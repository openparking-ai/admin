import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Problem, STALE } from './api.js';
import { ProblemNote, useGarageRead } from './parts.jsx';
import { save } from './ListActions.jsx';
import { PAGES, hashFor } from './pages.js';
import { invisible, shownLetter } from './files/text.js';
import { needsOf, specsOf, titleOf } from './drawings/sheets.js';
import Sheets from './drawings/Sheets.jsx';

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
 */
export default function DrawingsPage({ t, language, client, garage }) {
  const read = useCallback(async (id) => {
    const [setup, lanes] = await Promise.all([client.setup(id), client.lanes(id)]);
    const answer = setup.takes_any_driver;
    return { takesAnyDriver: answer === true || answer === false ? answer : null, lanes: lanes.lanes };
  }, [client]);
  const drawings = useGarageRead(read, garage.id);
  const [busy, setBusy] = useState(null); // { what, phase }
  const [problem, setProblem] = useState(null);
  const [letters, setLetters] = useState([]);
  const [printing, setPrinting] = useState(null);
  const here = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  if (drawings.problem) return <ProblemNote t={t} kind={drawings.problem} onRetry={drawings.retry} />;
  if (!drawings.data) return <p className="quiet">{t('loading')}</p>;

  const run = async (what) => {
    if (working.current) return;
    working.current = true;
    setProblem(null);
    setLetters([]);
    setBusy({ what, phase: 'reading' });
    const asked = client.epoch();
    try {
      const { data, readAt } = await drawings.refresh();
      if (!here.current || client.epoch() !== asked) return;
      if (needsOf(data).length) return;
      setBusy({ what, phase: 'making' });
      let file;
      try {
        file = await maker();
      } catch {
        throw new Problem('unreachable');
      }
      const made = file.makeDrawingsFile({ t, language, garage, lanes: data.lanes, takesAnyDriver: data.takesAnyDriver, madeAt: readAt });
      if (!here.current || client.epoch() !== asked) return;
      if (what === 'pdf') save(made.blob, made.name);
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
    const mine = busy?.what === what;
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

  return (
    <>
      <section className="panel no-print" data-list="drawings">
        <p>{t('drawings.about')}</p>
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
          {specs.map((spec, i) => (
            <li key={i} data-sheet={spec.key} data-kind={spec.kind}>
              {titleOf(t, spec)}
              {spec.lane ? (
                <>
                  {' · '}
                  <bdi>{spec.lane.name}</bdi>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      {printing ? <Sheets sheets={printing} /> : null}
    </>
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
