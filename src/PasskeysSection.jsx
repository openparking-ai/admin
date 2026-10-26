import { useCallback, useEffect, useState } from 'react';
import { STALE } from './api.js';
import { makePasskey, passkeysHere } from './passkeys.js';
import { ownDay } from './time.js';
import { ProblemNote } from './parts.jsx';
import FieldName from './FieldName.jsx';

/** A passkey's name, as the platform takes it. */
export const NAME_MAX = 60;

function useProblem() {
  const [problem, setProblem] = useState(null);
  const fail = (p) => {
    if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
  };
  return [problem, setProblem, fail];
}

/**
 * Passkeys, on Settings. The admin's own: each with its name, the day it was added and
 * the day it was last used; add one (named, then the browser's own window), rename one,
 * remove one. The password always stays. A person from a linked accounts module keeps
 * theirs with the rest of their account, so this says so and offers nothing.
 */
export default function PasskeysSection({ t, language, client, access, here = passkeysHere() }) {
  if (access.kind === 'linked') {
    return (
      <section className="panel" data-section="passkeys">
        <h2 className="section-title">{t('passkeys.title')}</h2>
        <p className="quiet" data-notice="passkeys-elsewhere">
          {t('passkeys.elsewhere')}
        </p>
      </section>
    );
  }
  return <OwnPasskeys t={t} language={language} client={client} here={here} />;
}

function OwnPasskeys({ t, language, client, here }) {
  const [list, setList] = useState(null);
  const [problem, setProblem, fail] = useProblem();
  const [panel, setPanel] = useState(null);
  const read = useCallback(() => {
    setProblem(null);
    client.passkeys().then(setList, fail);
  }, [client]);
  useEffect(read, [read]);
  const done = () => {
    setPanel(null);
    read();
  };

  return (
    <section className="panel" data-section="passkeys">
      <h2 className="section-title">{t('passkeys.title')}</h2>
      <p className="quiet">{t('passkeys.intro')}</p>
      {problem ? (
        <ProblemNote t={t} kind={problem} onRetry={read} />
      ) : !list ? (
        <p className="quiet">{t('loading')}</p>
      ) : list.length === 0 ? (
        <p className="quiet" data-notice="no-passkeys">
          {t('passkeys.none')}
        </p>
      ) : (
        <ul className="passkey-list" data-list="passkeys">
          {list.map((p) => (
            <li key={p.id} className="passkey-row" data-passkey={p.id}>
              <span className="passkey-name">
                <bdi>{p.name}</bdi>
              </span>
              <span className="quiet">
                {t('passkeys.added', { day: ownDay(p.created_at, language) ?? '' })}
                {' · '}
                {p.last_used_at ? t('passkeys.lastUsed', { day: ownDay(p.last_used_at, language) ?? '' }) : t('passkeys.notUsed')}
              </span>
              <span className="list-buttons">
                <button type="button" className="link-button" data-action="rename-passkey" onClick={() => setPanel({ kind: 'rename', passkey: p })}>
                  {t('passkeys.rename')}
                </button>
                <button type="button" className="link-button" data-action="remove-passkey" onClick={() => setPanel({ kind: 'remove', passkey: p })}>
                  {t('passkeys.remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {panel?.kind === 'rename' ? <RenamePasskey key={panel.passkey.id} t={t} client={client} passkey={panel.passkey} onDone={done} onClose={() => setPanel(null)} /> : null}
      {panel?.kind === 'remove' ? <RemovePasskey key={panel.passkey.id} t={t} client={client} passkey={panel.passkey} onDone={done} onClose={() => setPanel(null)} /> : null}
      {!here ? (
        <p className="quiet" data-notice="passkeys-not-here">
          {t('passkeys.notHere')}
        </p>
      ) : panel?.kind === 'add' ? (
        <AddPasskey t={t} client={client} onDone={done} onClose={() => setPanel(null)} />
      ) : (
        <button type="button" className="secondary-button" data-action="add-passkey" onClick={() => setPanel({ kind: 'add' })}>
          {t('passkeys.add')}
        </button>
      )}
    </section>
  );
}

/** A name for a passkey: the platform takes 1 to NAME_MAX characters, and keeps them as given. */
function NameField({ t, value, onChange }) {
  return (
    <label className="field">
      <FieldName t={t} name="passkeys.name" />
      <input type="text" value={value} maxLength={NAME_MAX} autoComplete="off" data-field="passkey-name" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function AddPasskey({ t, client, onDone, onClose }) {
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  const add = async (e) => {
    e.preventDefault();
    if (working) return;
    if (!name.trim()) return setProblem('passkeyName');
    setWorking(true);
    setProblem(null);
    try {
      await client.addPasskey(name.trim(), (options) => makePasskey(options));
      onDone();
    } catch (p) {
      fail(p);
    } finally {
      setWorking(false);
    }
    return undefined;
  };
  return (
    <form className="setup-form" data-panel="add-passkey" onSubmit={add} noValidate>
      <NameField t={t} value={name} onChange={setName} />
      <button type="submit" className="primary-button" disabled={working}>
        {t('passkeys.addButton')}
      </button>{' '}
      <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
        {t('passkeys.cancel')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

function RenamePasskey({ t, client, passkey, onDone, onClose }) {
  const [name, setName] = useState(passkey.name);
  const [problem, setProblem, fail] = useProblem();
  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setProblem('passkeyName');
    setProblem(null);
    try {
      await client.renamePasskey(passkey.id, name.trim());
      onDone();
    } catch (p) {
      fail(p);
    }
    return undefined;
  };
  return (
    <form className="setup-form" data-panel="rename-passkey" onSubmit={save} noValidate>
      <NameField t={t} value={name} onChange={setName} />
      <button type="submit" className="primary-button">
        {t('passkeys.save')}
      </button>{' '}
      <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
        {t('passkeys.cancel')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

function RemovePasskey({ t, client, passkey, onDone, onClose }) {
  const [problem, setProblem, fail] = useProblem();
  return (
    <div className="setup-form" data-panel="remove-passkey">
      <p>
        {t('passkeys.removeAsk')} <bdi>{passkey.name}</bdi>
      </p>
      <button
        type="button"
        className="primary-button"
        data-action="remove-passkey-confirm"
        onClick={async () => {
          setProblem(null);
          try {
            await client.removePasskey(passkey.id);
            onDone();
          } catch (p) {
            fail(p);
          }
        }}
      >
        {t('passkeys.removeButton')}
      </button>{' '}
      <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
        {t('passkeys.keep')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}
