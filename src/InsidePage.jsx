import { useCallback } from 'react';
import { Pager, PrintHead, ProblemNote, Stored, useGarageRead, usePaging, usePrint } from './parts.jsx';
import { InsideCounts } from './Home.jsx';
import { garageTime } from './time.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/**
 * Garage View: the open stays, oldest first, as the platform returns them,
 * twenty at a time. Read only. (Its garage map comes in a later round.)
 */
export default function InsidePage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const inside = useGarageRead(useCallback((id) => client.carsInside(id), [client]), garage.id);
  const paging = usePaging(inside.data?.sessions.length ?? 0);

  if (inside.problem) return <ProblemNote t={t} kind={inside.problem} onRetry={inside.retry} />;
  if (!inside.data) return <p className="quiet">{t('loading')}</p>;
  const stays = inside.data.sessions;

  return (
    <section className="panel printable" data-list="inside">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={inside.readAt} />
      <div className="list-head">
        <h2 className="section-title">{t('page.inside.title')}</h2>
        {stays.length ? <ListActions t={t} list="inside" language={language} client={client} garage={garage} refresh={inside.refresh} print={print} /> : null}
      </div>
      <InsideCounts t={t} data={inside.data} />
      {stays.length === 0 ? (
        <p className="quiet">{t('inside.empty')}</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="inside.plate" />
              </th>
              <th>
                <FieldName t={t} name="inside.ticket" />
              </th>
              <th>
                <FieldName t={t} name="inside.letIn" />
              </th>
              <th>
                <FieldName t={t} name="inside.lane" />
              </th>
              <th>
                <FieldName t={t} name="inside.confirmed" />
              </th>
            </tr>
          </thead>
          <tbody>
            {stays.map((s, i) => (
              <tr key={s.id} data-stay={s.id} className={paging.row(i)}>
                <td>
                  <Stored parts={[s.plate, s.plate_region]} />
                </td>
                <td>
                  <Stored parts={[s.ticket_ref]} />
                </td>
                <td data-time={s.entry_at}>{garageTime(s.entry_at, garage.timezone, language)}</td>
                <td>
                  <bdi>{s.entry_lane}</bdi>
                </td>
                <td>{s.entry_confirmation === 'confirmed' ? t('yes') : t('no')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager t={t} language={language} paging={paging} list="inside" />
    </section>
  );
}
