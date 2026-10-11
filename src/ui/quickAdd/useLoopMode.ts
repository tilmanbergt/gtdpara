/**
 * What Quick Add does with a todo that is a loop itself
 * (docs/dev/history/technical-design-loops.md §4.1): only a loop tag, plus
 * `#next`/`#now`, a date or a file, and not someday/maybe. Quick Add only
 * relabels its button; the todo is saved the normal way and
 * storage/loops.ts turns it into the loop's line after the save, which also
 * reports it in the status slot.
 *
 * - `add`: creating into an Area or Project whose loop has no line yet -
 *   "+ Add loop", the date field is the main date.
 * - `make`: editing such a todo there - "Make loop".
 * - `exists`: the loop has a line already - creating is disabled (a bare tag
 *   would only be an empty todo); an edit saves as a plain todo.
 * - `none`: everything else, the Inbox included (filing it there later
 *   starts the loop).
 */
import {resolveAbbrevFileTarget} from '../../domain/abbrev';
import {Destination} from '../../domain/destination';
import {loopItselfOfLine, LoopRef} from '../../domain/loops';
import {findLoopLine} from '../../domain/loopsSection';
import {composeTaskText, TaskComposeFields} from '../../domain/quickAddCompose';
import {CachedItem, findCachedItem} from '../../storage/dataCache';
import {useLoopKinds} from '../useLoopKinds';

export type LoopMode = {kind: 'none'} | {kind: 'add' | 'make' | 'exists'; loop: LoopRef};

const NONE: LoopMode = {kind: 'none'};

interface Input {
  /** False outside the Todo tab and in the capture panel. */
  active: boolean;
  fields: TaskComposeFields;
  editing: boolean;
  fixedDestination: Destination;
  /** Quick Add's `editingItemPath` prop: where the edited todo lives, when the screen says so. */
  editingItemPath?: string | null;
  abbrevItems: CachedItem[];
}

export function useLoopMode({active, fields, editing, fixedDestination, editingItemPath, abbrevItems}: Input): LoopMode {
  const {kinds} = useLoopKinds();
  if (!active || kinds.length === 0) return NONE;
  const fixedPath = fixedDestination.type === 'item' ? fixedDestination.path : null;
  // Where the todo is saved: the edited todo's file, or a typed abbreviation's Project/Area, else the screen's own.
  const abbrev = editing ? null : resolveAbbrevFileTarget(fields.text, abbrevItems, fixedPath);
  const ownerPath = editing ? (editingItemPath !== undefined ? editingItemPath : fixedPath) : abbrev ? abbrev.path : fixedPath;
  if (!ownerPath) return NONE;
  const loop = loopItselfOfLine(composeTaskText(fields, abbrev ? abbrev.tag : null), kinds);
  if (!loop) return NONE;
  const owner = findCachedItem(ownerPath);
  if (owner && findLoopLine(owner.loops, loop.tag)) return {kind: 'exists', loop};
  return {kind: editing ? 'make' : 'add', loop};
}
