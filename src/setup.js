// The setup checklist, in words.
//
// The platform works every step out (GET /garages/:id/setup) and says whether
// it is done and on what facts. Nothing here decides a step: `done` is shown
// as the platform gave it, and these functions only put its facts into plain
// sentences and say where the step is done.

import { garageTime } from './time.js';
import { alertName } from './alerts.js';

/** Where each step is done: a page of these screens, this page, or not from here yet. */
export const WHERE = {
  garage_details: { notYet: true },
  drivers: { here: true },
  lanes: { page: 'lanes', drawings: true },
  lane_computers: { page: 'lanes' },
  rates: { notYet: true },
  taxes: { notYet: true },
  getting_paid: { notYet: true },
  card_readers: { notYet: true },
  alerts: { page: 'alerts' },
  open: { notYet: true },
};

/** The lanes a fact lists, by name, joined as a sentence would join them. */
const names = (lanes, language) =>
  new Intl.ListFormat(language === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(lanes.map((l) => l.name));

const count = (t, n, one, many) => t(n === 1 ? one : many, { count: n });

/**
 * The step's facts as sentences, each plain text. Lane names are returned
 * apart from the words (`{ text, names }`), so the page can keep each one
 * apart on screen.
 */
export function factLines(t, step, garage, language, now = new Date()) {
  const f = step.facts ?? {};
  const at = (iso) => garageTime(iso, garage.timezone, language, now);
  switch (step.key) {
    case 'garage_details':
      return f.name ? [{ text: t('setup.fact.details') }] : [{ text: t('setup.fact.noName') }];
    case 'drivers':
      if (f.transient_available === true) return [{ text: t('setup.fact.driversAny') }];
      if (f.transient_available === false) return [{ text: t('setup.fact.driversPassOnly') }];
      return [{ text: t('setup.fact.driversUnanswered') }];
    case 'lanes': {
      const lines = [
        { text: count(t, f.entry_lanes, 'setup.fact.inOne', 'setup.fact.inMany') },
        { text: count(t, f.exit_lanes, 'setup.fact.outOne', 'setup.fact.outMany') },
      ];
      if ((f.closed_lanes ?? []).length) lines.push({ text: t('setup.fact.closed'), names: names(f.closed_lanes, language) });
      return lines;
    }
    case 'lane_computers': {
      if (!f.lanes) return [{ text: t('setup.fact.noLanes') }];
      const lines = [{ text: t('setup.fact.working', { working: f.working, lanes: f.lanes, minutes: f.quiet_minutes }) }];
      const by = (state) => (f.not_working ?? []).filter((l) => l.state === state);
      for (const [state, key] of [['none', 'setup.fact.noComputer'], ['cancelled', 'setup.fact.cancelled'], ['never_heard', 'setup.fact.neverHeard'], ['quiet', 'setup.fact.quiet']]) {
        const lanes = by(state);
        if (lanes.length) lines.push({ text: t(key, { minutes: f.quiet_minutes }), names: names(lanes, language) });
      }
      return lines;
    }
    case 'rates':
      if (!f.stored) return [{ text: t('setup.fact.noRates') }];
      if (!f.in_force) return [{ text: t('setup.fact.ratesLater', { time: at(f.earliest) }) }];
      return [{ text: count(t, f.in_force, 'setup.fact.ratesOne', 'setup.fact.ratesMany') }];
    case 'taxes':
      if (!f.stated) return [{ text: t('setup.fact.noTaxes') }];
      if (!f.in_force) return [{ text: t('setup.fact.taxesLater', { time: at(f.earliest) }) }];
      if (f.rules_in_force === 0) return [{ text: t('setup.fact.taxesNone') }];
      return [{ text: count(t, f.rules_in_force, 'setup.fact.taxesOne', 'setup.fact.taxesMany') }];
    case 'getting_paid': {
      if (!f.account) return [{ text: t('setup.fact.noAccount') }];
      if (f.charges_enabled === true && f.card_payments === 'active') return [{ text: t('setup.fact.accountReady') }];
      return [{ text: t('setup.fact.accountNotReady') }];
    }
    case 'card_readers': {
      if (!f.exit_lanes) return [{ text: t('setup.fact.noWayOut') }];
      const lines = [{ text: t('setup.fact.readers', { with: f.with_reader, lanes: f.exit_lanes }) }];
      if ((f.without_reader ?? []).length) lines.push({ text: t('setup.fact.withoutReader'), names: names(f.without_reader, language) });
      return lines;
    }
    case 'alerts': {
      const all = f.alerts ?? [];
      const nobody = f.nobody_told ?? [];
      const lines = [{ text: t('setup.fact.alertsCovered', { covered: all.length - nobody.length, alerts: all.length }) }];
      if (nobody.length) {
        const list = new Intl.ListFormat(language === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' });
        lines.push({ text: t('setup.fact.alertsNobody'), names: list.format(nobody.map((key) => alertName(t, key))) });
      }
      lines.push({ text: t('setup.fact.alertsNotSent') });
      return lines;
    }
    case 'open':
      if (f.open) return [{ text: f.opened_at ? t('setup.fact.openSince', { time: at(f.opened_at) }) : t('setup.fact.open') }];
      return (f.required_missing ?? []).length
        ? [{ text: t('setup.fact.needs'), names: new Intl.ListFormat(language === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(f.required_missing.map((k) => t(`setup.step.${k}`))) }]
        : [{ text: t('setup.fact.canOpen') }];
    default:
      return [];
  }
}
