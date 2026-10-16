import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pager, PrintHead, ProblemNote, Segmented, useGarageRead, useNow, usePaging, usePrint } from './parts.jsx';
import { STALE } from './api.js';
import { taxNamesAt } from './taxes.js';
import ListActions from './ListActions.jsx';
import FieldName, { FieldAbout } from './FieldName.jsx';
import { garageDateTime, localSaid, zoneSaid } from './time.js';
import {
  ADJUST_ROUNDINGS,
  AMOUNT_KINDS,
  CHARGES,
  DAYS,
  DAY_KINDS,
  DIRECTIONS,
  PRESETS,
  PRESET_KEYS,
  TABLE_MAX,
  WEEK_KINDS,
  arrange,
  caseKey,
  caseWords,
  changes,
  clockWords,
  currencySign,
  dateWords,
  dayName,
  dayShort,
  daysWords,
  findingWords,
  formFromPlan,
  formShows,
  instantOf,
  lengthWords,
  lineWords,
  mergeRegular,
  mergeSpecial,
  moneyText,
  orderedWindows,
  parseMoney,
  percentWords,
  planName,
  planSentences,
  platformNow,
  saveStart,
  stayToTry,
  fillNote,
  tickOf,
  regularPlan,
  regularProblems,
  regularUntouched,
  specialForm,
  specialName,
  specialProblems,
  specialSentence,
  specialWords,
  specialsPlan,
  startNow,
  tableStays,
  typedRegular,
  typedSpecial,
} from './rates.js';

/**
 * A garage's rates (U7i, the page the owner approved on 2026-10-13): the
 * current rates, who set them and when, and what they charge; the regular
 * rates and the special rates, each changed with its own button; a price
 * calculator; and every earlier set of rates. Nothing is scheduled: rates are
 * charged to cars that come in from the moment they are confirmed, and a car
 * already parked pays the rates it came in under.
 *
 * Every field starts empty, with the value in force under it; a field left
 * empty keeps it. "Check prices and save" opens the check page, which prices a
 * table of example stays through the platform for the rates as they will be,
 * and saves them only once the owner has ticked and confirmed. The platform
 * and its rate engine price every stay shown here; nothing is priced on the
 * page. The only write is new rates (POST rate-plans), and the old ones stay
 * on record.
 */
export default function RatesPage({ t, language, client, garage }) {
  const ticking = useNow();
  const read = useGarageRead(useCallback((id) => client.ratePlans(id), [client]), garage.id);
  const taxLists = useTaxLists(client, garage);
  const savers = useSavers(client, garage, read.data?.saved);
  const { printedAt, print } = usePrint();
  const [regular, setRegular] = useState(null);
  const [nothing, setNothing] = useState(false);
  const [special, setSpecial] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [saved, setSaved] = useState(null);
  const [lost, setLost] = useState(false);
  const reread = useCallback(() => {
    read.refresh().then(savers.refresh, () => read.retry());
  }, [read, savers.refresh]);

  // A special being changed or removed that the rates read again no longer
  // hold (another owner removed it), or one being changed that they now hold
  // with settings the form cannot show: back to the rates, saying they changed.
  const plansNow = read.data?.plans;
  const currentNow = plansNow ? arrange(plansNow).current : null;
  const goneId =
    [reviewing, special].find((x) => {
      const rule = x?.id ? orderedWindows(currentNow).find((r) => r.id === x.id) : null;
      return x?.id && (!rule || (x.kind === 'change' && !formShows(rule)));
    })?.id ?? null;
  useEffect(() => {
    if (!goneId || !plansNow) return;
    setReviewing(null);
    setSpecial(null);
    setLost(true);
  }, [goneId, plansNow]);

  if (read.problem) return <ProblemNote t={t} kind={read.problem} onRetry={read.retry} />;
  if (!read.data) return <p className="quiet">{t('loading')}</p>;
  const now = new Date(Math.max(ticking.getTime(), read.readAt?.getTime() ?? 0));
  const { plans, spaceClass, clock } = read.data;
  // The rates in force are the newest stored, whatever this computer's clock
  // says: the ones shown, the ones a save is built on, and the ones it says it
  // was checked against (U7i, `based_on`) are one (OP-NODE-012).
  const { current, earlier } = arrange(plans);
  const basedOn = current ? (read.data.saved.find((r) => r.plan_version === current.plan_version)?.id ?? null) : null;
  const at = (iso) => garageDateTime(iso, garage.timezone, language);
  const zone = zoneSaid(garage.timezone, language, now);
  const opts = (start, name) => ({ garage, spaceClass, start, name });
  const nowForm = formFromPlan(current, garage.currency);
  const list = orderedWindows(current);

  // The regular rates: what was typed, over the rates in force.
  const regularTyped = regular ?? typedRegular(nowForm);
  const regularMerged = mergeRegular(regularTyped, nowForm);
  const regularDraft = {
    what: t('rates.review.whatRegular'),
    problems: regularProblems(regularMerged, garage),
    make: (start, name) => regularPlan(current, regularTyped, nowForm, opts(start, name)),
  };

  // The special being added or changed, as it will be. One being changed that
  // the rates read no longer hold (another owner removed it) has nothing built
  // for it: the effect above goes back to the rates, saying they changed (OP-NODE-010).
  const editIndex = special?.kind === 'change' ? list.findIndex((r) => r.id === special.id) : -1;
  const editing = special && (special.kind !== 'change' || (editIndex >= 0 && formShows(list[editIndex]))) ? special : null;
  const specialNow = editIndex >= 0 ? specialForm(list[editIndex], garage.currency) : null;
  const specialMerged = editing ? mergeSpecial(editing.typed, specialNow) : null;
  const others = list.filter((r) => r.id !== editing?.id).map((r) => r.label ?? '');
  const specialUnchanged =
    editing?.kind === 'change' && Object.keys(specialProblems(specialMerged, 'special', garage, others)).length === 0
      ? (() => {
          const was = list[editIndex];
          const is = specialsPlan(current, { kind: 'change', index: editIndex, special: specialMerged }, opts(current.effective_from, 'x'));
          const isRule = orderedWindows(is)[editIndex];
          return specialSentence(t, was, current.currency, language) === specialSentence(t, isRule, current.currency, language) && was.label === isRule.label;
        })()
      : false;
  const specialDraft = editing
    ? {
        what: t(editing.kind === 'add' ? 'rates.review.whatAdd' : 'rates.review.whatChange', { name: specialMerged.name.trim() }),
        problems: { ...specialProblems(specialMerged, 'special', garage, others), ...(specialUnchanged ? { 'special.nothing': 'rates.nothingToSave.special' } : {}) },
        names: { name: specialMerged.name.trim() },
        make: (start, name) => specialsPlan(current, { kind: editing.kind, index: editIndex, special: specialMerged }, opts(start, name)),
      }
    : null;

  // The check page's draft: what was opened, built on the rates as read now.
  const reviewDraft = (() => {
    if (!reviewing) return null;
    if (reviewing.kind === 'regular') return regularDraft;
    if (reviewing.kind === 'remove') {
      const index = list.findIndex((r) => r.id === reviewing.id);
      if (index < 0) return null;
      return {
        what: t('rates.review.whatRemove', { name: specialName(t, list[index], index) }),
        make: (start, name) => specialsPlan(current, { kind: 'remove', index }, opts(start, name)),
      };
    }
    return specialDraft;
  })();

  const done = (start) => {
    setRegular(null);
    setSpecial(null);
    setReviewing(null);
    setNothing(false);
    setLost(false);
    setSaved(start);
    reread();
    window.scrollTo(0, 0);
  };

  if (reviewing && reviewDraft) {
    return (
      <Review
        t={t}
        language={language}
        client={client}
        garage={garage}
        current={current}
        basedOn={basedOn}
        clock={clock}
        draft={reviewDraft}
        taxLists={taxLists}
        reread={reread}
        onBack={() => setReviewing(null)}
        onSaved={done}
      />
    );
  }

  // The calculator's "rates I am changing": the regular rates as typed, and the special being added or changed.
  const changing = (() => {
    const problems = { ...regularDraft.problems, ...(specialDraft ? specialProblems(specialMerged, 'special', garage, others) : {}) };
    if (Object.keys(problems).length) return { problems };
    const base = regularDraft.make(current?.effective_from ?? startNow(garage), 'calc');
    if (!editing) return { plan: base };
    const index = editing.kind === 'change' ? orderedWindows(base).findIndex((r) => r.id === editing.id) : null;
    return { plan: specialsPlan(base, { kind: editing.kind, index, special: specialMerged }, opts(base.effective_from, 'calc')) };
  })();

  return (
    <>
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={read.readAt} />
      {saved ? (
        <p className="saved-note no-print" role="status" data-notice="saved">
          {t('rates.saved', { time: at(saved) })}
        </p>
      ) : null}
      {lost ? <ProblemNote t={t} kind="ratesChanged" /> : null}
      <section className="panel" data-section="in-force">
        <h2 className="section-title">{t('rates.inForce')}</h2>
        {current ? (
          <>
            <p className="rates-state" data-state="current">
              {t('rates.since', { time: at(current.effective_from) })}
              {zone ? (
                <>
                  {' '}
                  <span className="quiet">{t('rates.zone', { zone })}</span>
                </>
              ) : null}
            </p>
            <SetBy t={t} language={language} garage={garage} savers={savers} plan={current} />
            <Sentences t={t} language={language} plan={current} kind="current" />
          </>
        ) : (
          <p className="rates-state" data-state="none">
            {t('rates.none')}
          </p>
        )}
        {plans.length ? <ListActions t={t} list="rates" language={language} client={client} garage={garage} refresh={read.refresh} print={print} /> : null}
      </section>

      <RegularSection
        t={t}
        language={language}
        garage={garage}
        now={current ? nowForm : null}
        typed={regularTyped}
        problems={regularDraft.problems}
        nothing={nothing}
        onChange={(next) => {
          setRegular(next);
          setNothing(false);
          setSaved(null);
        }}
        onClear={() => {
          setRegular(null);
          setNothing(false);
        }}
        onSave={() => {
          if (current && regularUntouched(regularTyped, nowForm)) setNothing(true);
          else setReviewing({ kind: 'regular' });
        }}
      />

      <SpecialSection
        t={t}
        language={language}
        garage={garage}
        canAdd={Boolean(current)}
        list={list}
        current={current}
        editing={editing}
        now={specialNow}
        draft={specialDraft}
        onEdit={(next) => {
          setSpecial(next);
          setSaved(null);
          setLost(false);
        }}
        onRemove={(id) => {
          setSaved(null);
          setLost(false);
          setReviewing({ kind: 'remove', id });
        }}
        onSave={() => setReviewing({ kind: editing.kind, id: editing.id ?? null })}
      />

      <Calculator
        t={t}
        language={language}
        client={client}
        garage={garage}
        taxLists={taxLists}
        sources={[
          { value: 'force', text: t('rates.calc.force'), plan: current, problem: current ? null : t('rates.calc.noRates') },
          {
            value: 'changing',
            text: t('rates.calc.changing'),
            plan: changing.plan ?? null,
            problem: changing.plan ? null : t('rates.calc.notFinished', { fields: missingItems(t, changing.problems, [...REGULAR_ORDER, ...SPECIAL_ORDER]).map((i) => i.label).join(', ') }),
          },
        ]}
      />

      {earlier.length ? (
        <section className="panel" data-section="earlier">
          <h2 className="section-title">
            <FieldName t={t} name="rates.earlier" />
          </h2>
          {earlier.map((plan) => (
            <div key={plan.plan_version} className="rate-plan" data-plan="earlier" data-starts={plan.effective_from}>
              <p className="rate-plan-when">{t('rates.fromTo', { from: at(plan.effective_from), to: at(plan.until) })}</p>
              <SetBy t={t} language={language} garage={garage} savers={savers} plan={plan} />
              <Sentences t={t} language={language} plan={plan} kind="earlier" small untitled />
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

/**
 * The garage's lists of taxes, for the names of a priced stay's tax lines:
 * each stay's from the list in force when it left (OP-NODE-013).
 */
function useTaxLists(client, garage) {
  const taxes = useGarageRead(useCallback((id) => client.taxLists(id), [client]), garage.id);
  return taxes.data ?? [];
}

/** The most pages of the change log read to find who set each set of rates. */
const SAVER_PAGES = 40;

/**
 * Who set each set of rates, and when (U7i, item 11): from the line every
 * save writes to the garage's change log (`rate_plan.add`), matched by the
 * stored rates' own id -- the line's subject. Read newest first, page by page,
 * until every set of rates is found. `saved` is the platform's `[{ id,
 * plan_version }]`. By plan version: `{ name, kind, at }`, or absent.
 */
function useSavers(client, garage, saved) {
  // `for`: the sets of rates the lookup was made for; until it is the current ones, nothing is said.
  const [state, setState] = useState({ by: {}, for: null });
  const [attempt, setAttempt] = useState(0);
  const wanted = useMemo(() => (saved ?? []).map((s) => `${s.id}:${s.plan_version}`).join(), [saved]);
  useEffect(() => {
    if (!saved) return undefined;
    let live = true;
    (async () => {
      const ids = new Map(saved.map((s) => [s.id, s.plan_version]));
      const by = {};
      let after = null;
      for (let page = 0; page < SAVER_PAGES && Object.keys(by).length < ids.size; page += 1) {
        const out = await client.changes(garage.id, after);
        for (const line of out.changes) {
          if (line.subject?.kind !== 'rate_plan' || !ids.has(line.subject.id) || line.action !== 'rate_plan.add') continue;
          const version = ids.get(line.subject.id);
          if (!by[version]) by[version] = { name: line.who?.name ?? null, kind: line.who?.kind ?? null, at: line.at };
        }
        if (!out.next) break;
        after = out.next;
      }
      if (live) setState({ by, for: wanted });
    })().catch(() => live && setState({ by: {}, for: wanted }));
    return () => {
      live = false;
    };
    // `wanted` stands for `saved`: the same sets of rates are not looked up again.
  }, [client, garage.id, wanted, attempt]);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { by: state.by, read: state.for === wanted, refresh };
}

/** "Set by Pat on Oct 12, 2026, 2:10 PM", the owner in bold, from the change log. */
function SetBy({ t, language, garage, savers, plan }) {
  const s = savers.by[plan.plan_version];
  // Not found is said only once the lookup is for these very rates: a save just made is looked up first.
  if (!s && !savers.read) return null;
  if (!s) {
    return (
      <p className="saved-by quiet" data-saved-by="unknown" data-plan-version={plan.plan_version}>
        {t('rates.savedBy.unknown')}
      </p>
    );
  }
  const when = garageDateTime(s.at, garage.timezone, language);
  if (!s.name) {
    return (
      <p className="saved-by" data-saved-by="" data-saved-at={s.at} data-plan-version={plan.plan_version}>
        {t('rates.setOn', { when })}
      </p>
    );
  }
  const [before, after] = t(s.kind === 'key' ? 'rates.setByKey' : 'rates.setBy', { name: '\u0000', when }).split('\u0000');
  return (
    <p className="saved-by" data-saved-by={s.name} data-saved-at={s.at} data-plan-version={plan.plan_version}>
      {before}
      <b>
        <bdi className="saved-name">{s.name}</bdi>
      </b>
      {after}
    </p>
  );
}

/** One plan, in plain sentences: "What it charges", a special's name kept apart from the words. */
function Sentences({ t, language, plan, kind, small = false, title = null, untitled = false }) {
  return (
    <div className="rate-sentences" data-sentences={kind}>
      {untitled ? null : (
        <p className="rate-sentences-title">
          <b>{title ?? t('rates.charges')}</b>
        </p>
      )}
      <ul className={small ? 'small' : undefined}>
        {planSentences(t, plan, language).map((s) => (
          <li key={s.key} data-sentence={s.key}>
            {s.name ? (
              <>
                <bdi className="special-name">{s.name}</bdi>
                {' — '}
              </>
            ) : null}
            {s.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- fields --------------------------------------------------------------------

/** A 'YYYY-MM-DDTHH:MM' from a datetime field, or null. */
const wallOf = (value) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value ?? '')) ? value : null);

/** The id of a field on the page, from where its problem is said ("time.firstMinutes"). */
const fieldId = (scope, at) => `rates-${scope}-${at.replace(/\./g, '-')}`;

/** A field's problem: its red sentence, directly under it. */
function Wrong({ t, problem, id, values }) {
  if (!problem) return null;
  return (
    <span className="field-wrong" id={`${id}-wrong`} data-wrong-for={id}>
      {t(problem, values)}
    </span>
  );
}

/** "Now: $15.00": the value in force, under a field that starts empty. */
function NowWas({ t, text }) {
  if (text === null || text === undefined || text === '') return null;
  return (
    <span className="now-was" data-now>
      {t('rates.now', { value: text })}
    </span>
  );
}

const invalid = (problem, id) => (problem ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-wrong` } : {});

/**
 * A typed field, its unit inside the box: "$" before money, "minutes" after
 * time, "%" after a percent (U7i, item 9).
 */
function Text({ t, language, garage, name, field, id, value, onChange, unit = null, now, problem, values, inputMode = 'decimal', maxLength = 10 }) {
  const sign = unit === 'money' ? currencySign(garage.currency, language) : null;
  const after = unit === 'minutes' ? t('rates.unit.minutes') : unit === 'percent' ? '%' : null;
  return (
    <label className="field" data-wrong={problem ? 'yes' : 'no'} id={`${id}-field`}>
      <FieldName t={t} name={name} />
      <span className="unit-box" data-unit={unit ?? 'none'}>
        {sign ? (
          <span className="unit unit-before" aria-hidden="true" data-unit-text={sign}>
            {sign}
          </span>
        ) : null}
        <input type="text" id={id} inputMode={inputMode} data-field={field} value={value} maxLength={maxLength} autoComplete="off" onChange={(e) => onChange(e.target.value)} {...invalid(problem, id)} />
        {after ? (
          <span className="unit unit-after" aria-hidden="true" data-unit-text={after}>
            {after}
          </span>
        ) : null}
      </span>
      <NowWas t={t} text={now} />
      <Wrong t={t} problem={problem} id={id} values={values} />
    </label>
  );
}

/** A choice field: a select with "Choose…" and nothing chosen for the owner. */
function Choice({ t, name, field, id, value, options, onChange, now, problem }) {
  return (
    <label className="field" data-wrong={problem ? 'yes' : 'no'}>
      <FieldName t={t} name={name} />
      <select id={id} data-field={field} value={value} onChange={(e) => onChange(e.target.value)} {...invalid(problem, id)}>
        <option value="">{t('rates.pick')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
      <NowWas t={t} text={now} />
      <Wrong t={t} problem={problem} id={id} />
    </label>
  );
}

/**
 * A date or time box, empty until the owner picks (U7i, item 5): a plain
 * prompt ("Pick a date") and never the browser's grey digits, which read as a
 * value that is not there; a picked value in full dark text.
 */
function When({ t, kind, field, id, value, onChange, problem, name, now = null, bare = false }) {
  const empty = value ? 'no' : 'yes';
  const prompt = (
    <span className="when-prompt" aria-hidden="true" data-prompt-for={field}>
      {t(`rates.when.${kind}`)}
    </span>
  );
  if (bare) {
    // One of a list (a special's dates): its name is the list's own, above it.
    return (
      <>
        <span className="when-box" data-empty={empty}>
          <input type={kind} id={id} data-field={field} aria-label={t(name)} value={value} onChange={(e) => onChange(e.target.value)} />
          {prompt}
        </span>
        <FieldAbout t={t} name={name} />
      </>
    );
  }
  return (
    <label className="field" data-wrong={problem ? 'yes' : 'no'}>
      <FieldName t={t} name={name} />
      <span className="when-box" data-empty={empty}>
        <input type={kind} id={id} data-field={field} value={value} onChange={(e) => onChange(e.target.value)} {...invalid(problem, id)} />
        {prompt}
      </span>
      <NowWas t={t} text={now} />
      <Wrong t={t} problem={problem} id={id} />
    </label>
  );
}

/**
 * A tick with its words beside it: on or off, as every tick on these screens is
 * drawn (a button, so a print can say it in words), as wide as its words.
 */
function Tick({ t, on, onChange, words, tick, id }) {
  return (
    <span className="tick-row">
      <button type="button" id={id} role="checkbox" aria-checked={on} className="tick tick-words" data-tick={tick} onClick={() => onChange(!on)}>
        <span aria-hidden="true" className="tick-box" data-on={on ? 'yes' : 'no'} />
        <span aria-hidden="true" className="print-word" data-print={on ? 'yes' : 'no'}>
          {on ? t('yes') : t('no')}
        </span>
        <span>{words}</span>
      </button>
    </span>
  );
}

/**
 * A button that may be locked, with the next step beside it (U7i, items 12
 * and 13) -- never a wait cursor. `said` is beside it whether locked or not.
 */
function Act({ action, onClick, disabled, reason, said = null, className = 'primary-button', children, type = 'button' }) {
  const beside = said ?? (disabled ? reason : null);
  return (
    <span className="act-row">
      <button type={type} className={className} data-action={action} disabled={disabled} onClick={onClick}>
        {children}
      </button>
      {beside ? (
        <span className="locked-reason" data-reason-for={action}>
          {beside}
        </span>
      ) : null}
    </span>
  );
}

/**
 * What is still missing or wrong, by the button it stops (U7i, item 4): each
 * field by name, a link that moves to it. `items` are `{ at, label, problem }`.
 */
function Missing({ t, scope, items, values }) {
  if (!items.length) return null;
  return (
    <div className="warning missing" data-notice="form-not-ready" role="alert">
      <p>
        <b>{items.length === 1 ? t('rates.missing.one') : t('rates.missing.many', { count: items.length })}</b>
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.at}>
            <button type="button" className="link-button" data-goes-to={fieldId(scope, item.at)} onClick={() => goTo(fieldId(scope, item.at))}>
              {item.label}
            </button>
            {': '}
            {t(item.problem, values)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Moves to a field, and into it: its own box, or the first thing to press in a group. */
function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.matches('input, select, textarea, button') ? el : el.querySelector('input, select, textarea, button');
  (target ?? el).scrollIntoView({ block: 'center' });
  (target ?? el).focus({ preventScroll: true });
}

/** The names the list by the button calls each field by. */
const FIELD_NAMES = {
  'time.firstMinutes': 'rates.time.firstMinutes',
  'time.firstPrice': 'rates.time.firstPrice',
  'time.nextMinutes': 'rates.time.nextMinutes',
  'time.nextPrice': 'rates.time.nextPrice',
  'dayMax.price': 'rates.dayMax.price',
  'dayMax.kind': 'rates.dayMax.kind',
  'weekMax.price': 'rates.weekMax.price',
  'weekMax.kind': 'rates.weekMax.kind',
  'weekMax.startsOn': 'rates.weekMax.startsOn',
  'grace.minutes': 'rates.grace.minutes',
  'special.nothing': 'rates.nothingToSave',
  'special.name': 'rates.special.name',
  'special.preset': 'rates.special.choice',
  'special.days': 'rates.special.choice',
  'special.dates': 'rates.special.dates',
  'special.enterFrom': 'rates.special.enterFrom',
  'special.enterBy': 'rates.special.enterBy',
  'special.leaveBy': 'rates.special.leaveBy',
  'special.nextDay': 'rates.special.nextDay',
  'special.charge': 'rates.special.charge',
  'special.flat': 'rates.special.flat',
  'special.rate.firstMinutes': 'rates.srate.firstMinutes',
  'special.rate.firstPrice': 'rates.srate.firstPrice',
  'special.rate.nextMinutes': 'rates.srate.nextMinutes',
  'special.rate.nextPrice': 'rates.srate.nextPrice',
  'special.direction': 'rates.special.direction',
  'special.amountKind': 'rates.special.amountKind',
  'special.amount': 'rates.special.amount',
  'special.cent': 'rates.special.cent',
};

/** The list's items, in the order the fields are on the page. `amount` is named by its kind. */
function missingItems(t, problems, order, amountName = 'rates.special.fixed') {
  return order
    .filter((at) => problems[at])
    .map((at) => ({ at, label: t(at === 'special.amount' ? amountName : FIELD_NAMES[at]), problem: problems[at] }));
}

const RATE_FIELDS = ['firstMinutes', 'firstPrice', 'nextMinutes', 'nextPrice'];
const REGULAR_ORDER = [...RATE_FIELDS.map((f) => `time.${f}`), 'dayMax.price', 'dayMax.kind', 'weekMax.price', 'weekMax.kind', 'weekMax.startsOn', 'grace.minutes'];
const SPECIAL_ORDER = [
  'special.nothing',
  'special.name',
  'special.preset',
  'special.days',
  'special.dates',
  'special.enterFrom',
  'special.enterBy',
  'special.leaveBy',
  'special.nextDay',
  'special.charge',
  'special.flat',
  ...RATE_FIELDS.map((f) => `special.rate.${f}`),
  'special.direction',
  'special.amountKind',
  'special.amount',
  'special.cent',
];

/**
 * A button that, pressed with something missing, marks each field, lists them
 * by name beside it, and moves to the first (U7i, item 4).
 */
function useSaveTried(scope, problems, order) {
  const [tried, setTried] = useState(false);
  const [goFirst, setGoFirst] = useState(0);
  useEffect(() => {
    if (!goFirst) return;
    const first = order.find((at) => problems[at]);
    if (first) goTo(fieldId(scope, first));
    // Only when the button is pressed, not as the owner types.
  }, [goFirst]);
  const press = (onReady) => {
    setTried(true);
    if (Object.keys(problems).length === 0) onReady();
    else setGoFirst((n) => n + 1);
  };
  return { tried, press, reset: () => setTried(false) };
}

/** The money a form field holds, as the "Now:" under it says it. */
const nowMoney = (typed, garage, language) => {
  const p = parseMoney(typed, garage.currency, { zeroOk: true });
  return p.minor === undefined ? null : moneyText(p.minor, garage.currency, language);
};
const nowMinutes = (t, typed) => (/^\d+$/.test(String(typed ?? '')) ? `${typed} ${t('rates.unit.minutes')}` : null);
const nowOnOff = (t, on) => t(on ? 'rates.now.on' : 'rates.now.off');

/** The fields of a time-based rate: the first period and its price, each period after and its price. */
function RateFields({ t, language, garage, rate, now, onChange, prefix, scope, problems, tried }) {
  const set = (field) => (value) => onChange({ ...rate, [field]: value });
  const p = (f) => (tried ? problems[`${prefix}.${f}`] : null);
  const id = (f) => fieldId(scope, `${prefix}.${f}`);
  const df = prefix === 'time' ? 'time' : 'special-rate';
  const names = prefix === 'time' ? 'rates.time' : 'rates.srate';
  return (
    <div className="rate-fields tax-line-fields" data-rate-fields={prefix}>
      <Text t={t} language={language} garage={garage} name={`${names}.firstMinutes`} field={`${df}-first-minutes`} id={id('firstMinutes')} value={rate.firstMinutes} onChange={set('firstMinutes')} unit="minutes" now={now && nowMinutes(t, now.firstMinutes)} problem={p('firstMinutes')} inputMode="numeric" maxLength={5} />
      <Text t={t} language={language} garage={garage} name={`${names}.firstPrice`} field={`${df}-first-price`} id={id('firstPrice')} value={rate.firstPrice} onChange={set('firstPrice')} unit="money" now={now && nowMoney(now.firstPrice, garage, language)} problem={p('firstPrice')} />
      <Text t={t} language={language} garage={garage} name={`${names}.nextMinutes`} field={`${df}-next-minutes`} id={id('nextMinutes')} value={rate.nextMinutes} onChange={set('nextMinutes')} unit="minutes" now={now && nowMinutes(t, now.nextMinutes)} problem={p('nextMinutes')} inputMode="numeric" maxLength={5} />
      <Text t={t} language={language} garage={garage} name={`${names}.nextPrice`} field={`${df}-next-price`} id={id('nextPrice')} value={rate.nextPrice} onChange={set('nextPrice')} unit="money" now={now && nowMoney(now.nextPrice, garage, language)} problem={p('nextPrice')} />
    </div>
  );
}

/**
 * A section's title and the approved page's sentence under it, drawn as a
 * field's name and description are -- for the two sections whose sentence is
 * longer than a field's description may be (the calculator, the price table).
 */
function SectionName({ t, name }) {
  return (
    <>
      <span className="field-name">{t(name)}</span>
      <span className="field-about" data-about={`${name}.intro`}>
        {t(`${name}.intro`)}
      </span>
    </>
  );
}

/** A box's title alone, with no sentence under it (the approved page's Max per day and Max per week). */
function BoxName({ t, name }) {
  return <span className="field-name">{t(name)}</span>;
}

// --- the regular rates --------------------------------------------------------

/**
 * The regular rates: the time-based rate, a max per day and per week, and a
 * free grace period, with their own button. `now` is the form of the rates in
 * force, or null when there are none (then every field is needed).
 */
function RegularSection({ t, language, garage, now, typed, problems, nothing, onChange, onClear, onSave }) {
  const save = useSaveTried('regular', problems, REGULAR_ORDER);
  const p = (at) => (save.tried ? problems[at] : null);
  const id = (at) => fieldId('regular', at);
  const set = (part) => (value) => onChange({ ...typed, [part]: value });
  const part = (name) => (change) => onChange({ ...typed, [name]: { ...typed[name], ...change } });
  // A tick as shown: as the owner pressed it, else as it is in the rates in force now (OP-NODE-008).
  const on = (name) => tickOf(typed[name].on, now?.[name].on);
  // The value in force of a part ticked on now, else "none" to show.
  const was = (name) => (now && now[name].on ? now[name] : null);
  const none = now ? t('rates.change.none') : null;
  return (
    <section className="panel no-print" data-section="regular" aria-live="polite">
      <h2 className="section-title">
        <FieldName t={t} name="rates.regular" />
      </h2>
      {now ? null : <p className="quiet">{t('rates.regular.first')}</p>}
      <form
        className="setup-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.press(onSave);
        }}
      >
        <fieldset className="rates-part" data-part="time">
          <legend>
            <FieldName t={t} name="rates.time" />
          </legend>
          <RateFields t={t} language={language} garage={garage} rate={typed.time} now={now?.time} onChange={set('time')} prefix="time" scope="regular" problems={problems} tried={save.tried} />
        </fieldset>

        <fieldset className="rates-part" data-part="day-max">
          <legend>
            <BoxName t={t} name="rates.dayMax" />
          </legend>
          <Tick t={t} tick="day-max-on" on={on('dayMax')} onChange={(v) => part('dayMax')({ on: v })} words={t('rates.dayMax.use')} />
          {now ? <NowWas t={t} text={nowOnOff(t, now.dayMax.on)} /> : null}
          {on('dayMax') ? (
            <div className="tax-line-fields">
              <Text t={t} language={language} garage={garage} name="rates.dayMax.price" field="day-max-price" id={id('dayMax.price')} value={typed.dayMax.price} onChange={(v) => part('dayMax')({ price: v })} unit="money" now={was('dayMax') ? nowMoney(was('dayMax').price, garage, language) : none} problem={p('dayMax.price')} />
              <Choice t={t} name="rates.dayMax.kind" field="day-max-kind" id={id('dayMax.kind')} value={typed.dayMax.kind} options={DAY_KINDS.map((k) => ({ value: k, text: t(`rates.dayKind.${k}`) }))} onChange={(v) => part('dayMax')({ kind: v })} now={was('dayMax') ? t(`rates.dayKind.${was('dayMax').kind}`) : none} problem={p('dayMax.kind')} />
            </div>
          ) : null}
        </fieldset>

        <fieldset className="rates-part" data-part="week-max">
          <legend>
            <BoxName t={t} name="rates.weekMax" />
          </legend>
          <Tick t={t} tick="week-max-on" on={on('weekMax')} onChange={(v) => part('weekMax')({ on: v })} words={t('rates.weekMax.use')} />
          {now ? <NowWas t={t} text={nowOnOff(t, now.weekMax.on)} /> : null}
          {on('weekMax') ? (
            <div className="tax-line-fields">
              <Text t={t} language={language} garage={garage} name="rates.weekMax.price" field="week-max-price" id={id('weekMax.price')} value={typed.weekMax.price} onChange={(v) => part('weekMax')({ price: v })} unit="money" now={was('weekMax') ? nowMoney(was('weekMax').price, garage, language) : none} problem={p('weekMax.price')} />
              <Choice t={t} name="rates.weekMax.kind" field="week-max-kind" id={id('weekMax.kind')} value={typed.weekMax.kind} options={WEEK_KINDS.map((k) => ({ value: k, text: t(`rates.weekKind.${k}`) }))} onChange={(v) => part('weekMax')({ kind: v })} now={was('weekMax') ? t(`rates.weekKind.${was('weekMax').kind}`) : none} problem={p('weekMax.kind')} />
              {(typed.weekMax.kind || was('weekMax')?.kind) === 'calendar_week' ? (
                <Choice t={t} name="rates.weekMax.startsOn" field="week-max-starts" id={id('weekMax.startsOn')} value={typed.weekMax.startsOn} options={DAYS.map((d) => ({ value: d, text: dayName(d, language) }))} onChange={(v) => part('weekMax')({ startsOn: v })} now={was('weekMax')?.startsOn ? dayName(was('weekMax').startsOn, language) : none} problem={p('weekMax.startsOn')} />
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="rates-part" data-part="grace">
          <legend>
            <FieldName t={t} name="rates.grace" />
          </legend>
          <Tick t={t} tick="grace-on" on={on('grace')} onChange={(v) => part('grace')({ on: v })} words={t('rates.grace.use')} />
          {now ? <NowWas t={t} text={nowOnOff(t, now.grace.on)} /> : null}
          {on('grace') ? (
            <div className="tax-line-fields">
              <Text t={t} language={language} garage={garage} name="rates.grace.minutes" field="grace-minutes" id={id('grace.minutes')} value={typed.grace.minutes} onChange={(v) => part('grace')({ minutes: v })} unit="minutes" now={was('grace') ? nowMinutes(t, was('grace').minutes) : none} problem={p('grace.minutes')} inputMode="numeric" maxLength={5} />
            </div>
          ) : null}
        </fieldset>

        <p className="rates-note" data-notice="new-rates">
          {t('rates.newRates')}
        </p>
        {nothing ? (
          <div className="warning missing" data-notice="nothing-to-save" role="alert">
            <p>
              <b>{t('rates.nothingToSave')}</b>
            </p>
            <p>{t('rates.nothingToSave.regular')}</p>
          </div>
        ) : null}
        {save.tried ? <Missing t={t} scope="regular" items={missingItems(t, problems, REGULAR_ORDER)} /> : null}
        <div className="lane-actions">
          <button type="submit" className="primary-button" data-action="save-regular">
            {t('rates.saveRegular')}
          </button>
          <button
            type="button"
            className="link-button"
            data-action="clear-regular"
            onClick={() => {
              save.reset();
              onClear();
            }}
          >
            {t('rates.clear')}
          </button>
        </div>
      </form>
    </section>
  );
}

// --- the special rates --------------------------------------------------------

/**
 * The special rates in force, each its name and one sentence, with Change and
 * Remove, and "Add a special rate". One is added or changed at a time, with
 * its own button; Remove goes straight to the check page.
 */
function SpecialSection({ t, language, garage, canAdd, list, current, editing, now, draft, onEdit, onRemove, onSave }) {
  const open = (kind, rule = null) => onEdit({ kind, id: rule?.id ?? null, typed: typedSpecial(rule ? specialForm(rule, garage.currency) : null) });
  return (
    <section className="panel no-print" data-section="specials" aria-live="polite">
      <h2 className="section-title">
        <FieldName t={t} name="rates.specials" />
      </h2>
      <p className="quiet">{t('rates.specials.cheaper')}</p>
      {list.length ? (
        <ol className="special-list">
          {list.map((rule, i) => (
            <li key={rule.id} className="special-in-force" data-special-in-force={i + 1} data-editing={editing?.id === rule.id ? 'yes' : 'no'}>
              <div className="special-words">
                <b className="special-name">
                  <bdi>{specialName(t, rule, i)}</bdi>
                </b>
                <span>{specialSentence(t, rule, current.currency, language)}</span>
              </div>
              {editing ? null : (
                <div className="lane-actions">
                  {formShows(rule) ? (
                    <button type="button" className="link-button" data-action="change-special" onClick={() => open('change', rule)}>
                      {t('rates.special.change')}
                    </button>
                  ) : (
                    // Settings the form cannot show (written elsewhere): not changed here, so nothing is rewritten unseen (OP-NODE-011).
                    <span className="quiet small" data-notice="special-not-here">
                      {t('rates.special.notHere')}
                    </span>
                  )}
                  <button type="button" className="link-button" data-action="remove-special" onClick={() => onRemove(rule.id)}>
                    {t('rates.special.remove')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="quiet">{t('rates.specials.none')}</p>
      )}
      {editing ? (
        <SpecialEditor t={t} language={language} garage={garage} editing={editing} wasName={editing.kind === 'change' ? specialName(t, list.find((r) => r.id === editing.id) ?? {}, list.findIndex((r) => r.id === editing.id)) : null} now={now} draft={draft} onEdit={onEdit} onSave={onSave} />
      ) : (
        <Act action="add-special" className="secondary-button" disabled={!canAdd} reason={t('rates.specials.regularFirst')} onClick={() => open('add')}>
          {t('rates.addSpecial')}
        </Act>
      )}
    </section>
  );
}

/** One special being added or changed: its fields, the note, and its button. */
function SpecialEditor({ t, language, garage, editing, wasName, now, draft, onEdit, onSave }) {
  const save = useSaveTried('special', draft.problems, SPECIAL_ORDER);
  const typed = editing.typed;
  const change = (c) => onEdit({ ...editing, typed: { ...typed, ...c } });
  const merged = mergeSpecial(typed, now);
  const amountName = merged.adjust.kind === 'percent' ? 'rates.special.percent' : 'rates.special.fixed';
  return (
    <form
      className="setup-form special-editor rates-part"
      noValidate
      data-editing={editing.kind}
      id={fieldId('special', 'special.nothing')}
      onSubmit={(e) => {
        e.preventDefault();
        save.press(onSave);
      }}
    >
      <p className="special-editor-title" data-editing-says>
        <b>{editing.kind === 'add' ? t('rates.special.adding') : t('rates.special.changing', { name: wasName })}</b>
      </p>
      {editing.kind === 'add' ? <p className="quiet">{t('rates.special.fillAll')}</p> : null}
      <SpecialFields t={t} language={language} garage={garage} typed={typed} now={now} problems={draft.problems} names={draft.names} tried={save.tried} onChange={change} />
      <p className="rates-note" data-notice="special-note">
        {t('rates.special.note')}
      </p>
      {save.tried ? <Missing t={t} scope="special" items={missingItems(t, draft.problems, SPECIAL_ORDER, amountName)} values={draft.names} /> : null}
      <div className="lane-actions">
        <button type="submit" className="primary-button" data-action="save-special">
          {editing.kind === 'add' ? t('rates.saveSpecial') : t('rates.saveChange')}
        </button>
        <button type="button" className="link-button" data-action="cancel-special" onClick={() => onEdit(null)}>
          {t('rates.cancel')}
        </button>
      </div>
    </form>
  );
}

/** A special's fields: its name, its days, its times, its price. `now` is the special in force, or null for a new one. */
function SpecialFields({ t, language, garage, typed: s, now, problems, names, tried, onChange }) {
  const p = (f) => (tried ? problems[`special.${f}`] : null);
  const id = (f) => fieldId('special', `special.${f}`);
  const merged = mergeSpecial(s, now);
  const pickPreset = (preset) => onChange({ preset, days: PRESETS[preset] ? [...PRESETS[preset]] : now ? s.days : [], dates: preset === 'dates' ? (s.dates.length ? s.dates : ['']) : [] });
  // The days as shown: as the owner ticked them, else as they are in force (OP-NODE-008).
  const days = merged.days;
  const clock = (v) => (v ? clockWords(v, language) : null);
  const money = (v) => (v ? nowMoney(v, garage, language) : null);
  const amountKind = merged.adjust.kind;
  const daysWrong = p('days');
  return (
    <>
      <div className="tax-line-fields">
        <Text t={t} language={language} garage={garage} name="rates.special.name" field="special-name" id={id('name')} value={s.name} onChange={(v) => onChange({ name: v })} now={now?.name || null} problem={p('name')} values={names} inputMode="text" maxLength={60} />
        <Choice t={t} name="rates.special.choice" field="special-preset" id={id('preset')} value={s.preset} options={PRESET_KEYS.map((k) => ({ value: k, text: t(`rates.preset.${k}`) }))} onChange={pickPreset} now={now ? t(`rates.preset.${now.preset}`) : null} problem={p('preset')} />
      </div>
      {merged.preset && merged.preset !== 'dates' ? (
        <fieldset className="days" data-field="special-days" id={id('days')} data-wrong={daysWrong ? 'yes' : 'no'}>
          <legend>
            <FieldName t={t} name="rates.special.days" />
          </legend>
          <div className="day-ticks">
            {DAYS.map((d) => (
              <Tick key={d} t={t} tick={`day-${d}`} on={days.includes(d)} onChange={(on) => onChange({ days: on ? DAYS.filter((x) => x === d || days.includes(x)) : days.filter((x) => x !== d) })} words={dayShort(d, language)} />
            ))}
          </div>
          {now && now.preset !== 'dates' ? <NowWas t={t} text={daysWords(t, { kind: 'days_of_week', days: now.days }, language)} /> : null}
          <Wrong t={t} problem={daysWrong} id={id('days')} />
        </fieldset>
      ) : null}
      {merged.preset === 'dates' ? (
        <fieldset className="dates" data-field="special-dates" id={id('dates')} data-wrong={p('dates') ? 'yes' : 'no'}>
          <legend>
            <FieldName t={t} name="rates.special.dates" />
          </legend>
          {s.dates.map((d, n) => (
            <div key={n} className="date-row">
              <When t={t} kind="date" name="rates.special.dates" field={`special-date-${n + 1}`} id={n === 0 ? `${id('dates')}-first` : undefined} value={d} bare onChange={(v) => onChange({ dates: s.dates.map((x, m) => (m === n ? v : x)) })} />
              <button type="button" className="link-button" data-action="remove-date" onClick={() => onChange({ dates: s.dates.filter((_, m) => m !== n) })}>
                {t('rates.special.removeDate')}
              </button>
            </div>
          ))}
          <button type="button" className="link-button" data-action="add-date" onClick={() => onChange({ dates: [...s.dates, ''] })}>
            {t('rates.special.addDate')}
          </button>
          {now?.preset === 'dates' ? <NowWas t={t} text={now.dates.map((x) => dateWords(x, language)).join(', ')} /> : null}
          <Wrong t={t} problem={p('dates')} id={id('dates')} />
        </fieldset>
      ) : null}
      <div className="tax-line-fields">
        {[
          ['enterFrom', 'rates.special.enterFrom', 'special-enter-from'],
          ['enterBy', 'rates.special.enterBy', 'special-enter-by'],
          ['leaveBy', 'rates.special.leaveBy', 'special-leave-by'],
        ].map(([f, name, field]) => (
          <When key={f} t={t} kind="time" name={name} field={field} id={id(f)} value={s[f]} onChange={(v) => onChange({ [f]: v })} problem={p(f)} now={now && clock(now[f])} />
        ))}
      </div>
      <div className="chooser" data-chooser="next-day" id={id('nextDay')} data-wrong={p('nextDay') ? 'yes' : 'no'}>
        <FieldName t={t} name="rates.special.nextDay" />
        <Segmented
          label={t('rates.special.nextDay')}
          value={s.nextDay}
          options={[
            { value: false, text: t('rates.nextDay.no') },
            { value: true, text: t('rates.nextDay.yes') },
          ]}
          onChange={(v) => onChange({ nextDay: v })}
          name="next-day"
        />
        {now ? <NowWas t={t} text={t(now.nextDay ? 'rates.nextDay.yes' : 'rates.nextDay.no')} /> : null}
        <Wrong t={t} problem={p('nextDay')} id={id('nextDay')} />
      </div>
      <Choice t={t} name="rates.special.charge" field="special-charge" id={id('charge')} value={s.charge} options={CHARGES.map((c) => ({ value: c, text: t(`rates.chargeKind.${c}`) }))} onChange={(v) => onChange({ charge: v })} now={now ? t(`rates.chargeKind.${now.charge}`) : null} problem={p('charge')} />
      {merged.charge === 'flat' ? <Text t={t} language={language} garage={garage} name="rates.special.flat" field="special-flat" id={id('flat')} value={s.flat} onChange={(v) => onChange({ flat: v })} unit="money" now={now ? (now.charge === 'flat' ? money(now.flat) : t('rates.now.notThisKind')) : null} problem={p('flat')} /> : null}
      {merged.charge === 'rate' ? <RateFields t={t} language={language} garage={garage} rate={s.rate} now={now?.charge === 'rate' ? now.rate : null} onChange={(rate) => onChange({ rate })} prefix="special.rate" scope="special" problems={problems} tried={tried} /> : null}
      {merged.charge === 'adjust' ? (
        <div className="tax-line-fields">
          <Choice t={t} name="rates.special.direction" field="special-direction" id={id('direction')} value={s.adjust.direction} options={DIRECTIONS.map((d) => ({ value: d, text: t(`rates.direction.${d}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, direction: v } })} now={now?.charge === 'adjust' ? t(`rates.direction.${now.adjust.direction}`) : null} problem={p('direction')} />
          <Choice t={t} name="rates.special.amountKind" field="special-amount-kind" id={id('amountKind')} value={s.adjust.kind} options={AMOUNT_KINDS.map((k) => ({ value: k, text: t(`rates.amountKind.${k}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, kind: v } })} now={now?.charge === 'adjust' ? t(`rates.amountKind.${now.adjust.kind}`) : null} problem={p('amountKind')} />
          {amountKind ? (
            <Text
              t={t}
              language={language}
              garage={garage}
              name={amountKind === 'percent' ? 'rates.special.percent' : 'rates.special.fixed'}
              field="special-amount"
              id={id('amount')}
              value={s.adjust.value}
              onChange={(v) => onChange({ adjust: { ...s.adjust, value: v } })}
              unit={amountKind === 'percent' ? 'percent' : 'money'}
              now={now?.charge === 'adjust' && now.adjust.kind === amountKind ? (amountKind === 'percent' ? percentWords(Number(now.adjust.value) * 100, language) : money(now.adjust.value)) : null}
              problem={p('amount')}
            />
          ) : null}
          {amountKind === 'percent' ? (
            <Choice t={t} name="rates.special.cent" field="special-cent" id={id('cent')} value={s.adjust.rounding} options={ADJUST_ROUNDINGS.map((r) => ({ value: r, text: t(`rates.cent.${r}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, rounding: v } })} now={now?.charge === 'adjust' && now.adjust.kind === 'percent' ? t(`rates.cent.${now.adjust.rounding}`) : null} problem={p('cent')} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

// --- the price calculator -----------------------------------------------------

/**
 * The plan a calculator sends to price one stay by `plan`, whatever its own
 * start: from the earlier of now and one minute before the car came in, under
 * a name of its own, so the engine picks it for that stay -- the stay is priced
 * by the rates chosen, as the approved page prices it. Nothing is stored.
 */
function forStay(plan, entry, garage, name) {
  const entryMs = instantOf(entry, garage.timezone);
  const from = Math.min(Date.now(), (entryMs ?? Date.now()) - 60000);
  return { ...plan, plan_version: name, effective_from: startNow(garage, from) };
}

/**
 * The price calculator (U7i, item 7): came in, left, and what the driver pays
 * with each line in plain words. Nothing is saved. `sources` are the rates it
 * can price by, `{ value, text, plan, problem }` (a source with no plan says
 * why); the platform prices every stay, the way a leaving car is priced. An
 * answer is tied to the rates and the stay it was priced for: change either
 * and it is greyed, with a line saying to work it out again (U7i fix 1, F1).
 */
function Calculator({ t, language, client, garage, sources, taxLists, onCheckPage = false }) {
  const [source, setSource] = useState(sources[0].value);
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [problem, setProblem] = useState(null);
  const [said, setSaid] = useState(null);
  const chosen = sources.find((s) => s.value === source) ?? sources[0];
  // What an answer would be priced for this moment: the rates and the stay.
  const askedFor = JSON.stringify({ source, rates: chosen.plan ? { ...chosen.plan, plan_version: null, effective_from: null } : null, entry, exit });

  const run = async () => {
    setProblem(null);
    if (!wallOf(entry) || !wallOf(exit)) return setSaid('rates.try.need');
    if (exit < entry) return setSaid('rates.try.backwards');
    if (!chosen.plan) return setSaid(null);
    setSaid(null);
    if (busy) return;
    setBusy(true);
    const key = askedFor;
    try {
      const plan = forStay(chosen.plan, entry, garage, planName(Date.now(), garage.timezone));
      const out = await client.tryStays(garage.id, { plan, stays: [stayToTry(plan, { entry, exit })] });
      setAnswer({ stay: { ...out.stays[0], entry, exit }, plan, key });
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  };

  const stay = answer?.stay;
  const stale = Boolean(answer) && answer.key !== askedFor;

  return (
    <section className={`panel${onCheckPage ? '' : ' no-print'}`} data-section="calculator" aria-live="polite">
      <h2 className="section-title">
        <SectionName t={t} name="rates.calc" />
      </h2>
      <div className="chooser" data-chooser="calc-rates">
        <FieldName t={t} name="rates.calc.which" />
        <Segmented
          label={t('rates.calc.which')}
          value={source}
          options={sources.map((s) => ({ value: s.value, text: s.text }))}
          onChange={(v) => {
            setSource(v);
            setAnswer(null);
            setSaid(null);
          }}
          name="calc-rates"
        />
      </div>
      <form
        className="setup-form try-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="tax-line-fields calc-fields">
          <When t={t} kind="datetime-local" name="rates.try.entry" field="try-entry" id={`calc-entry${onCheckPage ? '-check' : ''}`} value={entry} onChange={setEntry} />
          <When t={t} kind="datetime-local" name="rates.try.exit" field="try-exit" id={`calc-exit${onCheckPage ? '-check' : ''}`} value={exit} onChange={setExit} />
          <Act type="submit" action="try-stay" className="secondary-button" disabled={busy || !chosen.plan} reason={busy ? null : chosen.problem}>
            {t('rates.calc.button')}
          </Act>
        </div>
      </form>
      {said ? (
        <p className="warning" data-notice="try-need">
          {t(said)}
        </p>
      ) : null}
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
      {stay && !busy && stale ? (
        <p className="warning" data-notice="calc-stale">
          {t('rates.calc.stale')}
        </p>
      ) : null}
      {stay && !busy ? (
        <div className={stale ? 'tried-stale' : undefined} data-stale={stale ? 'yes' : 'no'}>
          <TriedStay t={t} language={language} garage={garage} stay={stay} plan={answer.plan} taxLists={taxLists} />
        </div>
      ) : null}
    </section>
  );
}

/** One priced stay: "Nothing is saved.", what the driver pays, how long it stayed, each part of the price and why. */
function TriedStay({ t, language, garage, stay, plan, taxLists }) {
  if (stay.refused) {
    return (
      <div className="tried" data-tried="refused">
        <p className="warning">{t('rates.try.refused')}</p>
        <ul>
          {(stay.findings ?? []).map((f, i) => (
            <li key={i} data-finding={f.code}>
              {findingWords(t, f, plan, garage.timezone, language)}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const money = (minor) => moneyText(minor, garage.currency, language);
  // Each tax line named from the list the stay was taxed by: the one in force when it left (OP-NODE-013).
  const left = Date.parse(stay.exit_at ?? '') || instantOf(stay.exit, garage.timezone);
  const { lines, byHour } = lineWords(t, stay, plan, taxNamesAt(taxLists, left), garage.currency, language);
  return (
    <div className="tried" data-tried="priced" data-fee={stay.fee_minor}>
      <p className="quiet small">{t('rates.calc.nothingSaved')}</p>
      <p className="tried-pays">{t('rates.try.pays', { amount: money(stay.fee_minor) })}</p>
      <p>{t('rates.try.stayed', { length: lengthWords(t, stay.minutes) })}</p>
      {fillNote(t, plan, language) ? (
        <p className="quiet small" data-notice="fill-rule">
          {fillNote(t, plan, language)}
        </p>
      ) : null}
      {stay.taxes_stated === false ? (
        <p className="quiet small" data-notice="tax-not-stated">
          {t('rates.try.taxNotStated')}
        </p>
      ) : null}
      <table className="list tried-lines">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} data-line-tax={line.tax ? 'yes' : 'no'} data-line-cap={line.cap ?? undefined}>
              <td>
                <bdi>{line.words}</bdi>
              </td>
              <td className="money" data-minor={line.minor}>
                {line.amount}
              </td>
            </tr>
          ))}
          <tr className="tried-total" data-line-total>
            <td>
              <b>{t('rates.line.total')}</b>
            </td>
            <td className="money" data-minor={stay.fee_minor}>
              <b>{money(stay.fee_minor)}</b>
            </td>
          </tr>
        </tbody>
      </table>
      {byHour !== null ? (
        <p className="quiet small" data-by-hour={byHour}>
          {t('rates.line.byHour', { amount: money(byHour) })}
        </p>
      ) : null}
      <p className="small" data-special-words>
        {specialWords(t, stay, plan, language)}
      </p>
    </div>
  );
}

// --- the check page -----------------------------------------------------------

/**
 * The check page: its steps (1 Check the prices, 2 Tick, 3 Confirm, the one
 * to do marked), what this save does in one sentence, what changes (each old
 * value struck through, then the new), the new rates in plain sentences, the
 * price calculator, and the price table -- priced by itself as the page opens
 * and again whenever a stay is added -- then the tick and Confirm. Nothing is
 * saved before Confirm. The rates are saved to start at the moment Confirm is
 * pressed, naming the rates they were checked against (`basedOn`): rates
 * stored meanwhile by someone else refuse the save, and the page reads the
 * rates again and prices again, keeping what was typed.
 */
function Review({ t, language, client, garage, current, basedOn, clock, draft, taxLists, reread, onBack, onSaved }) {
  const [added, setAdded] = useState([]);
  const [priced, setPriced] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState({ entry: '', exit: '' });
  const [addSaid, setAddSaid] = useState(null);
  // The engine's findings when it refused the save itself, each said in plain words.
  const [saveFindings, setSaveFindings] = useState([]);
  const name = useRef(planName(Date.now(), garage.timezone));
  // The moment the new rates are priced from: when the page opened, and again
  // whenever the rates are read anew (another owner saved), so the new rates
  // always start after every rates stored -- by the platform's clock, never
  // this computer's (OP-NODE-014), and after the start of the rates they are
  // built on (OP-NODE-012).
  const opened = useRef(null);
  const openedOn = useRef(basedOn);
  if (opened.current === null || openedOn.current !== basedOn) {
    openedOn.current = basedOn;
    opened.current = Date.parse(saveStart(current, platformNow(clock)));
  }
  const asking = useRef(null);
  const { printedAt, print } = usePrint();

  const shown = draft.make(startNow(garage, opened.current), name.current);
  const ratesKey = JSON.stringify({ ...shown, plan_version: null, effective_from: null, basedOn });
  const stays = [...tableStays(shown, garage.timezone, opened.current), ...added].slice(0, TABLE_MAX);
  const key = JSON.stringify({ ratesKey, stays: stays.map(({ entry, exit }) => [entry, exit]) });

  const price = async () => {
    asking.current = key;
    setBusy(true);
    setProblem((p) => (p === 'ratesChanged' ? p : null));
    try {
      const out = await client.tryStays(garage.id, { plan: shown, stays: stays.map(({ entry, exit }) => stayToTry(shown, { entry, exit })) });
      if (asking.current !== key) return { data: priced, readAt: priced?.at };
      const done = { key, ratesKey, plan: shown, rows: stays.map((st, i) => ({ ...st, answer: out.stays[i] })), draftFindings: out.draftFindings, at: new Date() };
      setPriced(done);
      return { data: done, readAt: done.at };
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      asking.current = null;
      throw p;
    } finally {
      setBusy(false);
    }
  };

  // Priced as the page opens, and again whenever what the table prices changes: a stay added, or the rates read again.
  useEffect(() => {
    price().catch(() => {});
  }, [key]);
  // Rates read again (another owner saved): the tick is given again only for the prices priced now.
  useEffect(() => {
    setTicked(false);
  }, [ratesKey]);

  const current_ = priced?.key === key;
  const blocked = (priced?.draftFindings ?? []).length > 0;
  const step = !current_ || blocked ? 1 : !ticked ? 2 : 3;
  const canConfirm = current_ && ticked && !saving && !blocked;
  const confirmSaid = blocked ? t('rates.review.cannotSave') : !current_ ? t('rates.table.busy') : ticked ? t('rates.review.confirmSays') : t('rates.review.needTick');

  const confirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    setProblem(null);
    setSaveFindings([]);
    const start = saveStart(current, platformNow(clock));
    try {
      await client.addRatePlan(garage.id, { ...priced.plan, effective_from: start }, { confirmed: true, basedOn });
      onSaved(start);
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
      setProblem(p?.kind ?? 'unexpected');
      setSaving(false);
      if (p?.kind === 'planFindings') setSaveFindings(p.findings ?? []);
      if (p?.kind === 'ratesChanged') {
        setTicked(false);
        reread();
      }
    }
  };

  const addStay = () => {
    const entry = wallOf(extra.entry);
    const exit = wallOf(extra.exit);
    if (!entry || !exit) return setAddSaid('rates.try.need');
    if (exit < entry) return setAddSaid('rates.try.backwards');
    if (stays.length >= TABLE_MAX) return setAddSaid(null);
    setAddSaid(null);
    setAdded((was) => [...was, { entry, exit, why: { key: 'added' } }]);
    setExtra({ entry: '', exit: '' });
  };
  const changed = current ? changes(t, current, shown, language) : [];
  const findings = [...(priced?.draftFindings ?? []), ...saveFindings];

  return (
    <>
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={priced?.at} />
      <section className="panel" data-form="review-rates" aria-live="polite">
        <div className="lane-panel-head">
          <h2 className="section-title">{t('rates.review')}</h2>
          <button type="button" className="link-button no-print" data-action="back-to-form" onClick={onBack}>
            {t('rates.review.back')}
          </button>
        </div>
        <ol className="steps no-print" data-steps>
          {['rates.step.check', 'rates.step.tick', 'rates.step.confirm'].map((k, i) => (
            <li key={k} data-step={i + 1} aria-current={step === i + 1 ? 'step' : undefined} data-current={step === i + 1 ? 'yes' : 'no'} data-done={step > i + 1 ? 'yes' : 'no'}>
              <span className="step-n">{step > i + 1 ? '✓' : i + 1}</span> {t(k)}
            </li>
          ))}
        </ol>
        {problem === 'ratesChanged' ? <ProblemNote t={t} kind="ratesChanged" /> : null}
        <p data-notice="what-changes">{draft.what}</p>
        {changed.length ? (
          <>
            <p className="rate-sentences-title">
              <b>{t('rates.review.changes')}</b>
            </p>
            <div className="change-grid" data-changes>
              {changed.map((c) => (
                <div key={c.key} className="change-row" data-change={c.key}>
                  <span className="change-what">{c.name ? <bdi>{c.name}</bdi> : t(c.key)}</span>
                  <span className="change-was">{c.was}</span>
                  <span className="change-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="change-is">{c.is}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <Sentences t={t} language={language} plan={shown} kind="draft" title={t('rates.review.sentences')} />
      </section>

      <Calculator
        t={t}
        language={language}
        client={client}
        garage={garage}
        taxLists={taxLists}
        onCheckPage
        sources={[
          { value: 'new', text: t('rates.calc.new'), plan: shown, problem: null },
          { value: 'force', text: t('rates.calc.force'), plan: current, problem: current ? null : t('rates.calc.noRates') },
        ]}
      />

      <section className="panel" data-section="price-table">
        <h2 className="section-title">
          <SectionName t={t} name="rates.table" />
        </h2>
        {busy && !current_ ? (
          <p className="quiet" data-notice="table-pricing">
            {t('rates.table.busy')}
          </p>
        ) : null}
        {problem && problem !== 'ratesChanged' && !priced ? <ProblemNote t={t} kind={problem} onRetry={() => price().catch(() => {})} /> : null}
        {priced ? <PriceTable t={t} language={language} garage={garage} priced={priced} /> : null}
        {priced ? <ListActions t={t} list="priceTable" language={language} client={client} garage={garage} refresh={() => price()} print={print} /> : null}
        <div className="tax-line-fields calc-fields no-print" data-add-stay>
          <When t={t} kind="datetime-local" name="rates.try.entry" field="add-entry" id="add-entry" value={extra.entry} onChange={(v) => setExtra((x) => ({ ...x, entry: v }))} />
          <When t={t} kind="datetime-local" name="rates.try.exit" field="add-exit" id="add-exit" value={extra.exit} onChange={(v) => setExtra((x) => ({ ...x, exit: v }))} />
          <Act action="add-stay" className="secondary-button" disabled={stays.length >= TABLE_MAX} reason={t('rates.table.full', { count: TABLE_MAX })} onClick={addStay}>
            {t('rates.table.add')}
          </Act>
        </div>
        {addSaid ? (
          <p className="warning" data-notice="add-need">
            {t(addSaid)}
          </p>
        ) : null}
      </section>

      {findings.length ? (
        <section className="panel" data-section="findings">
          <p className="warning">{t('rates.findings')}</p>
          <ul>
            {findings.map((f, i) => (
              <li key={i} data-finding={f.code}>
                {findingWords(t, f, shown, garage.timezone, language)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel no-print" data-section="confirm">
        <p className="rates-note confirm-notice" data-notice="takes-effect">
          <b>{t('rates.review.noticeBold')}</b> {t('rates.review.noticeRest')}
        </p>
        <Tick t={t} tick="checked-prices" on={ticked} onChange={setTicked} words={t('rates.review.tick')} />
        <Act action="confirm-rates" disabled={!canConfirm} said={saving ? null : confirmSaid} onClick={confirm}>
          {saving ? t('rates.review.saving') : t('rates.review.confirm')}
        </Act>
        {problem && problem !== 'ratesChanged' && priced ? <ProblemNote t={t} kind={problem} /> : null}
      </section>
    </>
  );
}

/** The price table: one row per example stay, as the platform priced it. */
function PriceTable({ t, language, garage, priced, list = 'price-table' }) {
  const paging = usePaging(priced.rows.length);
  const money = (minor) => moneyText(minor, garage.currency, language);
  // Each time is already the garage's own clock.
  const when = (wall) => localSaid(wall, language);
  const note = fillNote(t, priced.plan, language);
  return (
    <div className="table-scroll">
      {note ? (
        <p className="quiet small" data-notice="fill-rule">
          {note}
        </p>
      ) : null}
      <table className="list price-table" data-list={list}>
        <thead>
          <tr>
            {['rates.table.cameIn', 'rates.table.left', 'rates.table.length', 'rates.table.rate', 'rates.table.tax', 'rates.table.pays', 'rates.table.special', 'rates.table.test'].map((k) => (
              <th key={k}>
                <FieldName t={t} name={k} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {priced.rows.map((row, i) => {
            const a = row.answer;
            const taxMinor = a && !a.refused ? (a.tax_lines ?? []).reduce((sum, l) => sum + l.delta_minor, 0) : null;
            return (
              <tr key={i} className={`${paging.row(i)}${row.why.key === 'added' ? ' added-row' : ''}`} data-row={i + 1} data-fee={a && !a.refused ? a.fee_minor : undefined} data-why={row.why.key} data-says={caseKey(row)} data-entry={row.entry} data-exit={row.exit}>
                <td>{when(row.entry)}</td>
                <td>{when(row.exit)}</td>
                <td>{lengthWords(t, a?.minutes ?? 0)}</td>
                <td className="money">{a && !a.refused ? money(a.subtotal_minor) : t('rates.table.noPrice')}</td>
                <td className="money">{a && !a.refused ? (a.taxes_stated === false ? t('rates.table.noTax') : money(taxMinor)) : '–'}</td>
                <td className="money">
                  <b>{a && !a.refused ? money(a.fee_minor) : t('rates.table.noPrice')}</b>
                </td>
                <td>{a ? (a.refused ? (a.findings ?? []).map((f) => findingWords(t, f, priced.plan, garage.timezone, language)).join(' ') : specialWords(t, { ...a, entry: row.entry, exit: row.exit }, priced.plan, language)) : ''}</td>
                <td>
                  <bdi>{caseWords(t, row)}</bdi>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager t={t} language={language} paging={paging} list={list} />
    </div>
  );
}

