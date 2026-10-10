import { useCallback, useState } from 'react';
import { ProblemNote, Segmented, useGarageRead, useNow } from './parts.jsx';
import { STALE } from './api.js';
import { ROUNDINGS, arrange, garageInstant, linesOf, listToState, parsePercent, percentText, startOfDay, stateWords, taxState } from './taxes.js';
import { garageDateTime, zoneSaid } from './time.js';
import FieldName from './FieldName.jsx';

/**
 * A garage's taxes and fees: the list in force now, the ones that start
 * later and the ones before it, each with when it starts in the garage's own
 * time; and "Change taxes", which states a new list. Nothing is changed in
 * place: the only write here is a new list (POST tax-sets), and the old ones
 * stay on record. Percents only.
 */
export default function TaxesPage({ t, language, client, garage }) {
  const ticking = useNow();
  const lists = useGarageRead(useCallback((id) => client.taxLists(id), [client]), garage.id);
  const [changing, setChanging] = useState(false);
  const reread = useCallback(() => lists.refresh().catch(() => lists.retry()), [lists]);

  if (lists.problem) return <ProblemNote t={t} kind={lists.problem} onRetry={lists.retry} />;
  if (!lists.data) return <p className="quiet">{t('loading')}</p>;
  // Which list is in force is judged at the later of the clock and the read: a
  // list saved "now" is in force the moment the page reads it back.
  const now = new Date(Math.max(ticking.getTime(), lists.readAt?.getTime() ?? 0));
  const { current, later, earlier } = arrange(lists.data, now);
  const at = (iso) => garageDateTime(iso, garage.timezone, language);
  const zone = zoneSaid(garage.timezone, language, now);

  return (
    <>
      <section className="panel" data-section="in-force">
        <div className="list-head">
          <h2 className="section-title">{t('taxes.inForce')}</h2>
          {changing ? null : (
            <button type="button" className="primary-button" data-action="change-taxes" onClick={() => setChanging(true)}>
              {t('taxes.change')}
            </button>
          )}
        </div>
        <p className="taxes-state" data-state={taxState(lists.data, now)}>
          {stateWords(t, lists.data, garage, language, now)}
        </p>
        {zone ? <p className="quiet">{t('taxes.zone', { zone })}</p> : null}
        {current ? <TaxList t={t} language={language} list={current} when={t('taxes.since', { time: at(current.effective_from) })} kind="current" /> : null}
      </section>

      {changing ? (
        <ChangeTaxes
          t={t}
          client={client}
          garage={garage}
          from={current}
          onSaved={() => {
            setChanging(false);
            reread();
          }}
          onClose={() => setChanging(false)}
        />
      ) : null}

      {later.length ? (
        <section className="panel" data-section="later">
          <h2 className="section-title">{t('taxes.later')}</h2>
          {later.map((list) => (
            <TaxList key={list.id ?? list.effective_from} t={t} language={language} list={list} when={t('taxes.startsAt', { time: at(list.effective_from) })} kind="later" />
          ))}
        </section>
      ) : null}

      {earlier.length ? (
        <section className="panel" data-section="earlier">
          <h2 className="section-title">{t('taxes.earlier')}</h2>
          {earlier.map((list) => (
            <TaxList
              key={list.id ?? list.effective_from}
              t={t}
              language={language}
              list={list}
              when={t('taxes.fromTo', { from: at(list.effective_from), to: at(list.until) })}
              kind="earlier"
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

/** One list: when it starts (or started), and its lines in order -- or that it charges no tax. */
function TaxList({ t, language, list, when, kind }) {
  const lines = linesOf(list);
  return (
    <div className="tax-list" data-tax-list={kind} data-starts={list.effective_from}>
      <p className="tax-when">{when}</p>
      {lines.length === 0 ? (
        <p data-notice="no-tax">{t('taxes.noTax')}</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="taxes.name" />
              </th>
              <th>
                <FieldName t={t} name="taxes.percent" />
              </th>
              <th>
                <FieldName t={t} name="taxes.rounding" />
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} data-line={line.id}>
                <td>
                  <bdi>{line.label}</bdi>
                </td>
                <td data-percent={line.percent_bp}>{percentText(line.percent_bp, language)}</td>
                <td>{t(ROUNDINGS.includes(line.rounding) ? `taxes.round.${line.rounding}` : 'taxes.round.other')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

let lineKeys = 0;
const blankLine = () => ({ key: (lineKeys += 1), name: '', percent: '', rounding: '' });
/** A percent in hundredths as the owner would type it again: 1850 is "18.5". */
const typed = (bp) => String(bp / 100);

/** What is wrong with one line, as the key of its words; null when nothing is. */
function lineProblem(line) {
  if (!line.name.trim()) return 'taxes.needName';
  const percent = parsePercent(line.percent);
  if (percent.problem) return `taxes.needPercent.${percent.problem}`;
  if (!ROUNDINGS.includes(line.rounding)) return 'taxes.needRounding';
  return null;
}

/**
 * A new list, starting as a copy of the one in force: add, remove and
 * reorder lines, each a name, a percent and how it rounds; or the single
 * choice that this garage charges no tax. It starts now, or from the start
 * of a day in the garage's own time. Before saving it says that this starts a
 * new list and the old one stays on record.
 */
function ChangeTaxes({ t, client, garage, from, onSaved, onClose }) {
  const [charges, setCharges] = useState(from && from.rules.length === 0 ? 'none' : 'taxes');
  const [lines, setLines] = useState(() => {
    const copied = linesOf(from).map((r) => ({ key: (lineKeys += 1), name: r.label, percent: typed(r.percent_bp), rounding: r.rounding }));
    return copied.length ? copied : [blankLine()];
  });
  const [starts, setStarts] = useState('now');
  const [day, setDay] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);

  const noTax = charges === 'none';
  const problems = noTax ? [] : lines.map(lineProblem);
  const start = starts === 'now' ? null : startOfDay(day, garage.timezone);
  const ready = (noTax || (lines.length > 0 && problems.every((p) => p === null))) && (starts === 'now' || start !== null);

  const change = (key, field, value) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const move = (i, by) =>
    setLines((ls) => {
      const next = [...ls];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  const save = async () => {
    setTried(true);
    if (!ready || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const list = listToState({
        noTax,
        lines: lines.map((l) => ({ name: l.name, bp: parsePercent(l.percent).bp, rounding: l.rounding })),
        start: start ?? garageInstant(Date.now(), garage.timezone),
      });
      await client.addTaxList(garage.id, list);
      onSaved();
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      setSaving(false);
    }
  };

  return (
    <section className="panel no-print" data-form="change-taxes" aria-live="polite">
      <div className="lane-panel-head">
        <h2 className="section-title">{t('taxes.formTitle')}</h2>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t('taxes.cancel')}
        </button>
      </div>
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="chooser" data-chooser="charges">
          <FieldName t={t} name="taxes.charges" />
          <Segmented
            label={t('taxes.charges')}
            value={charges}
            options={[
              { value: 'taxes', text: t('taxes.charges.taxes') },
              { value: 'none', text: t('taxes.charges.none') },
            ]}
            onChange={setCharges}
            name="charges"
          />
        </div>

        {noTax ? null : (
          <ol className="tax-lines">
            {lines.map((line, i) => (
              <li key={line.key} className="tax-line" data-line-at={i + 1}>
                <p className="tax-line-name">{t('taxes.line', { n: i + 1 })}</p>
                <div className="tax-line-fields">
                  <label className="field">
                    <FieldName t={t} name="taxes.name" />
                    <input type="text" data-field="tax-name" value={line.name} maxLength={80} autoComplete="off" onChange={(e) => change(line.key, 'name', e.target.value)} />
                  </label>
                  <label className="field">
                    <FieldName t={t} name="taxes.percent" />
                    <input type="text" inputMode="decimal" data-field="tax-percent" value={line.percent} maxLength={7} autoComplete="off" onChange={(e) => change(line.key, 'percent', e.target.value)} />
                  </label>
                  <label className="field">
                    <FieldName t={t} name="taxes.rounding" />
                    <select data-field="tax-rounding" value={line.rounding} onChange={(e) => change(line.key, 'rounding', e.target.value)}>
                      <option value="">{t('taxes.roundingPick')}</option>
                      {ROUNDINGS.map((r) => (
                        <option key={r} value={r}>
                          {t(`taxes.round.${r}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="lane-actions">
                  <button type="button" className="link-button" data-action="move-up" disabled={i === 0} onClick={() => move(i, -1)}>
                    {t('taxes.moveUp')}
                  </button>
                  <button type="button" className="link-button" data-action="move-down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                    {t('taxes.moveDown')}
                  </button>
                  <button type="button" className="link-button" data-action="remove-line" onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}>
                    {t('taxes.removeLine')}
                  </button>
                </div>
                {tried && problems[i] ? (
                  <p className="warning" data-line-problem={i + 1}>
                    {t(problems[i])}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {noTax ? null : (
          <button type="button" className="link-button" data-action="add-line" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            {t('taxes.addLine')}
          </button>
        )}
        {!noTax && tried && lines.length === 0 ? (
          <p className="warning" data-notice="need-line">
            {t('taxes.needLine')}
          </p>
        ) : null}

        <div className="chooser" data-chooser="starts">
          <FieldName t={t} name="taxes.starts" />
          <Segmented
            label={t('taxes.starts')}
            value={starts}
            options={[
              { value: 'now', text: t('taxes.starts.now') },
              { value: 'day', text: t('taxes.starts.day') },
            ]}
            onChange={setStarts}
            name="starts"
          />
        </div>
        {starts === 'day' ? (
          <label className="field">
            <FieldName t={t} name="taxes.day" />
            <input type="date" data-field="tax-day" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
        ) : null}
        {starts === 'day' && tried && start === null ? (
          <p className="warning" data-notice="need-day">
            {t('taxes.needDay')}
          </p>
        ) : null}

        <p className="warning" data-notice="new-list">
          {t('taxes.newList')}
        </p>
        <button type="submit" className="primary-button" data-action="save-taxes" disabled={saving}>
          {saving ? t('taxes.saving') : t('taxes.save')}
        </button>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </form>
    </section>
  );
}
