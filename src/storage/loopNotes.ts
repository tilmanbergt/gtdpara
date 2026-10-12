/**
 * The loop note (docs/dev/history/technical-design-loops.md §4.4): one note
 * per loop, in its owner's own folder, named from its Loop rule
 * (storage/loops.ts's `loopNoteName`).
 *
 * - Page 1 is the loop's own page: created with the note, keyword
 *   `loop <kind>/<name>`, filled from the Loop rule's pieces (the caller,
 *   storage/meetingNoteContent.ts, fills it).
 * - A meeting's or todo's first note goes into its loop's note as a page of
 *   its own (`loopNoteTarget`, used by storage/itemNotePlan.ts) when the
 *   item carries the tag of an active loop of its file - unless the rule
 *   that decides its note matched through another tag (a thread rule on
 *   `#jf`, say): that rule's note wins. A default rule, or a rule on the
 *   loop's kind, leaves the page to the loop note; its pieces still fill the
 *   page.
 */
import {findLoopLine, LoopLine} from '../domain/loopsSection';
import {LoopRef, loopOf, loopsOfTags} from '../domain/loops';
import {GtdParaSettings} from '../domain/settings';
import {TagRule, tagMatchesRuleTag} from '../domain/tagRules';
import {fileExists, insertKeyWord} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {findCachedItem} from './dataCache';
import {getLoopKinds} from './loopKinds';
import {loopNoteName} from './loops';
import {resolveNoteBackgroundTemplate} from './noteLinks';
import {ensureSharedNoteFile} from './sharedNotePages';

export interface LoopNoteTarget {
  loop: LoopRef;
  line: LoopLine;
  /** The note's base name (no folder, no ".note"). */
  fileName: string;
}

/** Page 1's keyword. */
export function loopPageKeyword(tag: string): string {
  return `loop ${tag}`;
}

/** Whether `rule` matched `tags` through a tag that is not a loop tag. */
function matchedThroughOtherTag(rule: TagRule, tags: readonly string[], kinds: readonly string[]): boolean {
  if (rule.isDefault) return false;
  const ruleTags = rule.tags.map(t => t.toLowerCase());
  return tags.some(raw => {
    const tag = raw.toLowerCase();
    return ruleTags.some(ruleTag => tagMatchesRuleTag(tag, ruleTag)) && loopOf(tag, kinds) === null;
  });
}

/** The loop note a new note of an item in `itemPath` with `tags` goes into, or null (see the module doc comment). */
export function loopNoteTarget(itemPath: string, tags: readonly string[], rule: TagRule | null): LoopNoteTarget | null {
  const kindsState = getLoopKinds();
  if (kindsState.kinds.length === 0) return null;
  if (rule && matchedThroughOtherTag(rule, tags, kindsState.kinds)) return null;
  const item = findCachedItem(itemPath);
  if (!item) return null;
  for (const loop of loopsOfTags(tags.map(t => t.toLowerCase()), kindsState.kinds)) {
    const line = findLoopLine(item.loops, loop.tag);
    if (line && line.status === 'active') {
      log('LoopNotes: plan', loop.kind);
      return {loop, line, fileName: loopNoteName(kindsState, loop, line.mainDate)};
    }
  }
  return null;
}

/** The loop of `tag` in `ownerPath` with its note's name and Loop rule; throws when it has no line. */
export function loopNoteOf(ownerPath: string, tag: string): LoopNoteTarget & {absolutePath: string; rule: TagRule | null} {
  const kindsState = getLoopKinds();
  const item = findCachedItem(ownerPath);
  const loop = loopOf(tag, kindsState.kinds);
  const line = item && loop ? findLoopLine(item.loops, loop.tag) : undefined;
  if (!item || !loop || !line) throw new Error(`Loop ${tag} has no line here.`);
  const fileName = loopNoteName(kindsState, loop, line.mainDate);
  return {loop, line, fileName, absolutePath: `${item.path.replace(/\/+$/, '')}/${fileName}.note`, rule: kindsState.rules[loop.kind] ?? null};
}

/**
 * Creates the loop note with its first page when it is missing; true when
 * it was created (page 1 then needs filling).
 */
export async function ensureLoopNoteFile(ownerPath: string, target: LoopNoteTarget, settings: GtdParaSettings): Promise<boolean> {
  const absolutePath = `${ownerPath.replace(/\/+$/, '')}/${target.fileName}.note`;
  if (await fileExists(absolutePath)) return false;
  await ensureSharedNoteFile(ownerPath, target.fileName, resolveNoteBackgroundTemplate(settings, 'loop', [target.loop.tag]));
  await insertKeyWord(absolutePath, 0, loopPageKeyword(target.loop.tag));
  log('LoopNotes: created', target.loop.kind);
  return true;
}
