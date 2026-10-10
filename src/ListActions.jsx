import { Fragment, useEffect, useRef, useState } from 'react';
import { Problem, STALE } from './api.js';
import { ProblemNote } from './parts.jsx';
import { invisible, shownLetter } from './files/text.js';

// Each maker is its own file, loaded only when its button is clicked, so the
// first page stays as light as it was.
const MAKERS = {
  excel: () => import('./files/excelFile.js'),
  pdf: () => import('./files/pdfFile.js'),
};

// How long the saved file's address is held after the save starts. A browser
// may still be reading it just after the click; then it is let go.
export const RELEASE_MS = 1000;

// The most letters the notice names; any more are counted.
export const LETTERS_NAMED = 24;

/** Hand the file to the browser to save, then let go of its address. */
export function save(blob, name) {
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
 *
 * `shape`, for a list that can be sorted and chosen from (U7b), turns the
 * answer into the lines chosen, in the order chosen, with the choices in
 * words for the file's head: the file holds every line that matches, never
 * only the page on screen. Print needs none: the page draws the new answer
 * with the same choices, and prints every row of it.
 *
 * Whatever a file left out is said under the buttons, in plain words: the
 * letters the PDF's font cannot draw (only letters a person can see, each kept
 * apart so it cannot turn the sentence around it), that hidden characters were
 * left out of the file (either file: src/files/text.js), or that a text was cut
 * at an Excel cell's limit.
 */
export default function ListActions({ t, list, language, garage, client, refresh, print, shape }) {
  const [busy, setBusy] = useState(null); // { what, phase: 'reading' | 'making' }
  const [problem, setProblem] = useState(null);
  const [left, setLeft] = useState(null); // what the last file left out
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
    setLeft(null);
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
      const made = maker.make(list, { t, language, garage, data: shape ? shape(data) : data, readAt });
      // Signed out, or the page left, while it was being made: nothing is saved.
      if (!here.current || client.epoch() !== asked) return;
      save(made.blob, made.name);
      const letters = made.missing.filter((ch) => !invisible(ch));
      if (letters.length || made.hidden || made.cut) setLeft({ letters, hidden: made.hidden, cut: made.cut });
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
      {left ? <LeftOut t={t} left={left} /> : null}
    </div>
  );
}

/** What the last file left out, each in one plain sentence. */
function LeftOut({ t, left }) {
  const [before, after] = t('download.missingLetters').split('{letters}');
  const named = left.letters.slice(0, LETTERS_NAMED);
  const more = left.letters.length - named.length;
  return (
    <div role="status">
      {named.length ? (
        <p className="problem-note" data-notice="missing-letters">
          {/* One piece of text, so the note's flex box wraps it as a sentence. */}
          <span>
            {before}
            {named.map((ch, i) => (
              <Fragment key={i}>
                {i ? ' ' : null}
                <bdi data-letter>{shownLetter(ch)}</bdi>
              </Fragment>
            ))}
            {more ? <span data-more={more}>{` ${t('download.missingMore', { count: more })}`}</span> : null}
            {after}
          </span>
        </p>
      ) : null}
      {left.hidden ? (
        <p className="problem-note" data-notice="hidden-characters">
          {t('download.hiddenLeftOut')}
        </p>
      ) : null}
      {left.cut ? (
        <p className="problem-note" data-notice="cut-at-limit">
          {t('download.cutAtLimit')}
        </p>
      ) : null}
    </div>
  );
}
