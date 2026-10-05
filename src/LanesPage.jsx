import { useCallback, useRef, useState } from 'react';
import { PrintHead, ProblemNote, Segmented, useGarageRead, useNow, usePrint } from './parts.jsx';
import { STALE } from './api.js';
import { CLOSE_REASONS, SAMPLE_KEYS, deviceWords, directionKey, openPieces } from './lanes.js';
import { garageTime } from './time.js';
import { translate } from './i18n/index.js';
import FieldName from './FieldName.jsx';
import Icon from './Icon.jsx';
import ListActions from './ListActions.jsx';

/**
 * Every lane of the garage, its lane computers, whether it has a card reader,
 * and whether it is open -- and setting them up: add, rename, remove, connect
 * a lane computer or cancel its access, close and reopen. Every confirmation
 * is on the page; nothing opens a browser dialog.
 */
export default function LanesPage({ t, language, client, garage }) {
  const now = useNow();
  const { printedAt, print } = usePrint();
  const lanes = useGarageRead(useCallback((id) => client.lanes(id), [client]), garage.id);
  // One setup panel at a time: { kind, lane, device }.
  const [panel, setPanel] = useState(null);
  const reread = useCallback(() => lanes.refresh().catch(() => lanes.retry()), [lanes]);

  if (lanes.problem) return <ProblemNote t={t} kind={lanes.problem} onRetry={lanes.retry} />;
  if (!lanes.data) return <p className="quiet">{t('loading')}</p>;

  return (
    <>
      <section className="panel printable" data-list="lanes">
        <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={lanes.readAt} />
        <div className="list-head">
          <h2 className="section-title">{t('page.lanes.title')}</h2>
          <ListActions t={t} list="lanes" language={language} client={client} garage={garage} refresh={lanes.refresh} print={print} />
        </div>
        {lanes.data.lanes.length === 0 ? (
          <p className="quiet">{t('lanes.none')}</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>
                  <FieldName t={t} name="lanes.lane" />
                </th>
                <th>
                  <FieldName t={t} name="lanes.direction" />
                </th>
                <th>
                  <FieldName t={t} name="lanes.computers" />
                </th>
                <th>
                  <FieldName t={t} name="lanes.reader" />
                </th>
                <th>
                  <FieldName t={t} name="lanes.open" />
                </th>
                <th className="no-print">
                  <FieldName t={t} name="lanes.setup" />
                </th>
              </tr>
            </thead>
            <tbody>
              {lanes.data.lanes.map((lane) => (
                <tr key={lane.id} data-lane={lane.id}>
                  <td>
                    <bdi>{lane.name}</bdi>
                  </td>
                  <td>{t(directionKey(lane))}</td>
                  <td>
                    {(lane.devices ?? []).length === 0 ? (
                      <span className="quiet">{t('lane.noComputer')}</span>
                    ) : (
                      <ul className="device-list">
                        {lane.devices.map((d) => (
                          <li key={d.id} data-device={d.id}>
                            <span className="device-name">
                              <bdi>{d.name}</bdi>
                            </span>{' '}
                            <span className="quiet">
                              {d.revoked_at
                                ? t('device.off', { time: garageTime(d.revoked_at, garage.timezone, language, now) })
                                : deviceWords(t, d, garage, language, now, lanes.data.quietMinutes).text}
                            </span>
                            {d.revoked_at ? null : (
                              <>
                                {' '}
                                <button type="button" className="link-button no-print" data-action="cancel-computer" onClick={() => setPanel({ kind: 'cancel', lane, device: d })}>
                                  {t('lanes.cancelAccess')}
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{lane.reader ? t('lanes.readerYes') : t('lanes.readerNo')}</td>
                  <td data-open={lane.closed ? 'closed' : 'open'}>
                    <OpenLine t={t} lane={lane} garage={garage} language={language} now={now} />
                  </td>
                  <td className="no-print">
                    <div className="lane-actions">
                      <button type="button" className="link-button" data-action="rename" onClick={() => setPanel({ kind: 'rename', lane })}>
                        {t('lanes.rename')}
                      </button>
                      <button type="button" className="link-button" data-action="connect" onClick={() => setPanel({ kind: 'connect', lane })}>
                        {t('lanes.connect')}
                      </button>
                      {lane.closed ? (
                        <button type="button" className="link-button" data-action="reopen" onClick={() => setPanel({ kind: 'reopen', lane })}>
                          {t('lanes.reopen')}
                        </button>
                      ) : null}
                      <button type="button" className="link-button" data-action="close" onClick={() => setPanel({ kind: 'close', lane })}>
                        {lane.closed ? t('lanes.closeChange') : t('lanes.close')}
                      </button>
                      <button type="button" className="link-button" data-action="remove" onClick={() => setPanel({ kind: 'remove', lane })}>
                        {t('lanes.remove')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="quiet no-print" data-notice="closing-not-acted-on">
          {t('lanes.closingNotYet')}
        </p>
      </section>

      {panel ? (
        <LanePanel
          key={`${panel.kind}:${panel.lane?.id ?? ''}:${panel.device?.id ?? ''}`}
          t={t}
          client={client}
          panel={panel}
          lanes={lanes.data.lanes}
          onDone={() => reread()}
          onClose={() => setPanel(null)}
        />
      ) : null}

      <AddLane t={t} client={client} garage={garage} onAdded={() => reread()} />
    </>
  );
}

function OpenLine({ t, lane, garage, language, now }) {
  return (
    <span className={lane.closed ? 'lane-closed' : undefined}>
      {openPieces(t, lane, garage, language, now).map((p, i) =>
        p.tag ? (
          <span key={i} className="tag">
            {p.words}
          </span>
        ) : p.stored !== undefined ? (
          <bdi key={i}>{p.stored}</bdi>
        ) : (
          <span key={i}>{p.words}</span>
        ),
      )}
    </span>
  );
}

/** A request's refusal, in plain words; a sign-out on the way is not this page's to show. */
function useProblem() {
  const [problem, setProblem] = useState(null);
  const fail = (p) => {
    if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
  };
  return [problem, setProblem, fail];
}

function AddLane({ t, client, garage, onAdded }) {
  const [name, setName] = useState('');
  const [direction, setDirection] = useState('entry');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await client.addLane(garage.id, name.trim(), direction);
      setName('');
      onAdded();
    } catch (p) {
      fail(p);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel no-print" data-form="add-lane">
      <h2 className="section-title">{t('lanes.add')}</h2>
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !busy) add();
        }}
      >
        <label className="field">
          <FieldName t={t} name="lanes.addName" />
          <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <div className="chooser" data-chooser="direction">
          <FieldName t={t} name="lanes.addDirection" />
          <Segmented
            label={t('lanes.addDirection')}
            value={direction}
            options={['entry', 'exit'].map((d) => ({ value: d, text: t(directionKey({ direction: d })) }))}
            onChange={setDirection}
            name="direction"
          />
        </div>
        <button type="submit" className="primary-button" disabled={!name.trim() || busy}>
          {busy ? t('setup.saving') : t('lanes.addButton')}
        </button>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </form>
    </section>
  );
}

/**
 * What the button that closes a panel says: on a question asked with "Yes",
 * "No, keep it"; on a form, "Cancel"; once a lane computer's code is shown,
 * "Done". Never "Done" beside a "Yes" that was not pressed.
 */
const CLOSE_WORDS = { remove: 'lanes.panelKeep', cancel: 'lanes.panelKeep', reopen: 'lanes.panelKeep', rename: 'lanes.panelCancel', close: 'lanes.panelCancel', connect: 'lanes.panelCancel' };

function LanePanel({ t, client, panel, lanes, onDone, onClose }) {
  const Body = { rename: Rename, remove: Remove, connect: Connect, cancel: Cancel, close: Close, reopen: Reopen }[panel.kind];
  // A connect panel showing its code has nothing left to cancel.
  const [shown, setShown] = useState(false);
  return (
    <section className="panel no-print lane-panel" data-panel={panel.kind} aria-live="polite">
      <div className="lane-panel-head">
        <h2 className="section-title">
          {t(`lanes.panel.${panel.kind}`)} <bdi>{panel.device ? panel.device.name : panel.lane.name}</bdi>
        </h2>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t(shown ? 'lanes.panelDone' : CLOSE_WORDS[panel.kind])}
        </button>
      </div>
      <Body t={t} client={client} lane={panel.lane} device={panel.device} lanes={lanes} onDone={onDone} onClose={onClose} onShown={() => setShown(true)} />
    </section>
  );
}

function Rename({ t, client, lane, onDone, onClose }) {
  const [name, setName] = useState(lane.name);
  const [problem, setProblem, fail] = useProblem();
  return (
    <form
      className="setup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setProblem(null);
        try {
          await client.renameLane(lane.id, name.trim());
          onDone();
          onClose();
        } catch (p) {
          fail(p);
        }
      }}
    >
      <label className="field">
        <FieldName t={t} name="lanes.newName" />
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <button type="submit" className="primary-button" disabled={!name.trim() || name.trim() === lane.name}>
        {t('lanes.renameButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

function Remove({ t, client, lane, onDone, onClose }) {
  const [problem, setProblem, fail] = useProblem();
  return (
    <div className="setup-form">
      <p>{t('lanes.removeAsk')}</p>
      <button
        type="button"
        className="primary-button"
        data-action="remove-confirm"
        onClick={async () => {
          setProblem(null);
          try {
            await client.removeLane(lane.id);
            onDone();
            onClose();
          } catch (p) {
            fail(p);
          }
        }}
      >
        {t('lanes.removeButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}

function Cancel({ t, client, device, onDone, onClose }) {
  const [problem, setProblem, fail] = useProblem();
  return (
    <div className="setup-form">
      <p>{t('lanes.cancelAsk')}</p>
      <button
        type="button"
        className="primary-button"
        data-action="cancel-confirm"
        onClick={async () => {
          setProblem(null);
          try {
            await client.cancelComputer(device.id);
            onDone();
            onClose();
          } catch (p) {
            fail(p);
          }
        }}
      >
        {t('lanes.cancelButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}

/**
 * Connect a lane computer: name it, and its connection code is shown here
 * ONCE, with a copy button and the plain warning that it will not be shown
 * again. The code lives in this panel's state only -- never in browser
 * storage, the address, a log line or a file -- and goes when the panel
 * closes or the page changes.
 */
function Connect({ t, client, lane, onDone, onShown }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  const codeRef = useRef(null);

  if (code) {
    return (
      <div className="setup-form" data-shown="connection-code">
        <p className="warning" data-notice="code-once">
          {t('lanes.codeOnce')}
        </p>
        <p className="field">
          <FieldName t={t} name="lanes.code" />
          <code className="connection-code" ref={codeRef} translate="no">
            {code}
          </code>
        </p>
        <button
          type="button"
          className="primary-button"
          data-action="copy-code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            } catch {
              // No clipboard here: the code stays on screen to copy by hand.
              const range = document.createRange();
              range.selectNodeContents(codeRef.current);
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }}
        >
          <Icon name="copy" /> <span>{copied ? t('lanes.copied') : t('lanes.copy')}</span>
        </button>
      </div>
    );
  }
  return (
    <form
      className="setup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setProblem(null);
        try {
          const made = await client.connectComputer(lane.id, name.trim());
          setCode(made.code);
          onShown();
          onDone();
        } catch (p) {
          fail(p);
        }
      }}
    >
      <label className="field">
        <FieldName t={t} name="lanes.computerName" />
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <button type="submit" className="primary-button" disabled={!name.trim()}>
        {t('lanes.connectButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

/**
 * Close a lane: why (full, so pass and monthly holders still get in; or
 * closed to everyone), and the message for the lane, picked from the samples
 * in either language or typed. The last open lane of a direction is refused
 * with a plain warning, and closed only on a second, deliberate press.
 */
function Close({ t, client, lane, onDone, onClose }) {
  const [reason, setReason] = useState(lane.closed?.reason ?? 'full');
  const [message, setMessage] = useState(lane.closed?.message ?? '');
  const [lastOpen, setLastOpen] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  const send = async (override) => {
    setProblem(null);
    try {
      await client.closeLane(lane.id, { reason, message: message.trim(), override });
      onDone();
      onClose();
    } catch (p) {
      if (p?.kind === 'lastOpenLane' && !override) setLastOpen(true);
      else fail(p);
    }
  };
  return (
    <form
      className="setup-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (message.trim()) send(false);
      }}
    >
      <div className="chooser" data-chooser="reason">
        <FieldName t={t} name="lanes.reason" />
        <Segmented
          label={t('lanes.reason')}
          value={reason}
          options={CLOSE_REASONS.map((r) => ({ value: r, text: t(`lanes.reason.${r}`) }))}
          onChange={(r) => {
            setReason(r);
            setLastOpen(false);
          }}
          name="reason"
        />
      </div>
      <label className="field">
        <FieldName t={t} name="lanes.sample" />
        <select data-field="sample" value="" onChange={(e) => e.target.value && setMessage(e.target.value)}>
          <option value="">{t('lanes.samplePick')}</option>
          {['en', 'es'].map((language) => (
            <optgroup key={language} label={t(`language.${language}`)}>
              {SAMPLE_KEYS[reason].map((key) => (
                <option key={key} value={translate(language, key)}>
                  {translate(language, key)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <FieldName t={t} name="lanes.message" />
        <textarea value={message} maxLength={160} rows={2} onChange={(e) => { setMessage(e.target.value); setLastOpen(false); }} />
      </label>
      {lastOpen ? (
        <div className="warning" role="alert" data-notice="last-open-lane">
          <p>{t(lane.direction === 'exit' ? 'lanes.lastOut' : 'lanes.lastIn')}</p>
          <button type="button" className="primary-button" data-action="close-anyway" onClick={() => send(true)}>
            {t('lanes.closeAnyway')}
          </button>
        </div>
      ) : (
        <button type="submit" className="primary-button" disabled={!message.trim()}>
          {t('lanes.closeButton')}
        </button>
      )}
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

function Reopen({ t, client, lane, onDone, onClose }) {
  const [problem, setProblem, fail] = useProblem();
  return (
    <div className="setup-form">
      <p>{t('lanes.reopenAsk')}</p>
      <button
        type="button"
        className="primary-button"
        data-action="reopen-confirm"
        onClick={async () => {
          setProblem(null);
          try {
            await client.reopenLane(lane.id);
            onDone();
            onClose();
          } catch (p) {
            fail(p);
          }
        }}
      >
        {t('lanes.reopenButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}
