import { useCallback, useEffect, useState } from 'react';
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
              <span className="garage-choice-name">{g.name}</span>
              <span className="quiet">{g.live ? t('garage.live') : t('garage.notLive')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
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
 */
export function useGarageRead(read, garageId) {
  const [state, setState] = useState({ data: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    read(garageId).then(
      (data) => live && setState({ data, problem: null }),
      (problem) => {
        if (!live || problem.kind === STALE || problem.kind === 'ended') return;
        setState({ data: null, problem: problem.kind });
      },
    );
    return () => {
      live = false;
    };
  }, [read, garageId, attempt]);
  const retry = useCallback(() => {
    setState({ data: null, problem: null });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
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

export function PrintHead({ t, garage, language, printedAt }) {
  return (
    <div className="print-head">
      <p className="print-garage">{garage.name}</p>
      <p>{t('print.printed', { time: garageDateTime(printedAt ?? new Date(), garage.timezone, language) })}</p>
    </div>
  );
}

export function PrintButton({ t, onPrint }) {
  return (
    <button type="button" className="link-button no-print" data-action="print" onClick={onPrint}>
      {t('print.button')}
    </button>
  );
}
