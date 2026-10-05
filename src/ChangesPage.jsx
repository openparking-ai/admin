import { Fragment, useCallback, useState } from 'react';
import { PrintHead, ProblemNote, useGarageRead, usePrint } from './parts.jsx';
import { changedFields, lastWords, timesWords, whatPieces, whenWords, whoPieces, whyWords } from './changes.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/** Pieces of words, each stored text kept apart on its own. */
function Pieces({ pieces }) {
  return pieces.map((p, i) => (p.stored !== undefined ? <bdi key={i}>{p.stored}</bdi> : <Fragment key={i}>{p.words}</Fragment>));
}

/**
 * `pages` pages of one of the garage's two lists -- `read` is the client's
 * changes or refused read -- newest first, and whether there are more.
 */
function usePages(client, garageId, what) {
  const [pages, setPages] = useState(1);
  const read = useCallback(
    async (id) => {
      const lines = [];
      let next = null;
      let count = null;
      for (let page = 0; page < pages; page += 1) {
        const got = await client[what](id, next);
        lines.push(...got[what]);
        count = got.count ?? count;
        next = got.next;
        if (!next) break;
      }
      return { [what]: lines, more: Boolean(next), count };
    },
    [client, pages, what],
  );
  return { log: useGarageRead(read, garageId), older: () => setPages((n) => n + 1) };
}

/**
 * The garage's change log: every change made to it and its account -- who,
 * what, before and after, when, in the garage's own time -- newest first,
 * older ones a page at a time. Below it and apart, every refused attempt,
 * with how many there are: so no number of refused attempts can push a
 * change out of sight. Each list prints and downloads as the other lists do,
 * reading itself again first, as far back as the screen shows.
 */
export default function ChangesPage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const changes = usePages(client, garage.id, 'changes');
  const refused = usePages(client, garage.id, 'refused');

  return (
    <>
      <ChangesList t={t} language={language} client={client} garage={garage} pages={changes} printedAt={printedAt} print={print} />
      <RefusedList t={t} language={language} client={client} garage={garage} pages={refused} printedAt={printedAt} print={print} />
    </>
  );
}

function ChangesList({ t, language, client, garage, pages, printedAt, print }) {
  const { log, older } = pages;
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
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const fields = changedFields(t, line, garage, language);
              return (
                <tr key={line.id} data-change={line.id} data-outcome={line.outcome}>
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
      {log.data.more ? (
        <p className="no-print">
          <button type="button" className="link-button" data-action="older" onClick={older}>
            {t('changes.older')}
          </button>
        </p>
      ) : null}
    </section>
  );
}

function RefusedList({ t, language, client, garage, pages, printedAt, print }) {
  const { log, older } = pages;
  if (log.problem) return <ProblemNote t={t} kind={log.problem} onRetry={log.retry} />;
  if (!log.data) return <p className="quiet">{t('loading')}</p>;
  const lines = log.data.refused;
  const attempts = log.data.count?.attempts ?? 0;
  return (
    <section className="panel printable" data-list="refused">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={log.readAt} />
      <div className="list-head">
        <h2 className="section-title">{t('refused.title')}</h2>
        <ListActions t={t} list="refused" language={language} client={client} garage={garage} refresh={log.refresh} print={print} />
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
              {lines.map((line) => (
                <tr key={line.id} data-change={line.id} data-outcome="refused" className="is-refused">
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
      {log.data.more ? (
        <p className="no-print">
          <button type="button" className="link-button" data-action="older-refused" onClick={older}>
            {t('refused.older')}
          </button>
        </p>
      ) : null}
    </section>
  );
}
