/**
 * A confirm in the status slot (docs/dev/history/technical-design-status-slot.md),
 * as a Promise: resolves `true` on the confirm button, `false` on ✕.
 * Generalized from useNoteCreateConfirm (docs/dev/history/technical-design-files-0.6.md
 * §3.4), which now wraps it.
 *
 * Only one confirm per hook at a time: a second request while one is showing
 * resolves the earlier one `false` first (nothing is left waiting), then
 * shows the new one. Unmounting the screen, or hiding its kept tab, also
 * resolves a pending confirm `false` (and removes it from the slot). `name`
 * is made unique per component instance, so a screen mounted twice gets two
 * separate confirms.
 */
import {useCallback, useEffect, useRef} from 'react';
import {ConfirmText} from '../domain/fileChangeText';
import {useOnScreenHide} from './screenActivity';
import {useStatusApi} from './status/StatusProvider';

let nextInstance = 0;

export function useStatusConfirm(name: string): (text: ConfirmText) => Promise<boolean> {
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
    ({text, detail, actionLabel}: ConfirmText) => {
      settle(false);
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
