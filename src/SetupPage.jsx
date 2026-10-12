import { useCallback, useState } from 'react';
import { Opens, ProblemNote, Segmented, useGarageRead, useNow } from './parts.jsx';
import { STALE } from './api.js';
import { WHERE, factLines } from './setup.js';
import { PAGES, hashFor } from './pages.js';
import FieldName from './FieldName.jsx';

/**
 * The garage's setup checklist, as the platform works it out: each step's
 * name and what it is, done or not yet, the facts in plain words, and where
 * it is done. Nothing here decides whether a step is done.
 */
export default function SetupPage({ t, language, client, garage }) {
  const now = useNow();
  const setup = useGarageRead(useCallback((id) => client.setup(id), [client]), garage.id);

  if (setup.problem) return <ProblemNote t={t} kind={setup.problem} onRetry={setup.retry} />;
  if (!setup.data) return <p className="quiet">{t('loading')}</p>;
  const steps = setup.data.steps;
  const done = steps.filter((s) => s.done).length;

  return (
    <section className="panel" data-list="setup">
      {setup.data.open ? (
        <p className="setup-open" data-notice="garage-open">
          {t('setup.isOpen')}
        </p>
      ) : null}
      <p className="setup-count" data-count={done}>
        {t('setup.count', { done, steps: steps.length })}
      </p>
      <ol className="setup-steps">
        {steps.map((step) => (
          <li key={step.key} id={`setup-step-${step.key}`} className="setup-step" data-step={step.key} data-done={step.done ? 'yes' : 'no'}>
            <div className="setup-step-head">
              <h3 className="setup-step-name">
                <FieldName t={t} name={`setup.step.${step.key}`} />
              </h3>
              <span className={`setup-state ${step.done ? 'is-done' : 'is-not-done'}`} data-state={step.done ? 'done' : 'not-yet'}>
                {step.done ? t('setup.done') : t('setup.notYet')}
              </span>
            </div>
            <ul className="setup-facts">
              {(step.key === 'open' && !setup.data.open && (step.facts?.not_done ?? []).length ? [] : factLines(t, step, garage, language, now)).map((line, i) => (
                <li key={i}>
                  {line.text}
                  {line.names ? (
                    <>
                      {' '}
                      <bdi>{line.names}</bdi>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            <Where t={t} step={step} />
            {step.key === 'open' && !setup.data.open ? <OpenGarage t={t} client={client} garage={garage} notDone={step.facts?.not_done ?? []} onOpened={setup.retry} onRefused={setup.refresh} /> : null}
            {step.key === 'drivers' ? (
              <Opens t={t} opener={step.facts?.transient_available === undefined || step.facts?.transient_available === null ? 'setup.drivers.answer' : 'setup.drivers.change'} action="open-drivers">
                {(close) => <DriversQuestion t={t} client={client} garage={garage} answered={step.facts?.transient_available ?? null} onSaved={setup.retry} onClose={close} />}
              </Opens>
            ) : null}
          </li>
        ))}
      </ol>
      <TailgaterSettings t={t} client={client} garage={garage} />
    </section>
  );
}

/**
 * U7f: tailgaters, the garage owner's choice. Off until the owner turns it on:
 * a car that follows another through the gate, whose plate the lane reads, is
 * put on this garage's banned list and kept out next time. And the list's
 * reach: this garage only, or all the owner's garages. Not a checklist step --
 * a garage opens with it off.
 */
function TailgaterSettings({ t, client, garage }) {
  const settings = useGarageRead(useCallback((id) => client.banned(id), [client]), garage.id);
  if (settings.problem) return <ProblemNote t={t} kind={settings.problem} onRetry={settings.retry} />;
  if (!settings.data) return null;
  const { banTailgaters, banReach } = settings.data;
  return (
    <div className="setup-extra" data-section="tailgaters">
      <div className="setup-step-head">
        <h3 className="setup-step-name">
          <FieldName t={t} name="setup.tailgaters" />
        </h3>
      </div>
      <ul className="setup-facts">
        <li data-fact="ban">{banTailgaters ? t('setup.tailgaters.on') : t('setup.tailgaters.off')}</li>
        {banTailgaters ? <li data-fact="reach">{banReach === 'all' ? t('setup.tailgaters.reachAll') : t('setup.tailgaters.reachGarage')}</li> : null}
      </ul>
      <Opens t={t} opener="setup.tailgaters.change" action="open-tailgaters">
        {(close) => <TailgaterQuestion t={t} client={client} garage={garage} was={settings.data} onSaved={settings.retry} onClose={close} />}
      </Opens>
    </div>
  );
}

function TailgaterQuestion({ t, client, garage, was, onSaved, onClose }) {
  const [ban, setBan] = useState(was.banTailgaters);
  const [reach, setReach] = useState(was.banReach);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const changed = ban !== was.banTailgaters || reach !== was.banReach;

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await client.setTailgaters(garage.id, { banTailgaters: ban, banReach: reach });
      onSaved();
    } catch (p) {
      if (p.kind !== STALE && p.kind !== 'ended') setProblem(p.kind);
      setSaving(false);
    }
  };

  return (
    <form
      className="setup-question"
      data-question="tailgaters"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !saving) save();
      }}
    >
      <div className="chooser" data-chooser="ban-tailgaters">
        <FieldName t={t} name="setup.tailgaters.question" />
        <Segmented
          label={t('setup.tailgaters.question')}
          value={ban}
          options={[
            { value: true, text: t('setup.tailgaters.yes') },
            { value: false, text: t('setup.tailgaters.no') },
          ]}
          onChange={setBan}
          name="ban-tailgaters"
        />
      </div>
      <div className="chooser" data-chooser="ban-reach">
        <FieldName t={t} name="setup.tailgaters.reach" />
        <Segmented
          label={t('setup.tailgaters.reach')}
          value={reach}
          options={[
            { value: 'garage', text: t('setup.tailgaters.thisGarage') },
            { value: 'all', text: t('setup.tailgaters.allGarages') },
          ]}
          onChange={setReach}
          name="ban-reach"
        />
      </div>
      <div className="lane-actions">
        <button type="submit" className="primary-button" disabled={!changed || saving}>
          {saving ? t('setup.saving') : t('setup.save')}
        </button>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t('setup.cancel')}
        </button>
      </div>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

/**
 * Where a step that is still missing is done: its page, or its place on this
 * page (the drivers answer).
 */
function StepLink({ t, stepKey }) {
  const where = WHERE[stepKey] ?? {};
  const words = t('setup.open.goTo', { step: t(`setup.step.${stepKey}`) });
  if (where.page) {
    const page = PAGES.find((p) => p.id === where.page);
    return (
      <a href={hashFor(page)} data-go={page.id} data-missing={stepKey}>
        {words}
      </a>
    );
  }
  return (
    <button type="button" className="link-button" data-missing={stepKey} onClick={() => document.getElementById(`setup-step-${stepKey}`)?.scrollIntoView({ block: 'start' })}>
      {words}
    </button>
  );
}

/**
 * U7g: Open the garage. Shown while it is not open; pressable only when
 * nothing is missing (the platform's `not_done`, the list its Open refuses
 * on); otherwise it lists what is missing, each going to where it is done.
 * Pressing it asks once -- once open, it stays open -- and a refusal lists,
 * in plain words, what the platform says is still missing.
 */
/**
 * The Open button, and what is still missing, said ONCE: the open step shows
 * no fact line of its own while this list is shown. A refused Open reads Setup
 * again, so the checklist above says what the refusal says (U7g fix 1, F3).
 */
function OpenGarage({ t, client, garage, notDone, onOpened, onRefused }) {
  const [asking, setAsking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState(null);
  const [refusedOn, setRefusedOn] = useState(null);
  const missing = refusedOn ? [...new Set([...notDone, ...refusedOn])] : notDone;

  const open = async () => {
    setOpening(true);
    setProblem(null);
    try {
      await client.openGarage(garage.id);
      onOpened();
    } catch (p) {
      if (p.kind === STALE || p.kind === 'ended') return;
      if (p.kind === 'notReadyToOpen') {
        // The list below is the message; Setup is read again so the steps above agree with it.
        setRefusedOn(p.unmet ?? []);
        await onRefused().catch(() => {});
      } else setProblem(p.kind);
      setAsking(false);
      setOpening(false);
    }
  };

  return (
    <div className="open-garage no-print" data-section="open-garage">
      {missing.length ? (
        <div data-notice={refusedOn ? 'open-refused' : 'open-missing'}>
          <p>{refusedOn ? t('setup.open.refused') : t('setup.open.missing')}</p>
          <ul className="setup-facts">
            {missing.map((k) => (
              <li key={k} data-still-missing={k}>
                <StepLink t={t} stepKey={k} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {asking ? (
        <div className="setup-question" data-question="open">
          <p className="warning" data-notice="open-stays-open">
            {t('setup.open.confirm')}
          </p>
          <div className="lane-actions">
            <button type="button" className="primary-button" data-action="open-yes" disabled={opening} onClick={open}>
              {opening ? t('setup.open.opening') : t('setup.open.yes')}
            </button>
            <button type="button" className="link-button" data-action="open-no" disabled={opening} onClick={() => setAsking(false)}>
              {t('setup.open.no')}
            </button>
          </div>
        </div>
      ) : (
        <p className="opens">
          <button type="button" className="primary-button" data-action="open-garage" disabled={missing.length > 0} aria-disabled={missing.length > 0} onClick={() => setAsking(true)}>
            {t('setup.open.button')}
          </button>
        </p>
      )}
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}

function Where({ t, step }) {
  const where = WHERE[step.key] ?? { notYet: true };
  if (where.page) {
    const page = PAGES.find((p) => p.id === where.page);
    const drawings = PAGES.find((p) => p.id === 'drawings');
    return (
      <>
        <p className="setup-where">
          <a href={hashFor(page)} data-go={page.id}>
            {t('setup.goTo', { page: t(`page.${page.id}.title`) })}
          </a>
        </p>
        {where.drawings ? (
          <p className="setup-where">
            <a href={hashFor(drawings)} data-go="drawings">
              {t('setup.drawings')}
            </a>
          </p>
        ) : null}
      </>
    );
  }
  // Answered here: the step's own button opens its question (U7a).
  if (where.here) return null;
  // U7d-2: set when the garage was created, and never changed after.
  if (where.fixed) {
    return (
      <p className="setup-where quiet" data-notice="set-at-creation">
        {t('setup.setAtCreation')}
      </p>
    );
  }
  return (
    <p className="setup-where quiet" data-notice="not-from-here">
      {t('setup.notFromHere')}
    </p>
  );
}

/**
 * Does this garage take drivers without a pass? Yes, any driver; or no, pass
 * holders only. Once answered it can be changed, never taken back to
 * unanswered -- and the page says so before the first save.
 */
function DriversQuestion({ t, client, garage, answered, onSaved, onClose }) {
  const [choice, setChoice] = useState(answered);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const changed = choice !== null && choice !== answered;

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await client.setDrivers(garage.id, choice);
      onSaved();
    } catch (p) {
      if (p.kind !== STALE && p.kind !== 'ended') setProblem(p.kind);
      setSaving(false);
    }
  };

  return (
    <form
      className="setup-question"
      data-question="drivers"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !saving) save();
      }}
    >
      <div className="chooser" data-chooser="drivers">
        <FieldName t={t} name="setup.drivers.question" />
        <Segmented
          label={t('setup.drivers.question')}
          value={choice}
          options={[
            { value: true, text: t('setup.drivers.any') },
            { value: false, text: t('setup.drivers.passOnly') },
          ]}
          onChange={setChoice}
          name="drivers"
        />
      </div>
      {answered === null ? (
        <p className="quiet" data-notice="drivers-once">
          {t('setup.drivers.once')}
        </p>
      ) : null}
      <div className="lane-actions">
        <button type="submit" className="primary-button" disabled={!changed || saving}>
          {saving ? t('setup.saving') : t('setup.save')}
        </button>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t('setup.cancel')}
        </button>
      </div>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}
