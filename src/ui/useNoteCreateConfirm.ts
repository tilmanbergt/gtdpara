/**
 * Status-slot confirm before a Todo/Meeting note is created, recreated or
 * linked (docs/dev/technical-design-split-by-tag.md §3.5). Every screen with
 * note icons passes the returned callback to
 * `openOrCreateMeetingNote`/`openOrCreateTodoNote` as `confirmCreate`.
 * A thin wrapper over useStatusConfirm (same one-at-a-time and
 * ✕-on-hide/unmount rules).
 */
import {useCallback} from 'react';
import {noteCreationConfirmText} from '../domain/fileChangeText';
import {NoteCreationPlan} from '../domain/noteCreationPlan';
import {displayPath} from '../supernote/fileSystem';
import {useStatusConfirm} from './useStatusConfirm';

export function useNoteCreateConfirm(name: string): (plan: NoteCreationPlan) => Promise<boolean> {
  const confirm = useStatusConfirm(name);
  return useCallback(
    (plan: NoteCreationPlan) => confirm(noteCreationConfirmText(plan, displayPath(plan.absolutePath))),
    [confirm],
  );
}
