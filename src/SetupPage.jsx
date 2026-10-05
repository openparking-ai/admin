import { useCallback, useState } from 'react';
import { ProblemNote, Segmented, useGarageRead, useNow } from './parts.jsx';
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
          <li key={step.key} className="setup-step" data-step={step.key} data-done={step.done ? 'yes' : 'no'}>
            <div className="setup-step-head">
              <h3 className="setup-step-name">
                <FieldName t={t} name={`setup.step.${step.key}`} />
              </h3>
              <span className={`setup-state ${step.done ? 'is-done' : 'is-not-done'}`} data-state={step.done ? 'done' : 'not-yet'}>
                {step.done ? t('setup.done') : t('setup.notYet')}
              </span>
            </div>
            <ul className="setup-facts">
              {factLines(t, step, garage, language, now).map((line, i) => (
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
            {step.key === 'drivers' ? (
              <DriversQuestion t={t} client={client} garage={garage} answered={step.facts?.transient_available ?? null} onSaved={setup.retry} />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Where({ t, step }) {
  const where = WHERE[step.key] ?? { notYet: true };
  if (where.page) {
    const page = PAGES.find((p) => p.id === where.page);
    return (
      <p className="setup-where">
        <a href={hashFor(page)} data-go={page.id}>
          {t('setup.goTo', { page: t(`page.${page.id}.title`) })}
        </a>
      </p>
    );
  }
  if (where.here) return <p className="setup-where quiet">{t('setup.here')}</p>;
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
function DriversQuestion({ t, client, garage, answered, onSaved }) {
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
      <button type="submit" className="primary-button" disabled={!changed || saving}>
        {saving ? t('setup.saving') : t('setup.save')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}
