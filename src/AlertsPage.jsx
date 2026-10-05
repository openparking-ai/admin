import { Fragment, useCallback, useState } from 'react';
import { PrintHead, ProblemNote, Segmented, useGarageRead, usePrint } from './parts.jsx';
import { STALE } from './api.js';
import { alertName, alertNames, alertSays, canEmail, canText, languageWords } from './alerts.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/**
 * Who is told when something goes wrong at this garage, and how: the people
 * (a name, a phone number and/or an email address, a language), and for
 * each alert, whether each person gets it by text, by email, or both.
 *
 * Nothing is sent yet, and the page says so first. Which alerts there are,
 * and in what order, is the platform's one list, read here; whether the
 * Setup step is done is the platform's too. Every confirmation is on the
 * page; nothing opens a browser dialog. A tick that cannot apply -- a text
 * for someone with no phone number -- is not offered, and the page says why.
 */
export default function AlertsPage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const read = useGarageRead(useCallback((id) => client.alerts(id), [client]), garage.id);
  // One panel at a time: { kind: 'change' | 'remove', person }.
  const [panel, setPanel] = useState(null);
  // What the last change turned off, said once: { name, by_text, by_email }.
  const [turnedOff, setTurnedOff] = useState(null);
  const reread = useCallback(() => read.refresh().catch(() => read.retry()), [read]);

  if (read.problem) return <ProblemNote t={t} kind={read.problem} onRetry={read.retry} />;
  if (!read.data) return <p className="quiet">{t('loading')}</p>;
  const { alerts, contacts, quietMinutes, maxContacts } = read.data;
  const order = alerts.map((a) => a.key);

  return (
    <>
      <section className="panel printable" data-list="alerts">
        <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={read.readAt} />
        <p className="warning" data-notice="not-sent-yet">
          {t('alerts.notSentYet')}
        </p>
        <p className="quiet" data-notice="confirm-first">
          {t('alerts.confirmFirst')}
        </p>
        <div className="list-head">
          <h2 className="section-title">{t('alerts.people')}</h2>
          <ListActions t={t} list="alerts" language={language} client={client} garage={garage} refresh={read.refresh} print={print} />
        </div>
        {contacts.length === 0 ? (
          <p className="quiet">{t('alerts.nobody')}</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>
                  <FieldName t={t} name="alerts.person" />
                </th>
                <th>
                  <FieldName t={t} name="alerts.phone" />
                </th>
                <th>
                  <FieldName t={t} name="alerts.email" />
                </th>
                <th>
                  <FieldName t={t} name="alerts.language" />
                </th>
                <th>
                  <FieldName t={t} name="alerts.confirmed" />
                </th>
                <th className="no-print">
                  <FieldName t={t} name="alerts.setup" />
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((person) => (
                <tr key={person.id} data-person={person.id}>
                  <td>
                    <bdi>{person.name}</bdi>
                  </td>
                  <td>{canText(person) ? <bdi dir="ltr">{person.phone}</bdi> : <span className="quiet">{t('alerts.none')}</span>}</td>
                  <td>{canEmail(person) ? <bdi>{person.email}</bdi> : <span className="quiet">{t('alerts.none')}</span>}</td>
                  <td>{languageWords(t, person.language)}</td>
                  <td data-confirmed={person.confirmed ? 'yes' : 'no'}>{person.confirmed ? t('alerts.isConfirmed') : t('alerts.notConfirmed')}</td>
                  <td className="no-print">
                    <div className="lane-actions">
                      <button type="button" className="link-button" data-action="change-person" onClick={() => setPanel({ kind: 'change', person })}>
                        {t('alerts.change')}
                      </button>
                      <button type="button" className="link-button" data-action="remove-person" onClick={() => setPanel({ kind: 'remove', person })}>
                        {t('alerts.remove')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="quiet no-print">{t('alerts.most', { max: maxContacts })}</p>
      </section>

      {turnedOff ? <TurnedOff t={t} language={language} order={order} said={turnedOff} /> : null}

      {panel ? (
        <PersonPanel
          key={`${panel.kind}:${panel.person.id}`}
          t={t}
          client={client}
          garage={garage}
          panel={panel}
          onDone={(off) => {
            setTurnedOff(off);
            reread();
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}

      <AddPerson
        t={t}
        client={client}
        garage={garage}
        onAdded={() => {
          setTurnedOff(null);
          reread();
        }}
      />

      <Choices t={t} client={client} garage={garage} alerts={alerts} contacts={contacts} quietMinutes={quietMinutes} onSaved={reread} />
    </>
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

/** What a change turned off with the phone number or address it took away, said once. */
function TurnedOff({ t, language, order, said }) {
  const text = alertNames(t, said.by_text, order, language);
  const email = alertNames(t, said.by_email, order, language);
  return (
    <section className="panel no-print" role="status" data-notice="turned-off">
      {text ? (
        <p>
          <bdi>{said.name}</bdi>
          {': '}
          {t('alerts.turnedOffText')} {text}
        </p>
      ) : null}
      {email ? (
        <p>
          <bdi>{said.name}</bdi>
          {': '}
          {t('alerts.turnedOffEmail')} {email}
        </p>
      ) : null}
    </section>
  );
}

/** The fields of a person: name, phone, email and language. Shared by adding and changing. */
function PersonFields({ t, value, onChange }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  return (
    <>
      <label className="field">
        <FieldName t={t} name="alerts.person" />
        <input type="text" value={value.name} maxLength={80} onChange={set('name')} autoComplete="off" />
      </label>
      <label className="field">
        <FieldName t={t} name="alerts.phone" />
        <input type="tel" value={value.phone} maxLength={32} onChange={set('phone')} autoComplete="off" data-field="phone" />
      </label>
      <label className="field">
        <FieldName t={t} name="alerts.email" />
        <input type="text" inputMode="email" value={value.email} maxLength={254} onChange={set('email')} autoComplete="off" data-field="email" />
      </label>
      <div className="chooser" data-chooser="person-language">
        <FieldName t={t} name="alerts.language" />
        <Segmented
          label={t('alerts.language')}
          value={value.language}
          options={['en', 'es'].map((l) => ({ value: l, text: t(`language.${l}`) }))}
          onChange={(l) => onChange({ ...value, language: l })}
          name="person-language"
        />
      </div>
    </>
  );
}

const blank = { name: '', phone: '', email: '', language: 'en' };

function AddPerson({ t, client, garage, onAdded }) {
  const [value, setValue] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  const ready = value.name.trim() !== '' && (value.phone.trim() !== '' || value.email.trim() !== '');
  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await client.addPerson(garage.id, {
        name: value.name.trim(),
        ...(value.phone.trim() ? { phone: value.phone } : {}),
        ...(value.email.trim() ? { email: value.email } : {}),
        language: value.language,
      });
      setValue(blank);
      onAdded();
    } catch (p) {
      fail(p);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel no-print" data-form="add-person">
      <h2 className="section-title">{t('alerts.add')}</h2>
      <form
        className="setup-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) add();
        }}
      >
        <PersonFields t={t} value={value} onChange={setValue} />
        <p className="quiet">{t('alerts.phoneOrEmail')}</p>
        <button type="submit" className="primary-button" disabled={!ready || busy}>
          {busy ? t('setup.saving') : t('alerts.addButton')}
        </button>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </form>
    </section>
  );
}

const CLOSE_WORDS = { change: 'alerts.panelCancel', remove: 'alerts.panelKeep' };

function PersonPanel({ t, client, garage, panel, onDone, onClose }) {
  const Body = panel.kind === 'change' ? ChangePerson : RemovePerson;
  return (
    <section className="panel no-print lane-panel" data-panel={`${panel.kind}-person`} aria-live="polite">
      <div className="lane-panel-head">
        <h2 className="section-title">
          {t(`alerts.panel.${panel.kind}`)} <bdi>{panel.person.name}</bdi>
        </h2>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t(CLOSE_WORDS[panel.kind])}
        </button>
      </div>
      <Body t={t} client={client} garage={garage} person={panel.person} onDone={onDone} onClose={onClose} />
    </section>
  );
}

/**
 * Change a person: only what changed is sent. A phone number or address
 * emptied is taken away -- and the page says, before the save, that their
 * alerts that way stop with it.
 */
function ChangePerson({ t, client, garage, person, onDone, onClose }) {
  const was = { name: person.name, phone: person.phone ?? '', email: person.email ?? '', language: person.language };
  const [value, setValue] = useState(was);
  const [problem, setProblem, fail] = useProblem();
  const changes = {};
  if (value.name.trim() !== was.name) changes.name = value.name.trim();
  if (value.phone.trim() !== was.phone) changes.phone = value.phone.trim() === '' ? null : value.phone;
  if (value.email.trim() !== was.email) changes.email = value.email.trim() === '' ? null : value.email;
  if (value.language !== was.language) changes.language = value.language;
  const changed = Object.keys(changes).length > 0;
  return (
    <form
      className="setup-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!changed) return;
        setProblem(null);
        try {
          const out = await client.changePerson(garage.id, person.id, changes);
          const off = out.turned_off ?? {};
          onDone((off.by_text ?? []).length || (off.by_email ?? []).length ? { name: out.contact?.name ?? person.name, by_text: off.by_text ?? [], by_email: off.by_email ?? [] } : null);
          onClose();
        } catch (p) {
          fail(p);
        }
      }}
    >
      <PersonFields t={t} value={value} onChange={setValue} />
      {changes.phone === null && person.by_text.length ? (
        <p className="warning" data-notice="phone-goes">
          {t('alerts.phoneGoes')}
        </p>
      ) : null}
      {changes.email === null && person.by_email.length ? (
        <p className="warning" data-notice="email-goes">
          {t('alerts.emailGoes')}
        </p>
      ) : null}
      <button type="submit" className="primary-button" disabled={!changed || value.name.trim() === ''}>
        {t('alerts.saveButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

function RemovePerson({ t, client, garage, person, onDone, onClose }) {
  const [problem, setProblem, fail] = useProblem();
  return (
    <div className="setup-form">
      <p>{t('alerts.removeAsk')}</p>
      <button
        type="button"
        className="primary-button"
        data-action="remove-person-confirm"
        onClick={async () => {
          setProblem(null);
          try {
            await client.removePerson(garage.id, person.id);
            onDone(null);
            onClose();
          } catch (p) {
            fail(p);
          }
        }}
      >
        {t('alerts.removeButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}

/**
 * Who gets which alert: every alert, in the platform's order, with every
 * person under it and a Text and an Email tick each. A tick is saved when
 * it is pressed, as the person's whole set of choices. A text for someone
 * with no phone number, or an email for someone with no address, is not
 * offered: the cell says what is missing.
 */
function Choices({ t, client, garage, alerts, contacts, quietMinutes, onSaved }) {
  const [busy, setBusy] = useState(null);
  const [problem, setProblem, fail] = useProblem();
  const toggle = async (person, way, key) => {
    const field = way === 'text' ? 'by_text' : 'by_email';
    const now = person[field].includes(key) ? person[field].filter((k) => k !== key) : [...person[field], key];
    setBusy(`${person.id}:${way}:${key}`);
    setProblem(null);
    try {
      await client.setChoices(garage.id, person.id, { by_text: field === 'by_text' ? now : person.by_text, by_email: field === 'by_email' ? now : person.by_email });
      onSaved();
    } catch (p) {
      fail(p);
    } finally {
      setBusy(null);
    }
  };
  const tick = (alert, person, way) => {
    const can = way === 'text' ? canText(person) : canEmail(person);
    if (!can) {
      return (
        <span className="quiet" data-missing={way === 'text' ? 'phone' : 'email'}>
          {t(way === 'text' ? 'alerts.needsPhone' : 'alerts.needsEmail')}
        </span>
      );
    }
    const on = person[way === 'text' ? 'by_text' : 'by_email'].includes(alert.key);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        className="tick"
        data-tick={way}
        disabled={busy !== null}
        aria-label={t(way === 'text' ? 'alerts.tickText' : 'alerts.tickEmail', { alert: alertName(t, alert.key), person: person.name })}
        onClick={() => toggle(person, way, alert.key)}
      >
        <span aria-hidden="true" className="tick-box" data-on={on ? 'yes' : 'no'} />
        {/* On paper a tick is a word: a print leaves backgrounds out by default. */}
        <span aria-hidden="true" className="print-word" data-print={on ? 'yes' : 'no'}>
          {on ? t('yes') : t('no')}
        </span>
      </button>
    );
  };

  return (
    <section className="panel" data-list="alert-choices">
      <h2 className="section-title">{t('alerts.choices')}</h2>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
      {contacts.length === 0 ? (
        <p className="quiet">{t('alerts.choicesNobody')}</p>
      ) : (
        <table className="list choices">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="alerts.alert" />
              </th>
              <th>
                <FieldName t={t} name="alerts.who" />
              </th>
              <th>
                <FieldName t={t} name="alerts.byText" />
              </th>
              <th>
                <FieldName t={t} name="alerts.byEmail" />
              </th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <Fragment key={alert.key}>
                {contacts.map((person, i) => (
                  <tr key={person.id} data-alert={alert.key} data-person={person.id}>
                    {i === 0 ? (
                      <td rowSpan={contacts.length} className="alert-cell">
                        <span className="alert-name">{alertName(t, alert.key)}</span>
                        <span className="alert-says">{alertSays(t, alert.key, quietMinutes)}</span>
                      </td>
                    ) : null}
                    <td>
                      <bdi>{person.name}</bdi>
                    </td>
                    <td>{tick(alert, person, 'text')}</td>
                    <td>{tick(alert, person, 'email')}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
