/**
 * The moment chosen for a meeting in Engage (docs/dev/history/technical-design-meetings-0.21.md
 * R3, §3.2): a tap on Before, During or After is kept per meeting while the
 * plugin runs - closing and reopening Engage keeps it, a plugin restart
 * forgets it. Never written to a file. A choice equal to the moment by time
 * is dropped, so time takes over again.
 *
 * Keyed `<item path>|<meeting key>` (domain/provenance.ts's `meetingKey`),
 * so it follows the meeting, not its row index.
 */
import {useSyncExternalStore} from 'react';
import {EngageSource, MeetingRef} from '../domain/engageOwner';
import {MeetingMoment} from '../domain/meetingMoment';
import {meetingKey} from '../domain/provenance';
import {Meeting} from '../domain/types';
import {log} from '../utils/log';

const choices = new Map<string, MeetingMoment>();
const listeners = new Set<() => void>();
let version = 0;

export function momentKey(itemPath: string, meeting: Pick<Meeting, 'date' | 'title'>): string {
  return `${itemPath}|${meetingKey(meeting)}`;
}

export function momentChoice(key: string): MeetingMoment | null {
  return choices.get(key) ?? null;
}

/** The moment chosen for the meeting at `ref`, or null. */
export function chosenMomentAt(ref: MeetingRef | null, source: EngageSource | null): MeetingMoment | null {
  const meeting = ref ? source?.items.find(i => i.path === ref.itemPath)?.meetings[ref.meetingIndex] : undefined;
  return ref && meeting ? momentChoice(momentKey(ref.itemPath, meeting)) : null;
}

/** Keeps `moment` for the meeting; the moment by time (`byTime`) drops the choice. */
export function chooseMoment(key: string, moment: MeetingMoment, byTime: MeetingMoment | null): void {
  if (moment === byTime) choices.delete(key);
  else choices.set(key, moment);
  version++;
  log('meetingMoment: chosen', moment);
  listeners.forEach(listener => listener());
}

/** Forgets every choice (tests; a plugin restart does it by itself). */
export function resetMomentChoices(): void {
  choices.clear();
  version++;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getVersion = () => version;

/** Re-renders on every choice; returns a number that changes with them (for dependency lists). */
export function useMomentChoices(): number {
  return useSyncExternalStore(subscribe, getVersion);
}
