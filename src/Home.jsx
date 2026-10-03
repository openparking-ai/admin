import { useCallback } from 'react';
import { ProblemNote, useGarageRead, useNow } from './parts.jsx';
import { directionKey, laneWords } from './lanes.js';

/**
 * At a glance: each lane and whether it is working, and how many cars are
 * inside. The count is the platform's; a breakdown by kind of customer is
 * shown only when the platform returns one, and today it does not.
 */
export default function Home({ t, language, client, garage }) {
  const now = useNow();
  const lanes = useGarageRead(useCallback((id) => client.lanes(id), [client]), garage.id);
  const inside = useGarageRead(useCallback((id) => client.carsInside(id), [client]), garage.id);

  return (
    <div className="home-grid">
      <section className="panel" data-section="lanes">
        <h2 className="section-title">{t('home.lanes')}</h2>
        {lanes.problem ? (
          <ProblemNote t={t} kind={lanes.problem} onRetry={lanes.retry} />
        ) : !lanes.data ? (
          <p className="quiet">{t('loading')}</p>
        ) : lanes.data.length === 0 ? (
          <p className="quiet">{t('lanes.none')}</p>
        ) : (
          <ul className="lane-list">
            {lanes.data.map((lane) => {
              const words = laneWords(t, lane, garage, language, now);
              return (
                <li key={lane.id} className="lane-row" data-state={words.state}>
                  <span className="lane-name">{lane.name}</span>
                  <span className="tag">{t(directionKey(lane))}</span>
                  <span className="lane-state">
                    <span className="dot" aria-hidden="true" />
                    {words.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel" data-section="inside">
        <h2 className="section-title">{t('home.inside')}</h2>
        {inside.problem ? (
          <ProblemNote t={t} kind={inside.problem} onRetry={inside.retry} />
        ) : !inside.data ? (
          <p className="quiet">{t('loading')}</p>
        ) : (
          <InsideCounts t={t} data={inside.data} />
        )}
      </section>
    </div>
  );
}

/** The platform's own figures: cars confirmed inside, and the open ones it could not confirm. */
export function InsideCounts({ t, data }) {
  const count = Number(data.inside_count) || 0;
  const unconfirmed = Number(data.unconfirmable_count) || 0;
  return (
    <div className="inside-counts">
      <p className="figure" data-figure="inside">
        {count === 0 ? t('inside.countNone') : count === 1 ? t('inside.countOne') : t('inside.countMany', { count })}
      </p>
      {unconfirmed > 0 ? (
        <p className="quiet" data-figure="unconfirmed">
          {unconfirmed === 1 ? t('inside.unconfirmedOne') : t('inside.unconfirmedMany', { count: unconfirmed })}
        </p>
      ) : null}
    </div>
  );
}
