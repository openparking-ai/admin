// The Rates form, filled in six ways (U7g check 4), each with one stay and
// what that stay costs by the form's own sentences -- worked out here by
// hand, before tax, and checked against what the rate engine charged when
// test/platform-shapes.json was recorded from the platform.
//
// Every one starts "from the start of" a Monday in 2030, a week apart, in
// the garage's time (America/New_York), so each is the plan in force for its
// own week and no two start at one moment. Used by the recording
// (test/platform-shapes.js), the form's tests (test/rates.test.js) and the
// browser check (scripts/check-rates.js).

import { blankForm, blankRate, blankSpecial } from '../src/rates.js';

export const ZONE = 'America/New_York';
export const RECORDED_GARAGE = { name: 'Recorded rates garage', timezone: ZONE, currency: 'USD' };

const rate = (firstMinutes, firstPrice, nextMinutes, nextPrice) => ({ ...blankRate(), firstMinutes, firstPrice, nextMinutes, nextPrice, rounding: 'ceil' });
const hourly = () => rate('60', '8.00', '60', '4.00');

function form(day, change) {
  const f = { ...blankForm(), time: hourly(), starts: 'day', day };
  change(f);
  return f;
}

function special(preset, fields) {
  return { ...blankSpecial(preset), ...fields };
}

/**
 * The six, as the brief names them. `stay` is in the garage's time; `fee` is
 * what the form's sentences say it costs, before tax.
 */
export const FORMS = [
  {
    id: 'a',
    what: 'hourly and the most per day',
    form: form('2030-01-07', (f) => {
      f.dayMax = { on: true, price: '30.00', kind: 'calendar_day' };
    }),
    // Ten hours: 8.00 + 9 x 4.00 = 44.00, and at most 30.00 a day.
    stay: { entry: '2030-01-08T08:00', exit: '2030-01-08T18:00' },
    fee: 3000,
  },
  {
    id: 'b',
    what: 'an early bird on weekdays',
    form: form('2030-01-14', (f) => {
      f.specials = [special('weekdays', { name: 'Early bird', enterFrom: '06:00', enterBy: '09:00', leaveBy: '18:00', nextDay: false, charge: 'flat', flat: '15.00' })];
    }),
    // In at 7:30 on a Tuesday, out at 5:00 PM: the early bird, 15.00 (the hourly rate would be 8.00 + 9 x 4.00).
    stay: { entry: '2030-01-15T07:30', exit: '2030-01-15T17:00' },
    fee: 1500,
  },
  {
    id: 'c',
    what: 'a weekend flat price, leaving by the next day',
    form: form('2030-01-21', (f) => {
      f.specials = [special('weekends', { name: 'Weekend', enterFrom: '00:00', enterBy: '23:59', leaveBy: '12:00', nextDay: true, charge: 'flat', flat: '20.00' })];
    }),
    // In Saturday 10:00, out Sunday 11:00: the weekend price, 20.00.
    stay: { entry: '2030-01-26T10:00', exit: '2030-01-27T11:00' },
    fee: 2000,
  },
  {
    id: 'd',
    what: 'an event date at a different time-based rate',
    form: form('2030-01-28', (f) => {
      f.specials = [special('dates', { name: 'Game day', dates: ['2030-02-02'], enterFrom: '00:00', enterBy: '23:59', leaveBy: '23:59', nextDay: false, charge: 'rate', rate: rate('60', '5.00', '60', '2.00') })];
    }),
    // Three and a half hours on the game day: 5.00 + 3 x 2.00 = 11.00, less than
    // the hour's 8.00 + 3 x 4.00 = 20.00, so the game-day rate is what is charged
    // (U7g fix 1: the driver pays the cheaper of a special and the time-based rate;
    // at 15.00 and 5.00 it was 30.00 and the hour's 20.00 was charged instead).
    stay: { entry: '2030-02-02T18:00', exit: '2030-02-02T21:30' },
    fee: 1100,
  },
  {
    id: 'e',
    what: 'a 10% discount, then a 2.00 discount',
    form: form('2030-02-04', (f) => {
      const everyDay = { enterFrom: '00:00', enterBy: '23:59', leaveBy: '23:59', nextDay: true, charge: 'adjust' };
      f.specials = [
        special('everyDay', { ...everyDay, name: 'Ten percent off', adjust: { direction: 'discount', kind: 'percent', value: '10', rounding: 'down' } }),
        special('everyDay', { ...everyDay, name: 'Two off', adjust: { direction: 'discount', kind: 'fixed', value: '2.00', rounding: 'down' } }),
      ];
    }),
    // Three hours: 8.00 + 2 x 4.00 = 16.00; 10% off is 14.40; then 2.00 off is 12.40.
    // (The other order: 16.00 - 2.00 = 14.00, then 10% off = 12.60.)
    stay: { entry: '2030-02-05T10:00', exit: '2030-02-05T13:00' },
    fee: 1240,
  },
  {
    id: 'f',
    what: 'a free grace period of 10 minutes',
    form: form('2030-02-11', (f) => {
      f.grace = { on: true, minutes: '10' };
    }),
    // Out within ten minutes: free.
    stay: { entry: '2030-02-12T10:00', exit: '2030-02-12T10:10' },
    fee: 0,
  },
];

/**
 * The form the browser check fills in and prices a table for: a little of
 * everything, so the table holds every kind of example stay.
 */
export const TABLE_FORM = form('2030-03-04', (f) => {
  f.dayMax = { on: true, price: '30.00', kind: 'calendar_day' };
  f.grace = { on: true, minutes: '10' };
  f.specials = [
    special('weekdays', { name: 'Early bird', enterFrom: '06:00', enterBy: '09:00', leaveBy: '18:00', nextDay: false, charge: 'flat', flat: '15.00' }),
    special('weekends', { name: 'Weekend', enterFrom: '00:00', enterBy: '23:59', leaveBy: '12:00', nextDay: true, charge: 'flat', flat: '20.00' }),
  ];
});

/**
 * U7g fix 1, F1: the three plans the gate measured the price table's "most per
 * day / per week" rows on, each by its own hand: $1 an hour, at most $20 a
 * calendar day; $8 then $4 an hour, $30 a calendar day, $100 a calendar week;
 * $2 then $1 an hour, $20 a calendar day, $90 a calendar week from Monday.
 * Recorded as drafts only (never stored), so their starts are their own.
 */
export const GATE_MAX_FORMS = [
  {
    id: 'hour1-day20',
    form: form('2030-04-01', (f) => {
      f.time = rate('60', '1.00', '60', '1.00');
      f.dayMax = { on: true, price: '20.00', kind: 'calendar_day' };
    }),
  },
  {
    id: 'day30-week100',
    form: form('2030-04-08', (f) => {
      f.dayMax = { on: true, price: '30.00', kind: 'calendar_day' };
      f.weekMax = { on: true, price: '100.00', kind: 'calendar_week', startsOn: 'mon' };
    }),
  },
  {
    id: 'day20-week90',
    form: form('2030-04-15', (f) => {
      f.time = rate('60', '2.00', '60', '1.00');
      f.dayMax = { on: true, price: '20.00', kind: 'calendar_day' };
      f.weekMax = { on: true, price: '90.00', kind: 'calendar_week', startsOn: 'mon' };
    }),
  },
];

/**
 * U7g fix 2, G3: plans where an hour's steps land EXACTLY on the most -- $10 an
 * hour, at most $100 -- so the hour that reaches it is not the one that passes
 * it. The engine applies a most only when the charge is MORE; a table that
 * called the hour reaching $100 "takes over" would be wrong by an hour, and only
 * a plan like these can tell. One for each kind of day and of week.
 */
const ten = () => rate('60', '10.00', '60', '10.00');
export const EQUAL_MAX_FORMS = [
  { id: 'hour10-day100', form: form('2030-04-22', (f) => { f.time = ten(); f.dayMax = { on: true, price: '100.00', kind: 'calendar_day' }; }) },
  { id: 'hour10-day100-24h', form: form('2030-04-29', (f) => { f.time = ten(); f.dayMax = { on: true, price: '100.00', kind: 'rolling_24h' }; }) },
  { id: 'hour10-week100-7d', form: form('2030-05-13', (f) => { f.time = ten(); f.weekMax = { on: true, price: '100.00', kind: 'rolling_7d', startsOn: '' }; }) },
  { id: 'hour10-week100-cal', form: form('2030-05-20', (f) => { f.time = ten(); f.weekMax = { on: true, price: '100.00', kind: 'calendar_week', startsOn: 'mon' }; }) },
];

/**
 * U7g fix 2, G2: the re-gate's walk plan, with a discount and a service fee on
 * every stay -- the plan on which the "time-based rate is less" words went
 * missing. $2 then $1 an hour, at most $20 a calendar day and $90 a calendar
 * week from Monday, 15 minutes free; an early bird, weekend nights (Friday to
 * Sunday), a game night on three dates at its own rate, then Members 10 % off
 * and a $1.00 service fee. Recorded as a draft table, and saved on a garage of
 * its own so Try a stay can be asked of it.
 */
export const WALK_FORM = form('2030-05-27', (f) => {
  f.time = rate('60', '2.00', '60', '1.00');
  f.dayMax = { on: true, price: '20.00', kind: 'calendar_day' };
  f.weekMax = { on: true, price: '90.00', kind: 'calendar_week', startsOn: 'mon' };
  f.grace = { on: true, minutes: '15' };
  const everyDay = { enterFrom: '00:00', enterBy: '23:59', leaveBy: '23:59', nextDay: true, charge: 'adjust' };
  f.specials = [
    special('weekdays', { name: 'Early bird', enterFrom: '05:00', enterBy: '09:00', leaveBy: '18:00', nextDay: false, charge: 'flat', flat: '9.00' }),
    special('weekends', { name: 'Weekend nights', days: ['fri', 'sat', 'sun'], enterFrom: '17:00', enterBy: '23:59', leaveBy: '12:00', nextDay: true, charge: 'flat', flat: '12.00' }),
    special('dates', { name: 'Game night', dates: ['2030-05-31', '2030-06-07', '2030-06-14'], enterFrom: '16:00', enterBy: '22:00', leaveBy: '23:59', nextDay: false, charge: 'rate', rate: rate('30', '5.00', '30', '5.00') }),
    special('everyDay', { ...everyDay, name: 'Members', adjust: { direction: 'discount', kind: 'percent', value: '10', rounding: 'down' } }),
    special('everyDay', { ...everyDay, name: 'Service fee', adjust: { direction: 'increase', kind: 'fixed', value: '1.00', rounding: 'up' } }),
  ];
});

/** U7g fix 1, F5: a holiday special on three typed dates, for the price table's every-date cases (not recorded). */
export const THREE_DATES_FORM = form('2030-06-03', (f) => {
  f.specials = [special('dates', { name: 'Holidays', dates: ['2030-07-04', '2030-09-02', '2030-11-28'], enterFrom: '08:00', enterBy: '12:00', leaveBy: '20:00', nextDay: false, charge: 'flat', flat: '12.00' })];
});

/** A plan with a gap: the time-based rate stops at 24 hours and nothing caps a longer stay. */
export const GAP_DAY = '2030-03-11';

/**
 * Every document the recording sends, as the Rates form builds it (the page's
 * own buildPlan), named so a run is the same as the last: the six forms with
 * their stays, the price table's form with its example stays and one stay of
 * the owner's, rates with a gap, and three the store refuses.
 */
export function recordedPlans({ buildPlan, startOfDay, tableStays }) {
  const garage = { ...RECORDED_GARAGE };
  const make = (form, name, start = startOfDay(form.day, ZONE)) => buildPlan(form, { garage, spaceClass: 'standard', start, name });
  const forms = FORMS.map((f) => ({ id: f.id, plan: make(f.form, `recorded-${f.id}`), stay: f.stay }));
  const tablePlan = make(TABLE_FORM, 'recorded-table');
  const gap = make({ ...FORMS[0].form, dayMax: { on: false, price: '', kind: '' }, day: GAP_DAY }, 'recorded-gap');
  gap.rules = gap.rules.map((r) => (r.id === 'time' ? { ...r, max_duration_minutes: 1440 } : r));
  return {
    garage,
    forms,
    table: {
      plan: tablePlan,
      stays: tableStays(tablePlan, ZONE).map(({ entry, exit }) => ({ entry, exit })),
      added: { entry: '2030-03-06T07:00', exit: '2030-03-06T19:00' },
      // E1: a Tuesday, an hour inside the early bird's times: $8.00 by the hour against its $15.00.
      short: { entry: '2030-03-05T07:00', exit: '2030-03-05T08:00' },
    },
    maxes: [...GATE_MAX_FORMS, ...EQUAL_MAX_FORMS].map((g) => {
      const plan = make(g.form, `recorded-${g.id}`);
      // `late`: recorded after the table's rates were saved (fix 2), so tried beside them.
      return { id: g.id, plan, stays: tableStays(plan, ZONE).map(({ entry, exit }) => ({ entry, exit })), late: EQUAL_MAX_FORMS.includes(g) };
    }),
    walk: (() => {
      const plan = make(WALK_FORM, 'recorded-walk');
      const stays = tableStays(plan, ZONE).map(({ entry, exit }) => ({ entry, exit }));
      // Try a stay on the walk plan saved: each short stay the table holds, where the hour is less.
      const bases = plan.rules.filter((r) => r.type === 'time_window' && r.stage === 'QUALIFY').map((r) => r.label);
      const short = tableStays(plan, ZONE)
        .filter((s) => s.why.key === 'specialShort' && bases.includes(s.why.name))
        .map(({ entry, exit }) => ({ entry, exit }));
      return { plan, stays, short };
    })(),
    gap,
    gapStays: [
      { entry: '2030-03-12T10:00', exit: '2030-03-12T12:00' },
      { entry: '2030-03-12T10:00', exit: '2030-03-13T10:01' },
    ],
    past: make(FORMS[0].form, 'recorded-past', startOfDay('2020-01-06', ZONE)),
    sameStart: make(FORMS[1].form, 'recorded-same-start', forms[0].plan.effective_from),
    sameName: make(FORMS[0].form, 'recorded-a', startOfDay('2030-05-06', ZONE)),
  };
}
