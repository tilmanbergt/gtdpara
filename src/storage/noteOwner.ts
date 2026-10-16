/**
 * The Project or Area a note belongs to, for the `{name}` and `{abbr}`
 * placeholders of a note name (docs/dev/history/technical-design-note-setups-finish.md
 * §1.2): its folder name and its abbreviation from the cache.
 */
import {NoteOwnerNames} from '../domain/sharedNotePages';
import {findCachedItem} from './dataCache';

/** `{name}`/`{abbr}` of the item at `itemPath`; the abbreviation is `''` when it has none or isn't cached. */
export function noteOwnerNames(itemPath: string): NoteOwnerNames {
  const trimmed = itemPath.replace(/\/+$/, '');
  return {itemName: trimmed.slice(trimmed.lastIndexOf('/') + 1), itemAbbrev: findCachedItem(itemPath)?.abbrev ?? ''};
}
