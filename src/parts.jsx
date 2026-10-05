import { Fragment, useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { STALE, problemKey } from './api.js';
import { garageDateTime } from './time.js';
import FieldName from './FieldName.jsx';

/** Several garages: a plain list to pick from. */
export function GaragePicker({ t, garages, onChoose }) {
  return (
    <section className="panel">
      <h2 className="section-title">
        <FieldName t={t} name="garage.choose" />
      </h2>
      <ul className="garage-list">
        {garages.map((g) => (
          <li key={g.id}>
            <button type="button" className="garage-choice" data-garage={g.id} onClick={() => onChoose(g.id)}>
              <span className="garage-choice-name">
                <bdi>{g.name}</bdi>
              </span>
              <span className="quiet">{g.live ? t('garage.live') : t('garage.notLive')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Stored text (a plate and its region, a ticket), each part kept apart with
 * <bdi> so nothing in it can turn the words around it; parts joined by " · ",
 * and "–" when there is none.
 */
export function Stored({ parts }) {
  const given = parts.filter(Boolean);
  if (given.length === 0) return '–';
  return given.map((part, i) => (
    <Fragment key={i}>
      {i ? ' · ' : null}
      <bdi>{part}</bdi>
    </Fragment>
  ));
}

/** Something could not be shown. Words from the dictionaries only. */
export function ProblemNote({ t, kind, onRetry }) {
  return (
    <div className="problem-note" role="alert" data-problem={kind}>
      <p>{t(problemKey({ kind }))}</p>
      {onRetry ? (
        <button type="button" className="link-button" onClick={onRetry}>
          {t('retry')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * One read for a page, for one garage. An answer that arrives after the page
 * has gone, or after a sign-out, is dropped. A 401 is not this page's to show:
 * the client has already sent the owner to the sign-in screen.
 *
 * `refresh` reads again, now: the answer is drawn on screen before it returns
 * `{ data, readAt }`, so a file or a printed page made from it says what the
 * screen says. A failure is thrown to the caller, and the screen keeps what it
 * showed.
 */
export function useGarageRead(read, garageId) {
  const [state, setState] = useState({ data: null, problem: null, readAt: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    read(garageId).then(
      (data) => live && setState({ data, problem: null, readAt: new Date() }),
      (problem) => {
        if (!live || problem.kind === STALE || problem.kind === 'ended') return;
        setState({ data: null, problem: problem.kind, readAt: null });
      },
    );
    return () => {
      live = false;
    };
  }, [read, garageId, attempt]);
  const retry = useCallback(() => {
    setState({ data: null, problem: null, readAt: null });
    setAttempt((n) => n + 1);
  }, []);
  const refresh = useCallback(async () => {
    const data = await read(garageId);
    const readAt = new Date();
    flushSync(() => setState({ data, problem: null, readAt }));
    return { data, readAt };
  }, [read, garageId]);
  return { ...state, retry, refresh };
}

/** The time now, moving on every `ms`, so "a minute ago" stays true. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The browser's own print, of one list: no frame, black on white, with the
 * garage's name and the time it was printed, in the garage's time zone.
 * The Print button reads the list again first (src/ListActions.jsx), then
 * calls `print`. Printed from the browser's own menu instead, there is no
 * read: the print head then also says when the list on screen was read.
 */
export function usePrint() {
  const [printedAt, setPrintedAt] = useState(null);
  useEffect(() => {
    const before = () => flushSync(() => setPrintedAt(new Date()));
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, []);
  const print = useCallback(() => {
    flushSync(() => setPrintedAt(new Date()));
    window.print();
  }, []);
  return { printedAt, print };
}

// A list read at least this long before it is printed says when it was read.
export const AS_OF_MS = 60 * 1000;

export function PrintHead({ t, garage, language, printedAt, readAt }) {
  const printed = printedAt ?? new Date();
  const old = readAt && printed - readAt >= AS_OF_MS;
  return (
    <div className="print-head">
      <p className="print-garage">
        <bdi>{garage.name}</bdi>
      </p>
      <p>{t('print.printed', { time: garageDateTime(printed, garage.timezone, language) })}</p>
      {old ? <p data-notice="as-of">{t('print.asOf', { time: garageDateTime(readAt, garage.timezone, language) })}</p> : null}
    </div>
  );
}
