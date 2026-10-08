/**
 * One-shot requests a screen sends into Quick Add's create drafts
 * (ui/QuickAddWidget.tsx): `prefill` (text appended to the Todo or Meeting
 * draft, docs/dev/history/technical-design-gmail-body-select.md) and
 * `meetingSeed` (a whole new meeting draft, "+ Next <type>",
 * docs/dev/history/technical-design-tending-threads.md §3.6).
 *
 * Each request acts exactly when its `nonce` changes - a fresh object with the
 * same nonce does nothing, so a caller can keep it in state - and at most once
 * per nonce, even across a remount. A prefill that arrives while an edit is
 * open is dropped (the tabs are locked then); a meeting seed waits until the
 * edit has closed (the overview ends its edit and sends the seed in one tap).
 */
import {useEffect, useRef} from 'react';
import {MeetingSeedFields} from '../../domain/nextMeeting';

export interface DraftPrefill {
  kind: 'task' | 'meeting';
  text: string;
  nonce: number;
}

export interface MeetingSeed {
  fields: MeetingSeedFields;
  nonce: number;
}

interface Appliers {
  /** Appends `addition` (whitespace already collapsed, never empty) to the draft of `kind`. */
  text: (kind: 'task' | 'meeting', addition: string) => void;
  /** Replaces the meeting draft with `fields` and shows the Meeting tab. */
  seed: (fields: MeetingSeedFields) => void;
}

function useOnce<T extends {nonce: number}>(
  request: T | null | undefined,
  isEditing: boolean,
  waitForEdit: boolean,
  apply: (request: T) => void,
): void {
  const handledRef = useRef<number | null>(request ? request.nonce : null);
  useEffect(() => {
    if (!request || request.nonce === handledRef.current) return;
    if (isEditing && waitForEdit) return;
    handledRef.current = request.nonce;
    if (!isEditing) apply(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce, waitForEdit && isEditing]);
}

export function useDraftRequests(
  prefill: DraftPrefill | null | undefined,
  meetingSeed: MeetingSeed | null | undefined,
  isEditing: boolean,
  apply: Appliers,
): void {
  useOnce(prefill, isEditing, false, request => {
    const addition = request.text.replace(/\s+/g, ' ').trim();
    if (addition) apply.text(request.kind, addition);
  });
  useOnce(meetingSeed, isEditing, true, request => apply.seed(request.fields));
}
