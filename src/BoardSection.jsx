import { useCallback, useEffect, useRef, useState } from 'react';
import { Pager, ProblemNote, useGarageRead, usePaging } from './parts.jsx';
import { STALE } from './api.js';
import { localSaid } from './time.js';
import { charactersSaid, messageLanes, screenLines, undrawable } from './screen.js';
import FieldName from './FieldName.jsx';

/**
 * What the lanes' screens show while no car is there and the lane is open:
 * the owner's messages, one after another, each on the lanes chosen for it
 * and between the times set for it, and the price where it is switched on.
 * One place for all of it, under the lanes. Nobody types a price: the lane
 * works it out from the rates and taxes it charges with.
 *
 * A message is text for a screen, so a character the screens cannot show is
 * named as it is typed and the message is not sent with it; a preview shows
 * it the way the screen will, in capitals and broken into lines. Times are
 * written in the garage's own time. Every confirmation is on the page.
 *
 * A message is always on at least one real lane: a lane removed takes itself
 * off every message, and a message left on no lane goes with it (the
 * platform does both). So the board is read again whenever the lanes change,
 * and a message's lanes are named from that same read -- never an empty name.
 */
export default function BoardSection({ t, language, client, garage, lanes }) {
  const board = useGarageRead(useCallback((id) => client.board(id), [client]), garage.id);
  // What is being written: null, { kind: 'add' }, { kind: 'change', message } or { kind: 'remove', message }.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const reread = useCallback(() => board.refresh().catch(() => board.retry()), [board]);
  const paging = usePaging(board.data?.messages.length ?? 0);
  // The lanes changed (one added, renamed or removed): read the board again, so it shows what the platform now keeps.
  const lanesNow = lanes.map((l) => `${l.id}:${l.name}`).join('|');
  const lanesBefore = useRef(lanesNow);
  useEffect(() => {
    if (lanesBefore.current === lanesNow) return;
    lanesBefore.current = lanesNow;
    reread();
  }, [lanesNow, reread]);
  const fail = (p) => {
    if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
  };

  if (board.problem) return <ProblemNote t={t} kind={board.problem} onRetry={board.retry} />;
  if (!board.data) return null;
  const { messages, messagesMax, screen } = board.data;
  const shownAt = (m) => messageLanes(m, board.data.lanes);

  const setPrices = async (lane, show) => {
    setBusy(lane.id);
    setProblem(null);
    try {
      await client.setBoardPrices(lane.id, show);
      await reread();
    } catch (p) {
      fail(p);
    } finally {
      setBusy(null);
    }
  };

  const when = (m) => {
    const start = localSaid(m.starts, language);
    const end = localSaid(m.ends, language);
    if (start && end) return t('board.between', { start, end });
    if (start) return t('board.from', { start });
    if (end) return t('board.until', { end });
    return t('board.always');
  };

  return (
    <section className="panel no-print" data-form="board">
      <h2 className="section-title">{t('board.title')}</h2>
      <p className="quiet">{t('board.purpose')}</p>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}

      <div className="field" data-list="board-prices">
        <FieldName t={t} name="board.prices" />
        <ul className="board-prices">
          {board.data.lanes.map((lane) => (
            <li key={lane.id} data-lane={lane.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={lane.prices}
                className="tick"
                data-tick="prices"
                disabled={busy !== null}
                onClick={() => setPrices(lane, !lane.prices)}
              >
                <span aria-hidden="true" className="tick-box" data-on={lane.prices ? 'yes' : 'no'} />
                <span>{t('board.pricesShow', { lane: lane.name })}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <h3 className="section-title">{t('board.messages')}</h3>
      {messages.length === 0 ? (
        <p className="quiet">{t('board.none')}</p>
      ) : (
        <table className="list" data-list="board">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="board.message" />
              </th>
              <th>
                <FieldName t={t} name="board.shownOn" />
              </th>
              <th>
                <FieldName t={t} name="board.when" />
              </th>
              <th>
                <FieldName t={t} name="board.change" />
              </th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m, i) => (
              <tr key={m.id} data-message={m.id} className={paging.row(i)}>
                <td>
                  <bdi>{m.text}</bdi>
                </td>
                <td>
                  {shownAt(m).map((lane, i) => (
                    <span key={lane.id} data-shown-at={lane.id}>
                      {i ? ', ' : ''}
                      <bdi>{lane.name}</bdi>
                    </span>
                  ))}
                </td>
                <td>{when(m)}</td>
                <td>
                  <div className="lane-actions">
                    <button type="button" className="link-button" data-action="change-message" onClick={() => setEditing({ kind: 'change', message: m })}>
                      {t('board.change')}
                    </button>
                    <button type="button" className="link-button" data-action="remove-message" onClick={() => setEditing({ kind: 'remove', message: m })}>
                      {t('board.remove')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager t={t} language={language} paging={paging} list="board" />

      {editing === null ? (
        <p className="opens">
          <button type="button" className="primary-button" data-action="open-add-message" onClick={() => setEditing({ kind: 'add' })}>
            {t('board.add')}
          </button>
        </p>
      ) : editing.kind === 'remove' ? (
        <RemoveMessage
          key={`remove:${editing.message.id}`}
          t={t}
          onYes={async () => {
            setProblem(null);
            try {
              await client.removeBoardMessage(garage.id, editing.message.id);
              setEditing(null);
              await reread();
            } catch (p) {
              fail(p);
            }
          }}
          onNo={() => setEditing(null)}
        />
      ) : (
        <MessageForm
          key={editing.kind === 'change' ? `change:${editing.message.id}` : 'add'}
          t={t}
          lanes={board.data.lanes}
          screen={screen}
          message={editing.kind === 'change' ? editing.message : null}
          count={t('board.count', { count: messages.length, max: messagesMax })}
          onCancel={() => setEditing(null)}
          onSave={async (fields) => {
            setProblem(null);
            try {
              if (editing.kind === 'change') await client.changeBoardMessage(garage.id, editing.message.id, fields);
              else await client.addBoardMessage(garage.id, fields);
              setEditing(null);
              await reread();
              return true;
            } catch (p) {
              fail(p);
              return false;
            }
          }}
        />
      )}
    </section>
  );
}

function RemoveMessage({ t, onYes, onNo }) {
  return (
    <div className="setup-form" data-panel="remove-message">
      <p>{t('board.removeAsk')}</p>
      <button type="button" className="primary-button" data-action="remove-message-confirm" onClick={onYes}>
        {t('board.removeButton')}
      </button>
      <button type="button" className="link-button" data-action="keep-message" onClick={onNo}>
        {t('board.keep')}
      </button>
    </div>
  );
}

/**
 * Add a message, or change one: its words, the lanes it shows at, and when.
 * Only what changed is sent on a change. How messages work is said here, in
 * the form, not above the list (U7a).
 */
function MessageForm({ t, lanes, screen, message, count, onSave, onCancel }) {
  const [text, setText] = useState(message?.text ?? '');
  const [chosen, setChosen] = useState(message?.lanes ?? []);
  const [starts, setStarts] = useState(message?.starts ?? '');
  const [ends, setEnds] = useState(message?.ends ?? '');
  const [busy, setBusy] = useState(false);
  const cannotShow = undrawable(text, screen.characters);
  const ready = text.trim() !== '' && chosen.length > 0 && cannotShow.length === 0 && !busy;

  const fields = () => {
    const all = { text: text.trim(), lanes: lanes.filter((l) => chosen.includes(l.id)).map((l) => l.id), starts: starts || null, ends: ends || null };
    if (!message) return all;
    const was = { text: message.text, lanes: message.lanes, starts: message.starts ?? null, ends: message.ends ?? null };
    return Object.fromEntries(Object.entries(all).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(was[k])));
  };

  return (
    <form
      className="setup-form"
      data-panel={message ? 'change-message' : 'add-message'}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        const send = fields();
        if (message && Object.keys(send).length === 0) {
          onCancel?.();
          return;
        }
        setBusy(true);
        const saved = await onSave(send);
        setBusy(false);
        if (saved && !message) {
          setText('');
          setChosen([]);
          setStarts('');
          setEnds('');
        }
      }}
    >
      <h3 className="section-title">{t(message ? 'board.changeTitle' : 'board.add')}</h3>
      <p className="quiet" data-notice="board-form">
        {t('board.formNote')}
      </p>
      {message ? null : (
        <p className="quiet" data-notice="board-count">
          {count}
        </p>
      )}
      <label className="field">
        <FieldName t={t} name="board.text" />
        <textarea data-field="board-text" value={text} maxLength={screen.messageMax} rows={2} onChange={(e) => setText(e.target.value)} />
      </label>
      {cannotShow.length ? (
        <p className="warning" role="alert" data-notice="screen-characters">
          {t('screen.cannotShow', { characters: charactersSaid(cannotShow, t) })}
        </p>
      ) : null}
      <ScreenPreview t={t} text={text} />
      <div className="field" data-field="board-lanes">
        <FieldName t={t} name="board.lanes" />
        <ul className="board-prices">
          {lanes.map((lane) => {
            const on = chosen.includes(lane.id);
            return (
              <li key={lane.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className="tick"
                  data-pick={lane.id}
                  onClick={() => setChosen(on ? chosen.filter((id) => id !== lane.id) : [...chosen, lane.id])}
                >
                  <span aria-hidden="true" className="tick-box" data-on={on ? 'yes' : 'no'} />
                  <bdi>{lane.name}</bdi>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <label className="field">
        <FieldName t={t} name="board.starts" />
        <input type="datetime-local" data-field="board-starts" value={starts} onChange={(e) => setStarts(e.target.value)} />
      </label>
      <label className="field">
        <FieldName t={t} name="board.ends" />
        <input type="datetime-local" data-field="board-ends" value={ends} onChange={(e) => setEnds(e.target.value)} />
      </label>
      <button type="submit" className="primary-button" disabled={!ready}>
        {t(message ? 'board.saveButton' : 'board.addButton')}
      </button>
      <button type="button" className="link-button" data-action="cancel-message" onClick={onCancel}>
        {t('board.cancel')}
      </button>
    </form>
  );
}

/** The text as the lane's screen shows it: capitals, broken into lines by words, nothing cut off. */
export function ScreenPreview({ t, text }) {
  const lines = screenLines(text);
  if (lines.length === 0) return null;
  return (
    <div className="field" data-preview="screen">
      <FieldName t={t} name="screen.preview" />
      <div className="screen-preview" translate="no">
        {lines.map((line, i) => (
          <div key={i} className="screen-line">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
