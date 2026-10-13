/**
 * The loop note (docs/dev/history/technical-design-loops.md §4.4): one note
 * per loop, in its owner's own folder, named from its Loop setup's note name
 * (storage/loops.ts's `loopNoteName`).
 *
 * - Page 1 is the loop's own page: created with the note, keyword
 *   `loop <kind>/<name>`, filled from the Loop setup's First page (the
 *   caller, storage/meetingNoteContent.ts, fills it).
 * - A meeting's or todo's first note can go into its loop's note as a page
 *   of its own when the item carries the tag of an active loop of its file:
 *   `activeLoopsOf` lists those loops, domain/noteSetups.ts's
 *   `noteCandidates` decides whether the loop note is the default place
 *   (docs/dev/history/technical-design-note-setups.md §1.2).
 */
import {findLoopLine, LoopLine} from '../domain/loopsSection';
import {LOOP_PAGE_KEYWORD_PREFIX, LoopRef, loopOf, loopsOfTags} from '../domain/loops';
import {layoutFor, NoteSetup, NoteSetupDefaults} from '../domain/noteSetups';
import {NoteOwnerNames} from '../domain/sharedNotePages';
import {fileExists, insertKeyWord} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {findCachedItem} from './dataCache';
import {getLoopKinds} from './loopKinds';
import {loopNoteFileName} from './loops';
import {noteOwnerNames} from './noteOwner';
import {backgroundOf} from './noteLinks';
import {ensureSharedNoteFile} from './sharedNotePages';

export interface LoopNoteTarget {
  loop: LoopRef;
  line: LoopLine;
  /** The note's base name (no folder, no ".note"). */
  fileName: string;
  /** The loop's Loop setup (null when its kind has none any more). */
  setup: NoteSetup | null;
}

/** Page 1's keyword. */
export function loopPageKeyword(tag: string): string {
  return `${LOOP_PAGE_KEYWORD_PREFIX}${tag}`;
}

/** The loops among `tags` with an active line in the item at `itemPath`, in tag order. */
export function activeLoopsOf(itemPath: string, tags: readonly string[], kinds: readonly string[]): Array<{loop: LoopRef; line: LoopLine}> {
  if (kinds.length === 0) return [];
  const item = findCachedItem(itemPath);
  if (!item) return [];
  const out: Array<{loop: LoopRef; line: LoopLine}> = [];
  for (const loop of loopsOfTags(tags.map(t => t.toLowerCase()), kinds)) {
    const line = findLoopLine(item.loops, loop.tag);
    if (line && line.status === 'active') out.push({loop, line});
  }
  return out;
}

/** The note of `loop` (its line `line`) under `setup`, in the Project or Area `owner`. */
export function loopNoteTargetOf(setup: NoteSetup | null, loop: LoopRef, line: LoopLine, owner: NoteOwnerNames): LoopNoteTarget {
  return {loop, line, fileName: loopNoteFileName(setup, loop, line.mainDate, owner), setup};
}

/** The loop of `tag` in `ownerPath` with its note's name and Loop setup; throws when it has no line. */
export function loopNoteOf(ownerPath: string, tag: string): LoopNoteTarget & {absolutePath: string} {
  const kindsState = getLoopKinds();
  const item = findCachedItem(ownerPath);
  const loop = loopOf(tag, kindsState.kinds);
  const line = item && loop ? findLoopLine(item.loops, loop.tag) : undefined;
  if (!item || !loop || !line) throw new Error(`Loop ${tag} has no line here.`);
  const target = loopNoteTargetOf(kindsState.setups[loop.kind] ?? null, loop, line, noteOwnerNames(item.path));
  return {...target, absolutePath: `${item.path.replace(/\/+$/, '')}/${target.fileName}.note`};
}

/**
 * Creates the loop note with its first page when it is missing; true when
 * it was created (page 1 then needs filling).
 */
export async function ensureLoopNoteFile(ownerPath: string, target: LoopNoteTarget, defaults: NoteSetupDefaults): Promise<boolean> {
  const absolutePath = `${ownerPath.replace(/\/+$/, '')}/${target.fileName}.note`;
  if (await fileExists(absolutePath)) return false;
  await ensureSharedNoteFile(ownerPath, target.fileName, backgroundOf(layoutFor(target.setup, 'first', defaults)));
  await insertKeyWord(absolutePath, 0, loopPageKeyword(target.loop.tag));
  log('LoopNotes: created', target.loop.kind);
  return true;
}
