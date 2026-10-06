/**
 * One error slot for a screen's actions (docs/dev/technical-design-cleanup-0.5.md
 * S4): the error text, shown in the central status slot under `statusName`
 * (ui/status/StatusProvider.tsx's useErrorStatus) and logged as
 * `logError(logPrefix, message)`.
 *
 * - `run(fn, logPrefix?)`: clears the error, runs `fn`, and on failure logs and
 *   shows it. Never rejects - the error is handled here. `logPrefix` overrides
 *   the hook's prefix for this one action.
 * - `runSave(fn, logPrefix?)`: the same, resolving true on success and false on
 *   failure (Quick Add's save-then-switch needs to know, ui/useEditFlush.ts).
 */
import {useCallback, useMemo, useState} from 'react';
import {errorMessage} from '../utils/errorMessage';
import {logError} from '../utils/log';
import {useErrorStatus} from './status/StatusProvider';

export interface ActionError {
  error: string | null;
  clear: () => void;
  run: (fn: () => Promise<void>, logPrefix?: string) => Promise<void>;
  runSave: (fn: () => Promise<void>, logPrefix?: string) => Promise<boolean>;
}

export function useActionError(statusName: string, logPrefix: string): ActionError {
  const [error, setError] = useState<string | null>(null);
  const clear = useCallback(() => setError(null), []);
  useErrorStatus(statusName, error, clear);

  const runSave = useCallback(
    async (fn: () => Promise<void>, actionLogPrefix?: string): Promise<boolean> => {
      setError(null);
      try {
        await fn();
        return true;
      } catch (e) {
        const message = errorMessage(e);
        logError(actionLogPrefix ?? logPrefix, message);
        setError(message);
        return false;
      }
    },
    [logPrefix],
  );
  const run = useCallback(
    (fn: () => Promise<void>, actionLogPrefix?: string): Promise<void> => runSave(fn, actionLogPrefix).then(() => undefined),
    [runSave],
  );

  return useMemo(() => ({error, clear, run, runSave}), [error, clear, run, runSave]);
}
