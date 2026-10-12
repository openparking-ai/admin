import { useCallback, useMemo, useRef, useState } from 'react';
import { Pager, PrintHead, ProblemNote, Segmented, useGarageRead, useNow, usePaging, usePrint } from './parts.jsx';
import { STALE } from './api.js';
import ListActions from './ListActions.jsx';
import FieldName, { FieldAbout } from './FieldName.jsx';
import { garageDateTime, localSaid, zoneSaid } from './time.js';
import {
  ADJUST_ROUNDINGS,
  AMOUNT_KINDS,
  CHARGES,
  DAYS,
  DAY_KINDS,
  DIRECTIONS,
  PERIOD_ROUNDINGS,
  PRESETS,
  PRESET_KEYS,
  TABLE_MAX,
  WEEK_KINDS,
  arrange,
  blankSpecial,
  buildPlan,
  caseKey,
  caseWords,
  dayName,
  findingWords,
  firstStartDay,
  formFromPlan,
  formProblems,
  formStart,
  lengthWords,
  lineWords,
  moneyText,
  planName,
  planSentences,
  specialWords,
  tableStays,
  wallAt,
} from './rates.js';

/**
 * A garage's rates: the ones in force now, the ones that start later and the
 * ones before, each with when it starts in the garage's own time, each in
 * plain sentences; "Try a stay"; and "Change rates", which builds new rates,
 * prices a table of example stays through the platform, and saves them only
 * once the owner has checked the prices and confirmed. Nothing is changed in
 * place: the only write is new rates (POST rate-plans), and the old ones stay
 * on record. The platform and its rate engine price every stay shown here.
 */
export default function RatesPage({ t, language, client, garage }) {
  const ticking = useNow();
  const read = useGarageRead(useCallback((id) => client.ratePlans(id), [client]), garage.id);
  const taxNames = useTaxNames(t, client, garage);
  const [changing, setChanging] = useState(false);
  const { printedAt, print } = usePrint();
  const reread = useCallback(() => read.refresh().catch(() => read.retry()), [read]);

  if (read.problem) return <ProblemNote t={t} kind={read.problem} onRetry={read.retry} />;
  if (!read.data) return <p className="quiet">{t('loading')}</p>;
  // Which plan is in force is judged at the later of the clock and the read:
  // rates saved "now" are in force the moment the page reads them back.
  const now = new Date(Math.max(ticking.getTime(), read.readAt?.getTime() ?? 0));
  const { plans, spaceClass } = read.data;
  const { current, later, earlier } = arrange(plans, now);
  const at = (iso) => garageDateTime(iso, garage.timezone, language);
  const zone = zoneSaid(garage.timezone, language, now);

  return (
    <>
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={read.readAt} />
      <section className="panel" data-section="in-force">
        <div className="list-head">
          <h2 className="section-title">{t('rates.inForce')}</h2>
          {changing ? null : (
            <button type="button" className="primary-button no-print" data-action="change-rates" onClick={() => setChanging(true)}>
              {t('rates.change')}
            </button>
          )}
        </div>
        <p className="rates-state" data-state={current ? 'current' : later.length ? 'later' : 'none'}>
          {current ? t('rates.since', { time: at(current.effective_from) }) : later.length ? t('rates.notYet', { time: at(later[0].effective_from) }) : t('rates.none')}
        </p>
        {zone ? <p className="quiet">{t('rates.zone', { zone })}</p> : null}
        {current ? <Sentences t={t} language={language} plan={current} kind="current" /> : null}
        {plans.length ? <ListActions t={t} list="rates" language={language} client={client} garage={garage} refresh={read.refresh} print={print} /> : null}
      </section>

      {changing ? (
        <ChangeRates
          t={t}
          language={language}
          client={client}
          garage={garage}
          spaceClass={spaceClass}
          from={current ?? later.at(-1) ?? null}
          taxNames={taxNames}
          onSaved={() => {
            setChanging(false);
            reread();
          }}
          onClose={() => setChanging(false)}
        />
      ) : current || later.length ? (
        <TryAStay t={t} language={language} client={client} garage={garage} plan={null} shownPlans={plans} taxNames={taxNames} />
      ) : null}

      {later.length ? (
        <section className="panel" data-section="later">
          <h2 className="section-title">{t('rates.later')}</h2>
          {later.map((plan) => (
            <div key={plan.plan_version} className="rate-plan" data-plan="later" data-starts={plan.effective_from}>
              <p className="tax-when">{t('rates.startsAt', { time: at(plan.effective_from) })}</p>
              <Sentences t={t} language={language} plan={plan} kind="later" />
            </div>
          ))}
        </section>
      ) : null}

      {earlier.length ? (
        <section className="panel" data-section="earlier">
          <h2 className="section-title">{t('rates.earlier')}</h2>
          {earlier.map((plan) => (
            <div key={plan.plan_version} className="rate-plan" data-plan="earlier" data-starts={plan.effective_from}>
              <p className="tax-when">{t('rates.fromTo', { from: at(plan.effective_from), to: at(plan.until) })}</p>
              <Sentences t={t} language={language} plan={plan} kind="earlier" />
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

/** The names of the garage's taxes, by their line's id, for the words of a priced stay. */
function useTaxNames(t, client, garage) {
  const taxes = useGarageRead(useCallback((id) => client.taxLists(id), [client]), garage.id);
  return useMemo(() => {
    const names = {};
    for (const list of taxes.data ?? []) for (const rule of list.rules ?? []) names[rule.id] = rule.label;
    return names;
  }, [taxes.data]);
}

/** One plan, in plain sentences: a special's name kept apart from the words. */
function Sentences({ t, language, plan, kind }) {
  return (
    <div className="rate-sentences" data-sentences={kind}>
      <FieldName t={t} name="rates.charges" />
      <ul>
        {planSentences(t, plan, language).map((s) => (
          <li key={s.key} data-sentence={s.key}>
            {s.name ? (
              <>
                <bdi className="special-name">{s.name}</bdi>
                {' — '}
              </>
            ) : null}
            {s.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A 'YYYY-MM-DDTHH:MM' from a datetime field, or null. */
const wallOf = (value) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value ?? '')) ? value : null);

/**
 * Try a stay: the owner picks when a car came in and when it left, and sees
 * each part of the price in plain words and what the driver pays, tax
 * included -- priced by the platform the way a leaving car is. `plan` is the
 * new rates being entered (null: the rates in force).
 */
function TryAStay({ t, language, client, garage, plan, shownPlans, taxNames, ready = true }) {
  const today = wallAt(Date.now(), garage.timezone).slice(0, 10);
  const [entry, setEntry] = useState(`${today}T08:00`);
  const [exit, setExit] = useState(`${today}T17:30`);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [problem, setProblem] = useState(null);
  const [tried, setTried] = useState(false);
  const fine = wallOf(entry) && wallOf(exit) && exit >= entry;

  const run = async () => {
    setTried(true);
    if (!fine || busy || !ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const out = await client.tryStays(garage.id, { plan, stays: [{ entry, exit }] });
      setAnswer({ stay: out.stays[0], plan });
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  };

  const stay = answer?.stay;
  // The plan that priced it, to name a special: the draft, or the stored one it names.
  const priced = stay && !stay.refused ? (answer.plan && answer.plan.plan_version === stay.plan_version ? answer.plan : shownPlans?.find((p) => p.plan_version === stay.plan_version) ?? answer.plan) : null;

  return (
    <section className="panel" data-section="try" aria-live="polite">
      <h2 className="section-title">
        <FieldName t={t} name="rates.try" />
      </h2>
      <p className="quiet">{plan ? t('rates.try.onDraft') : t('rates.try.onCurrent')}</p>
      <form
        className="setup-form try-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className="field">
          <FieldName t={t} name="rates.try.entry" />
          <input type="datetime-local" data-field="try-entry" value={entry} onChange={(e) => setEntry(e.target.value)} />
        </label>
        <label className="field">
          <FieldName t={t} name="rates.try.exit" />
          <input type="datetime-local" data-field="try-exit" value={exit} onChange={(e) => setExit(e.target.value)} />
        </label>
        <button type="submit" className="primary-button" data-action="try-stay" disabled={busy || !ready}>
          {busy ? t('rates.try.busy') : t('rates.try.button')}
        </button>
      </form>
      {!ready ? (
        <p className="quiet" data-notice="form-first">
          {t('rates.try.formFirst')}
        </p>
      ) : null}
      {tried && !fine ? (
        <p className="warning" data-notice="try-need">
          {t('rates.try.need')}
        </p>
      ) : null}
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
      {stay ? <TriedStay t={t} language={language} garage={garage} stay={stay} plan={priced ?? answer.plan} taxNames={taxNames} /> : null}
    </section>
  );
}

/** One priced stay: what the driver pays, how long it stayed, and each part of the price. */
function TriedStay({ t, language, garage, stay, plan, taxNames }) {
  if (stay.refused) {
    return (
      <div className="tried" data-tried="refused">
        <p className="warning">{t('rates.try.refused')}</p>
        <ul>
          {(stay.findings ?? []).map((f, i) => (
            <li key={i} data-finding={f.code}>
              {findingWords(t, f, plan, garage.timezone, language)}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const lines = lineWords(t, stay, plan, taxNames, garage.currency, language);
  return (
    <div className="tried" data-tried="priced" data-fee={stay.fee_minor}>
      <p className="tried-pays">{t('rates.try.pays', { amount: moneyText(stay.fee_minor, garage.currency, language) })}</p>
      <p className="quiet">{t('rates.try.stayed', { length: lengthWords(t, stay.minutes) })}</p>
      {stay.taxes_stated === false ? (
        <p className="quiet" data-notice="tax-not-stated">
          {t('rates.try.taxNotStated')}
        </p>
      ) : null}
      <FieldName t={t} name="rates.lines" />
      <table className="list tried-lines">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} data-line-tax={line.tax ? 'yes' : 'no'}>
              <td>
                <bdi>{line.words}</bdi>
              </td>
              <td className="money" data-minor={line.minor}>
                {line.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="quiet" data-special-words>
        {specialWords(t, stay, plan, language)}
      </p>
    </div>
  );
}

/**
 * A tick with its words beside it: on or off, as every tick on these screens is
 * drawn (a button, so a print can say it in words), as wide as its words.
 */
function Tick({ t, on, onChange, words, tick, disabled = false }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className="tick tick-words" data-tick={tick} disabled={disabled} onClick={() => onChange(!on)}>
      <span aria-hidden="true" className="tick-box" data-on={on ? 'yes' : 'no'} />
      <span aria-hidden="true" className="print-word" data-print={on ? 'yes' : 'no'}>
        {on ? t('yes') : t('no')}
      </span>
      <span>{words}</span>
    </button>
  );
}

/** A choice field: a select with "Choose…" and nothing chosen for the owner. */
function Choice({ t, name, field, value, options, onChange }) {
  return (
    <label className="field">
      <FieldName t={t} name={name} />
      <select data-field={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('rates.pick')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Text({ t, name, field, value, onChange, inputMode = 'decimal', maxLength = 10 }) {
  return (
    <label className="field">
      <FieldName t={t} name={name} />
      <input type="text" inputMode={inputMode} data-field={field} value={value} maxLength={maxLength} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Problem({ t, problems, at, tried }) {
  if (!tried || !problems[at]) return null;
  return (
    <p className="warning" data-problem-at={at}>
      {t(problems[at])}
    </p>
  );
}

/** The fields of a time-based rate: first period and its price, each period after and its price, a started period. */
function RateFields({ t, rate, onChange, prefix, problems, tried }) {
  const set = (field) => (value) => onChange({ ...rate, [field]: value });
  return (
    <div className="rate-fields" data-rate-fields={prefix}>
      <div className="tax-line-fields">
        <Text t={t} name="rates.time.firstMinutes" field={`${prefix}-first-minutes`} value={rate.firstMinutes} onChange={set('firstMinutes')} inputMode="numeric" maxLength={5} />
        <Text t={t} name="rates.time.firstPrice" field={`${prefix}-first-price`} value={rate.firstPrice} onChange={set('firstPrice')} />
        <Text t={t} name="rates.time.nextMinutes" field={`${prefix}-next-minutes`} value={rate.nextMinutes} onChange={set('nextMinutes')} inputMode="numeric" maxLength={5} />
        <Text t={t} name="rates.time.nextPrice" field={`${prefix}-next-price`} value={rate.nextPrice} onChange={set('nextPrice')} />
        <Choice t={t} name="rates.time.rounding" field={`${prefix}-rounding`} value={rate.rounding} options={PERIOD_ROUNDINGS.map((r) => ({ value: r, text: t(`rates.round.${r}`) }))} onChange={set('rounding')} />
      </div>
      {['firstMinutes', 'firstPrice', 'nextMinutes', 'nextPrice', 'rounding'].map((f) => (
        <Problem key={f} t={t} problems={problems} at={`${prefix === 'time' ? 'time' : prefix}.${f}`} tried={tried} />
      ))}
    </div>
  );
}

/**
 * New rates, starting as a copy of the ones in force: the time-based rate,
 * at most per day and per week, a free grace period, and special rates added
 * one by one. "Check prices and save" opens the review: the rates in plain
 * sentences, a price table priced by the platform, when they start, and the
 * tick and Confirm that save them.
 */
function ChangeRates({ t, language, client, garage, spaceClass, from, taxNames, onSaved, onClose }) {
  const [form, setForm] = useState(() => formFromPlan(from, garage.currency));
  const [tried, setTried] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const name = useRef(planName(Date.now(), garage.timezone));
  const ticking = useNow();
  const problems = formProblems(form, garage, ticking.getTime());
  const ready = Object.keys(problems).length === 0;
  const set = (part) => (value) => setForm((f) => ({ ...f, [part]: value }));
  const draft = useMemo(() => {
    if (!ready) return null;
    const start = formStart(form, garage);
    return start ? buildPlan(form, { garage, spaceClass, start, name: name.current }) : null;
    // The start "now" is read again when the table is priced and when saved.
  }, [ready, form, garage, spaceClass]);

  const specials = form.specials;
  const setSpecial = (key, change) => setForm((f) => ({ ...f, specials: f.specials.map((s) => (s.key === key ? { ...s, ...change } : s)) }));
  const move = (i, by) =>
    setForm((f) => {
      const next = [...f.specials];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return { ...f, specials: next };
    });
  const adjusts = specials.filter((s) => s.charge === 'adjust').length;

  if (reviewing && draft) {
    return (
      <Review
        t={t}
        language={language}
        client={client}
        garage={garage}
        form={form}
        spaceClass={spaceClass}
        name={name}
        onBack={() => setReviewing(false)}
        onSaved={onSaved}
      />
    );
  }

  return (
    <>
      <section className="panel no-print" data-form="change-rates" aria-live="polite">
        <div className="lane-panel-head">
          <h2 className="section-title">{t('rates.formTitle')}</h2>
          <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
            {t('rates.cancel')}
          </button>
        </div>
        {from ? <p className="quiet">{t('rates.formCopy')}</p> : null}
        {/* noValidate: the form says what is wrong itself, in the owner's language
            (the start day among it); the browser's own bubble would stop the first
            press before it could (U7g fix 2, F7). */}
        <form
          className="setup-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (ready) setReviewing(true);
          }}
        >
          <fieldset className="rates-part" data-part="time">
            <legend>
              <FieldName t={t} name="rates.time" />
            </legend>
            <RateFields t={t} rate={form.time} onChange={set('time')} prefix="time" problems={problems} tried={tried} />
          </fieldset>

          <fieldset className="rates-part" data-part="day-max">
            <legend>
              <FieldName t={t} name="rates.dayMax" />
            </legend>
            <Tick t={t} tick="day-max-on" on={form.dayMax.on} onChange={(on) => set('dayMax')({ ...form.dayMax, on })} words={t('rates.dayMax.use')} />
            {form.dayMax.on ? (
              <div className="tax-line-fields">
                <Text t={t} name="rates.dayMax.price" field="day-max-price" value={form.dayMax.price} onChange={(v) => set('dayMax')({ ...form.dayMax, price: v })} />
                <Choice t={t} name="rates.dayMax.kind" field="day-max-kind" value={form.dayMax.kind} options={DAY_KINDS.map((k) => ({ value: k, text: t(`rates.dayKind.${k}`) }))} onChange={(v) => set('dayMax')({ ...form.dayMax, kind: v })} />
              </div>
            ) : null}
            <Problem t={t} problems={problems} at="dayMax.price" tried={tried} />
            <Problem t={t} problems={problems} at="dayMax.kind" tried={tried} />
          </fieldset>

          <fieldset className="rates-part" data-part="week-max">
            <legend>
              <FieldName t={t} name="rates.weekMax" />
            </legend>
            <Tick t={t} tick="week-max-on" on={form.weekMax.on} onChange={(on) => set('weekMax')({ ...form.weekMax, on })} words={t('rates.weekMax.use')} />
            {form.weekMax.on ? (
              <div className="tax-line-fields">
                <Text t={t} name="rates.weekMax.price" field="week-max-price" value={form.weekMax.price} onChange={(v) => set('weekMax')({ ...form.weekMax, price: v })} />
                <Choice t={t} name="rates.weekMax.kind" field="week-max-kind" value={form.weekMax.kind} options={WEEK_KINDS.map((k) => ({ value: k, text: t(`rates.weekKind.${k}`) }))} onChange={(v) => set('weekMax')({ ...form.weekMax, kind: v })} />
                {form.weekMax.kind === 'calendar_week' ? (
                  <Choice t={t} name="rates.weekMax.startsOn" field="week-max-starts" value={form.weekMax.startsOn} options={DAYS.map((d) => ({ value: d, text: dayName(d, language) }))} onChange={(v) => set('weekMax')({ ...form.weekMax, startsOn: v })} />
                ) : null}
              </div>
            ) : null}
            <Problem t={t} problems={problems} at="weekMax.price" tried={tried} />
            <Problem t={t} problems={problems} at="weekMax.kind" tried={tried} />
            <Problem t={t} problems={problems} at="weekMax.startsOn" tried={tried} />
          </fieldset>

          <fieldset className="rates-part" data-part="grace">
            <legend>
              <FieldName t={t} name="rates.grace" />
            </legend>
            <Tick t={t} tick="grace-on" on={form.grace.on} onChange={(on) => set('grace')({ ...form.grace, on })} words={t('rates.grace.use')} />
            {form.grace.on ? <Text t={t} name="rates.grace.minutes" field="grace-minutes" value={form.grace.minutes} onChange={(v) => set('grace')({ ...form.grace, minutes: v })} inputMode="numeric" maxLength={5} /> : null}
            <Problem t={t} problems={problems} at="grace.minutes" tried={tried} />
          </fieldset>

          <fieldset className="rates-part" data-part="specials">
            <legend>
              <FieldName t={t} name="rates.specials" />
            </legend>
            {specials.length ? <p className="quiet">{t('rates.specials.cheaper')}</p> : <p className="quiet">{t('rates.specials.none')}</p>}
            {adjusts > 1 ? (
              <p className="warning" data-notice="adjust-order">
                {t('rates.adjust.orderNote')}
              </p>
            ) : null}
            <ol className="tax-lines">
              {specials.map((s, i) => (
                <Special
                  key={s.key}
                  t={t}
                  language={language}
                  special={s}
                  i={i}
                  count={specials.length}
                  problems={problems}
                  tried={tried}
                  onChange={(change) => setSpecial(s.key, change)}
                  onMove={(by) => move(i, by)}
                  onRemove={() => setForm((f) => ({ ...f, specials: f.specials.filter((x) => x.key !== s.key) }))}
                />
              ))}
            </ol>
            <button type="button" className="link-button" data-action="add-special" onClick={() => setForm((f) => ({ ...f, specials: [...f.specials, blankSpecial()] }))}>
              {t('rates.addSpecial')}
            </button>
          </fieldset>

          <div className="chooser" data-chooser="starts">
            <FieldName t={t} name="rates.starts" />
            <Segmented
              label={t('rates.starts')}
              value={form.starts}
              options={[
                { value: 'now', text: t('rates.starts.now') },
                { value: 'day', text: t('rates.starts.day') },
              ]}
              onChange={set('starts')}
              name="starts"
            />
          </div>
          {form.starts === 'day' ? (
            <label className="field">
              <FieldName t={t} name="rates.day" />
              <input type="date" data-field="rates-day" min={firstStartDay(garage, ticking.getTime())} value={form.day} onChange={(e) => set('day')(e.target.value)} />
            </label>
          ) : null}
          <Problem t={t} problems={problems} at="day" tried={tried} />

          <p className="warning" data-notice="new-rates">
            {t('rates.newRates')}
          </p>
          {tried && !ready ? (
            <p className="warning" data-notice="form-not-ready">
              {t('rates.formNotReady')}
            </p>
          ) : null}
          <button type="submit" className="primary-button" data-action="review-rates">
            {t('rates.save')}
          </button>
        </form>
      </section>
      <TryAStay t={t} language={language} client={client} garage={garage} plan={draft} taxNames={taxNames} ready={Boolean(draft)} />
    </>
  );
}

/** One special rate in the form: its choice of days, its times, what it charges, its name, and where it is in the list. */
function Special({ t, language, special: s, i, count, problems, tried, onChange, onMove, onRemove }) {
  const at = `special.${i}`;
  const p = (f) => <Problem t={t} problems={problems} at={`${at}.${f}`} tried={tried} />;
  const pickPreset = (preset) => onChange({ preset, days: PRESETS[preset] ? [...PRESETS[preset]] : [], dates: preset === 'dates' ? (s.dates.length ? s.dates : ['']) : [] });
  return (
    <li className="tax-line special" data-special-at={i + 1}>
      <p className="tax-line-name">{t('rates.special.n', { n: i + 1 })}</p>
      <div className="tax-line-fields">
        <Text t={t} name="rates.special.name" field="special-name" value={s.name} onChange={(v) => onChange({ name: v })} inputMode="text" maxLength={60} />
        <Choice t={t} name="rates.special.choice" field="special-preset" value={s.preset} options={PRESET_KEYS.map((k) => ({ value: k, text: t(`rates.preset.${k}`) }))} onChange={pickPreset} />
      </div>
      {p('name')}
      {p('preset')}
      {s.preset && s.preset !== 'dates' ? (
        <fieldset className="days" data-field="special-days">
          <legend>
            <FieldName t={t} name="rates.special.days" />
          </legend>
          <div className="day-ticks">
            {DAYS.map((d) => (
              <Tick
                key={d}
                t={t}
                tick={`day-${d}`}
                on={s.days.includes(d)}
                onChange={(on) => onChange({ days: on ? DAYS.filter((x) => x === d || s.days.includes(x)) : s.days.filter((x) => x !== d) })}
                words={dayName(d, language)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      {p('days')}
      {s.preset === 'dates' ? (
        <fieldset className="dates" data-field="special-dates">
          <legend>
            <FieldName t={t} name="rates.special.dates" />
          </legend>
          {s.dates.map((d, n) => (
            <div key={n} className="date-row">
              <input type="date" data-date-at={n + 1} value={d} onChange={(e) => onChange({ dates: s.dates.map((x, m) => (m === n ? e.target.value : x)) })} />
              <FieldAbout t={t} name="rates.special.dates" />
              <button type="button" className="link-button" data-action="remove-date" onClick={() => onChange({ dates: s.dates.filter((_, m) => m !== n) })}>
                {t('rates.special.removeDate')}
              </button>
            </div>
          ))}
          <button type="button" className="link-button" data-action="add-date" onClick={() => onChange({ dates: [...s.dates, ''] })}>
            {t('rates.special.addDate')}
          </button>
        </fieldset>
      ) : null}
      {p('dates')}
      <div className="tax-line-fields">
        <label className="field">
          <FieldName t={t} name="rates.special.enterFrom" />
          <input type="time" data-field="special-enter-from" value={s.enterFrom} onChange={(e) => onChange({ enterFrom: e.target.value })} />
        </label>
        <label className="field">
          <FieldName t={t} name="rates.special.enterBy" />
          <input type="time" data-field="special-enter-by" value={s.enterBy} onChange={(e) => onChange({ enterBy: e.target.value })} />
        </label>
        <label className="field">
          <FieldName t={t} name="rates.special.leaveBy" />
          <input type="time" data-field="special-leave-by" value={s.leaveBy} onChange={(e) => onChange({ leaveBy: e.target.value })} />
        </label>
      </div>
      {p('enterFrom')}
      {p('enterBy')}
      {p('leaveBy')}
      <div className="chooser" data-chooser="next-day">
        <FieldName t={t} name="rates.special.nextDay" />
        <Segmented
          label={t('rates.special.nextDay')}
          value={s.nextDay}
          options={[
            { value: false, text: t('rates.nextDay.no') },
            { value: true, text: t('rates.nextDay.yes') },
          ]}
          onChange={(v) => onChange({ nextDay: v })}
          name="next-day"
        />
      </div>
      {p('nextDay')}
      <Choice t={t} name="rates.special.charge" field="special-charge" value={s.charge} options={CHARGES.map((c) => ({ value: c, text: t(`rates.chargeKind.${c}`) }))} onChange={(v) => onChange({ charge: v })} />
      {p('charge')}
      {s.charge === 'flat' ? <Text t={t} name="rates.special.flat" field="special-flat" value={s.flat} onChange={(v) => onChange({ flat: v })} /> : null}
      {p('flat')}
      {s.charge === 'rate' ? <RateFields t={t} rate={s.rate} onChange={(rate) => onChange({ rate })} prefix={`${at}.rate`} problems={problems} tried={tried} /> : null}
      {s.charge === 'adjust' ? (
        <div className="tax-line-fields">
          <Choice t={t} name="rates.special.direction" field="special-direction" value={s.adjust.direction} options={DIRECTIONS.map((d) => ({ value: d, text: t(`rates.direction.${d}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, direction: v } })} />
          <Choice t={t} name="rates.special.amountKind" field="special-amount-kind" value={s.adjust.kind} options={AMOUNT_KINDS.map((k) => ({ value: k, text: t(`rates.amountKind.${k}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, kind: v } })} />
          <Text t={t} name="rates.special.amount" field="special-amount" value={s.adjust.value} onChange={(v) => onChange({ adjust: { ...s.adjust, value: v } })} />
          <Choice t={t} name="rates.special.cent" field="special-cent" value={s.adjust.rounding} options={ADJUST_ROUNDINGS.map((r) => ({ value: r, text: t(`rates.cent.${r}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, rounding: v } })} />
        </div>
      ) : null}
      {p('direction')}
      {p('amountKind')}
      {p('amount')}
      {p('cent')}
      <div className="lane-actions">
        <button type="button" className="link-button" data-action="move-up" disabled={i === 0} onClick={() => onMove(-1)}>
          {t('rates.moveUp')}
        </button>
        <button type="button" className="link-button" data-action="move-down" disabled={i === count - 1} onClick={() => onMove(1)}>
          {t('rates.moveDown')}
        </button>
        <button type="button" className="link-button" data-action="remove-special" onClick={onRemove}>
          {t('rates.special.remove')}
        </button>
      </div>
    </li>
  );
}

/**
 * The review: the new rates in plain sentences, the price table, when they
 * start, and -- only once the table is priced for exactly these rates -- the
 * tick and Confirm. Nothing is saved before Confirm; a change after the table
 * was priced disables Confirm until it is priced again.
 */
function Review({ t, language, client, garage, form, spaceClass, name, onBack, onSaved }) {
  const [table, setTable] = useState({ added: [], priced: null });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [findings, setFindings] = useState(null);
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState({ entry: '', exit: '' });
  const { printedAt, print } = usePrint();

  // The plan as it would be saved this moment ("Now" is this moment).
  const draftNow = () => buildPlan(form, { garage, spaceClass, start: formStart(form, garage), name: name.current });
  const shown = draftNow();
  const stays = () => {
    const plan = draftNow();
    return { plan, stays: [...tableStays(plan, garage.timezone), ...table.added].slice(0, TABLE_MAX) };
  };

  const price = async () => {
    if (busy) return null;
    setBusy(true);
    setProblem(null);
    setFindings(null);
    try {
      const asked = stays();
      const key = draftKey(form, asked.plan, table.added);
      const out = await client.tryStays(garage.id, { plan: asked.plan, stays: asked.stays.map(({ entry, exit }) => ({ entry, exit })) });
      const priced = { key, plan: asked.plan, rows: asked.stays.map((s, i) => ({ ...s, answer: out.stays[i] })), draftFindings: out.draftFindings, at: new Date() };
      setTable((tb) => ({ ...tb, priced }));
      if (out.draftFindings.length) setFindings(out.draftFindings);
      return { data: priced, readAt: priced.at };
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      throw p;
    } finally {
      setBusy(false);
    }
  };

  // Priced for exactly these rates and these stays. "Now" moves with the
  // clock, so a start of "now" is compared as "now", not as the moment.
  const current = table.priced !== null && table.priced.key === draftKey(form, shown, table.added);
  const canConfirm = current && ticked && !saving && !(table.priced?.draftFindings ?? []).length;
  const startWords = form.starts === 'now' ? t('rates.review.now') : garageDateTime(shown.effective_from, garage.timezone, language);

  const confirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    setProblem(null);
    setFindings(null);
    try {
      // Saved as priced -- but "Now" is the moment Confirm is pressed.
      const plan = form.starts === 'now' ? { ...table.priced.plan, effective_from: formStart(form, garage) } : table.priced.plan;
      await client.addRatePlan(garage.id, plan, { confirmed: ticked });
      onSaved();
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
      setProblem(p?.kind ?? 'unexpected');
      if (p?.kind === 'planFindings') setFindings(p.findings ?? []);
      setSaving(false);
    }
  };

  const addStay = () => {
    const entry = wallOf(extra.entry);
    const exit = wallOf(extra.exit);
    if (!entry || !exit || exit < entry || table.added.length + tableStays(shown, garage.timezone).length >= TABLE_MAX) return;
    setTable((tb) => ({ ...tb, added: [...tb.added, { entry, exit, why: { key: 'added' } }] }));
  };

  return (
    <>
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={table.priced?.at} />
      <section className="panel" data-form="review-rates" aria-live="polite">
        <div className="lane-panel-head">
          <h2 className="section-title">{t('rates.review')}</h2>
          <button type="button" className="link-button no-print" data-action="back-to-form" onClick={onBack}>
            {t('rates.review.back')}
          </button>
        </div>
        <h3 className="setup-step-name">{t('rates.review.sentences')}</h3>
        <Sentences t={t} language={language} plan={shown} kind="draft" />
        <p data-notice="starts">{form.starts === 'now' ? t('rates.review.startsNow') : t('rates.review.startsAt', { time: startWords })}</p>
      </section>

      <section className="panel" data-section="price-table">
        <div className="list-head">
          <h2 className="section-title">
            <FieldName t={t} name="rates.table" />
          </h2>
          <button type="button" className="primary-button no-print" data-action="price-table" disabled={busy} onClick={() => price().catch(() => {})}>
            {busy ? t('rates.table.busy') : t('rates.table.price')}
          </button>
        </div>
        {!table.priced ? <p className="quiet">{t('rates.table.notPriced')}</p> : null}
        {table.priced && !current ? (
          <p className="warning" data-notice="table-stale">
            {t('rates.table.stale')}
          </p>
        ) : null}
        {table.priced ? <PriceTable t={t} language={language} garage={garage} priced={table.priced} /> : null}
        {table.priced ? <ListActions t={t} list="priceTable" language={language} client={client} garage={garage} refresh={price} print={print} /> : null}
        <div className="tax-line-fields no-print" data-add-stay>
          <label className="field">
            <FieldName t={t} name="rates.try.entry" />
            <input type="datetime-local" data-field="add-entry" value={extra.entry} onChange={(e) => setExtra((x) => ({ ...x, entry: e.target.value }))} />
          </label>
          <label className="field">
            <FieldName t={t} name="rates.try.exit" />
            <input type="datetime-local" data-field="add-exit" value={extra.exit} onChange={(e) => setExtra((x) => ({ ...x, exit: e.target.value }))} />
          </label>
          <button type="button" className="link-button" data-action="add-stay" onClick={addStay}>
            {t('rates.table.add')}
          </button>
        </div>
        {table.added.length + tableStays(shown, garage.timezone).length >= TABLE_MAX ? <p className="quiet">{t('rates.table.full', { count: TABLE_MAX })}</p> : null}
      </section>

      {findings && findings.length ? (
        <section className="panel" data-section="findings">
          <p className="warning">{t('rates.findings')}</p>
          <ul>
            {findings.map((f, i) => (
              <li key={i} data-finding={f.code}>
                {findingWords(t, f, shown, garage.timezone, language)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel no-print" data-section="confirm">
        <Tick t={t} tick="checked-prices" on={ticked && current} disabled={!current} onChange={setTicked} words={t('rates.review.tick', { start: startWords })} />
        {!current ? <p className="quiet">{t('rates.review.needTable')}</p> : !ticked ? <p className="quiet">{t('rates.review.needTick')}</p> : null}
        <button type="button" className="primary-button" data-action="confirm-rates" disabled={!canConfirm} onClick={confirm}>
          {saving ? t('rates.review.saving') : t('rates.review.confirm')}
        </button>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </section>
    </>
  );
}

/**
 * What a priced table was priced for: the plan but its name, with a start of
 * "now" said as "now", and the stays the owner added. Equal keys, same table.
 */
function draftKey(form, plan, added) {
  const rest = { ...plan };
  delete rest.plan_version;
  return JSON.stringify({ ...rest, effective_from: form.starts === 'now' ? 'now' : rest.effective_from, added: added.map(({ entry, exit }) => [entry, exit]) });
}

/** The price table: one row per example stay, as the platform priced it. */
function PriceTable({ t, language, garage, priced }) {
  const paging = usePaging(priced.rows.length);
  const money = (minor) => moneyText(minor, garage.currency, language);
  const answerOf = (key) => priced.rows.find((r) => r.why.key === key)?.answer;
  // Each time is already the garage's own clock.
  const when = (wall) => localSaid(wall, language);
  return (
    <>
      <table className="list price-table" data-list="price-table">
        <thead>
          <tr>
            {['rates.table.cameIn', 'rates.table.left', 'rates.table.length', 'rates.table.rate', 'rates.table.tax', 'rates.table.pays', 'rates.table.special', 'rates.table.test'].map((k) => (
              <th key={k}>
                <FieldName t={t} name={k} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {priced.rows.map((row, i) => {
            const a = row.answer;
            const taxMinor = a && !a.refused ? (a.tax_lines ?? []).reduce((sum, l) => sum + l.delta_minor, 0) : null;
            return (
              <tr key={i} className={paging.row(i)} data-row={i + 1} data-fee={a && !a.refused ? a.fee_minor : undefined} data-why={row.why.key} data-says={caseKey(row, a, answerOf)}>
                <td>{when(row.entry)}</td>
                <td>{when(row.exit)}</td>
                <td>{lengthWords(t, a?.minutes ?? 0)}</td>
                <td className="money">{a && !a.refused ? money(a.subtotal_minor) : t('rates.table.noPrice')}</td>
                <td className="money">{a && !a.refused ? (a.taxes_stated === false ? t('rates.table.noTax') : money(taxMinor)) : '–'}</td>
                <td className="money">{a && !a.refused ? money(a.fee_minor) : t('rates.table.noPrice')}</td>
                <td>{a ? (a.refused ? (a.findings ?? []).map((f) => findingWords(t, f, priced.plan, garage.timezone, language)).join(' ') : specialWords(t, { ...a, entry: row.entry, exit: row.exit }, priced.plan, language)) : ''}</td>
                <td>
                  <bdi>{caseWords(t, row, a, answerOf)}</bdi>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager t={t} language={language} paging={paging} list="price-table" />
    </>
  );
}
