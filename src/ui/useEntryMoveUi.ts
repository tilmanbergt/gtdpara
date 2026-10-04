/**
 * The screen side of storage/entryMove.ts's moveEntryWithNote: a status-slot
 * confirm (useStatusConfirm) and a success message that stays until ✕, the
 * screen is left or another move starts (docs/dev/technical-design-files-0.6.md §3.4).
 */
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {ConfirmText} from '../domain/fileChangeText';
import {EntryMoveUi} from '../storage/entryMove';
import {useOnScreenHide} from './screenActivity';
import {useStatusApi} from './status/StatusProvider';
import {useStatusConfirm} from './useStatusConfirm';

let nextInstance = 0;

export function useEntryMoveUi(name: string): EntryMoveUi {
  const doneId = useRef(`${name}.moved.${++nextInstance}`).current;
  const statusApi = useStatusApi();
  const confirmMove = useStatusConfirm(`${name}.move`);

  const clearDone = useCallback(() => statusApi.clear(doneId), [doneId, statusApi]);
  useEffect(() => clearDone, [clearDone]);
  useOnScreenHide(clearDone);

  const confirm = useCallback(
    (text: ConfirmText) => {
      clearDone();
      return confirmMove(text);
    },
    [clearDone, confirmMove],
  );
  const done = useCallback(
    (text: string) => statusApi.show(doneId, {kind: 'success', text, onDismiss: clearDone}),
    [clearDone, doneId, statusApi],
  );
  return useMemo(() => ({confirm, done}), [confirm, done]);
}
