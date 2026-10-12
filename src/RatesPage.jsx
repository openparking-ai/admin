import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pager, PrintHead, ProblemNote, Segmented, useGarageRead, useNow, usePaging, usePrint } from './parts.jsx';
import { STALE } from './api.js';
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
  PERIOD_ROUNDINGS,
  PRESETS,
  PRESET_KEYS,
  TABLE_MAX,
  WEEK_KINDS,
  arrange,
  baseAt,
  carryForward,
  caseKey,
  caseWords,
  clockWords,
  currencySign,
  dateWords,
  dayName,
  daysWords,
  findingWords,
  firstStartDay,
  formFromPlan,
  formStart,
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
  plansAfter,
  regularPlan,
  regularProblems,
  sameRates,
  specialForm,
  specialName,
  specialProblems,
  specialWords,
  specialsPlan,
  startProblems,
  tableStays,
  typedRegular,
  typedSpecial,
} from './rates.js';

/**
 * A garage's rates: the ones in force now, the ones that start later and the
 * ones before, each with when it starts in the garage's own time, who saved and
 * confirmed it, and each in plain sentences. Below them the two parts the owner
 * changes, each with its own Save (U7i, from the owner's walk, 2026-10-12): the regular rates,
 * and the special rates one by one. Every field starts empty, with the value in
 * force beside it; a field left empty keeps it. A Save opens the check page,
 * which prices a table of example stays by itself, through the platform, for
 * the rates as they will be after the save -- the other part as it is -- and
 * saves them only once the owner has checked the prices and confirmed. Apart
 * from both, a price calculator prices a stay by the rates in force or by the
 * ones being changed, and saves nothing. Nothing is changed in place: the only
 * write is new rates (POST rate-plans), and the old ones stay on record. The
 * platform and its rate engine price every stay shown here.
 */
export default function RatesPage({ t, language, client, garage }) {
  const ticking = useNow();
  const read = useGarageRead(useCallback((id) => client.ratePlans(id), [client]), garage.id);
  const taxNames = useTaxNames(t, client, garage);
  const savers = useSavers(client, garage, read.data?.saved);
  const { printedAt, print } = usePrint();
  const [regular, setRegular] = useState(null);
  const [special, setSpecial] = useState(null);
  const [touched, setTouched] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const reread = useCallback(() => {
    read.refresh().then(savers.refresh, () => read.retry());
  }, [read, savers.refresh]);

  if (read.problem) return <ProblemNote t={t} kind={read.problem} onRetry={read.retry} />;
  if (!read.data) return <p className="quiet">{t('loading')}</p>;
  // Which plan is in force is judged at the later of the clock and the read:
  // rates saved "now" are in force the moment the page reads them back.
  const now = new Date(Math.max(ticking.getTime(), read.readAt?.getTime() ?? 0));
  const { plans, replaced, spaceClass, saved } = read.data;
  const { current, later, earlier } = arrange(plans, now);
  const at = (iso) => garageDateTime(iso, garage.timezone, language);
  const zone = zoneSaid(garage.timezone, language, now);
  const opts = (start, name) => ({ garage, spaceClass, start, name });
  // U7i fix 1: every save is built on the rates as they will be when it starts
  // (`baseAt`) -- in force now plus any scheduled -- and carried into each later
  // version that kept the part it changes (`carryForward`).
  const idOf = (plan) => saved.find((r) => r.plan_version === plan.plan_version)?.id ?? null;
  const nowStart = formStart({ starts: 'now' }, garage, now.getTime());
  const startOf = (typed) => (typed.starts === 'day' && startProblems(typed, garage, ticking.getTime()).day === undefined ? formStart(typed, garage) : typed.starts === 'at' ? typed.at : nowStart);
  const saveOf = (section, build) => (start, name) => {
    const plan = build(baseAt(plans, start), start, name);
    return { plan, ...carryForward(plans, plan, section) };
  };

  // The regular rates: built on the rates in force at the start chosen.
  const regularTyped = regular ?? typedRegular(formFromPlan(baseAt(plans, nowStart), garage.currency));
  const regularBase = baseAt(plans, startOf(regularTyped));
  const regularNow = formFromPlan(regularBase, garage.currency);
  const regularDraft = {
    what: { kind: 'regular' },
    section: 'regular',
    starts: regularTyped,
    problems: { ...regularProblems(mergeRegular(regularTyped, regularNow), garage), ...startProblems(regularTyped, garage, ticking.getTime()) },
    save: saveOf('regular', (base, start, name) => regularPlan(base, regularTyped, formFromPlan(base, garage.currency), opts(start, name))),
  };

  // The special rates as they will be: those in force, then each one a later
  // version brings, listed with when it starts.
  const listed = specialsListed(current, later);
  const editingEntry = special && special.kind !== 'add' ? listed[special.index] : null;
  const specialNow = editingEntry ? specialForm(editingEntry.rule, garage.currency) : null;
  const specialMerged = special && (special.kind === 'add' || special.kind === 'change') ? mergeSpecial(special.typed, specialNow) : null;
  const specialBase = special ? baseAt(plans, startOf(special.typed)) : null;
  // The special being changed, in the rates it is built on (by its id: the order can differ there).
  const inBase = editingEntry && specialBase ? orderedWindows(specialBase).findIndex((r) => r.id === editingEntry.rule.id) : -1;
  const specialDraft = special
    ? {
        what: { kind: special.kind, name: specialMerged ? specialMerged.name.trim() : specialName(t, editingEntry.rule, special.index), by: special.by },
        section: 'specials',
        starts: special.typed,
        problems: {
          ...(specialMerged ? specialProblems(specialMerged, 'special', garage) : {}),
          ...startProblems(special.typed, garage, ticking.getTime()),
          ...(editingEntry && specialBase && inBase < 0 && !startProblems(special.typed, garage, ticking.getTime()).day ? { day: 'rates.need.specialNotThen' } : {}),
        },
        save: saveOf('specials', (base, start, name) => {
          const index = editingEntry ? orderedWindows(base).findIndex((r) => r.id === editingEntry.rule.id) : null;
          return specialsPlan(base, { kind: special.kind, index, by: special.by, special: specialMerged }, opts(start, name));
        }),
      }
    : null;
  const ready = (draft) => draft && Object.keys(draft.problems).length === 0;
  // The calculator's "rates I am changing": the part changed last, as its Save would make it.
  const changing = touched === 'special' ? specialDraft : touched === 'regular' ? regularDraft : null;

  const done = () => {
    setRegular(null);
    setSpecial(null);
    setTouched(null);
    setReviewing(null);
    reread();
  };

  if (reviewing) {
    const draft = reviewing === 'regular' ? regularDraft : specialDraft;
    return (
      <Review
        t={t}
        language={language}
        client={client}
        garage={garage}
        draft={draft}
        plans={plans}
        idOf={idOf}
        taxNames={taxNames}
        onBack={() => setReviewing(null)}
        onSaved={done}
      />
    );
  }

  return (
    <>
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={read.readAt} />
      <section className="panel" data-section="in-force">
        <h2 className="section-title">{t('rates.inForce')}</h2>
        <p className="rates-state" data-state={current ? 'current' : later.length ? 'later' : 'none'}>
          {current ? t('rates.since', { time: at(current.effective_from) }) : later.length ? t('rates.notYet', { time: at(later[0].effective_from) }) : t('rates.none')}
        </p>
        {zone ? <p className="quiet">{t('rates.zone', { zone })}</p> : null}
        {current ? (
          <>
            <SavedBy t={t} language={language} garage={garage} savers={savers} plan={current} />
            <Sentences t={t} language={language} plan={current} kind="current" />
          </>
        ) : null}
        {plans.length ? <ListActions t={t} list="rates" language={language} client={client} garage={garage} refresh={read.refresh} print={print} /> : null}
      </section>

      <RegularSection
        t={t}
        language={language}
        garage={garage}
        now={regularBase ? regularNow : null}
        basedOn={regularBase && regularBase !== current ? at(regularBase.effective_from) : null}
        typed={regularTyped}
        problems={regularDraft.problems}
        onChange={(next) => {
          setRegular(next);
          setTouched('regular');
        }}
        onSave={() => setReviewing('regular')}
        ticking={ticking}
      />

      <SpecialSection
        t={t}
        language={language}
        garage={garage}
        canAdd={plans.length > 0}
        listed={listed}
        at={at}
        editing={special}
        now={specialNow}
        draft={specialDraft}
        onEdit={(next) => {
          setSpecial(next);
          setTouched(next ? 'special' : regular ? 'regular' : null);
        }}
        onSave={() => setReviewing('special')}
        ticking={ticking}
      />

      <Calculator
        t={t}
        language={language}
        client={client}
        garage={garage}
        stored={plans}
        idOf={idOf}
        draft={changing && ready(changing) ? changing : null}
        changingWhat={changing?.what ?? null}
        taxNames={taxNames}
      />

      {later.length ? (
        <section className="panel" data-section="later">
          <h2 className="section-title">{t('rates.later')}</h2>
          {later.map((plan) => (
            <div key={plan.plan_version} className="rate-plan" data-plan="later" data-starts={plan.effective_from}>
              <p className="tax-when">{t('rates.startsAt', { time: at(plan.effective_from) })}</p>
              <SavedBy t={t} language={language} garage={garage} savers={savers} plan={plan} />
              <Sentences t={t} language={language} plan={plan} kind="later" />
            </div>
          ))}
        </section>
      ) : null}

      {earlier.length || replaced.length ? (
        <section className="panel" data-section="earlier">
          <h2 className="section-title">{t('rates.earlier')}</h2>
          {earlier.map((plan) => (
            <div key={plan.plan_version} className="rate-plan" data-plan="earlier" data-starts={plan.effective_from}>
              <p className="tax-when">{t('rates.fromTo', { from: at(plan.effective_from), to: at(plan.until) })}</p>
              <SavedBy t={t} language={language} garage={garage} savers={savers} plan={plan} />
              <Sentences t={t} language={language} plan={plan} kind="earlier" />
            </div>
          ))}
          {replaced.map(({ plan }) => (
            <div key={plan.plan_version} className="rate-plan" data-plan="replaced" data-starts={plan.effective_from}>
              <p className="tax-when">{t('rates.review.carriedAt', { time: at(plan.effective_from) })}</p>
              <ReplacedBy t={t} language={language} garage={garage} savers={savers} plan={plan} />
              <SavedBy t={t} language={language} garage={garage} savers={savers} plan={plan} />
              <Sentences t={t} language={language} plan={plan} kind="replaced" />
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

/**
 * The special rates as they will be (U7i fix 1): each in force now, then each
 * one a later version brings that is not in force, with the version it starts
 * with (`from`, null for one in force). `{ rule, from, plan }` -- `plan` the
 * rates it is in -- in the order listed.
 */
function specialsListed(current, later) {
  const listed = orderedWindows(current).map((rule) => ({ rule, from: null, plan: current }));
  for (const plan of later) {
    for (const rule of orderedWindows(plan)) if (!listed.some((e) => e.rule.id === rule.id)) listed.push({ rule, from: plan, plan });
  }
  return listed;
}

/** The names of the garage's taxes, by their line's id, for the words of a priced stay. */
function useTaxNames(t, client, garage) {
  const taxes = useGarageRead(useCallback((id) => client.taxLists(id), [client]), garage.id);
  return useMemo(() => {
    const names = {};
    for (const list of taxes.data ?? []) for (const rule of list.rules ?? []) names[rule.id] = rule.label;
    return names;
  }, [taxes.data]);
}

/** The most pages of the change log read to find who saved each set of rates. */
const SAVER_PAGES = 40;

/**
 * Who saved each set of rates, and when (U7i, item 11): from the line every
 * save writes to the garage's change log (`rate_plan.add`), matched by the
 * stored rates' own id -- the line's subject. Read newest first, page by page,
 * until every set of rates is found. `saved` is the platform's `[{ id,
 * plan_version }]`. By plan version: `{ name, kind, at, confirmed }`, or absent.
 */
function useSavers(client, garage, saved) {
  // `for`: the sets of rates the lookup was made for; until it is the current ones, nothing is said.
  const [state, setState] = useState({ by: {}, gone: {}, for: null });
  const [attempt, setAttempt] = useState(0);
  const wanted = useMemo(() => (saved ?? []).map((s) => `${s.id}:${s.plan_version}`).join(), [saved]);
  useEffect(() => {
    if (!saved) return undefined;
    let live = true;
    (async () => {
      const ids = new Map(saved.map((s) => [s.id, s.plan_version]));
      const by = {};
      const gone = {};
      let after = null;
      for (let page = 0; page < SAVER_PAGES && Object.keys(by).length < ids.size; page += 1) {
        const out = await client.changes(garage.id, after);
        for (const line of out.changes) {
          if (line.subject?.kind !== 'rate_plan' || !ids.has(line.subject.id)) continue;
          const version = ids.get(line.subject.id);
          // U7i fix 1: who replaced a set of rates before it started, from its own line.
          if (line.action === 'rate_plan.withdraw' && !gone[version]) gone[version] = { name: line.who?.name ?? null, kind: line.who?.kind ?? null, at: line.at };
          if (line.action === 'rate_plan.add' && !by[version]) by[version] = { name: line.who?.name ?? null, kind: line.who?.kind ?? null, at: line.at, confirmed: line.after?.confirmed === true };
        }
        if (!out.next) break;
        after = out.next;
      }
      if (live) setState({ by, gone, for: wanted });
    })().catch(() => live && setState({ by: {}, gone: {}, for: wanted }));
    return () => {
      live = false;
    };
    // `wanted` stands for `saved`: the same sets of rates are not looked up again.
  }, [client, garage.id, wanted, attempt]);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { by: state.by, gone: state.gone, read: state.for === wanted, refresh };
}

/** "Replaced before it started, by Pat on Oct 12, 2026, 2:10 PM", from its `rate_plan.withdraw` line (U7i fix 1). */
function ReplacedBy({ t, language, garage, savers, plan }) {
  const s = savers.gone[plan.plan_version];
  if (!s && !savers.read) return null;
  if (!s) {
    return (
      <p className="quiet replaced-by" data-replaced-by="unknown" data-plan-version={plan.plan_version}>
        {t('rates.replaced.unknown')}
      </p>
    );
  }
  const when = garageDateTime(s.at, garage.timezone, language);
  if (!s.name) {
    return (
      <p className="quiet replaced-by" data-replaced-by="" data-replaced-at={s.at} data-plan-version={plan.plan_version}>
        {t('rates.replaced.unnamed', { when })}
      </p>
    );
  }
  const [before, after] = t(s.kind === 'key' ? 'rates.replaced.byKey' : 'rates.replaced.by', { name: '\u0000', when }).split('\u0000');
  return (
    <p className="quiet replaced-by" data-replaced-by={s.name} data-replaced-at={s.at} data-plan-version={plan.plan_version}>
      {before}
      <bdi className="saved-name">{s.name}</bdi>
      {after}
    </p>
  );
}

/** "Saved and confirmed by Pat on Oct 12, 2026, 2:10 PM", from the change log. */
function SavedBy({ t, language, garage, savers, plan }) {
  const s = savers.by[plan.plan_version];
  // Not found is said only once the lookup is for these very rates: a save just made is looked up first.
  if (!s && !savers.read) return null;
  if (!s) {
    return (
      <p className="quiet saved-by" data-saved-by="unknown" data-plan-version={plan.plan_version}>
        {t('rates.savedBy.unknown')}
      </p>
    );
  }
  const when = garageDateTime(s.at, garage.timezone, language);
  const key = s.kind === 'key' ? (s.confirmed ? 'rates.savedBy.keyConfirmed' : 'rates.savedBy.key') : s.confirmed ? 'rates.savedBy.confirmed' : 'rates.savedBy.saved';
  const [before, after] = t(key, { name: '\u0000', when }).split('\u0000');
  return (
    <p className="quiet saved-by" data-saved-by={s.name ?? ''} data-saved-at={s.at} data-plan-version={plan.plan_version}>
      {s.name ? (
        <>
          {before}
          <bdi className="saved-name">{s.name}</bdi>
          {after}
        </>
      ) : (
        t(s.confirmed ? 'rates.savedBy.unnamedConfirmed' : 'rates.savedBy.unnamed', { when })
      )}
    </p>
  );
}

/** One plan, in plain sentences: a special's name kept apart from the words. */
function Sentences({ t, language, plan, kind }) {
  return (
    <div className="rate-sentences" data-sentences={kind}>
      <FieldName t={t} name="rates.charges" />
      <ul>
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
function Wrong({ t, problem, id }) {
  if (!problem) return null;
  return (
    <span className="field-wrong" id={`${id}-wrong`} data-wrong-for={id}>
      {t(problem)}
    </span>
  );
}

/** "Now: $15.00": the value in force, beside a field that starts empty. */
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
function Text({ t, language, garage, name, field, id, value, onChange, unit = null, now, problem, inputMode = 'decimal', maxLength = 10 }) {
  const sign = unit === 'money' ? currencySign(garage.currency, language) : null;
  const after = unit === 'minutes' ? t('rates.unit.minutes') : unit === 'percent' ? '%' : null;
  return (
    <label className="field" data-wrong={problem ? 'yes' : 'no'}>
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
      <Wrong t={t} problem={problem} id={id} />
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
function When({ t, kind, field, id, value, onChange, min, problem, name, now = null, bare = false }) {
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
          <input type={kind} id={id} data-field={field} aria-label={t(name)} min={min} value={value} onChange={(e) => onChange(e.target.value)} />
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
        <input type={kind} id={id} data-field={field} min={min} value={value} onChange={(e) => onChange(e.target.value)} {...invalid(problem, id)} />
        {prompt}
      </span>
      <NowWas t={t} text={now} />
      <Wrong t={t} problem={problem} id={id} />
    </label>
  );
}

/**
 * A tick with its words beside it: on or off, as every tick on these screens is
 * drawn (a button, so a print can say it in words), as wide as its words. A
 * locked one is greyed, with the reason it is locked beside it (U7i, items 12
 * and 13) -- never a wait cursor.
 */
function Tick({ t, on, onChange, words, tick, disabled = false, reason = null, id }) {
  return (
    <span className="tick-row">
      <button type="button" id={id} role="checkbox" aria-checked={on} className="tick tick-words" data-tick={tick} disabled={disabled} onClick={() => onChange(!on)}>
        <span aria-hidden="true" className="tick-box" data-on={on ? 'yes' : 'no'} />
        <span aria-hidden="true" className="print-word" data-print={on ? 'yes' : 'no'}>
          {on ? t('yes') : t('no')}
        </span>
        <span>{words}</span>
      </button>
      {disabled && reason ? (
        <span className="locked-reason" data-reason-for={tick}>
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/** A button that may be locked, with the next step beside it when it is. */
function Act({ action, onClick, disabled, reason, className = 'primary-button', children, type = 'button' }) {
  return (
    <span className="act-row">
      <button type={type} className={className} data-action={action} disabled={disabled} onClick={onClick}>
        {children}
      </button>
      {disabled && reason ? (
        <span className="locked-reason" data-reason-for={action}>
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/**
 * What is still missing or wrong, by the Save it stops (U7i, item 4): each
 * field by name, a link that moves to it. `items` are `{ at, label, problem }`.
 */
function Missing({ t, scope, items }) {
  if (!items.length) return null;
  return (
    <div className="warning missing" data-notice="form-not-ready" role="alert">
      <p>{t('rates.formNotReady')}</p>
      <ul>
        {items.map((item) => (
          <li key={item.at}>
            <button type="button" className="link-button" data-goes-to={fieldId(scope, item.at)} onClick={() => goTo(fieldId(scope, item.at))}>
              {item.label}
            </button>
            {': '}
            {t(item.problem)}
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

/** The names the summary calls each field by. */
const FIELD_NAMES = {
  'time.firstMinutes': 'rates.time.firstMinutes',
  'time.firstPrice': 'rates.time.firstPrice',
  'time.nextMinutes': 'rates.time.nextMinutes',
  'time.nextPrice': 'rates.time.nextPrice',
  'time.rounding': 'rates.time.rounding',
  'dayMax.price': 'rates.dayMax.price',
  'dayMax.kind': 'rates.dayMax.kind',
  'weekMax.price': 'rates.weekMax.price',
  'weekMax.kind': 'rates.weekMax.kind',
  'weekMax.startsOn': 'rates.weekMax.startsOn',
  'grace.minutes': 'rates.grace.minutes',
  day: 'rates.day',
  'special.name': 'rates.special.name',
  'special.preset': 'rates.special.choice',
  'special.days': 'rates.special.days',
  'special.dates': 'rates.special.dates',
  'special.enterFrom': 'rates.special.enterFrom',
  'special.enterBy': 'rates.special.enterBy',
  'special.leaveBy': 'rates.special.leaveBy',
  'special.nextDay': 'rates.special.nextDay',
  'special.charge': 'rates.special.charge',
  'special.flat': 'rates.special.flat',
  'special.direction': 'rates.special.direction',
  'special.amountKind': 'rates.special.amountKind',
  'special.amount': 'rates.special.amount',
  'special.cent': 'rates.special.cent',
};

/** The summary's items, in the order the fields are on the page. */
function missingItems(t, problems, order) {
  return order
    .filter((at) => problems[at])
    .map((at) => {
      const rate = /^special\.rate\.(.+)$/.exec(at);
      const label = rate ? `${t('rates.chargeKind.rate')}: ${t(FIELD_NAMES[`time.${rate[1]}`])}` : t(FIELD_NAMES[at]);
      return { at, label, problem: problems[at] };
    });
}

const RATE_FIELDS = ['firstMinutes', 'firstPrice', 'nextMinutes', 'nextPrice', 'rounding'];
const REGULAR_ORDER = [...RATE_FIELDS.map((f) => `time.${f}`), 'dayMax.price', 'dayMax.kind', 'weekMax.price', 'weekMax.kind', 'weekMax.startsOn', 'grace.minutes', 'day'];
const SPECIAL_ORDER = [
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
  'day',
];

/**
 * A Save that, pressed with something missing, marks each field, lists them
 * by name beside it, and moves to the first (U7i, item 4).
 */
function useSaveTried(scope, problems, order) {
  const [tried, setTried] = useState(false);
  const [goFirst, setGoFirst] = useState(0);
  useEffect(() => {
    if (!goFirst) return;
    const first = order.find((at) => problems[at]);
    if (first) goTo(fieldId(scope, first));
    // Only when Save is pressed, not as the owner types.
  }, [goFirst]);
  const press = (onReady) => {
    setTried(true);
    if (Object.keys(problems).length === 0) onReady();
    else setGoFirst((n) => n + 1);
  };
  return { tried, press, reset: () => setTried(false) };
}

/** The money a form field holds, as the "Now:" beside it says it. */
const nowMoney = (typed, garage, language) => {
  const p = parseMoney(typed, garage.currency, { zeroOk: true });
  return p.minor === undefined ? null : moneyText(p.minor, garage.currency, language);
};
const nowMinutes = (t, typed) => (/^\d+$/.test(String(typed ?? '')) ? `${typed} ${t('rates.unit.minutes')}` : null);
const nowOnOff = (t, on) => t(on ? 'rates.now.on' : 'rates.now.off');

/** The fields of a time-based rate: first period and its price, each period after and its price, a started period. */
function RateFields({ t, language, garage, rate, now, onChange, prefix, scope, problems, tried }) {
  const set = (field) => (value) => onChange({ ...rate, [field]: value });
  const p = (f) => (tried ? problems[`${prefix}.${f}`] : null);
  const id = (f) => fieldId(scope, `${prefix}.${f}`);
  const df = prefix === 'time' ? 'time' : 'special-rate';
  return (
    <div className="rate-fields" data-rate-fields={prefix}>
      <div className="tax-line-fields">
        <Text t={t} language={language} garage={garage} name="rates.time.firstMinutes" field={`${df}-first-minutes`} id={id('firstMinutes')} value={rate.firstMinutes} onChange={set('firstMinutes')} unit="minutes" now={now && nowMinutes(t, now.firstMinutes)} problem={p('firstMinutes')} inputMode="numeric" maxLength={5} />
        <Text t={t} language={language} garage={garage} name="rates.time.firstPrice" field={`${df}-first-price`} id={id('firstPrice')} value={rate.firstPrice} onChange={set('firstPrice')} unit="money" now={now && nowMoney(now.firstPrice, garage, language)} problem={p('firstPrice')} />
        <Text t={t} language={language} garage={garage} name="rates.time.nextMinutes" field={`${df}-next-minutes`} id={id('nextMinutes')} value={rate.nextMinutes} onChange={set('nextMinutes')} unit="minutes" now={now && nowMinutes(t, now.nextMinutes)} problem={p('nextMinutes')} inputMode="numeric" maxLength={5} />
        <Text t={t} language={language} garage={garage} name="rates.time.nextPrice" field={`${df}-next-price`} id={id('nextPrice')} value={rate.nextPrice} onChange={set('nextPrice')} unit="money" now={now && nowMoney(now.nextPrice, garage, language)} problem={p('nextPrice')} />
        <Choice t={t} name="rates.time.rounding" field={`${df}-rounding`} id={id('rounding')} value={rate.rounding} options={PERIOD_ROUNDINGS.map((r) => ({ value: r, text: t(`rates.round.${r}`) }))} onChange={set('rounding')} now={now?.rounding ? t(`rates.round.${now.rounding}`) : null} problem={p('rounding')} />
      </div>
    </div>
  );
}

/** When new rates start: now, or from the start of a day after today. */
function Starts({ t, garage, typed, onChange, problem, scope, ticking }) {
  const id = fieldId(scope, 'day');
  return (
    <>
      <div className="chooser" data-chooser="starts">
        <FieldName t={t} name="rates.starts" />
        <Segmented
          label={t('rates.starts')}
          value={typed.starts}
          options={[
            { value: 'now', text: t('rates.starts.now') },
            { value: 'day', text: t('rates.starts.day') },
          ]}
          onChange={(v) => onChange({ starts: v })}
          name="starts"
        />
      </div>
      {typed.starts === 'day' ? (
        <When t={t} kind="date" name="rates.day" field="rates-day" id={id} min={firstStartDay(garage, ticking.getTime())} value={typed.day} onChange={(v) => onChange({ day: v })} problem={problem} />
      ) : null}
    </>
  );
}

// --- the regular rates --------------------------------------------------------

/**
 * The regular rates: the time-based rate, at most per day and per week, and
 * a free grace period, with their own Save. `now` is the form of the rates in
 * force, or null when there are none (then every field is needed).
 */
function RegularSection({ t, language, garage, now, basedOn = null, typed, problems, onChange, onSave, ticking }) {
  const save = useSaveTried('regular', problems, REGULAR_ORDER);
  const p = (at) => (save.tried ? problems[at] : null);
  const id = (at) => fieldId('regular', at);
  const set = (part) => (value) => onChange({ ...typed, [part]: value });
  const part = (name) => (change) => onChange({ ...typed, [name]: { ...typed[name], ...change } });
  // The value in force of a part ticked on now, else none to show.
  const was = (name) => (now && now[name].on ? now[name] : null);
  return (
    <section className="panel no-print" data-section="regular" aria-live="polite">
      <h2 className="section-title">
        <FieldName t={t} name="rates.regular" />
      </h2>
      <p className="quiet">{now ? t('rates.regular.keep') : t('rates.regular.first')}</p>
      {basedOn ? (
        <p className="quiet" data-notice="based-on">
          {t('rates.basedOn', { time: basedOn })}
        </p>
      ) : null}
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
            <FieldName t={t} name="rates.dayMax" />
          </legend>
          <Tick t={t} tick="day-max-on" on={typed.dayMax.on} onChange={(on) => part('dayMax')({ on })} words={t('rates.dayMax.use')} />
          {now ? <NowWas t={t} text={nowOnOff(t, now.dayMax.on)} /> : null}
          {typed.dayMax.on ? (
            <div className="tax-line-fields">
              <Text t={t} language={language} garage={garage} name="rates.dayMax.price" field="day-max-price" id={id('dayMax.price')} value={typed.dayMax.price} onChange={(v) => part('dayMax')({ price: v })} unit="money" now={was('dayMax') && nowMoney(was('dayMax').price, garage, language)} problem={p('dayMax.price')} />
              <Choice t={t} name="rates.dayMax.kind" field="day-max-kind" id={id('dayMax.kind')} value={typed.dayMax.kind} options={DAY_KINDS.map((k) => ({ value: k, text: t(`rates.dayKind.${k}`) }))} onChange={(v) => part('dayMax')({ kind: v })} now={was('dayMax') && t(`rates.dayKind.${was('dayMax').kind}`)} problem={p('dayMax.kind')} />
            </div>
          ) : null}
        </fieldset>

        <fieldset className="rates-part" data-part="week-max">
          <legend>
            <FieldName t={t} name="rates.weekMax" />
          </legend>
          <Tick t={t} tick="week-max-on" on={typed.weekMax.on} onChange={(on) => part('weekMax')({ on })} words={t('rates.weekMax.use')} />
          {now ? <NowWas t={t} text={nowOnOff(t, now.weekMax.on)} /> : null}
          {typed.weekMax.on ? (
            <div className="tax-line-fields">
              <Text t={t} language={language} garage={garage} name="rates.weekMax.price" field="week-max-price" id={id('weekMax.price')} value={typed.weekMax.price} onChange={(v) => part('weekMax')({ price: v })} unit="money" now={was('weekMax') && nowMoney(was('weekMax').price, garage, language)} problem={p('weekMax.price')} />
              <Choice t={t} name="rates.weekMax.kind" field="week-max-kind" id={id('weekMax.kind')} value={typed.weekMax.kind} options={WEEK_KINDS.map((k) => ({ value: k, text: t(`rates.weekKind.${k}`) }))} onChange={(v) => part('weekMax')({ kind: v })} now={was('weekMax') && t(`rates.weekKind.${was('weekMax').kind}`)} problem={p('weekMax.kind')} />
              {(typed.weekMax.kind || was('weekMax')?.kind) === 'calendar_week' ? (
                <Choice t={t} name="rates.weekMax.startsOn" field="week-max-starts" id={id('weekMax.startsOn')} value={typed.weekMax.startsOn} options={DAYS.map((d) => ({ value: d, text: dayName(d, language) }))} onChange={(v) => part('weekMax')({ startsOn: v })} now={was('weekMax')?.startsOn ? dayName(was('weekMax').startsOn, language) : null} problem={p('weekMax.startsOn')} />
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="rates-part" data-part="grace">
          <legend>
            <FieldName t={t} name="rates.grace" />
          </legend>
          <Tick t={t} tick="grace-on" on={typed.grace.on} onChange={(on) => part('grace')({ on })} words={t('rates.grace.use')} />
          {now ? <NowWas t={t} text={nowOnOff(t, now.grace.on)} /> : null}
          {typed.grace.on ? (
            <div className="tax-line-fields">
              <Text t={t} language={language} garage={garage} name="rates.grace.minutes" field="grace-minutes" id={id('grace.minutes')} value={typed.grace.minutes} onChange={(v) => part('grace')({ minutes: v })} unit="minutes" now={was('grace') && nowMinutes(t, was('grace').minutes)} problem={p('grace.minutes')} inputMode="numeric" maxLength={5} />
            </div>
          ) : null}
        </fieldset>

        <Starts t={t} garage={garage} typed={typed} onChange={(change) => onChange({ ...typed, ...change })} problem={p('day')} scope="regular" ticking={ticking} />
        <p className="warning" data-notice="new-rates">
          {t('rates.newRates')}
        </p>
        {save.tried ? <Missing t={t} scope="regular" items={missingItems(t, problems, REGULAR_ORDER)} /> : null}
        <button type="submit" className="primary-button" data-action="save-regular">
          {t('rates.saveRegular')}
        </button>
      </form>
    </section>
  );
}

// --- the special rates --------------------------------------------------------

/**
 * The special rates as they will be, each with Change and Remove, and Add a
 * special rate; one is added, changed, removed or moved at a time, with its own
 * Save. One a later version brings is listed with when it starts (U7i fix 1),
 * and a change to it starts with it. The order of two or more discounts or
 * increases in force is the order listed.
 */
function SpecialSection({ t, language, garage, canAdd, listed, at, editing, now, draft, onEdit, onSave, ticking }) {
  const inForce = listed.filter((e) => e.from === null).map((e) => e.rule);
  const adjusts = inForce.filter((r) => r.stage === 'ADJUST');
  const open = (kind, index = null, by = 0) => {
    const entry = index === null ? null : listed[index];
    const typed = typedSpecial(kind === 'change' ? specialForm(entry.rule, garage.currency) : null);
    // A special a later version brings: saved to start exactly when that version does.
    onEdit({ kind, index, by, typed: entry?.from ? { ...typed, starts: 'at', at: entry.from.effective_from } : typed });
  };
  return (
    <section className="panel no-print" data-section="specials" aria-live="polite">
      <h2 className="section-title">
        <FieldName t={t} name="rates.specials" />
      </h2>
      {listed.length ? <p className="quiet">{t('rates.specials.cheaper')}</p> : <p className="quiet">{t('rates.specials.none')}</p>}
      {adjusts.length > 1 ? (
        <p className="quiet" data-notice="adjust-order">
          {t('rates.adjust.orderNote')}
        </p>
      ) : null}
      {listed.length ? (
        <ol className="tax-lines special-list">
          {listed.map(({ rule, from, plan }, i) => {
            // In words with the rates it is in: their money, their clock.
            const sentence = planSentences(t, { ...plan, rules: [rule], adjust_order: null }, language).find((s) => s.key === rule.id);
            const ai = from ? -1 : adjusts.indexOf(rule);
            const here = editing && editing.kind !== 'add' && editing.index === i;
            return (
              <li key={rule.id} className="tax-line special-in-force" data-special-in-force={i + 1} data-special-starts={from ? from.effective_from : 'now'} data-editing={here ? 'yes' : 'no'}>
                <p className="tax-line-name">
                  <bdi className="special-name">{specialName(t, rule, i)}</bdi>
                </p>
                <p>{sentence?.text}</p>
                {from ? (
                  <p className="quiet" data-notice="special-starts-later">
                    {t('rates.special.startsLater', { time: at(from.effective_from) })}
                  </p>
                ) : null}
                {editing ? null : (
                  <div className="lane-actions">
                    <button type="button" className="link-button" data-action="change-special" onClick={() => open('change', i)}>
                      {t('rates.special.change')}
                    </button>
                    <button type="button" className="link-button" data-action="remove-special" onClick={() => open('remove', i)}>
                      {t('rates.special.remove')}
                    </button>
                    {ai > 0 ? (
                      <button type="button" className="link-button" data-action="move-up" onClick={() => open('move', i, inForce.indexOf(adjusts[ai - 1]) - i)}>
                        {t('rates.moveUp')}
                      </button>
                    ) : null}
                    {ai >= 0 && ai < adjusts.length - 1 ? (
                      <button type="button" className="link-button" data-action="move-down" onClick={() => open('move', i, inForce.indexOf(adjusts[ai + 1]) - i)}>
                        {t('rates.moveDown')}
                      </button>
                    ) : null}
                  </div>
                )}
                {here ? <SpecialEditor t={t} language={language} garage={garage} editing={editing} now={now} draft={draft} listed={listed} at={at} onEdit={onEdit} onSave={onSave} ticking={ticking} /> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {editing?.kind === 'add' ? (
        <div className="tax-line special" data-special-new>
          <SpecialEditor t={t} language={language} garage={garage} editing={editing} now={null} draft={draft} listed={listed} at={at} onEdit={onEdit} onSave={onSave} ticking={ticking} />
        </div>
      ) : null}
      {editing ? null : (
        <Act action="add-special" className="link-button" disabled={!canAdd} reason={t('rates.specials.regularFirst')} onClick={() => open('add')}>
          {t('rates.addSpecial')}
        </Act>
      )}
    </section>
  );
}

/** One special being added, changed, removed or moved: its fields (for an add or a change), when it starts, and its Save. */
function SpecialEditor({ t, language, garage, editing, now, draft, listed, at, onEdit, onSave, ticking }) {
  const save = useSaveTried('special', draft.problems, SPECIAL_ORDER);
  const typed = editing.typed;
  const change = (c) => onEdit({ ...editing, typed: { ...typed, ...c } });
  const fields = editing.kind === 'add' || editing.kind === 'change';
  const name = draft.what.name;
  const heading =
    editing.kind === 'add'
      ? t('rates.special.adding')
      : editing.kind === 'change'
        ? t('rates.special.changing', { name })
        : editing.kind === 'remove'
          ? t('rates.special.removing', { name })
          : t('rates.special.moving', { name, other: specialName(t, listed[editing.index + editing.by].rule, editing.index + editing.by) });
  return (
    <form
      className="setup-form special-editor"
      noValidate
      data-editing={editing.kind}
      onSubmit={(e) => {
        e.preventDefault();
        save.press(onSave);
      }}
    >
      <p className="setup-step-name" data-editing-says>
        {heading}
      </p>
      {fields ? <SpecialFields t={t} language={language} garage={garage} typed={typed} now={now} problems={draft.problems} tried={save.tried} onChange={change} /> : null}
      {typed.starts === 'at' ? (
        <p className="quiet" data-notice="special-starts-with" id={fieldId('special', 'day')}>
          {t('rates.special.startsWith', { time: at(typed.at) })}
        </p>
      ) : (
        <Starts t={t} garage={garage} typed={typed} onChange={change} problem={save.tried ? draft.problems.day : null} scope="special" ticking={ticking} />
      )}
      {save.tried ? <Missing t={t} scope="special" items={missingItems(t, draft.problems, SPECIAL_ORDER)} /> : null}
      <div className="lane-actions">
        <button type="submit" className="primary-button" data-action="save-special">
          {editing.kind === 'remove' ? t('rates.saveRemove') : editing.kind === 'move' ? t('rates.saveMove') : t('rates.saveSpecial')}
        </button>
        <button type="button" className="link-button" data-action="cancel-special" onClick={() => onEdit(null)}>
          {t('rates.cancel')}
        </button>
      </div>
    </form>
  );
}

/** A special's fields: its name, its days, its times, its price. `now` is the special in force, or null for a new one. */
function SpecialFields({ t, language, garage, typed: s, now, problems, tried, onChange }) {
  const p = (f) => (tried ? problems[`special.${f}`] : null);
  const id = (f) => fieldId('special', `special.${f}`);
  const merged = mergeSpecial(s, now);
  const pickPreset = (preset) => onChange({ preset, days: PRESETS[preset] ? [...PRESETS[preset]] : now ? s.days : [], dates: preset === 'dates' ? (s.dates.length ? s.dates : ['']) : [] });
  const nowRule = now ? { applies_on: now.preset === 'dates' ? { kind: 'dates', dates: now.dates } : { kind: 'days_of_week', days: now.days } } : null;
  const clock = (v) => (v ? clockWords(v, language) : null);
  const money = (v) => (v ? nowMoney(v, garage, language) : null);
  const amountUnit = merged.adjust.kind === 'percent' ? 'percent' : merged.adjust.kind === 'fixed' ? 'money' : null;
  return (
    <>
      <div className="tax-line-fields">
        <Text t={t} language={language} garage={garage} name="rates.special.name" field="special-name" id={id('name')} value={s.name} onChange={(v) => onChange({ name: v })} now={now?.name || null} problem={p('name')} inputMode="text" maxLength={60} />
        <Choice t={t} name="rates.special.choice" field="special-preset" id={id('preset')} value={s.preset} options={PRESET_KEYS.map((k) => ({ value: k, text: t(`rates.preset.${k}`) }))} onChange={pickPreset} now={now ? t(`rates.preset.${now.preset}`) : null} problem={p('preset')} />
      </div>
      {merged.preset && merged.preset !== 'dates' ? (
        <fieldset className="days" data-field="special-days" id={id('days')} data-wrong={p('days') ? 'yes' : 'no'}>
          <legend>
            <FieldName t={t} name="rates.special.days" />
          </legend>
          <div className="day-ticks">
            {DAYS.map((d) => (
              <Tick
                key={d}
                t={t}
                tick={`day-${d}`}
                on={s.days.includes(d)}
                onChange={(on) => onChange({ days: on ? DAYS.filter((x) => x === d || s.days.includes(x)) : s.days.filter((x) => x !== d) })}
                words={dayName(d, language)}
              />
            ))}
          </div>
          {nowRule && now.preset !== 'dates' ? <NowWas t={t} text={daysWords(t, nowRule.applies_on, language)} /> : null}
          <Wrong t={t} problem={p('days')} id={id('days')} />
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
      {merged.charge === 'flat' ? <Text t={t} language={language} garage={garage} name="rates.special.flat" field="special-flat" id={id('flat')} value={s.flat} onChange={(v) => onChange({ flat: v })} unit="money" now={now?.charge === 'flat' ? money(now.flat) : null} problem={p('flat')} /> : null}
      {merged.charge === 'rate' ? <RateFields t={t} language={language} garage={garage} rate={s.rate} now={now?.charge === 'rate' ? now.rate : null} onChange={(rate) => onChange({ rate })} prefix="special.rate" scope="special" problems={problems} tried={tried} /> : null}
      {merged.charge === 'adjust' ? (
        <div className="tax-line-fields">
          <Choice t={t} name="rates.special.direction" field="special-direction" id={id('direction')} value={s.adjust.direction} options={DIRECTIONS.map((d) => ({ value: d, text: t(`rates.direction.${d}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, direction: v } })} now={now?.charge === 'adjust' ? t(`rates.direction.${now.adjust.direction}`) : null} problem={p('direction')} />
          <Choice t={t} name="rates.special.amountKind" field="special-amount-kind" id={id('amountKind')} value={s.adjust.kind} options={AMOUNT_KINDS.map((k) => ({ value: k, text: t(`rates.amountKind.${k}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, kind: v } })} now={now?.charge === 'adjust' ? t(`rates.amountKind.${now.adjust.kind}`) : null} problem={p('amountKind')} />
          <Text t={t} language={language} garage={garage} name="rates.special.amount" field="special-amount" id={id('amount')} value={s.adjust.value} onChange={(v) => onChange({ adjust: { ...s.adjust, value: v } })} unit={amountUnit} now={now?.charge === 'adjust' ? (now.adjust.kind === 'percent' ? percentWords(Number(now.adjust.value) * 100, language) : money(now.adjust.value)) : null} problem={p('amount')} />
          <Choice t={t} name="rates.special.cent" field="special-cent" id={id('cent')} value={s.adjust.rounding} options={ADJUST_ROUNDINGS.map((r) => ({ value: r, text: t(`rates.cent.${r}`) }))} onChange={(v) => onChange({ adjust: { ...s.adjust, rounding: v } })} now={now?.charge === 'adjust' ? t(`rates.cent.${now.adjust.rounding}`) : null} problem={p('cent')} />
        </div>
      ) : null}
    </>
  );
}

// --- the price calculator -----------------------------------------------------

/**
 * The price calculator (U7i, item 7): came in, left, and the fee with each
 * line in plain words. Nothing is saved. It prices by the rates in force, or
 * by the rates being changed and not saved yet -- with every later version as
 * that save would leave it (U7i fix 1, item 8) -- priced by the platform the
 * way a leaving car is, never here. `draft` is the change, `{ save, starts }`,
 * or null when nothing is being changed or it is not complete. An answer is
 * tied to the rates and the stay it was priced for: change either and it is
 * greyed, with a line saying to work it out again (U7i fix 1, F1).
 */
function Calculator({ t, language, client, garage, stored, idOf, draft, changingWhat, taxNames, onCheckPage = false }) {
  const [source, setSource] = useState(onCheckPage ? 'changing' : 'force');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [problem, setProblem] = useState(null);
  const [tried, setTried] = useState(false);
  const name = useRef(null);
  const hasForce = stored.length > 0;
  const using = source === 'changing' ? (draft ? 'changing' : null) : hasForce ? 'force' : null;
  const fine = wallOf(entry) && wallOf(exit) && exit >= entry;
  // What an answer would be priced for this moment: the rates and the stay.
  const askedFor = JSON.stringify({ using, rates: using === 'changing' ? saveKey(draft, garage) : using === 'force' ? plansKey(stored) : null, entry, exit });

  const run = async () => {
    setTried(true);
    if (!fine || busy || !using) return;
    setBusy(true);
    setProblem(null);
    const key = askedFor;
    try {
      if (!name.current) name.current = planName(Date.now(), garage.timezone);
      const save = using === 'changing' ? draft.save(formStart(draft.starts, garage), name.current) : null;
      const out = await client.tryStays(garage.id, { plan: save?.plan ?? null, carry: save ? carryBody(save, idOf) : [], stays: [{ entry, exit }] });
      setAnswer({ stay: out.stays[0], plan: save?.plan ?? null, plans: save ? plansAfter(stored, save.plan, save) : stored, key });
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  };

  const stay = answer?.stay;
  // The plan that priced it, to name a special: one of the plans as they were priced.
  const priced = stay && !stay.refused ? (answer.plans.find((p) => p.plan_version === stay.plan_version) ?? answer.plan) : null;
  const stale = Boolean(answer) && answer.key !== askedFor;
  const reason = !using ? (source === 'changing' ? t(changingWhat ? 'rates.calc.fillFirst' : 'rates.calc.nothingChanging') : t('rates.calc.noRates')) : null;

  return (
    <section className={`panel${onCheckPage ? '' : ' no-print'}`} data-section="calculator" aria-live="polite">
      <h2 className="section-title">
        <FieldName t={t} name="rates.calc" />
      </h2>
      <div className="chooser" data-chooser="calc-rates">
        <FieldName t={t} name="rates.calc.which" />
        <Segmented
          label={t('rates.calc.which')}
          value={source}
          options={[
            { value: 'force', text: t('rates.calc.force') },
            { value: 'changing', text: t('rates.calc.changing') },
          ]}
          onChange={(v) => {
            setSource(v);
            setAnswer(null);
          }}
          name="calc-rates"
        />
      </div>
      {using === 'changing' && !onCheckPage && changingWhat ? (
        <p className="quiet" data-notice="calc-changing">
          {changingWhat.kind === 'regular' ? t('rates.calc.onRegular') : t('rates.calc.onSpecial', { name: changingWhat.name })}
        </p>
      ) : null}
      {using === 'changing' ? (
        <p className="quiet" data-notice="calc-from-start">
          {t('rates.calc.fromStart')}
        </p>
      ) : null}
      <form
        className="setup-form try-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="tax-line-fields">
          <When t={t} kind="datetime-local" name="rates.try.entry" field="try-entry" id={`calc-entry${onCheckPage ? '-check' : ''}`} value={entry} onChange={setEntry} />
          <When t={t} kind="datetime-local" name="rates.try.exit" field="try-exit" id={`calc-exit${onCheckPage ? '-check' : ''}`} value={exit} onChange={setExit} />
        </div>
        <Act type="submit" action="try-stay" disabled={busy || !using} reason={busy ? null : reason}>
          {busy ? t('rates.try.busy') : t('rates.calc.button')}
        </Act>
      </form>
      <p className="quiet">{t('rates.calc.nothingSaved')}</p>
      {tried && !fine ? (
        <p className="warning" data-notice="try-need">
          {t('rates.try.need')}
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
          <TriedStay t={t} language={language} garage={garage} stay={stay} plan={priced ?? answer.plan} taxNames={taxNames} />
        </div>
      ) : null}
    </section>
  );
}

/** The plans, as text: equal text, the same rates. */
const plansKey = (plans) => JSON.stringify(plans.map((p) => ({ ...p, plan_version: null })));

/**
 * What a save would store, as text, but its names, and with a start of "now"
 * said as "now" ("Now" moves with the clock): equal text, the same rates.
 */
function saveKey(draft, garage) {
  const save = draft.save(formStart(draft.starts, garage), 'key');
  const nowStart = draft.starts.starts === 'now';
  return JSON.stringify({
    plan: { ...save.plan, plan_version: null, effective_from: nowStart ? 'now' : save.plan.effective_from },
    carried: save.carried.map((c) => ({ ...c.plan, plan_version: null })),
    replaces: save.replaces?.plan_version ?? null,
  });
}

/** The save's `carry`, as the platform takes it: each later version it replaces, by its stored id. */
function carryBody(save, idOf) {
  return [...(save.replaces ? [{ withdraw: idOf(save.replaces) }] : []), ...save.carried.map((c) => ({ withdraw: idOf(c.from), plan: c.plan }))];
}

/** One priced stay: what the driver pays, how long it stayed, and each part of the price. */
function TriedStay({ t, language, garage, stay, plan, taxNames }) {
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
  const lines = lineWords(t, stay, plan, taxNames, garage.currency, language);
  return (
    <div className="tried" data-tried="priced" data-fee={stay.fee_minor}>
      <p className="tried-pays">{t('rates.try.pays', { amount: moneyText(stay.fee_minor, garage.currency, language) })}</p>
      <p className="quiet">{t('rates.try.stayed', { length: lengthWords(t, stay.minutes) })}</p>
      {stay.taxes_stated === false ? (
        <p className="quiet" data-notice="tax-not-stated">
          {t('rates.try.taxNotStated')}
        </p>
      ) : null}
      <FieldName t={t} name="rates.lines" />
      <table className="list tried-lines">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} data-line-tax={line.tax ? 'yes' : 'no'}>
              <td>
                <bdi>{line.words}</bdi>
              </td>
              <td className="money" data-minor={line.minor}>
                {line.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="quiet" data-special-words>
        {specialWords(t, stay, plan, language)}
      </p>
    </div>
  );
}

// --- the check page -----------------------------------------------------------

/**
 * The check page: what this save changes, the rates as they will be in plain
 * sentences, the price calculator, and the price table -- priced by itself as
 * the page opens and again whenever a stay is added (U7i, item 8) -- then its
 * steps in order: 1 Check the prices, 2 Tick, 3 Confirm. Nothing is saved
 * before Confirm; a change after a table was priced locks Confirm until it is
 * priced again. With rates saved to start later (U7i fix 1, item 7), each later
 * version this save rebuilds is listed too, with its date, its sentences and a
 * priced table of its own, and each one this change does not reach says so;
 * one tick and one Confirm save them all. `draft` is `{ what, section, starts, save }`.
 */
function Review({ t, language, client, garage, draft, plans, idOf, taxNames, onBack, onSaved }) {
  const [added, setAdded] = useState([]);
  const [priced, setPriced] = useState({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [findings, setFindings] = useState(null);
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState({ entry: '', exit: '' });
  const name = useRef(planName(Date.now(), garage.timezone));
  const asking = useRef({});
  const { printedAt, print } = usePrint();
  const startsNow = draft.starts.starts === 'now';
  const at = (iso) => garageDateTime(iso, garage.timezone, language);

  // The save as it would be made this moment ("Now" is this moment).
  const saveNow = () => draft.save(formStart(draft.starts, garage), name.current);
  const save = saveNow();
  const shown = save.plan;
  const base = baseAt(plans, shown.effective_from);
  const saveText = saveKey(draft, garage);
  // One table for the new rates (with the stays the owner added), one for each later version rebuilt.
  const tables = [
    { id: 'saved', plan: shown, stays: [...tableStays(shown, garage.timezone), ...added].slice(0, TABLE_MAX) },
    ...save.carried.map((c, i) => ({ id: `later-${i + 1}`, plan: c.plan, stays: tableStays(c.plan, garage.timezone) })),
  ].map((tb) => ({ ...tb, key: JSON.stringify({ save: saveText, stays: tb.stays.map(({ entry, exit }) => [entry, exit]) }) }));
  const wantKey = tables.map((tb) => tb.key).join('|');

  const priceOne = async (table, made) => {
    asking.current[table.id] = table.key;
    const out = await client.tryStays(garage.id, { plan: made.plan, carry: carryBody(made, idOf), stays: table.stays.map(({ entry, exit }) => ({ entry, exit })) });
    return { key: table.key, plan: table.plan, rows: table.stays.map((st, i) => ({ ...st, answer: out.stays[i] })), draftFindings: out.draftFindings, at: new Date() };
  };
  // Prices every table not priced for exactly what it shows now; returns the new rates' table.
  const price = async ({ all = false } = {}) => {
    const made = saveNow();
    const due = tables.filter((tb) => all || (priced[tb.id]?.key !== tb.key && asking.current[tb.id] !== tb.key));
    if (!due.length) return { data: priced.saved, readAt: priced.saved?.at };
    setBusy(true);
    setProblem(null);
    setFindings(null);
    try {
      let first = priced.saved;
      for (const table of due) {
        const done = await priceOne(table, made);
        if (asking.current[table.id] !== table.key) continue;
        setPriced((was) => ({ ...was, [table.id]: done }));
        if (table.id === 'saved') first = done;
        if (done.draftFindings.length) setFindings(done.draftFindings);
      }
      return { data: first, readAt: first?.at };
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
      for (const table of due) if (asking.current[table.id] === table.key) delete asking.current[table.id];
      throw p;
    } finally {
      setBusy(false);
    }
  };

  // Priced as the page opens, and again whenever what a table prices changes: a stay added.
  useEffect(() => {
    price().catch(() => {});
    // `wantKey` is what the tables price: the rates and the stays.
  }, [wantKey]);

  // Priced for exactly these rates and these stays. "Now" moves with the
  // clock, so a start of "now" is compared as "now", not as the moment.
  const current = tables.every((tb) => priced[tb.id]?.key === tb.key);
  const mainTable = priced.saved ?? null;
  const blocked = tables.some((tb) => (priced[tb.id]?.draftFindings ?? []).length > 0);
  const canConfirm = current && ticked && !saving && !blocked;
  const startWords = startsNow ? t('rates.review.now') : garageDateTime(shown.effective_from, garage.timezone, language);
  const unchanged = sameRates(shown, base);
  // Where the owner is: 1 check the prices, 2 tick, 3 confirm.
  const step = !current || blocked ? 1 : !ticked ? 2 : 3;
  const tickReason = busy ? t('rates.review.wait') : blocked ? t('rates.review.cannotSave') : t('rates.review.checkFirst');
  const confirmReason = saving ? null : step === 1 ? tickReason : t('rates.review.needTick');

  const confirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    setProblem(null);
    setFindings(null);
    try {
      // Saved as priced -- but "Now" is the moment Confirm is pressed.
      const plan = startsNow ? { ...mainTable.plan, effective_from: formStart(draft.starts, garage) } : mainTable.plan;
      await client.addRatePlan(garage.id, plan, { confirmed: ticked, carry: carryBody(saveNow(), idOf) });
      onSaved();
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
      setProblem(p?.kind ?? 'unexpected');
      if (p?.kind === 'planFindings') setFindings(p.findings ?? []);
      setSaving(false);
    }
  };

  const tableFull = added.length + tableStays(shown, garage.timezone).length >= TABLE_MAX;
  const addStay = () => {
    const entry = wallOf(extra.entry);
    const exit = wallOf(extra.exit);
    if (!entry || !exit || exit < entry || tableFull) return;
    setAdded((was) => [...was, { entry, exit, why: { key: 'added' } }]);
    setExtra({ entry: '', exit: '' });
  };
  const what = draft.what;
  const whatWords =
    what.kind === 'regular'
      ? t('rates.review.whatRegular')
      : what.kind === 'add'
        ? t('rates.review.whatAdd', { name: what.name })
        : what.kind === 'change'
          ? t('rates.review.whatChange', { name: what.name })
          : what.kind === 'remove'
            ? t('rates.review.whatRemove', { name: what.name })
            : t('rates.review.whatMove', { name: what.name });
  // Each table's own line: being priced, or priced for rates or stays that have changed since.
  const tableNotice = (table) =>
    busy && priced[table.id]?.key !== table.key ? (
      <p className="quiet" data-notice="table-pricing">
        {t('rates.table.busy')}
      </p>
    ) : priced[table.id] && priced[table.id].key !== table.key ? (
      <p className="warning" data-notice="table-stale">
        {t('rates.table.stale')}
      </p>
    ) : null;

  return (
    <>
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={mainTable?.at} />
      <section className="panel" data-form="review-rates" aria-live="polite">
        <div className="lane-panel-head">
          <h2 className="section-title">{t('rates.review')}</h2>
          <button type="button" className="link-button no-print" data-action="back-to-form" onClick={onBack}>
            {t('rates.review.back')}
          </button>
        </div>
        <ol className="steps no-print" data-steps>
          {['rates.step.check', 'rates.step.tick', 'rates.step.confirm'].map((k, i) => (
            <li key={k} data-step={i + 1} aria-current={step === i + 1 ? 'step' : undefined} data-current={step === i + 1 ? 'yes' : 'no'}>
              <span className="step-n">{i + 1}</span> {t(k)}
            </li>
          ))}
        </ol>
        <p data-notice="what-changes">{whatWords}</p>
        {unchanged ? (
          <p className="warning" data-notice="nothing-changed">
            {t('rates.review.nothingChanged')}
          </p>
        ) : null}
        {save.replaces ? (
          <p className="quiet" data-notice="replaces-later">
            {t('rates.review.replaces', { time: at(save.replaces.effective_from) })}
          </p>
        ) : null}
        <h3 className="setup-step-name">{t('rates.review.sentences')}</h3>
        <Sentences t={t} language={language} plan={shown} kind="draft" />
        <p data-notice="starts">{startsNow ? t('rates.review.startsNow') : t('rates.review.startsAt', { time: startWords })}</p>
      </section>

      <Calculator t={t} language={language} client={client} garage={garage} stored={plans} idOf={idOf} draft={draft} changingWhat={what} taxNames={taxNames} onCheckPage />

      <section className="panel" data-section="price-table">
        <h2 className="section-title">
          <FieldName t={t} name="rates.table" />
        </h2>
        {tableNotice(tables[0])}
        {problem && !mainTable ? <ProblemNote t={t} kind={problem} onRetry={() => price({ all: true }).catch(() => {})} /> : null}
        {mainTable ? <PriceTable t={t} language={language} garage={garage} priced={mainTable} /> : null}
        {mainTable ? <ListActions t={t} list="priceTable" language={language} client={client} garage={garage} refresh={() => price({ all: true })} print={print} /> : null}
        <div className="tax-line-fields no-print" data-add-stay>
          <When t={t} kind="datetime-local" name="rates.try.entry" field="add-entry" id="add-entry" value={extra.entry} onChange={(v) => setExtra((x) => ({ ...x, entry: v }))} />
          <When t={t} kind="datetime-local" name="rates.try.exit" field="add-exit" id="add-exit" value={extra.exit} onChange={(v) => setExtra((x) => ({ ...x, exit: v }))} />
          <Act action="add-stay" className="link-button" disabled={tableFull} reason={t('rates.table.full', { count: TABLE_MAX })} onClick={addStay}>
            {t('rates.table.add')}
          </Act>
        </div>
      </section>

      {save.carried.length || save.own.length ? (
        <section className="panel" data-section="carried">
          <h2 className="section-title">{t('rates.review.carried')}</h2>
          {save.carried.length ? <p className="quiet">{t('rates.review.carriedAbout')}</p> : null}
          {save.own.map((plan) => (
            <p key={plan.plan_version} className="quiet" data-notice="own-section" data-starts={plan.effective_from}>
              {t(draft.section === 'regular' ? 'rates.review.ownRegular' : 'rates.review.ownSpecials', { time: at(plan.effective_from) })}
            </p>
          ))}
          {tables.slice(1).map((table) => (
            <div key={table.id} className="rate-plan" data-carried={table.id} data-starts={table.plan.effective_from}>
              <h3 className="setup-step-name">{t('rates.review.carriedAt', { time: at(table.plan.effective_from) })}</h3>
              <Sentences t={t} language={language} plan={table.plan} kind="carried" />
              {tableNotice(table)}
              {priced[table.id] ? <PriceTable t={t} language={language} garage={garage} priced={priced[table.id]} list="price-table-later" /> : null}
            </div>
          ))}
        </section>
      ) : null}

      {findings && findings.length ? (
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
        <Tick
          t={t}
          tick="checked-prices"
          on={ticked && current}
          disabled={!current || blocked}
          reason={tickReason}
          onChange={setTicked}
          words={t(save.carried.length ? 'rates.review.tickCarried' : 'rates.review.tick', { start: startWords })}
        />
        <Act action="confirm-rates" disabled={!canConfirm} reason={confirmReason} onClick={confirm}>
          {saving ? t('rates.review.saving') : t('rates.review.confirm')}
        </Act>
        {problem && mainTable ? <ProblemNote t={t} kind={problem} /> : null}
      </section>
    </>
  );
}

/** The price table: one row per example stay, as the platform priced it. */
function PriceTable({ t, language, garage, priced, list = 'price-table' }) {
  const paging = usePaging(priced.rows.length);
  const money = (minor) => moneyText(minor, garage.currency, language);
  const answerOf = (key) => priced.rows.find((r) => r.why.key === key)?.answer;
  // Each time is already the garage's own clock.
  const when = (wall) => localSaid(wall, language);
  return (
    <>
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
              <tr key={i} className={paging.row(i)} data-row={i + 1} data-fee={a && !a.refused ? a.fee_minor : undefined} data-why={row.why.key} data-says={caseKey(row, a, answerOf)} data-entry={row.entry} data-exit={row.exit}>
                <td>{when(row.entry)}</td>
                <td>{when(row.exit)}</td>
                <td>{lengthWords(t, a?.minutes ?? 0)}</td>
                <td className="money">{a && !a.refused ? money(a.subtotal_minor) : t('rates.table.noPrice')}</td>
                <td className="money">{a && !a.refused ? (a.taxes_stated === false ? t('rates.table.noTax') : money(taxMinor)) : '–'}</td>
                <td className="money">{a && !a.refused ? money(a.fee_minor) : t('rates.table.noPrice')}</td>
                <td>{a ? (a.refused ? (a.findings ?? []).map((f) => findingWords(t, f, priced.plan, garage.timezone, language)).join(' ') : specialWords(t, { ...a, entry: row.entry, exit: row.exit }, priced.plan, language)) : ''}</td>
                <td>
                  <bdi>{caseWords(t, row, a, answerOf)}</bdi>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager t={t} language={language} paging={paging} list={list} />
    </>
  );
}
