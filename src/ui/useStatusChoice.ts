/**
 * A choice in the status slot (docs/dev/history/technical-design-status-slot.md,
 * docs/dev/history/technical-design-note-setups.md §4.4), as a Promise:
 * resolves the index of the tapped button (0 = the first, primary one) or
 * `null` on ✕. The slot's confirm carries one or two buttons.
 *
 * Only one choice per hook at a time: a second request while one is showing
 * resolves the earlier one `null` first (nothing is left waiting), then
 * shows the new one. Unmounting the screen, or hiding its kept tab, also
 * resolves a pending choice `null` (and removes it from the slot). `name`
 * is made unique per component instance, so a screen mounted twice gets two
 * separate choices. useStatusConfirm is the one-button form of this hook.
 */
import {useCallback, useEffect, useRef} from 'react';
import {useOnScreenHide} from './screenActivity';
import {useStatusApi} from './status/StatusProvider';

export interface StatusChoice {
  text: string;
  detail: string;
  /** The buttons, the first one primary. */
  labels: readonly string[];
}

let nextInstance = 0;

export function useStatusChoice(name: string): (choice: StatusChoice) => Promise<number | null> {
  const id = useRef(`${name}.${++nextInstance}`).current;
  const statusApi = useStatusApi();
  const pendingRef = useRef<((choice: number | null) => void) | null>(null);

  const settle = useCallback(
    (choice: number | null) => {
      const resolve = pendingRef.current;
      pendingRef.current = null;
      statusApi.clear(id);
      resolve?.(choice);
    },
    [id, statusApi],
  );

  useEffect(() => () => settle(null), [settle]);
  useOnScreenHide(() => settle(null));

  return useCallback(
    ({text, detail, labels}: StatusChoice) => {
      settle(null);
      return new Promise<number | null>(resolve => {
        pendingRef.current = resolve;
        statusApi.show(id, {
          kind: 'confirm',
          text,
          detail,
          actions: labels.map((label, index) => ({label, primary: index === 0, onPress: () => settle(index)})),
          onCancel: () => settle(null),
        });
      });
    },
    [id, settle, statusApi],
  );
}
