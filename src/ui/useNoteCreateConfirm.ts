/**
 * Status-slot confirm before a Todo/Meeting note is created, recreated or
 * linked (docs/dev/history/technical-design-split-by-tag.md §3.5). Every screen with
 * note icons passes the returned callback to
 * `openOrCreateMeetingNote`/`openOrCreateTodoNote` as `confirmCreate`.
 * When more than one setup matches, a second button offers the best other
 * place (docs/dev/history/technical-design-note-setups.md §4.4); the result
 * is the chosen place's index, `null` on ✕. Built on useStatusChoice (same
 * one-at-a-time and ✕-on-hide/unmount rules).
 */
import {useCallback} from 'react';
import {noteChoiceText} from '../domain/fileChangeText';
import {NoteCreateConfirm, NoteCreationPlan} from '../domain/noteCreationPlan';
import {displayPath} from '../supernote/fileSystem';
import {useStatusChoice} from './useStatusChoice';

export function useNoteCreateConfirm(name: string): NoteCreateConfirm {
  const choose = useStatusChoice(name);
  return useCallback((plan: NoteCreationPlan) => choose(noteChoiceText(plan, displayPath(plan.absolutePath))), [choose]);
}
