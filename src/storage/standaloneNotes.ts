/**
 * Creates a standalone, unlinked .note file - the "Note" mini-tab in
 * ui/QuickAddWidget.tsx (memory: feature_standalone_note_quickadd). Distinct
 * from storage/noteLinks.ts's createLinkedNote: a linked note is tied to a
 * Task/Meeting, always lives in a fixed "Todos"/"Meetings" subfolder, and is
 * tracked on that Task/Meeting's `notePath`. A standalone note is not tied to
 * anything - it's created wherever the Files pane happens to be browsing
 * (any folder under the item's own Project-/Area-root, `folderPath` below),
 * and has no representation at all in project.txt/area.txt.
 *
 * Tags are real Supernote page-keywords (supernote/fileSystem.ts's
 * insertKeyWord), not this app's own `#context` markdown-tag convention -
 * the caller (QuickAddWidget) has already parsed `#tag` tokens out of the
 * typed title and hands them here as a plain string array; `title` is
 * already the clean, tag-stripped text.
 */
import {GtdParaSettings} from '../domain/settings';
import {createNote, insertKeyWord, listFolderEntries} from '../supernote/fileSystem';
import {getNoteTemplate, sanitizeFileNameComponent} from './noteLinks';
import {log} from '../utils/log';

/**
 * Creates `<folderPath>/<title>.note`, tagged with `tags` on page 0. Always
 * gets a blank background (`storage/noteLinks.ts`'s `getNoteTemplate`) -
 * standalone notes aren't wired through `resolveNoteTemplate`/
 * `TagRule` at all (Phase 4, not yet built), unlike linked
 * Todo/Meeting notes. `settings` is threaded through unused today, kept as
 * a parameter rather than dropped - the obvious hook for a future
 * per-context standalone-note background, same as `getNoteTemplate`'s own
 * doc comment flags. Deliberately does NOT auto-number on a name collision
 * the way createLinkedNote does (" (2)", " (3)", ...) - a standalone note's
 * title is the only thing identifying it, so a collision throws and the
 * caller shows an inline error asking for a different title instead of
 * silently picking one (feature_standalone_note_quickadd.md's decided
 * requirement).
 */
export async function createStandaloneNote(
  folderPath: string,
  title: string,
  tags: string[],
  _settings: GtdParaSettings,
): Promise<void> {
  const cleanTitle = sanitizeFileNameComponent(title);
  const normalizedFolder = folderPath.replace(/\/+$/, '');

  const existing = await listFolderEntries(normalizedFolder);
  const existingNames = new Set(existing.map(entry => entry.name.toLowerCase()));
  const fileName = `${cleanTitle}.note`;
  if (existingNames.has(fileName.toLowerCase())) {
    throw new Error(`A note named "${cleanTitle}" already exists here - choose a different title.`);
  }

  const absolutePath = `${normalizedFolder}/${fileName}`;
  await createNote(absolutePath, getNoteTemplate(), true);

  for (const tag of tags) {
    await insertKeyWord(absolutePath, 0, tag);
  }

  log('createStandaloneNote: done', absolutePath, tags);
}
