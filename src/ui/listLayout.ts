/**
 * Session-only memory of each meeting list's 1-line/2-line choice
 * (docs/dev/technical-design-meeting-lists.md §2.4, Tilman 2026-09-29: "per
 * list, session only"). A module-level map, so the choice survives tab
 * switches and remounts, and resets when the plugin process restarts - no
 * settings file involved. `dayPanel` is one id shared by Daily, Week, Month
 * and Review's week ahead, so switching it once applies to all of them.
 */
import {useEffect, useState} from 'react';
import {MeetingRowLayout} from './MeetingRow';

export type MeetingListId =
  | 'dayPanel'
  | 'focusComingUp'
  | 'project'
  | 'inbox'
  | 'reviewInbox'
  | 'reviewCloseOut';

const chosen = new Map<MeetingListId, MeetingRowLayout>();
const listeners = new Set<() => void>();

export function setListLayout(id: MeetingListId, layout: MeetingRowLayout): void {
  chosen.set(id, layout);
  listeners.forEach(fn => fn());
}

/** The list's current layout (the session's choice, else `fallback`) and a setter. */
export function useListLayout(
  id: MeetingListId,
  fallback: MeetingRowLayout,
): [MeetingRowLayout, (layout: MeetingRowLayout) => void] {
  const [layout, setLayout] = useState<MeetingRowLayout>(chosen.get(id) ?? fallback);
  useEffect(() => {
    const sync = () => setLayout(chosen.get(id) ?? fallback);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [id, fallback]);
  return [layout, next => setListLayout(id, next)];
}
