/**
 * A confirm in the status slot (docs/dev/history/technical-design-status-slot.md),
 * as a Promise: resolves `true` on the confirm button, `false` on ✕. The
 * one-button form of useStatusChoice, with its one-at-a-time and
 * ✕-on-hide/unmount rules.
 */
import {useCallback} from 'react';
import {ConfirmText} from '../domain/fileChangeText';
import {useStatusChoice} from './useStatusChoice';

export function useStatusConfirm(name: string): (text: ConfirmText) => Promise<boolean> {
  const choose = useStatusChoice(name);
  return useCallback(
    async ({text, detail, actionLabel}: ConfirmText) => (await choose({text, detail, labels: [actionLabel]})) === 0,
    [choose],
  );
}
