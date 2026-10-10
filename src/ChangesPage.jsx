import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pager, PrintHead, ProblemNote, useGarageRead, usePaging, usePrint } from './parts.jsx';
import {
  NO_CHOICE, SORTS, changedFields, choiceWords, chosenLines, isChosen, kindsIn, lastWords, timesWords, whatPieces, whenWords, whoPieces,
  whyWords, whySaid, whysIn,
} from './changes.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/** Pieces of words, each stored text kept apart on its own. */
function Pieces({ pieces }) {
  return pieces.map((p, i) => (p.stored !== undefined ? <bdi key={i}>{p.stored}</bdi> : <Fragment key={i}>{p.words}</Fragment>));
}

/**
 * The whole of one of the garage's two lists -- `what` is the client's
 * changes or refused read -- newest first: every page the platform gives,
 * one after another, until it says there is no next. So the screen can say
 * where in the whole list it is ("21–40 of 312"), and Download and Print
 * always hold all of it (U7a). A page that names a next line already asked
 * for ends the read, so a platform that answered in a circle cannot hold it.
 */
export async function readWhole(client, garageId, what) {
  const lines = [];
  const asked = new Set();
  let next = null;
  let count = null;
  do {
    const got = await client[what](garageId, next);
    lines.push(...got[what]);
    count = got.count ?? count;
    next = got.next;
    if (next !== null && asked.has(next)) break;
    asked.add(next);
  } while (next !== null);
  return { [what]: lines, count };
}

function useWhole(client, garageId, what) {
  return useGarageRead(useCallback((id) => readWhole(client, id, what), [client, what]), garageId);
}

/**
 * The garage's change log: every change made to it and its account -- who,
 * what, before and after, when, in the garage's own time -- newest first,
 * twenty at a time on screen. Below it and apart, every refused attempt,
 * with how many there are: so no number of refused attempts can push a
 * change out of sight. Each list prints and downloads whole, as the other
 * lists do, reading itself again first.
 *
 * Each list can be sorted, and only some of its lines shown (U7b): by what
 * they are about and, for the refused attempts, why they were refused. The
 * pages on screen, Download and Print all follow the choices, and hold every
 * line that matches; the print's head and the file's say what was chosen.
 */
export default function ChangesPage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const changes = useWhole(client, garage.id, 'changes');
  const refused = useWhole(client, garage.id, 'refused');

  return (
    <>
      <ChangesList t={t} language={language} client={client} garage={garage} pages={changes} printedAt={printedAt} print={print} />
      <RefusedList t={t} language={language} client={client} garage={garage} pages={refused} printedAt={printedAt} print={print} />
    </>
  );
}

/**
 * A list's choices, and its lines as chosen: `lines` to draw, page and
 * print; `shape` makes a file from a fresh read the same way.
 */
function useChoice(t, language, all, what) {
  const [choice, setChoice] = useState(NO_CHOICE);
  const lines = useMemo(() => chosenLines(t, all, choice, language), [t, all, choice, language]);
  const paging = usePaging(lines.length);
  const choose = (next) => {
    setChoice(next);
    paging.go(0);
  };
  const shape = (data) => ({ ...data, [what]: chosenLines(t, data[what], choice, language), chosen: choiceWords(t, choice, language) });
  return { choice, choose, lines, paging, shape, words: choiceWords(t, choice, language) };
}

const NONE = [];

function ChangesList({ t, language, client, garage, pages: log, printedAt, print }) {
  const all = log.data?.changes ?? NONE;
  const { choice, choose, lines, paging, shape, words } = useChoice(t, language, all, 'changes');
  if (log.problem) return <ProblemNote t={t} kind={log.problem} onRetry={log.retry} />;
  if (!log.data) return <p className="quiet">{t('loading')}</p>;
  return (
    <section className="panel printable" data-list="changes">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={log.readAt} chosen={words} />
      <div className="list-head">
        <h2 className="section-title">{t('page.changes.title')}</h2>
        {lines.length ? <ListActions t={t} list="changes" language={language} client={client} garage={garage} refresh={log.refresh} print={print} shape={shape} /> : null}
      </div>
      {all.length ? <Choices t={t} language={language} list="changes" all={all} choice={choice} onChoose={choose} /> : null}
      {all.length === 0 ? (
        <p className="quiet">{t('changes.none')}</p>
      ) : lines.length === 0 ? (
        <p className="quiet" data-notice="none-chosen">
          {t('choose.nothing')}
        </p>
      ) : (
        <table className="list changes">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="changes.when" />
              </th>
              <th>
                <FieldName t={t} name="changes.who" />
              </th>
              <th>
                <FieldName t={t} name="changes.what" />
              </th>
              <th>
                <FieldName t={t} name="changes.before" />
              </th>
              <th>
                <FieldName t={t} name="changes.after" />
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const fields = changedFields(t, line, garage, language);
              return (
                <tr key={line.id} data-change={line.id} data-outcome={line.outcome} className={paging.row(i)}>
                  <td data-time={line.at}>{whenWords(line, garage, language)}</td>
                  <td>
                    <Pieces pieces={whoPieces(t, line)} />
                  </td>
                  <td>
                    <Pieces pieces={whatPieces(t, line)} />
                  </td>
                  {['before', 'after'].map((side) => (
                    <td key={side}>
                      {fields.length === 0
                        ? '–'
                        : fields.map((f, i) => (
                            <span key={i} className="change-field">
                              {i ? '; ' : null}
                              {f.field}: <Pieces pieces={[f[side]]} />
                            </span>
                          ))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Pager t={t} language={language} paging={paging} list="changes" total={all.length} />
    </section>
  );
}

function RefusedList({ t, language, client, garage, pages: log, printedAt, print }) {
  const all = log.data?.refused ?? NONE;
  const { choice, choose, lines, paging, shape, words } = useChoice(t, language, all, 'refused');
  if (log.problem) return <ProblemNote t={t} kind={log.problem} onRetry={log.retry} />;
  if (!log.data) return <p className="quiet">{t('loading')}</p>;
  const attempts = log.data.count?.attempts ?? 0;
  return (
    <section className="panel printable" data-list="refused">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={log.readAt} chosen={words} />
      <div className="list-head">
        <h2 className="section-title">{t('refused.title')}</h2>
        {lines.length ? <ListActions t={t} list="refused" language={language} client={client} garage={garage} refresh={log.refresh} print={print} shape={shape} /> : null}
      </div>
      {all.length === 0 ? (
        <p className="quiet">{t('refused.none')}</p>
      ) : (
        <>
          <RefusedCount t={t} language={language} attempts={attempts} lines={lines} choice={choice} />
          <Choices t={t} language={language} list="refused" all={all} choice={choice} onChoose={choose} />
          {lines.length === 0 ? (
            <p className="quiet" data-notice="none-chosen">
              {t('choose.nothing')}
            </p>
          ) : (
            <table className="list changes refused">
              <thead>
                <tr>
                  <th>
                    <FieldName t={t} name="refused.when" />
                  </th>
                  <th>
                    <FieldName t={t} name="refused.who" />
                  </th>
                  <th>
                    <FieldName t={t} name="refused.what" />
                  </th>
                  <th>
                    <FieldName t={t} name="refused.why" />
                  </th>
                  <th>
                    <FieldName t={t} name="refused.times" />
                  </th>
                  <th>
                    <FieldName t={t} name="refused.last" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.id} data-change={line.id} data-outcome="refused" className={paging.row(i) ? `is-refused ${paging.row(i)}` : 'is-refused'}>
                    <td data-time={line.at}>{whenWords(line, garage, language)}</td>
                    <Cut>
                      <Pieces pieces={whoPieces(t, line)} />
                    </Cut>
                    <Cut>
                      <Pieces pieces={whatPieces(t, line)} />
                    </Cut>
                    <Cut>{whyWords(t, line)}</Cut>
                    <td>{timesWords(line, language)}</td>
                    <td data-time={line.last_at ?? line.at}>{lastWords(line, garage, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <Pager t={t} language={language} paging={paging} list="refused" total={all.length} />
    </section>
  );
}

/**
 * How many refused attempts there are. With some ticked (U7c), how many of
 * them are shown: "24 of 120 refused attempts", each line counting its
 * attempts as its Times column does. With none ticked, or only sorted, how
 * many in all, as before.
 */
function RefusedCount({ t, language, attempts, lines, choice }) {
  const n = (x) => x.toLocaleString(language === 'es' ? 'es-US' : 'en-US');
  if (choice.kinds.length > 0 || choice.whys.length > 0) {
    const shown = lines.reduce((sum, line) => sum + Number(line.attempts ?? 1), 0);
    return (
      <p className="quiet" data-count={attempts} data-shown={shown}>
        {t(attempts === 1 ? 'refused.countChosenOne' : 'refused.countChosen', { shown: n(shown), attempts: n(attempts) })}
      </p>
    );
  }
  return (
    <p className="quiet" data-count={attempts}>
      {attempts === 1 ? t('refused.countOne') : t('refused.countMany', { attempts: n(attempts) })}
    </p>
  );
}

/**
 * A cell kept to one line on screen, cut short with "…" (U7b: a refused
 * attempt is one line a row). Its whole text is shown over the row while the
 * pointer is on it or it has the keyboard's focus; on paper, and in the
 * files, it is whole.
 */
function Cut({ children }) {
  return (
    <td className="cut" tabIndex={0}>
      <span className="cut-text">{children}</span>
    </td>
  );
}

/**
 * The choices above a list, on one line: Sort by; What, ticks of the kinds
 * of thing its lines are about; for the refused attempts, Why, ticks of the
 * reasons they were refused for -- only kinds and reasons its lines hold.
 * Nothing ticked is everything. "Show everything" puts every choice back.
 */
function Choices({ t, language, list, all, choice, onChoose }) {
  const kinds = kindsIn(all).map((kind) => ({ value: kind, text: t(`choose.kind.${kind}`) }));
  const whys = list === 'refused' ? whysIn(t, all, language).map((key) => ({ value: key, text: whySaid(t, key) })) : null;
  return (
    <div className="list-choose no-print" data-choose={list}>
      <label className="choose-field">
        <FieldName t={t} name="choose.sort" />
        <select data-control="sort" value={choice.sort} onChange={(e) => onChoose({ ...choice, sort: e.target.value })}>
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`choose.sort.${sort}`)}
            </option>
          ))}
        </select>
      </label>
      <Ticks t={t} label={t('choose.what')} control="what" options={kinds} chosen={choice.kinds} onChange={(next) => onChoose({ ...choice, kinds: next })}>
        <FieldName t={t} name="choose.what" />
      </Ticks>
      {whys ? (
        <Ticks t={t} label={t('choose.why')} control="why" options={whys} chosen={choice.whys} onChange={(next) => onChoose({ ...choice, whys: next })}>
          <FieldName t={t} name="choose.why" />
        </Ticks>
      ) : null}
      {isChosen(choice) ? (
        <button type="button" className="link-button choose-clear" data-action="show-everything" onClick={() => onChoose(NO_CHOICE)}>
          {t('choose.showEverything')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * A field of ticks behind one small button, which says what is ticked
 * ("Everything", the one ticked, or how many). The ticks open under it, and
 * close on a press outside them or Escape. `children` is the field's name
 * and description.
 */
function Ticks({ t, label, control, options, chosen, onChange, children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const said = chosen.length === 0 ? t('choose.everything') : chosen.length === 1 ? options.find((o) => o.value === chosen[0])?.text : t('choose.many', { count: chosen.length });
  const toggle = (value) => {
    const next = chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];
    onChange(options.map((o) => o.value).filter((v) => next.includes(v)));
  };
  return (
    <div className="choose-field" data-choose-field={control} ref={box}>
      {children}
      <button type="button" className="choose-open" aria-expanded={open} data-action={`choose-${control}`} onClick={() => setOpen(!open)}>
        {said}
      </button>
      {open ? (
        <div className="choose-ticks" role="group" aria-label={label} data-ticks={control}>
          {options.map((o) => {
            const on = chosen.includes(o.value);
            return (
              <button key={o.value} type="button" role="checkbox" aria-checked={on} className="choose-tick" data-value={o.value} onClick={() => toggle(o.value)}>
                <span aria-hidden="true" className="tick-box" data-on={on ? 'yes' : 'no'} />
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
