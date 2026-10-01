/**
 * Moving the Inbox from the base root into its own folder under Areas
 * (docs/dev/technical-design-inbox-as-area.md §3.3) - the pure half: which
 * operations to run, whether the move is blocked, and how links into the
 * moved folders are rewritten. storage/inboxMigration.ts runs the result.
 *
 * Trigger: an `Inbox.txt` at the base root. `Inbox.txt` is always moved
 * LAST, so as long as it is still at the root the move is not finished and
 * a rerun resumes it; once it is gone, nothing at the root is touched again
 * (a `Todos`/`Meetings` folder created there later by hand stays put).
 * Every op is planned from the current file state, so an op that already
 * ran in an earlier, interrupted run simply no longer appears.
 */
import {INBOX_FILE_NAME, AREA_FILE_NAME, PROJECT_FILE_NAME} from './types';

/** The note folders that move with the Inbox (storage/noteLinks.ts's TODOS_SUBFOLDER/MEETINGS_SUBFOLDER). */
export const INBOX_NOTE_FOLDERS = ['Todos', 'Meetings'] as const;

/** Just what the planner needs from a folder listing - domain stays free of supernote/ types. */
export interface ListedEntry {
  name: string;
  isFolder: boolean;
}

export interface InboxMigrationInput {
  /** Absolute base root (where the Inbox lived up to 0.1.0). */
  base: string;
  /** Absolute target folder (`<areas>/<inboxFolder>`). */
  inboxFolder: string;
  /** Listing of the base root. */
  rootEntries: ListedEntry[];
  /** Listing of the target folder - empty when it doesn't exist yet. */
  targetEntries: ListedEntry[];
  /** File/folder names inside root Todos/Meetings and target Todos/Meetings (empty when missing). */
  rootNoteEntries: Record<(typeof INBOX_NOTE_FOLDERS)[number], string[]>;
  targetNoteEntries: Record<(typeof INBOX_NOTE_FOLDERS)[number], string[]>;
}

export type InboxMigrationBlockReason = 'areaNameClash' | 'twoInboxFiles' | 'noteNameClash';

export type InboxMigrationOp =
  | {id: string; kind: 'ensureFolder'; path: string}
  | {id: string; kind: 'moveFolderMerge'; from: string; to: string}
  | {id: string; kind: 'rewriteLinks'}
  | {id: string; kind: 'moveFile'; from: string; to: string};

export type InboxMigrationPlan =
  | {state: 'none'}
  | {state: 'blocked'; reason: InboxMigrationBlockReason; detail: string}
  | {state: 'ready'; ops: InboxMigrationOp[]};

function has(entries: ListedEntry[], name: string, isFolder: boolean): boolean {
  return entries.some(e => e.name === name && e.isFolder === isFolder);
}

function trimSlashes(path: string): string {
  return path.replace(/\/+$/, '');
}

export function planInboxMigration(input: InboxMigrationInput): InboxMigrationPlan {
  const base = trimSlashes(input.base);
  const target = trimSlashes(input.inboxFolder);
  if (!has(input.rootEntries, INBOX_FILE_NAME, false)) return {state: 'none'};

  if (has(input.targetEntries, AREA_FILE_NAME, false) || has(input.targetEntries, PROJECT_FILE_NAME, false)) {
    return {state: 'blocked', reason: 'areaNameClash', detail: `${target} already holds a Project/Area file`};
  }
  if (has(input.targetEntries, INBOX_FILE_NAME, false)) {
    return {state: 'blocked', reason: 'twoInboxFiles', detail: `${INBOX_FILE_NAME} exists in both ${base} and ${target}`};
  }
  for (const folder of INBOX_NOTE_FOLDERS) {
    if (!has(input.rootEntries, folder, true)) continue;
    const existing = new Set(input.targetNoteEntries[folder]);
    const clash = input.rootNoteEntries[folder].find(name => existing.has(name));
    if (clash !== undefined) {
      return {state: 'blocked', reason: 'noteNameClash', detail: `${folder}: a file with the same name already exists in ${target}/${folder}`};
    }
  }

  const ops: InboxMigrationOp[] = [{id: 'ensureFolder', kind: 'ensureFolder', path: target}];
  for (const folder of INBOX_NOTE_FOLDERS) {
    if (has(input.rootEntries, folder, true)) {
      ops.push({id: `move:${folder}`, kind: 'moveFolderMerge', from: `${base}/${folder}`, to: `${target}/${folder}`});
    }
  }
  ops.push({id: 'rewriteLinks', kind: 'rewriteLinks'});
  ops.push({id: 'move:inbox', kind: 'moveFile', from: `${base}/${INBOX_FILE_NAME}`, to: `${target}/${INBOX_FILE_NAME}`});
  return {state: 'ready', ops};
}

/** `<areas>/<inboxFolder>` relative to the base root, e.g. "2 Areas/0 Inbox" - the prefix base-relative linkedFiles get. */
export function inboxFolderRelativeToBase(base: string, inboxFolder: string): string {
  const prefix = `${trimSlashes(base)}/`;
  const folder = trimSlashes(inboxFolder);
  return folder.startsWith(prefix) ? folder.slice(prefix.length) : folder;
}

/** A base-relative `linkedFile` pointing into the moved root Todos/Meetings, rewritten to the new place; anything else unchanged. */
export function rewriteMovedLinkedFile(linkedFile: string, inboxRelative: string): string {
  for (const folder of INBOX_NOTE_FOLDERS) {
    if (linkedFile.startsWith(`${folder}/`)) return `${inboxRelative}/${linkedFile}`;
  }
  return linkedFile;
}

/** An ABSOLUTE `notePath` (lasso "link to source note") into the moved root Todos/Meetings, rewritten; relative notePaths and anything else unchanged. */
export function rewriteMovedNotePath(notePath: string, base: string, inboxFolder: string): string {
  if (!notePath.startsWith('/')) return notePath;
  const root = trimSlashes(base);
  for (const folder of INBOX_NOTE_FOLDERS) {
    const prefix = `${root}/${folder}/`;
    if (notePath.startsWith(prefix)) return `${trimSlashes(inboxFolder)}/${folder}/${notePath.slice(prefix.length)}`;
  }
  return notePath;
}

/** Names left at the base root from the old Inbox location - for the Integrity Check (§3.6). */
export function legacyInboxLeftovers(rootEntries: ListedEntry[]): string[] {
  const found: string[] = [];
  if (has(rootEntries, INBOX_FILE_NAME, false)) found.push(INBOX_FILE_NAME);
  for (const folder of INBOX_NOTE_FOLDERS) {
    if (has(rootEntries, folder, true)) found.push(`${folder}/`);
  }
  return found;
}

/** Where the Inbox effectively is: the new folder unless the move hasn't happened (Inbox.txt still only at the root). */
export function effectiveInboxFolder(base: string, inboxFolder: string, rootHasInboxFile: boolean, targetHasInboxFile: boolean): string {
  if (targetHasInboxFile || !rootHasInboxFile) return trimSlashes(inboxFolder);
  return trimSlashes(base);
}
