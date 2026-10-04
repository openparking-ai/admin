import { useEffect, useRef, useState } from 'react';
import { Problem, STALE } from './api.js';
import { ProblemNote } from './parts.jsx';

// Each maker is its own file, loaded only when its button is clicked, so the
// first page stays as light as it was.
const MAKERS = {
  excel: () => import('./files/excelFile.js'),
  pdf: () => import('./files/pdfFile.js'),
};

// How long the saved file's address is held after the save starts. A browser
// may still be reading it just after the click; then it is let go.
export const RELEASE_MS = 1000;

/** Hand the file to the browser to save, then let go of its address. */
function save(blob, name) {
  const address = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = address;
  link.download = name;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(address), RELEASE_MS);
}

/**
 * Download Excel, Download PDF and Print, for one list.
 *
 * Each click reads the list from the platform again, shows that answer on
 * screen, and builds the file (or the printed page) from THAT answer, stamped
 * with the time it arrived. If the read fails, the plain sentence for it shows
 * and no file is made. If it answers 401, no file is made: the client has
 * already sent the owner to the sign-in screen. If a sign-out or 401 happens
 * while a file is being made, or the page is left, the file is not saved.
 * While one is being made, none of the three can be pressed.
 */
export default function ListActions({ t, list, language, garage, client, refresh, print }) {
  const [busy, setBusy] = useState(null); // { what, phase: 'reading' | 'making' }
  const [problem, setProblem] = useState(null);
  const [missing, setMissing] = useState(null);
  const here = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  const run = async (what) => {
    if (working.current) return;
    working.current = true;
    setProblem(null);
    setMissing(null);
    setBusy({ what, phase: 'reading' });
    const asked = client.epoch();
    try {
      const { data, readAt } = await refresh();
      if (!here.current || client.epoch() !== asked) return;
      if (what === 'print') {
        print();
        return;
      }
      setBusy({ what, phase: 'making' });
      let maker;
      try {
        maker = await MAKERS[what]();
      } catch {
        throw new Problem('unreachable');
      }
      const made = maker.make(list, { t, language, garage, data, readAt });
      // Signed out, or the page left, while it was being made: nothing is saved.
      if (!here.current || client.epoch() !== asked) return;
      save(made.blob, made.name);
      if (made.missing.length) setMissing(made.missing.join(' '));
    } catch (thrown) {
      if (!here.current || thrown?.kind === STALE || thrown?.kind === 'ended') return;
      setProblem(thrown instanceof Problem ? thrown.kind : 'unexpected');
    } finally {
      working.current = false;
      if (here.current) setBusy(null);
    }
  };

  const button = (what, words) => {
    const mine = busy?.what === what;
    return (
      <button
        type="button"
        className="link-button"
        data-action={what === 'print' ? 'print' : `download-${what}`}
        data-busy={mine ? busy.phase : undefined}
        disabled={busy !== null}
        aria-disabled={busy !== null}
        onClick={() => run(what)}
      >
        {mine ? t(busy.phase === 'reading' ? 'download.reading' : 'download.making') : t(words)}
      </button>
    );
  };

  return (
    <div className="list-actions no-print" aria-busy={busy !== null}>
      <div className="list-buttons">
        {button('excel', 'download.excel')}
        {button('pdf', 'download.pdf')}
        {button('print', 'print.button')}
      </div>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
      {missing ? (
        <p className="problem-note" role="status" data-notice="missing-letters">
          {t('download.missingLetters', { letters: missing })}
        </p>
      ) : null}
    </div>
  );
}
