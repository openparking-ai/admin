import { useCallback, useEffect, useRef, useState } from 'react';
import { frameAddress, frameMessage, readStatus, statusAddress } from './extras.js';
import { STALE } from './api.js';

/**
 * A page of the host's, drawn inside this page in a same-origin frame (src/extras.js).
 * The frame is opened at the entry's path with the chosen garage, the language and the
 * look in its address; a change of language or look is posted to it afterwards (to this
 * origin only). Its height follows what the page says of itself, within reason; a
 * message from any other origin, or of another shape, is left alone. `onChanged` is
 * told when the page says something changed.
 */
export function ExtraFrame({ entry, garage, language, look, onChanged }) {
  const frame = useRef(null);
  const [height, setHeight] = useState(240);
  // The address the frame was first opened at: the language and look after that go by message, so the page keeps its place.
  const [address] = useState(() => frameAddress(entry, { garageId: garage.id, language, look }));
  useEffect(() => {
    const onMessage = (event) => {
      const m = frameMessage(event, { origin: window.location.origin, ids: [entry.id] });
      if (!m || event.source !== frame.current?.contentWindow) return;
      if (m.height !== undefined) setHeight(m.height);
      if (m.changed) onChanged?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [entry.id, onChanged]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'extra-page', id: entry.id, language, look }, window.location.origin);
  }, [entry.id, language, look]);
  return (
    <iframe
      ref={frame}
      className="extra-frame"
      data-extra-frame={entry.id}
      src={address}
      title={entry.title[language] ?? entry.title.en}
      style={{ height: `${height}px` }}
      referrerPolicy="no-referrer"
    />
  );
}

/** The host's pages that sit inside this page, each under its own name. */
export function ExtraSections({ extras, page, garage, language, look, onChanged }) {
  const here = extras.filter((e) => e.section?.page === page);
  if (!here.length) return null;
  return here.map((entry) => (
    <section key={entry.id} className="panel extra-section" data-extra={entry.id}>
      <h2 className="section-title">
        <bdi>{entry.title[language] ?? entry.title.en}</bdi>
      </h2>
      <p className="quiet">
        <bdi>{entry.purpose[language] ?? entry.purpose.en}</bdi>
      </p>
      <ExtraFrame entry={entry} garage={garage} language={language} look={look} onChanged={onChanged} />
    </section>
  ));
}

/**
 * One more step of Setup, from the host: its status path says whether it is done and gives
 * one line of facts; its page opens inside the step, and the status is read again when the
 * page says something changed.
 */
export function ExtraStep({ t, client, entry, garage, language, look, onStatus }) {
  const [status, setStatus] = useState(null);
  const [problem, setProblem] = useState(false);
  const [open, setOpen] = useState(false);
  const read = useCallback(async () => {
    try {
      const body = await client.readOwn(statusAddress(entry, garage.id));
      const got = readStatus(body, language);
      setStatus(got);
      setProblem(got === null);
      onStatus?.(entry.id, got);
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
      setStatus(null);
      setProblem(true);
      onStatus?.(entry.id, null);
    }
  }, [client, entry, garage.id, language, onStatus]);
  useEffect(() => {
    read();
  }, [read]);
  const done = status?.done === true;
  return (
    <li className="setup-step" data-step={`extra-${entry.id}`} data-extra-step={entry.id} data-done={done ? 'yes' : 'no'}>
      <div className="setup-step-head">
        <h3 className="setup-step-name">
          <span className="field-name">
            <bdi>{entry.title[language] ?? entry.title.en}</bdi>
          </span>
          <span className="field-about">
            <bdi>{entry.purpose[language] ?? entry.purpose.en}</bdi>
          </span>
        </h3>
        {status ? (
          <span className={`setup-state ${done ? 'is-done' : 'is-not-done'}`} data-state={done ? 'done' : 'not-yet'}>
            {done ? t('setup.done') : t('setup.notYet')}
          </span>
        ) : null}
      </div>
      <ul className="setup-facts">
        {status?.facts ? (
          <li data-fact="extra">
            <bdi>{status.facts}</bdi>
          </li>
        ) : null}
        {problem ? <li data-notice="extra-not-read">{t('extra.notRead')}</li> : null}
      </ul>
      <p className="setup-where no-print">
        <button type="button" className="link-button" data-action={open ? 'close-extra' : 'open-extra'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t('extra.close') : t('extra.open')}
        </button>
      </p>
      {open ? <ExtraFrame entry={entry} garage={garage} language={language} look={look} onChanged={read} /> : null}
    </li>
  );
}
