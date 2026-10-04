// What to say about a lane, from what the platform returns for it.

import { garageTime, heardFrom } from './time.js';

/** The lane computer heard from most recently, of those whose access was not cancelled. */
export function laneComputer(lane) {
  const connected = (lane.devices ?? []).filter((d) => !d.revoked_at);
  if (connected.length === 0) return null;
  return connected.reduce((best, d) => (Date.parse(d.last_seen_at ?? 0) > Date.parse(best.last_seen_at ?? 0) ? d : best));
}

/** One device's state, in words. */
export function deviceWords(t, device, garage, language, now) {
  const heard = heardFrom(device.last_seen_at, now);
  if (heard.state === 'never') return { state: 'never', text: t('lane.never') };
  if (heard.state === 'quiet') {
    return { state: 'quiet', text: t('lane.quiet', { time: garageTime(heard.since, garage.timezone, language, now) }) };
  }
  if (heard.minutes === 0) return { state: 'working', text: t('lane.workingNow') };
  if (heard.minutes === 1) return { state: 'working', text: t('lane.workingOne') };
  return { state: 'working', text: t('lane.workingMany', { minutes: heard.minutes }) };
}

/**
 * A lane's state, in words: how its lane computer is doing, or why it has no
 * working one. "No lane computer yet" only for a lane that never had one; a
 * lane whose computers all had their access cancelled says that, and when the
 * last one was.
 */
export function laneWords(t, lane, garage, language, now) {
  const computer = laneComputer(lane);
  if (computer) return deviceWords(t, computer, garage, language, now);
  const cancelled = (lane.devices ?? []).filter((d) => d.revoked_at);
  if (cancelled.length === 0) return { state: 'none', text: t('lane.noComputer') };
  const last = cancelled.reduce((latest, d) => (Date.parse(d.revoked_at) > Date.parse(latest.revoked_at) ? d : latest));
  const time = garageTime(last.revoked_at, garage.timezone, language, now);
  return { state: 'cancelled', text: t(cancelled.length === 1 ? 'lane.cancelledOne' : 'lane.cancelledMany', { time }) };
}

export const directionKey = (lane) => (lane.direction === 'exit' ? 'lane.out' : 'lane.in');
