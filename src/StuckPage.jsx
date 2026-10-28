import { Fragment, useCallback, useState } from 'react';
import { Pager, ProblemNote, Stored, useGarageRead, usePaging } from './parts.jsx';
import { STALE, stayPicturePath } from './api.js';
import { garageTime } from './time.js';
import { wallAt } from './rates.js';
import { REASON_MAX, endedWords, hoursTyped, leftAtTyped, leftNow, plateParts, reasonProblem, whyListed } from './stuck.js';
import FieldName from './FieldName.jsx';

const COLUMNS = 6;
/** A stay that is no longer there to end: the list is read again for the person. */
const GONE = ['stayGone', 'stayNotOpen'];

/**
 * Stuck stays (platform 0043): the garage's open stays older than its own
 * number of hours, or not seen on its latest walk, oldest first, each with
 * its entry pictures. A person ends one -- the car left, at a time they say,
 * priced by the rates and shown as owed -- or writes it off, owing nothing;
 * each with a reason. Nothing here charges a card.
 */
export default function StuckPage({ t, language, client, garage }) {
  const stuck = useGarageRead(useCallback((id) => client.stuckStays(id), [client]), garage.id);
  const paging = usePaging(stuck.data?.stays.length ?? 0);
  const [ending, setEnding] = useState(null);
  const [said, setSaid] = useState(null);
  const [gone, setGone] = useState(null);

  if (stuck.problem) return <ProblemNote t={t} kind={stuck.problem} onRetry={stuck.retry} />;
  if (!stuck.data) return <p className="quiet">{t('loading')}</p>;
  const { stuckAfterHours, stays } = stuck.data;
  const readAgain = () => stuck.refresh().catch(() => {});
  const open = (stay, outcome) => {
    setSaid(null);
    setGone(null);
    setEnding({ id: stay.id, outcome });
  };

  return (
    <section className="panel" data-list="stuck">
      <div className="list-head">
        <h2 className="section-title">{t('page.stuck.title')}</h2>
      </div>
      <StuckHours t={t} language={language} client={client} garage={garage} hours={stuckAfterHours} onChanged={readAgain} />
      <p className="quiet" data-notice="never-charged">
        {t('stuck.neverCharged')}
      </p>
      {said ? (
        <p className="saved-note" role="status" data-notice="stay-ended">
          {said}
        </p>
      ) : null}
      {gone ? <ProblemNote t={t} kind={gone} /> : null}
      {stays.length === 0 ? (
        <p className="quiet" data-notice="none-stuck">
          {t('stuck.empty')}
        </p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="stuck.pictures" />
              </th>
              <th>
                <FieldName t={t} name="stuck.plate" />
              </th>
              <th>
                <FieldName t={t} name="stuck.cameIn" />
              </th>
              <th>
                <FieldName t={t} name="stuck.lane" />
              </th>
              <th>
                <FieldName t={t} name="stuck.why" />
              </th>
              <th>
                <FieldName t={t} name="stuck.end" />
              </th>
            </tr>
          </thead>
          <tbody>
            {stays.map((s, i) => {
              const plate = plateParts(t, s);
              const asking = ending?.id === s.id ? ending.outcome : null;
              return (
                <Fragment key={s.id}>
                  <tr data-stay={s.id} data-why={s.why} className={paging.row(i)}>
                    <td className="banned-pictures">
                      {s.pictures.map((picture) => (
                        <img
                          key={picture.id}
                          className="banned-picture"
                          src={stayPicturePath(garage.id, s.id, picture.id)}
                          alt={plate.stored.length ? t('stuck.pictureOf', { plate: s.plate }) : t('stuck.pictureOfCar')}
                          width="120"
                          height="80"
                          loading="lazy"
                        />
                      ))}
                      {s.pictures.length === 0 ? t('stuck.noPicture') : null}
                    </td>
                    <td>
                      {plate.stored.length ? <Stored parts={plate.stored} /> : null}
                      {plate.words ? <span className="quiet"> {plate.words}</span> : null}
                    </td>
                    <td data-time={s.entered_at}>{garageTime(s.entered_at, garage.timezone, language)}</td>
                    <td>{s.entry_lane ? <bdi>{s.entry_lane}</bdi> : '–'}</td>
                    <td>
                      {whyListed(t, s, stuckAfterHours)}
                      {s.last_seen_on_walk ? (
                        <span className="quiet" data-time={s.last_seen_on_walk}>
                          {' '}
                          {t('stuck.lastSeen', { time: garageTime(s.last_seen_on_walk, garage.timezone, language) })}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {s.at_exit ? (
                        <span data-notice="at-exit">{t('stuck.atExit')}</span>
                      ) : (
                        <div className="lane-actions">
                          <button type="button" className="link-button" data-action="end-stay" aria-pressed={asking === 'ended'} onClick={() => open(s, 'ended')}>
                            {t('stuck.endButton')}
                          </button>
                          <button type="button" className="link-button" data-action="abandon-stay" aria-pressed={asking === 'abandoned'} onClick={() => open(s, 'abandoned')}>
                            {t('stuck.abandonButton')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {asking ? (
                    <tr className={paging.row(i)} data-ending={s.id}>
                      <td colSpan={COLUMNS}>
                        <EndForm
                          key={asking}
                          t={t}
                          language={language}
                          client={client}
                          garage={garage}
                          stay={s}
                          outcome={asking}
                          onClose={() => setEnding(null)}
                          onEnded={(words) => {
                            setEnding(null);
                            setSaid(words);
                            readAgain();
                          }}
                          onGone={(kind) => {
                            setEnding(null);
                            setGone(kind);
                            readAgain();
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      <Pager t={t} language={language} paging={paging} list="stuck" />
    </section>
  );
}

/**
 * The garage's own number of hours before an open stay is listed: shown,
 * with a Change that opens one field in place. Saved through the platform,
 * which keeps it in the change log; the list is read again after.
 */
function StuckHours({ t, language, client, garage, hours, onChanged }) {
  const [typed, setTyped] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async () => {
    const value = hoursTyped(typed);
    if (value === null) return setProblem('stuckHoursRefused');
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await client.setStuckAfterHours(garage.id, value);
      setTyped(null);
      await onChanged();
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stuck-hours" data-hours={hours}>
      {typed === null ? (
        <p>
          <FieldName t={t} name="stuck.hours" />{' '}
          <span data-fact="hours">{hours === 1 ? t('stuck.hoursOne') : t('stuck.hoursMany', { hours: hours.toLocaleString(language === 'es' ? 'es-US' : 'en-US') })}</span>{' '}
          <button type="button" className="link-button" data-action="change-hours" onClick={() => setTyped(String(hours))}>
            {t('stuck.hoursChange')}
          </button>
        </p>
      ) : (
        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field">
            <FieldName t={t} name="stuck.hours" />
            <input type="text" inputMode="numeric" size={5} value={typed} data-field="stuck-hours" onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="lane-actions">
            <button type="submit" className="primary-button" data-action="save-hours" disabled={busy}>
              {busy ? t('stuck.hoursSaving') : t('stuck.hoursSave')}
            </button>
            <button type="button" className="link-button" data-action="cancel-hours" onClick={() => { setTyped(null); setProblem(null); }}>
              {t('stuck.hoursCancel')}
            </button>
          </div>
        </form>
      )}
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}

/**
 * Ending one stay: when the car left, on the garage's clock (the car left
 * only), and the reason, which the platform requires and keeps as typed.
 */
function EndForm({ t, language, client, garage, stay, outcome, onClose, onEnded, onGone }) {
  const left = outcome === 'ended';
  const [wall, setWall] = useState(() => leftNow(garage));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const submit = async () => {
    if (busy) return;
    const refused = reasonProblem(reason);
    if (refused) return setProblem(refused);
    let leftAt = null;
    if (left) {
      const typed = leftAtTyped(wall, stay, garage);
      if (typed.problem) return setProblem(typed.problem);
      leftAt = typed.at;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await client.endStay(garage.id, stay.id, { outcome, reason, leftAt });
      onEnded(endedWords(t, outcome, result, language));
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
      if (GONE.includes(p?.kind)) return onGone(p.kind);
      setProblem(p?.kind ?? 'unexpected');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="setup-form"
      data-form={left ? 'end-stay' : 'abandon-stay'}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {left ? (
        <label className="field">
          <FieldName t={t} name="stuck.leftAt" />
          <input type="datetime-local" step={60} value={wall} min={wallAt(Date.parse(stay.entered_at), garage.timezone)} max={leftNow(garage)} data-field="left-at" onChange={(e) => setWall(e.target.value)} />
        </label>
      ) : null}
      <label className="field">
        <FieldName t={t} name="stuck.reason" />
        <input type="text" value={reason} maxLength={REASON_MAX} data-field="reason" onChange={(e) => setReason(e.target.value)} autoComplete="off" />
      </label>
      <p className="quiet" data-notice={left ? 'priced-owed' : 'owes-nothing'}>
        {left ? t('stuck.endNote') : t('stuck.abandonNote')}
      </p>
      <div className="lane-actions">
        <button type="submit" className="primary-button" data-action={left ? 'end-stay-yes' : 'abandon-stay-yes'} disabled={busy}>
          {busy ? t('stuck.ending') : left ? t('stuck.endYes') : t('stuck.abandonYes')}
        </button>
        <button type="button" className="link-button" data-action="end-stay-keep" onClick={onClose}>
          {t('stuck.keep')}
        </button>
      </div>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}
