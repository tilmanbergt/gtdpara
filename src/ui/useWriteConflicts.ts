/**
 * Mounted once (App.tsx): shows the open "which version wins?" question of a
 * save that met an outside edit to the same part of a data file
 * (storage/writeConflicts.ts, docs/dev/history/technical-design-quality-hardening.md
 * §3.2) in the status slot. Neither answer is preselected; ✕ counts as "Use
 * the file", the choice that writes nothing.
 */
import {useEffect, useSyncExternalStore} from 'react';
import {writeConflictText} from '../domain/fileChangeText';
import {
  answerWriteConflict,
  getWriteConflict,
  installWriteConflictUi,
  subscribeWriteConflicts,
} from '../storage/writeConflicts';
import {useStatus} from './status/StatusProvider';
import {StatusMessage} from './status/types';

export function useWriteConflicts(): void {
  useEffect(() => installWriteConflictUi(), []);
  const conflict = useSyncExternalStore(subscribeWriteConflicts, getWriteConflict);
  let message: StatusMessage | null = null;
  if (conflict) {
    const {text, detail} = writeConflictText(conflict.fileName, conflict.parts);
    message = {
      kind: 'confirm',
      text,
      detail,
      scope: 'global',
      actions: [
        {label: 'Use mine', onPress: () => answerWriteConflict(conflict.id, 'mine')},
        {label: 'Use the file', onPress: () => answerWriteConflict(conflict.id, 'file')},
      ],
      onCancel: () => answerWriteConflict(conflict.id, 'file'),
    };
  }
  useStatus('app.writeConflict', message);
}
