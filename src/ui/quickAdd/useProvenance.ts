/**
 * The provenance a screen writes into the todos it adds from Quick Add
 * (docs/dev/history/technical-design-tending-threads.md §3.4): the meeting
 * they were agreed in and its thread tags. Used by Review's "Meetings to
 * close out", the thread overview and capture from a meeting's note page.
 *
 * `provenance` is Quick Add's grey line; its ✕ drops the provenance for the
 * next todo only - after a successful add (`added`) or for another meeting it
 * is on again. `apply` turns Quick Add's composed line into the line to save.
 */
import {useState} from 'react';
import {todayIso} from '../../domain/meetingTime';
import {applyProvenance, meetingKey, provenanceLabel, provenanceOf} from '../../domain/provenance';
import {Meeting} from '../../domain/types';
import {QuickAddProvenance} from './ProvenanceLine';

type ProvenanceMeeting = Pick<Meeting, 'date' | 'title' | 'tags'>;

export interface ProvenanceState {
  provenance: QuickAddProvenance | null;
  /** True while the line is shown (not dropped, a meeting is known). */
  active: boolean;
  apply: (composedLine: string) => string;
  /** Call after a todo was added: the next one gets the provenance again. */
  added: () => void;
}

export function useProvenance(meeting: ProvenanceMeeting | null): ProvenanceState {
  const [droppedKey, setDroppedKey] = useState<string | null>(null);
  const key = meeting ? meetingKey(meeting) : null;
  const active = meeting !== null && key !== droppedKey;
  return {
    provenance: active && meeting ? {label: provenanceLabel(meeting, todayIso()), onClear: () => setDroppedKey(key)} : null,
    active,
    apply: line => (active && meeting ? applyProvenance(line, provenanceOf(meeting)) : line),
    added: () => setDroppedKey(null),
  };
}
