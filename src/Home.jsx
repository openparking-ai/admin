import { useCallback } from 'react';
import { Pager, ProblemNote, useGarageRead, useNow, usePaging } from './parts.jsx';
import { directionKey, laneWords } from './lanes.js';
import { insideWords } from './inside.js';
import FieldName from './FieldName.jsx';

/**
 * Home: the owner's garages first, each with one line on whether its lanes
 * are working and how many cars are inside; one garage is a list of one.
 * Choosing one shows, under the list, that garage at a glance: each lane and
 * whether it is working, and how many cars are inside. Every figure is the
 * platform's; a breakdown by kind of customer is shown only when the platform
 * returns one, and today it does not.
 */
export default function Home({ t, language, client, garages, garage, onChoose }) {
  return (
    <>
      <GarageList t={t} language={language} client={client} garages={garages} chosen={garage?.id ?? null} onChoose={onChoose} />
      {garage ? <GarageDetail key={garage.id} t={t} language={language} client={client} garage={garage} /> : null}
    </>
  );
}

function GarageList({ t, language, client, garages, chosen, onChoose }) {
  const paging = usePaging(garages.length);
  return (
    <section className="panel" data-section="garages">
      <h2 className="section-title">
        <FieldName t={t} name="home.garages" />
      </h2>
      <ul className="garage-list home-garages" data-list="garages">
        {garages.map((g, i) => (
          <GarageRow key={g.id} t={t} language={language} client={client} garage={g} chosen={g.id === chosen} onChoose={onChoose} className={paging.row(i)} />
        ))}
      </ul>
      <Pager t={t} language={language} paging={paging} list="garages" />
    </section>
  );
}

/** How many of a garage's lanes are working, in words. */
export function lanesLine(t, data, garage, language, now) {
  const lanes = data.lanes;
  if (lanes.length === 0) return t('home.lanesNone');
  const working = lanes.filter((lane) => laneWords(t, lane, garage, language, now, data.quietMinutes).state === 'working').length;
  if (lanes.length === 1) return t(working ? 'home.laneWorking' : 'home.laneNotWorking');
  return t('home.lanesWorking', { working, lanes: lanes.length });
}

/** One garage of the list: its name, its one line, and whether it is open. Pressed, it is the garage these pages show. */
function GarageRow({ t, language, client, garage, chosen, onChoose, className }) {
  const now = useNow();
  const lanes = useGarageRead(useCallback((id) => client.lanes(id), [client]), garage.id);
  const inside = useGarageRead(useCallback((id) => client.carsInside(id), [client]), garage.id);
  const part = (read, words) => (read.problem ? t('home.notRead') : read.data ? words(read.data) : t('loading'));
  const state = (read) => (read.problem ? 'failed' : read.data ? 'read' : 'reading');
  return (
    <li className={className} data-garage-row={garage.id}>
      <button type="button" className="garage-choice" data-garage={garage.id} aria-current={chosen ? 'true' : undefined} onClick={() => onChoose(garage.id)}>
        <span className="garage-choice-name">
          <bdi>{garage.name}</bdi>
        </span>
        <span className="garage-line">
          <span data-line="lanes" data-read={state(lanes)}>
            {part(lanes, (data) => lanesLine(t, data, garage, language, now))}
          </span>
          {' · '}
          <span data-line="inside" data-read={state(inside)}>
            {part(inside, (data) => insideWords(t, data).figure)}
          </span>
        </span>
        <span className="tag">{garage.live ? t('garage.live') : t('garage.notLive')}</span>
      </button>
    </li>
  );
}

/** The chosen garage at a glance, as Home showed it before the list (U7a). */
function GarageDetail({ t, language, client, garage }) {
  const now = useNow();
  const lanes = useGarageRead(useCallback((id) => client.lanes(id), [client]), garage.id);
  const inside = useGarageRead(useCallback((id) => client.carsInside(id), [client]), garage.id);
  const paging = usePaging(lanes.data?.lanes.length ?? 0);

  return (
    <div className="home-detail" data-detail={garage.id}>
      <h2 className="home-detail-title">
        <bdi>{garage.name}</bdi>
      </h2>
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
            <>
              <ul className="lane-list">
                {lanes.data.lanes.map((lane, i) => {
                  const words = laneWords(t, lane, garage, language, now, lanes.data.quietMinutes);
                  const off = paging.row(i);
                  return (
                    <li key={lane.id} className={off ? `lane-row ${off}` : 'lane-row'} data-state={words.state}>
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
              <Pager t={t} language={language} paging={paging} list="home-lanes" />
            </>
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
