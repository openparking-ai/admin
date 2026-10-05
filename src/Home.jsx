import { useCallback } from 'react';
import { ProblemNote, useGarageRead, useNow } from './parts.jsx';
import { directionKey, laneWords } from './lanes.js';
import { insideWords } from './inside.js';
import FieldName from './FieldName.jsx';

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
        <h2 className="section-title">
          <FieldName t={t} name="home.lanes" />
        </h2>
        {lanes.problem ? (
          <ProblemNote t={t} kind={lanes.problem} onRetry={lanes.retry} />
        ) : !lanes.data ? (
          <p className="quiet">{t('loading')}</p>
        ) : lanes.data.lanes.length === 0 ? (
          <p className="quiet">{t('lanes.none')}</p>
        ) : (
          <ul className="lane-list">
            {lanes.data.lanes.map((lane) => {
              const words = laneWords(t, lane, garage, language, now, lanes.data.quietMinutes);
              return (
                <li key={lane.id} className="lane-row" data-state={words.state}>
                  <span className="lane-name">
                    <bdi>{lane.name}</bdi>
                  </span>
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
        <h2 className="section-title">
          <FieldName t={t} name="home.inside" />
        </h2>
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
  const { figure, more } = insideWords(t, data);
  return (
    <div className="inside-counts">
      <p className="figure" data-figure="inside">
        {figure}
      </p>
      {more ? (
        <p className="quiet" data-figure="unconfirmed">
          {more}
        </p>
      ) : null}
    </div>
  );
}
