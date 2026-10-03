import { useCallback } from 'react';
import { PrintButton, PrintHead, ProblemNote, useGarageRead, usePrint } from './parts.jsx';
import { InsideCounts } from './Home.jsx';
import { garageTime } from './time.js';

/** The open stays, oldest first, as the platform returns them. Read only. */
export default function InsidePage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const inside = useGarageRead(useCallback((id) => client.carsInside(id), [client]), garage.id);

  if (inside.problem) return <ProblemNote t={t} kind={inside.problem} onRetry={inside.retry} />;
  if (!inside.data) return <p className="quiet">{t('loading')}</p>;
  const stays = inside.data.sessions;

  return (
    <section className="panel printable" data-list="inside">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} />
      <div className="list-head">
        <h2 className="section-title">{t('page.inside.title')}</h2>
        <PrintButton t={t} onPrint={print} />
      </div>
      <InsideCounts t={t} data={inside.data} />
      {stays.length === 0 ? (
        <p className="quiet">{t('inside.empty')}</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>{t('inside.plate')}</th>
              <th>{t('inside.ticket')}</th>
              <th>{t('inside.cameIn')}</th>
              <th>{t('inside.lane')}</th>
              <th>{t('inside.confirmed')}</th>
            </tr>
          </thead>
          <tbody>
            {stays.map((s) => (
              <tr key={s.id} data-stay={s.id}>
                <td>{[s.plate, s.plate_region].filter(Boolean).join(' · ') || '–'}</td>
                <td>{s.ticket_ref || '–'}</td>
                <td data-time={s.entry_at}>{garageTime(s.entry_at, garage.timezone, language)}</td>
                <td>{s.entry_lane}</td>
                <td>{s.entry_confirmation === 'confirmed' ? t('yes') : t('no')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
