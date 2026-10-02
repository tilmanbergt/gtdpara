/**
 * Status-slot confirm before a Todo/Meeting note is created, recreated or
 * linked (docs/dev/technical-design-split-by-tag.md §3.5). Every screen with
 * note icons passes the returned callback to
 * `openOrCreateMeetingNote`/`openOrCreateTodoNote` as `confirmCreate`.
 *
 * Resolves `true` on the confirm button, `false` on ✕. Only one confirm per
 * screen at a time: a second note-icon tap while one is showing resolves the
 * earlier one `false` first (nothing is left waiting), then shows the new
 * one. Unmounting the screen, or hiding its kept tab, also resolves a
 * pending confirm `false` (and removes it from the slot), like a pick armed
 * in the status slot ends on leaving the tab. `name` is made unique per
 * component instance, so a screen mounted twice gets two separate confirms.
 */
import {useCallback, useEffect, useRef} from 'react';
import {noteCreationConfirmText} from '../domain/fileChangeText';
import {NoteCreationPlan} from '../domain/noteCreationPlan';
import {displayPath} from '../supernote/fileSystem';
import {useOnScreenHide} from './screenActivity';
import {useStatusApi} from './status/StatusProvider';

let nextInstance = 0;

export function useNoteCreateConfirm(name: string): (plan: NoteCreationPlan) => Promise<boolean> {
  const id = useRef(`${name}.${++nextInstance}`).current;
  const statusApi = useStatusApi();
  const pendingRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback(
    (ok: boolean) => {
      const resolve = pendingRef.current;
      pendingRef.current = null;
      statusApi.clear(id);
      resolve?.(ok);
    },
    [id, statusApi],
  );

  useEffect(() => () => settle(false), [settle]);
  useOnScreenHide(() => settle(false));

  return useCallback(
    (plan: NoteCreationPlan) => {
      settle(false);
      const {text, detail, actionLabel} = noteCreationConfirmText(plan, displayPath(plan.absolutePath));
      return new Promise<boolean>(resolve => {
        pendingRef.current = resolve;
        statusApi.show(id, {
          kind: 'confirm',
          text,
          detail,
          actions: [{label: actionLabel, primary: true, onPress: () => settle(true)}],
          onCancel: () => settle(false),
        });
      });
    },
    [id, settle, statusApi],
  );
}
