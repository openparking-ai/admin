import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Problem, STALE } from './api.js';
import { Pager, ProblemNote, useGarageRead, usePaging } from './parts.jsx';
import { save } from './ListActions.jsx';
import { PAGES, hashFor } from './pages.js';
import { invisible, shownLetter } from './files/text.js';
import { needsOf, specsOf, titleOf } from './drawings/sheets.js';
import Sheets, { Sheet } from './drawings/Sheets.jsx';

// The maker, loaded only when a button is clicked: the first page stays light.
const maker = () => import('./files/pdfFile.js');

/**
 * The installer drawings of the signed-in owner's garage, built from its own
 * lanes and its answer to the drivers question: the sheets they will get,
 * and Download PDF and Print.
 *
 * Each click reads the lanes and the answer again, shows that on screen, and
 * makes the set from THAT read. A failed read shows its plain sentence and
 * makes nothing; a 401 makes nothing (the client has already sent the owner
 * to the sign-in screen); a sign-out or 401 while the set is being made, or
 * the page left, and nothing is saved or printed.
 *
 * Each sheet in the list has its own View, Download PDF and Print too (U7b),
 * made the same way: the whole set is made from the new read, and that one
 * sheet of it is shown, saved or printed -- its number of the whole set and
 * all. A sheet the new read no longer has (its lane removed meanwhile) makes
 * nothing.
 */
export default function DrawingsPage({ t, language, client, garage }) {
  const read = useCallback(async (id) => {
    const [setup, lanes] = await Promise.all([client.setup(id), client.lanes(id)]);
    const answer = setup.takes_any_driver;
    return { takesAnyDriver: answer === true || answer === false ? answer : null, lanes: lanes.lanes };
  }, [client]);
  const drawings = useGarageRead(read, garage.id);
  const [busy, setBusy] = useState(null); // { what, sheet, phase }: `sheet`, a sheet's key in the list, or null for the set
  const [problem, setProblem] = useState(null);
  const [letters, setLetters] = useState([]);
  const [printing, setPrinting] = useState(null);
  const [viewing, setViewing] = useState(null); // { sheet, key }: the one sheet on screen
  const here = useRef(true);
  const working = useRef(false);
  const paging = usePaging(drawings.data && needsOf(drawings.data).length === 0 ? specsOf(drawings.data).length : 0);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  if (drawings.problem) return <ProblemNote t={t} kind={drawings.problem} onRetry={drawings.retry} />;
  if (!drawings.data) return <p className="quiet">{t('loading')}</p>;

  /** `what` is 'pdf', 'print' or 'view'; `sheet`, the key of one sheet in the list, or null for the whole set. */
  const run = async (what, sheet = null) => {
    if (working.current) return;
    working.current = true;
    setProblem(null);
    setLetters([]);
    setBusy({ what, sheet, phase: 'reading' });
    const asked = client.epoch();
    try {
      const { data, readAt } = await drawings.refresh();
      if (!here.current || client.epoch() !== asked) return;
      if (needsOf(data).length) return;
      // The sheet's place in the set as read now: the same sheet, wherever the new read puts it.
      const only = sheet === null ? null : specsOf(data).findIndex((spec) => sheetKey(spec) === sheet);
      if (only === -1) return;
      setBusy({ what, sheet, phase: 'making' });
      let file;
      try {
        file = await maker();
      } catch {
        throw new Problem('unreachable');
      }
      const made = file.makeDrawingsFile({ t, language, garage, lanes: data.lanes, takesAnyDriver: data.takesAnyDriver, madeAt: readAt, only });
      if (!here.current || client.epoch() !== asked) return;
      if (what === 'pdf') save(made.blob, made.name);
      else if (what === 'view') setViewing({ sheet: made.sheets[0], key: sheet });
      else {
        flushSync(() => setPrinting(made.sheets));
        window.print();
      }
      setLetters(made.missing.filter((ch) => !invisible(ch)));
    } catch (thrown) {
      if (!here.current || thrown?.kind === STALE || thrown?.kind === 'ended') return;
      setProblem(thrown instanceof Problem ? thrown.kind : 'unexpected');
    } finally {
      working.current = false;
      if (here.current) setBusy(null);
    }
  };

  const needs = needsOf(drawings.data);
  if (needs.length) {
    const lanesPage = PAGES.find((p) => p.id === 'lanes');
    const setupPage = PAGES.find((p) => p.id === 'setup');
    return (
      <section className="panel" data-list="drawings" data-needs={needs.join(' ')}>
        {needs.includes('drivers') ? (
          <p className="problem-note" data-notice="needs-drivers">
            <span>
              {t('drawings.needs.drivers')}{' '}
              <a href={hashFor(setupPage)} data-go="setup">
                {t('drawings.goSetup')}
              </a>
            </span>
          </p>
        ) : null}
        {needs.includes('lanes') ? (
          <p className="problem-note" data-notice="needs-lanes">
            <span>
              <NeedsLanes t={t} href={hashFor(lanesPage)} page={t('page.lanes.title')} />
            </span>
          </p>
        ) : null}
      </section>
    );
  }

  const specs = specsOf(drawings.data);
  const button = (what, words) => {
    const mine = busy?.what === what && busy.sheet === null;
    return (
      <button
        type="button"
        className="link-button"
        data-action={what === 'print' ? 'print' : 'download-pdf'}
        data-busy={mine ? busy.phase : undefined}
        disabled={busy !== null}
        aria-disabled={busy !== null}
        onClick={() => run(what)}
      >
        {mine ? t(busy.phase === 'reading' ? 'drawings.reading' : 'drawings.making') : t(words)}
      </button>
    );
  };
  /** One sheet's View, Download PDF or Print, named for the sheet to whoever cannot see the line. */
  const sheetButton = (what, spec, named) => {
    const key = sheetKey(spec);
    const mine = busy?.what === what && busy.sheet === key;
    return (
      <button
        type="button"
        className="link-button"
        data-action={`sheet-${what}`}
        data-busy={mine ? busy.phase : undefined}
        disabled={busy !== null}
        aria-disabled={busy !== null}
        aria-label={t(SHEET_WORDS[what].one, { sheet: named })}
        onClick={() => run(what, key)}
      >
        {mine ? t(busy.phase === 'reading' ? 'drawings.reading' : 'drawings.making') : t(SHEET_WORDS[what].button)}
      </button>
    );
  };

  return (
    <>
      <section className="panel no-print" data-list="drawings">
        <p className="drawings-every-way" data-notice="every-way">
          {t('drawings.everyWay')}
        </p>
        <div className="list-actions" aria-busy={busy !== null}>
          <div className="list-buttons">
            {button('pdf', 'download.pdf')}
            {button('print', 'print.button')}
          </div>
          {problem ? <ProblemNote t={t} kind={problem} /> : null}
          {letters.length ? <MissingLetters t={t} letters={letters} /> : null}
        </div>
        <h3 className="drawings-list-title">{t('drawings.listTitle')}</h3>
        <ol className="drawings-list" data-count={specs.length}>
          {specs.map((spec, i) => {
            const named = spec.lane ? `${titleOf(t, spec)} · ${spec.lane.name}` : titleOf(t, spec);
            return (
              <li key={sheetKey(spec)} data-sheet={spec.key} data-kind={spec.kind} data-key={sheetKey(spec)} className={paging.row(i)}>
                <span className="drawing-name">
                  {titleOf(t, spec)}
                  {spec.lane ? (
                    <>
                      {' · '}
                      <bdi>{spec.lane.name}</bdi>
                    </>
                  ) : null}
                </span>
                <span className="drawing-actions">
                  {sheetButton('view', spec, named)}
                  {sheetButton('pdf', spec, named)}
                  {sheetButton('print', spec, named)}
                </span>
              </li>
            );
          })}
        </ol>
        <Pager t={t} language={language} paging={paging} list="drawings" />
        {/* How the set is made and printed: under the list, not above it (U7a). */}
        <p className="quiet drawings-about">{t('drawings.about')}</p>
      </section>
      {viewing ? <SheetView t={t} viewing={viewing} onClose={() => setViewing(null)} /> : null}
      {printing ? <Sheets sheets={printing} /> : null}
    </>
  );
}

// One sheet's buttons: the words shown, and the words naming the sheet too.
const SHEET_WORDS = {
  view: { button: 'drawings.sheet.view', one: 'drawings.sheet.viewOne' },
  pdf: { button: 'download.pdf', one: 'drawings.sheet.pdfOne' },
  print: { button: 'print.button', one: 'drawings.sheet.printOne' },
};

/** A sheet, told apart from every other in the set whatever its place: a lane's by the lane, a shared one by its name. */
const sheetKey = (spec) => (spec.lane ? `plan:${spec.lane.id}` : spec.key);

/**
 * One sheet on the screen, drawn by the same <Sheet> the print uses, over the
 * page with a Close; Escape closes it too, and the keyboard goes back to the
 * View pressed.
 */
function SheetView({ t, viewing, onClose }) {
  const close = useRef(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    close.current?.focus();
    const escape = (e) => {
      if (e.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  const { sheet } = viewing;
  return (
    <div className="sheet-view-backdrop no-print" data-view={viewing.key}>
      <section className="sheet-view" role="dialog" aria-modal="true" aria-label={sheet.title}>
        <div className="sheet-view-head">
          <h2 className="section-title">
            {sheet.title}
            {sheet.lane ? (
              <>
                {' · '}
                <bdi>{sheet.lane}</bdi>
              </>
            ) : null}
          </h2>
          <button type="button" className="link-button" data-action="close-sheet" ref={close} onClick={onClose}>
            {t('drawings.sheet.close')}
          </button>
        </div>
        <Sheet sheet={sheet} number={1} className="drawing-sheet drawing-viewed" />
      </section>
    </div>
  );
}

function NeedsLanes({ t, href, page }) {
  const [before, after] = t('drawings.needs.lanes').split('{page}');
  return (
    <>
      {before}
      <a href={href} data-go="lanes">
        {page}
      </a>
      {after}
    </>
  );
}

function MissingLetters({ t, letters }) {
  const [before, after] = t('drawings.missingLetters').split('{letters}');
  return (
    <p className="problem-note" role="status" data-notice="missing-letters">
      <span>
        {before}
        {letters.map((ch, i) => (
          <Fragment key={i}>
            {i ? ' ' : null}
            <bdi data-letter>{shownLetter(ch)}</bdi>
          </Fragment>
        ))}
        {after}
      </span>
    </p>
  );
}
