/**
 * The loop note's icon (docs/dev/history/technical-design-loops.md §4.4):
 * opens the loop's note at its first page, or - after a confirm in the
 * status slot - creates it from the Loop setup. Errors show in the status
 * slot.
 */
import {useCallback} from 'react';
import {openOrCreateLoopNote} from '../storage/meetingNoteContent';
import {loadSettings} from '../storage/settingsStorage';
import {useActionError} from './useActionError';
import {useNoteCreateConfirm} from './useNoteCreateConfirm';

export function useLoopNote(name: string): (ownerPath: string, tag: string) => void {
  const confirm = useNoteCreateConfirm(`${name}.loopNote`);
  const action = useActionError(`${name}.loopNoteError`, `${name}: loop note failed`);
  const {run} = action;
  return useCallback(
    (ownerPath: string, tag: string) => {
      run(async () => {
        await openOrCreateLoopNote(ownerPath, tag, await loadSettings(), confirm);
      });
    },
    [run, confirm],
  );
}
