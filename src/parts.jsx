import { Fragment, useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { STALE, problemKey } from './api.js';
import { garageDateTime } from './time.js';
import FieldName from './FieldName.jsx';
import Icon from './Icon.jsx';

/** Several garages: a plain list to pick from, twenty at a time (U7a). */
export function GaragePicker({ t, language, garages, onChoose }) {
  const paging = usePaging(garages.length);
  return (
    <section className="panel">
      <h2 className="section-title">
        <FieldName t={t} name="garage.choose" />
      </h2>
      <ul className="garage-list">
        {garages.map((g, i) => (
          <li key={g.id} className={paging.row(i)}>
            <button type="button" className="garage-choice" data-garage={g.id} onClick={() => onChoose(g.id)}>
              <span className="garage-choice-name">
                <bdi>{g.name}</bdi>
              </span>
              <span className="quiet">{g.live ? t('garage.live') : t('garage.notLive')}</span>
            </button>
          </li>
        ))}
      </ul>
      <Pager t={t} language={language} paging={paging} list="choose-garage" />
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

// U7a: a list on screen shows this many rows at a time.
export const PAGE_ROWS = 20;

/**
 * Which rows of a list of `count` are on screen: PAGE_ROWS at a time, from
 * the first. A row off the page stays in the page with the class "off-page",
 * which only the screen leaves out: a print holds the whole list, and every
 * file is made from the list as read, never from what shows.
 */
export function usePaging(count) {
  const [chosen, setChosen] = useState(0);
  const pages = Math.max(1, Math.ceil(count / PAGE_ROWS));
  const at = Math.min(chosen, pages - 1);
  const from = at * PAGE_ROWS;
  const to = Math.min(count, from + PAGE_ROWS);
  return {
    count,
    at,
    pages,
    from,
    to,
    /** The class for row `i`: none on this page, "off-page" off it. */
    row: (i) => (i >= from && i < to ? undefined : 'off-page'),
    go: (n) => setChosen(Math.max(0, Math.min(pages - 1, n))),
  };
}

/**
 * Previous, Next, and where you are ("21–40 of 312"), under a list longer
 * than one page. Never printed: the print holds every row.
 */
export function Pager({ t, language, paging, list }) {
  if (paging.count <= PAGE_ROWS) return null;
  const n = (x) => x.toLocaleString(language === 'es' ? 'es-US' : 'en-US');
  return (
    <nav className="pager no-print" aria-label={t('pager.label')} data-pager={list}>
      <button type="button" className="link-button" data-action="previous" disabled={paging.at === 0} onClick={() => paging.go(paging.at - 1)}>
        {t('pager.previous')}
      </button>
      <span className="pager-where" data-from={paging.from + 1} data-to={paging.to} data-count={paging.count}>
        {t('pager.where', { from: n(paging.from + 1), to: n(paging.to), count: n(paging.count) })}
      </span>
      <button type="button" className="link-button" data-action="next" disabled={paging.at === paging.pages - 1} onClick={() => paging.go(paging.at + 1)}>
        {t('pager.next')}
      </button>
    </nav>
  );
}

/**
 * A form kept closed behind its button until the button is pressed (U7a).
 * `opener` is the key of the button's words; `children(close)` draws the
 * open form, which calls `close` when it is done or cancelled.
 */
export function Opens({ t, opener, action, children }) {
  const [open, setOpen] = useState(false);
  if (open) return children(() => setOpen(false));
  return (
    <p className="opens no-print">
      <button type="button" className="primary-button" data-action={action} onClick={() => setOpen(true)}>
        {t(opener)}
      </button>
    </p>
  );
}

/**
 * A row of choices, one of them chosen. Always inside a <div className="chooser">
 * with its <FieldName> first (scripts/check-descriptions.js holds it to that).
 */
export function Segmented({ label, value, options, onChange, name }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} data-control={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.hint}
          data-value={o.value}
          className="segment"
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} /> : null}
          <span>{o.text}</span>
        </button>
      ))}
    </div>
  );
}
