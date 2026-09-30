/**
 * In-memory slot for "the last file the plugin opened itself" - the input to
 * domain/returnContext.ts's decideLanding() (docs/dev/technical-design-return-to-
 * origin.md). Memory-only on purpose (design decision D3, 2026-09-19): the
 * whole feature is about resuming a still-alive plugin instance's screen
 * state, and a fresh process has no such state to return to, so a persisted
 * record would have nothing to resume anyway. Same lifetime as
 * storage/dataCache.ts's cache and fileSystem.ts's remembered launch path:
 * the JS process.
 */
import {normalizeNotePath, ReturnRecord} from '../domain/returnContext';

let record: ReturnRecord | null = null;

export function getReturnRecord(): ReturnRecord | null {
  return record;
}

/**
 * Remembers `path` as the last file the plugin opened (replacing any earlier
 * record - one slot only) and returns an undo function that puts the previous
 * record back, provided nothing has replaced this one in the meantime. The
 * caller (openPath, via its observer) uses it when the host refuses to open
 * the file, so a failed open never disturbs an earlier valid record.
 */
export function recordPluginOpen(path: string): () => void {
  const previous = record;
  const mine: ReturnRecord = {path: normalizeNotePath(path), openedAt: Date.now()};
  record = mine;
  return () => {
    if (record === mine) record = previous;
  };
}

export function clearReturnRecord(): void {
  record = null;
}
