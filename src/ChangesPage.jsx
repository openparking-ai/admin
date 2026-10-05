import { Fragment, useCallback, useState } from 'react';
import { PrintHead, ProblemNote, useGarageRead, usePrint } from './parts.jsx';
import { changedFields, outcomeWords, whatPieces, whenWords, whoPieces } from './changes.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/** Pieces of words, each stored text kept apart on its own. */
function Pieces({ pieces }) {
  return pieces.map((p, i) => (p.stored !== undefined ? <bdi key={i}>{p.stored}</bdi> : <Fragment key={i}>{p.words}</Fragment>));
}

/**
 * Every change made to this garage and its account -- who, what, before and
 * after, when, in the garage's own time -- and every refused attempt, marked
 * as refused. Newest first; older lines a page at a time. Printed and
 * downloaded as the other lists are: each reads the log again first, as far
 * back as the screen shows.
 */
export default function ChangesPage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const [pages, setPages] = useState(1);
  const read = useCallback(
    async (id) => {
      const lines = [];
      let next = null;
      for (let page = 0; page < pages; page += 1) {
        const got = await client.changes(id, next);
        lines.push(...got.changes);
        next = got.next;
        if (!next) break;
      }
      return { changes: lines, more: Boolean(next) };
    },
    [client, pages],
  );
  const log = useGarageRead(read, garage.id);

  if (log.problem) return <ProblemNote t={t} kind={log.problem} onRetry={log.retry} />;
  if (!log.data) return <p className="quiet">{t('loading')}</p>;
  const lines = log.data.changes;

  return (
    <section className="panel printable" data-list="changes">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={log.readAt} />
      <div className="list-head">
        <h2 className="section-title">{t('page.changes.title')}</h2>
        <ListActions t={t} list="changes" language={language} client={client} garage={garage} refresh={log.refresh} print={print} />
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
              <th>
                <FieldName t={t} name="changes.outcome" />
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const fields = changedFields(t, line, garage, language);
              return (
                <tr key={line.id} data-change={line.id} data-outcome={line.outcome} className={line.outcome === 'refused' ? 'is-refused' : undefined}>
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
                  <td>{line.outcome === 'refused' ? <span className="tag tag-refused">{outcomeWords(t, line)}</span> : outcomeWords(t, line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {log.data.more ? (
        <p className="no-print">
          <button type="button" className="link-button" data-action="older" onClick={() => setPages((n) => n + 1)}>
            {t('changes.older')}
          </button>
        </p>
      ) : null}
    </section>
  );
}
