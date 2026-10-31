import { Fragment, useCallback, useEffect, useState } from 'react';
import { Email, Pager, ProblemNote, useGarageRead, usePaging } from './parts.jsx';
import { STALE, letOutPicturePath } from './api.js';
import { garageDateTime } from './time.js';
import {
  clockSaid, copyPieces, dayOn, daySaid, garageDayOf, gateLine, isDay, kindPieces, money, newestFirst, picturesOf, sentence, storyOf, whoPieces,
} from './exceptions.js';
import FieldName from './FieldName.jsx';

/** Pieces of words: stored text kept apart in <bdi>, an address as one, never markup. */
function Pieces({ pieces }) {
  return pieces.map((p, i) =>
    p.email !== undefined ? <Email key={i} address={p.email} /> : p.stored !== undefined ? <bdi key={i}>{p.stored}</bdi> : <Fragment key={i}>{p.words}</Fragment>,
  );
}

/** A lane's name from the garage's lanes as read. */
function LaneName({ t, lanes, id }) {
  if (!lanes.data) return lanes.problem ? t('exceptions.laneUnknown') : t('loading');
  const lane = lanes.data.find((l) => l.id === id);
  return lane ? <bdi>{lane.name}</bdi> : t('exceptions.laneUnknown');
}

/**
 * One car's whole story, read when it is opened. An answer after the page has
 * gone, or after a sign-out, is dropped.
 */
function useStory(client, garageId, id) {
  const [held, setHeld] = useState(null);
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    setHeld(null);
    client.letOutStory(garageId, id).then(
      (whole) => live && setHeld({ id, whole }),
      (p) => live && p?.kind !== STALE && p?.kind !== 'ended' && setHeld({ id, problem: p?.kind ?? 'unexpected' }),
    );
    return () => {
      live = false;
    };
  }, [client, garageId, id]);
  return held?.id === id ? held : null;
}

/**
 * The cars a person let out at this garage (platform 0048), one day at a
 * time -- the garage's own day -- newest first, each with who let it out,
 * what it owed and what the gate agent kept; and one car's whole story. Read
 * only: nothing here charges a card or changes a record.
 */
export default function ExceptionsPage({ t, language, client, garage }) {
  const [day, setDay] = useState(null); // null: today, as the platform says it
  const [today, setToday] = useState(null);
  const [open, setOpen] = useState(null);
  // A date being typed in the box, until it is a whole day.
  const [typed, setTyped] = useState(null);
  const list = useGarageRead(useCallback((id) => client.letOutDay(id, day), [client, day]), garage.id);
  const lanes = useGarageRead(useCallback((id) => client.lanes(id).then((d) => d.lanes), [client]), garage.id);
  const shown = list.data?.day ?? null;
  useEffect(() => {
    if (day === null && shown) setToday(shown);
  }, [day, shown]);
  const letOuts = list.data ? newestFirst(list.data.letOuts) : null;
  const story = useStory(client, garage.id, open);
  const paging = usePaging(letOuts?.length ?? 0);

  const go = (next) => {
    setOpen(null);
    setTyped(null);
    setDay(next === today ? null : next);
  };
  const asked = day ?? today;
  const reading = !list.problem && (!list.data || (asked !== null && asked !== shown));

  if (open) {
    return (
      <Story
        t={t}
        language={language}
        garage={garage}
        lanes={lanes}
        held={story}
        summary={letOuts?.find((x) => x.id === open)?.gate_agent ?? null}
        day={shown}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <section className="panel" data-list="exceptions">
      <div className="list-head">
        <h2 className="section-title">{t('page.exceptions.title')}</h2>
      </div>
      <p className="quiet" data-notice="read-only">
        {t('exceptions.readOnly')}
      </p>
      <div className="exceptions-day no-print">
        <label className="field">
          <FieldName t={t} name="exceptions.day" />
          <input
            type="date"
            data-field="day"
            value={typed ?? shown ?? ''}
            max={today ?? undefined}
            onChange={(e) => {
              setTyped(e.target.value);
              if (isDay(e.target.value)) go(e.target.value);
            }}
          />
        </label>
        <div className="lane-actions">
          <button type="button" className="link-button" data-action="previous-day" disabled={!shown} onClick={() => go(dayOn(shown, -1))}>
            {t('exceptions.previousDay')}
          </button>
          <button type="button" className="link-button" data-action="next-day" disabled={!shown || !today || shown >= today} onClick={() => go(dayOn(shown, 1))}>
            {t('exceptions.nextDay')}
          </button>
          <button type="button" className="link-button" data-action="today" disabled={day === null && !list.problem} onClick={() => (day === null ? list.retry() : go(today))}>
            {t('exceptions.today')}
          </button>
        </div>
      </div>
      {list.problem ? <ProblemNote t={t} kind={list.problem} onRetry={list.retry} /> : null}
      {reading ? <p className="quiet">{t('loading')}</p> : null}
      {letOuts && !reading ? (
        <>
          <p data-notice="day" data-day={shown}>
            {t('exceptions.on', { day: daySaid(shown, language) })}
          </p>
          {letOuts.length === 0 ? (
            <p className="quiet" data-notice="none-let-out">
              {t('exceptions.none')}
            </p>
          ) : (
            <>
              <p className="quiet" data-notice="count">
                {letOuts.length === 1 ? t('exceptions.countOne') : t('exceptions.countMany', { n: letOuts.length.toLocaleString(language === 'es' ? 'es-US' : 'en-US') })}{' '}
                {list.data.owing !== null ? t('exceptions.owingCount', { n: list.data.owing.toLocaleString(language === 'es' ? 'es-US' : 'en-US') }) : null}
              </p>
              <table className="list exceptions">
                <thead>
                  <tr>
                    <th>
                      <FieldName t={t} name="exceptions.time" />
                    </th>
                    <th>
                      <FieldName t={t} name="exceptions.lane" />
                    </th>
                    <th>
                      <FieldName t={t} name="exceptions.who" />
                    </th>
                    <th>
                      <FieldName t={t} name="exceptions.owed" />
                    </th>
                    <th>
                      <FieldName t={t} name="exceptions.gate" />
                    </th>
                    <th>
                      <FieldName t={t} name="exceptions.open" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {letOuts.map((x, i) => {
                    const gate = gateLine(t, x.gate_agent, language);
                    return (
                      <tr key={x.id} data-let-out={x.id} data-kind={x.kind} className={paging.row(i)}>
                        <td data-time={x.let_out_at}>{clockSaid(x.let_out_at, garage.timezone, language, shown)}</td>
                        <td>
                          <LaneName t={t} lanes={lanes} id={x.lane_id} />
                        </td>
                        <td data-who>
                          <Pieces pieces={whoPieces(t, x.by)} />
                        </td>
                        <td data-owed={x.owed_minor}>{x.kind === 'barrier_opened' ? t('exceptions.owedNothing') : money(x.owed_minor, x.currency, language)}</td>
                        <td data-gate={gate.state}>{gate.text}</td>
                        <td>
                          <button type="button" className="link-button" data-action="open-let-out" onClick={() => setOpen(x.id)}>
                            {t('exceptions.openButton')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pager t={t} language={language} paging={paging} list="exceptions" />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

/** One car's whole story: what is known of it at a glance, then every step in order, then what the gate agent was asked. */
function Story({ t, language, garage, lanes, held, summary, day, onBack }) {
  const back = (
    <p className="no-print">
      <button type="button" className="link-button" data-action="back-to-day" onClick={onBack}>
        {t('exceptions.back', { day: day ? daySaid(day, language) : t('exceptions.today') })}
      </button>
    </p>
  );
  if (!held) {
    return (
      <section className="panel" data-story="reading">
        {back}
        <p className="quiet">{t('loading')}</p>
      </section>
    );
  }
  if (held.problem) {
    return (
      <section className="panel" data-story="problem">
        {back}
        <ProblemNote t={t} kind={held.problem} />
      </section>
    );
  }
  const x = held.whole;
  const zone = garage.timezone;
  const items = storyOf(t, x, { lanes: lanes.data ?? [], timeZone: zone, language });
  const pictures = picturesOf(t, x, { lanes: lanes.data ?? [], timeZone: zone, language });
  // The garage's day of the let-out: a time on another day says its date.
  const storyDay = garageDayOf(x.let_out_at, zone);
  return (
    <section className="panel" data-story={x.id}>
      {back}
      <dl className="exception-facts">
        <div>
          <dt>
            <FieldName t={t} name="exceptions.when" />
          </dt>
          <dd data-fact="when" data-time={x.let_out_at}>
            {garageDateTime(x.let_out_at, zone, language)}
          </dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.lane" />
          </dt>
          <dd data-fact="lane">
            <LaneName t={t} lanes={lanes} id={x.lane_id} />
          </dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.what" />
          </dt>
          <dd data-fact="what">
            <Pieces pieces={kindPieces(t, x, language)} />
          </dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.who" />
          </dt>
          <dd data-fact="who">
            <Pieces pieces={whoPieces(t, x.by)} />
          </dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.reason" />
          </dt>
          <dd data-fact="reason">{x.reason ? <bdi>{x.reason}</bdi> : <span className="quiet">{t('exceptions.noReason')}</span>}</dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.owed" />
          </dt>
          <dd data-fact="owed">{x.kind === 'barrier_opened' ? t('exceptions.owedNothing') : money(x.owed_minor, x.currency, language)}</dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.paid" />
          </dt>
          <dd data-fact="paid">{money(x.paid_minor, x.currency, language)}</dd>
        </div>
        <div>
          <dt>
            <FieldName t={t} name="exceptions.gate" />
          </dt>
          <dd data-fact="gate">{gateLine(t, summary, language).text}</dd>
        </div>
      </dl>

      <h3 className="section-title">
        <FieldName t={t} name="exceptions.pictures" />
      </h3>
      {pictures.every((g) => g.pictures.length === 0) ? (
        <p className="quiet" data-notice="no-pictures">
          {t('exceptions.noPictures')}
        </p>
      ) : (
        <div className="exception-pictures">
          {pictures
            .filter((g) => g.pictures.length)
            .map((g) => (
              <div key={g.kind} data-pictures={g.kind}>
                <p>{t(`exceptions.pictures.${g.kind}`)}</p>
                <ul className="exception-picture-list">
                  {g.pictures.map((p) => {
                    const path = letOutPicturePath(garage.id, x.id, p.id);
                    return (
                      <li key={p.id} data-picture={p.id} data-at={p.at}>
                        <a href={path} target="_blank" rel="noopener noreferrer">
                          <img className="banned-picture" src={path} alt={p.alt} width="120" height="80" loading="lazy" />
                        </a>
                        <span className="quiet">
                          <Pieces pieces={p.caption} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}

      <h3 className="section-title">
        <FieldName t={t} name="exceptions.story" />
      </h3>
      <ol className="story">
        {items.map((item, i) => (
          <li key={i} className="story-step" data-type={item.type} data-at={item.at} data-record={item.record}>
            <span className="story-time">{item.time}</span>
            <div className="story-body">
              <p className="story-title">
                <Pieces pieces={item.title} />
              </p>
              {item.lines.map((line, j) => (
                <p key={j} className="quiet">
                  <Pieces pieces={line} />
                </p>
              ))}
              {item.deliveries?.length ? (
                <ul className="story-deliveries">
                  {item.deliveries.map((d, j) => (
                    <li key={j} data-delivery={d.state}>
                      <Pieces pieces={d.pieces} /> <span className="quiet">· {d.tries}</span>
                      {d.why.map((why, k) => (
                        <span key={k} className="quiet story-why">
                          <Pieces pieces={why} />
                        </span>
                      ))}
                      {d.read ? (
                        <span className="quiet story-why">
                          <Pieces pieces={d.read} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <h3 className="section-title">
        <FieldName t={t} name="exceptions.records" />
      </h3>
      <p className="quiet" data-notice="window">
        <Pieces pieces={sentence(t, 'exceptions.window', { from: clockSaid(x.window.from, zone, language, storyDay), to: clockSaid(x.window.to, zone, language, storyDay) })} />
      </p>
      {['messages', 'calls'].map((source) => (
        <div key={source} className="story-copies" data-copies={source}>
          <p>{t(`exceptions.copies.${source}`)}</p>
          {(x.gate_agent[source] ?? []).length === 0 ? (
            <p className="quiet">{t('exceptions.copies.none')}</p>
          ) : (
            <ul>
              {x.gate_agent[source].map((copy) => (
                <li key={copy.id} data-copy={copy.state} data-complete={copy.complete ? 'yes' : 'no'}>
                  <Pieces pieces={copyPieces(t, copy, source, { timeZone: zone, language, day: storyDay })} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
