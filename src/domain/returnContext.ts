/**
 * Pure decision logic for "which page does the plugin land on when it is
 * (re)opened" - docs/dev/history/technical-design-return-to-origin.md. No RN/SDK imports
 * (domain/ convention, design-overview.md §3); the mutable "last note the
 * plugin opened" slot itself lives in storage/returnRecord.ts, and App.tsx's
 * reorient() is the only caller of decideLanding().
 *
 * The rule: if the note that is open right now is the note this plugin last
 * opened itself (via supernote/fileSystem.ts's openPath), the user is just
 * coming back from a quick look/jotting - so the plugin RESUMES, i.e. leaves
 * its screen exactly as it was left. Anything else means the user moved on
 * manually, and the older behavior applies unchanged: the note's enclosing
 * Project/Area, else Daily.
 */
import {EnclosingItem, findEnclosingItem, ResolvedParaPaths} from './settings';

/** What the plugin remembers about the last file it opened itself. */
export interface ReturnRecord {
  /** normalizeNotePath() of the path handed to openFile. */
  path: string;
  /** Date.now() at the moment of opening. */
  openedAt: number;
}

/**
 * A record older than this is treated as invalid (checked at reopen time):
 * a note left open for many hours - or overnight, when a still-mounted
 * Daily/Week would otherwise show yesterday's data - is not "a quick look"
 * any more.
 */
export const RETURN_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Makes two spellings of the same absolute Android path comparable: collapses
 * repeated slashes, drops trailing slashes, and maps the common aliases of
 * the primary shared-storage root (/sdcard, /storage/self/primary) onto
 * /storage/emulated/0 (the form settings.ts's default baseRoot uses).
 * Deliberately does NOT lowercase - what getCurrentFilePath returns for the
 * same file is expected to match in case; App.tsx logs both raw values on
 * every reopen so a real-device mismatch is visible immediately.
 */
export function normalizeNotePath(path: string): string {
  return path
    .trim()
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
    .replace(/^\/(?:sdcard|storage\/self\/primary|mnt\/sdcard)(?=\/|$)/, '/storage/emulated/0');
}

/** True when `record` exists, is younger than the TTL, and names exactly the note that is open now. */
export function isRecordValid(
  record: ReturnRecord | null,
  currentPath: string | null,
  nowMs: number,
): boolean {
  if (!record || !currentPath) return false;
  if (nowMs - record.openedAt >= RETURN_TTL_MS) return false;
  return normalizeNotePath(currentPath) === record.path;
}

export type Landing =
  /** Focus mode is on: always lands back on it (technical-design-now-focus-mode.md §4). Record untouched. */
  | {kind: 'focus'}
  /**
   * Leave the tab shell exactly as it is. `enclosing` is the current note's
   * Project/Area (null if it isn't inside one): App.tsx uses it to point the
   * Current tab there, but only when that tab isn't the one on screen -
   * changing what is displayed would defeat the point of resuming.
   */
  | {kind: 'resume'; enclosing: EnclosingItem | null}
  /** Existing behavior: jump to the current note's Project/Area. `clearRecord`: a stale/mismatching record existed and should be dropped. */
  | {kind: 'item'; item: EnclosingItem; clearRecord: boolean}
  /** Existing behavior: Daily. */
  | {kind: 'daily'; clearRecord: boolean};

export interface LandingInput {
  focusModeActive: boolean;
  /** Result of getCurrentNotePath(): the note/doc open right now, or null. */
  currentPath: string | null;
  record: ReturnRecord | null;
  paths: ResolvedParaPaths;
  nowMs: number;
}

/**
 * Landing priority (Lasso capture is handled before this is ever called):
 * focus mode > resume > enclosing Project/Area > Daily. `clearRecord` is true
 * exactly when a record existed but did not match (different note, or
 * expired) - that is what makes "navigated elsewhere manually" permanent, so
 * returning to the old note by hand later does not resurrect it.
 */
export function decideLanding(input: LandingInput): Landing {
  const {focusModeActive, currentPath, record, paths, nowMs} = input;
  if (focusModeActive) return {kind: 'focus'};

  const enclosing = currentPath ? findEnclosingItem(paths, currentPath) : null;
  if (isRecordValid(record, currentPath, nowMs)) return {kind: 'resume', enclosing};

  const clearRecord = record !== null;
  if (enclosing) return {kind: 'item', item: enclosing, clearRecord};
  return {kind: 'daily', clearRecord};
}
