import { Fragment, useCallback } from 'react';
import { Pager, PrintHead, ProblemNote, useGarageRead, usePaging, usePrint } from './parts.jsx';
import { changedFields, lastWords, timesWords, whatPieces, whenWords, whoPieces, whyWords } from './changes.js';
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

function ChangesList({ t, language, client, garage, pages: log, printedAt, print }) {
  const paging = usePaging(log.data?.changes.length ?? 0);
  if (log.problem) return <ProblemNote t={t} kind={log.problem} onRetry={log.retry} />;
  if (!log.data) return <p className="quiet">{t('loading')}</p>;
  const lines = log.data.changes;
  return (
    <section className="panel printable" data-list="changes">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={log.readAt} />
      <div className="list-head">
        <h2 className="section-title">{t('page.changes.title')}</h2>
        {lines.length ? <ListActions t={t} list="changes" language={language} client={client} garage={garage} refresh={log.refresh} print={print} /> : null}
      </div>
      {lines.length === 0 ? (
        <p className="quiet">{t('changes.none')}</p>
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
      <Pager t={t} language={language} paging={paging} list="changes" />
    </section>
  );
}

function RefusedList({ t, language, client, garage, pages: log, printedAt, print }) {
  const paging = usePaging(log.data?.refused.length ?? 0);
  if (log.problem) return <ProblemNote t={t} kind={log.problem} onRetry={log.retry} />;
  if (!log.data) return <p className="quiet">{t('loading')}</p>;
  const lines = log.data.refused;
  const attempts = log.data.count?.attempts ?? 0;
  return (
    <section className="panel printable" data-list="refused">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={log.readAt} />
      <div className="list-head">
        <h2 className="section-title">{t('refused.title')}</h2>
        {lines.length ? <ListActions t={t} list="refused" language={language} client={client} garage={garage} refresh={log.refresh} print={print} /> : null}
      </div>
      {lines.length === 0 ? (
        <p className="quiet">{t('refused.none')}</p>
      ) : (
        <>
          <p className="quiet" data-count={attempts}>
            {attempts === 1 ? t('refused.countOne') : t('refused.countMany', { attempts: attempts.toLocaleString(language === 'es' ? 'es-US' : 'en-US') })}
          </p>
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
                  <td>
                    <Pieces pieces={whoPieces(t, line)} />
                  </td>
                  <td>
                    <Pieces pieces={whatPieces(t, line)} />
                  </td>
                  <td>{whyWords(t, line)}</td>
                  <td>{timesWords(line, language)}</td>
                  <td data-time={line.last_at ?? line.at}>{lastWords(line, garage, language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <Pager t={t} language={language} paging={paging} list="refused" />
    </section>
  );
}
