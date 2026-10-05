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

// ── Closing a lane (U4) ─────────────────────────────────────────────────────

/** Why a lane is closed, as the platform takes it: full lets pass and monthly holders in. */
export const CLOSE_REASONS = ['full', 'everyone'];

/** The sample messages for each reason, by dictionary key: each exists in both languages. */
export const SAMPLE_KEYS = {
  full: ['lanes.sample.full1', 'lanes.sample.full2'],
  everyone: ['lanes.sample.everyone1', 'lanes.sample.everyone2', 'lanes.sample.everyone3'],
};

/**
 * A lane's open or closed state, as pieces of one line: the reason, the
 * owner's message and who closed it and when. `stored` pieces are text kept
 * as it was typed (the message, an email, a key's name), which the screen
 * keeps apart on its own; `text` joins them for a file. One function for the
 * screen and the file, so the two say the same.
 */
export function openPieces(t, lane, garage, language, now) {
  const closed = lane.closed;
  if (!closed) return [{ words: t('lanes.isOpen') }];
  const time = garageTime(closed.at, garage.timezone, language, now);
  const [before, after] = t(closed.by?.kind === 'key' ? 'lanes.closedByKey' : 'lanes.closedBy', { time }).split('{who}');
  return [
    { words: t(closed.reason === 'full' ? 'lanes.closedFull' : 'lanes.closedEveryone'), tag: true },
    { words: ' “' },
    { stored: closed.message },
    { words: `” ${before}` },
    { stored: closed.by?.name ?? '' },
    { words: after ?? '' },
  ];
}

export const openText = (t, lane, garage, language, now) =>
  openPieces(t, lane, garage, language, now).map((p) => (p.tag ? `${p.words} ` : p.words ?? p.stored)).join('').replace(/\s+/g, ' ').trim();
