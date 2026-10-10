import { useCallback, useMemo, useRef, useState } from 'react';
import { Pager, ProblemNote, useGarageRead, usePaging } from './parts.jsx';
import { STALE } from './api.js';
import { moneyChoices, moneyWords, zoneChoices, zoneWords } from './garages.js';
import FieldName from './FieldName.jsx';

/**
 * The Garages page (U7c): the account's garages, twenty at a time, each with
 * its name, time zone, money, whether it is open, and how many of its Setup
 * steps are done, as the Setup page counts them. Pressing one chooses it and
 * opens its Setup page. "Add a garage" is above the list, closed until pressed.
 */
export default function GaragesPage({ t, language, client, garages, chosen, onOpen, onAdded }) {
  const paging = usePaging(garages.length);
  if (garages.length === 0) return <NoGarages t={t} language={language} client={client} onAdded={onAdded} />;
  return (
    <>
      <AddGarage t={t} language={language} client={client} onAdded={onAdded} />
      <section className="panel" data-list="garages-page">
        <table className="list garages">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="garages.name" />
              </th>
              <th>
                <FieldName t={t} name="garages.zone" />
              </th>
              <th>
                <FieldName t={t} name="garages.money" />
              </th>
              <th>
                <FieldName t={t} name="garages.open" />
              </th>
              <th>
                <FieldName t={t} name="garages.setup" />
              </th>
            </tr>
          </thead>
          <tbody>
            {garages.slice(paging.from, paging.to).map((g) => (
              <GarageRow key={g.id} t={t} language={language} client={client} garage={g} chosen={g.id === chosen} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
        <Pager t={t} language={language} paging={paging} list="garages-page" />
      </section>
    </>
  );
}

/** One garage: pressed anywhere, or its name from the keyboard, it is chosen and its Setup opens. */
function GarageRow({ t, language, client, garage, chosen, onOpen }) {
  const setup = useGarageRead(useCallback((id) => client.setup(id), [client]), garage.id);
  const steps = setup.data?.steps;
  return (
    <tr className="garage-row" data-garage-row={garage.id} aria-current={chosen ? 'true' : undefined} onClick={() => onOpen(garage.id)}>
      <td>
        <button type="button" className="link-button garage-open" data-garage={garage.id}>
          <bdi>{garage.name}</bdi>
        </button>
      </td>
      <td data-zone={garage.timezone}>{zoneWords(t, garage.timezone, language) ?? t('changes.value.anotherZone')}</td>
      <td data-money={garage.currency}>{moneyWords(t, garage.currency, language) ?? t('changes.value.another')}</td>
      <td data-live={garage.live ? 'yes' : 'no'}>{garage.live ? t('garage.live') : t('garage.notLive')}</td>
      <td data-setup={steps ? steps.filter((s) => s.done).length : undefined} data-read={setup.problem ? 'failed' : steps ? 'read' : 'reading'}>
        {setup.problem ? t('home.notRead') : steps ? t('setup.count', { done: steps.filter((s) => s.done).length, steps: steps.length }) : t('loading')}
      </td>
    </tr>
  );
}

/**
 * "Add a garage", closed until pressed (U7a's rule). Shown on the Garages
 * page, and on every page of an account with no garage yet, so a new account
 * starts here.
 */
export function AddGarage({ t, language, client, onAdded }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <p className="opens no-print">
        <button type="button" className="primary-button" data-action="add-garage" onClick={() => setOpen(true)}>
          {t('garages.add')}
        </button>
      </p>
    );
  }
  return <GarageForm t={t} language={language} client={client} onAdded={onAdded} onClose={() => setOpen(false)} />;
}

/** An account with no garage yet: what every page shows, in place of its own. */
export function NoGarages({ t, language, client, onAdded }) {
  return (
    <div className="no-garages" data-start="no-garages">
      <p className="quiet" data-notice="no-garages">
        {t('garage.none')}
      </p>
      <AddGarage t={t} language={language} client={client} onAdded={onAdded} />
    </div>
  );
}

/**
 * The three things a garage is created with -- its name, its time zone and
 * the money it charges in -- then a check of them, since none can be changed
 * after, then Create garage. Nothing is picked for the owner, nothing blank
 * is sent, and one press makes one garage.
 */
function GarageForm({ t, language, client, onAdded, onClose }) {
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [money, setMoney] = useState('');
  const [checking, setChecking] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  // Set on the first press of Create garage and let go only on a refusal: a second press, however quick, sends nothing.
  const sending = useRef(false);
  // Named once per language, not on every key typed: there are over four hundred zones.
  const zones = useMemo(() => zoneChoices(t, language), [t, language]);
  const moneys = useMemo(() => moneyChoices(t, language), [t, language]);
  const missing = { name: !name.trim(), zone: !zone, money: !money };
  const complete = !missing.name && !missing.zone && !missing.money;

  const next = () => {
    setTried(true);
    if (complete) setChecking(true);
  };
  const create = async () => {
    if (!complete) {
      setChecking(false);
      setTried(true);
      return;
    }
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    let made;
    try {
      made = await client.addGarage({ name: name.trim(), timezone: zone, currency: money });
    } catch (p) {
      sending.current = false;
      setBusy(false);
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      return;
    }
    // The list as the platform has it now, so the new garage is shown as every other is.
    let garages = null;
    try {
      garages = await client.garages();
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
    }
    onAdded(made, garages);
  };

  return (
    <section className="panel no-print setup-form" data-form="add-garage">
      <div className="lane-panel-head">
        <h2 className="section-title">{t('garages.add')}</h2>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t('garages.cancel')}
        </button>
      </div>
      {checking ? (
        <div className="garage-check" data-step="check">
          <dl className="garage-answers">
            <div>
              <dt>
                <FieldName t={t} name="garages.form.name" />
              </dt>
              <dd data-answer="name">
                <bdi>{name.trim()}</bdi>
              </dd>
            </div>
            <div>
              <dt>
                <FieldName t={t} name="garages.form.zone" />
              </dt>
              <dd data-answer="zone">{zoneWords(t, zone, language)}</dd>
            </div>
            <div>
              <dt>
                <FieldName t={t} name="garages.form.money" />
              </dt>
              <dd data-answer="money">{moneyWords(t, money, language)}</dd>
            </div>
          </dl>
          <p className="warning" data-notice="cannot-change">
            {t('garages.cannotChange')}
          </p>
          <div className="lane-actions">
            <button type="button" className="primary-button" data-action="create-garage" disabled={busy} onClick={create}>
              {busy ? t('garages.creating') : t('garages.create')}
            </button>
            <button type="button" className="link-button" data-action="change-answers" disabled={busy} onClick={() => setChecking(false)}>
              {t('garages.change')}
            </button>
          </div>
          {problem ? <ProblemNote t={t} kind={problem} /> : null}
        </div>
      ) : (
        <form
          className="setup-form"
          data-step="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <label className="field">
            <FieldName t={t} name="garages.form.name" />
            <input type="text" data-field="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          {tried && missing.name ? (
            <p className="warning" data-notice="need-name">
              {t('garages.needName')}
            </p>
          ) : null}
          <label className="field">
            <FieldName t={t} name="garages.form.zone" />
            <select data-field="zone" value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">{t('garages.zonePick')}</option>
              <optgroup label={t('garages.zonesUs')}>
                {zones.us.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.words}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('garages.zonesOther')}>
                {zones.others.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.words}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {tried && missing.zone ? (
            <p className="warning" data-notice="need-zone">
              {t('garages.needZone')}
            </p>
          ) : null}
          <label className="field">
            <FieldName t={t} name="garages.form.money" />
            <select data-field="money" value={money} onChange={(e) => setMoney(e.target.value)}>
              <option value="">{t('garages.moneyPick')}</option>
              {moneys.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.words}
                </option>
              ))}
            </select>
          </label>
          {tried && missing.money ? (
            <p className="warning" data-notice="need-money">
              {t('garages.needMoney')}
            </p>
          ) : null}
          <p className="quiet">{t('garages.formSays')}</p>
          <button type="submit" className="primary-button" data-action="check-garage">
            {t('garages.next')}
          </button>
        </form>
      )}
    </section>
  );
}
