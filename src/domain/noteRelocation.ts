/**
 * What happens to a todo's or meeting's note when the entry moves to another
 * Project, Area or the Inbox (docs/dev/technical-design-files-0.6.md §3.4).
 * Pure: the caller has already classified the stored notePath
 * (storage/noteLinks.ts's classifyNotePath, which checks the disk).
 *
 * - none: no note, or an absolute link (a lasso source note, the user's own
 *   notebook) - nothing to do, the link keeps working from anywhere.
 * - missing: an own note whose file is gone - nothing is moved and the
 *   notePath stays; the note icon offers to create it again in the new place.
 * - own: the note file moves along, to the same relative place in the target
 *   folder (`Todos/x.note` -> `<target>/Todos/x.note`, a free name if taken).
 * - shared: the page stays in the shared note; the notePath becomes the same
 *   anchor with the file's absolute path, so it still opens that page.
 */
import {joinNotePath} from './sharedNotePages';

/** Structurally the same as storage/noteLinks.ts's NotePathClass (this file stays storage-free). */
export type ClassifiedNotePath =
  | {kind: 'none'}
  | {kind: 'own'; absolutePath: string; exists: boolean; isAbsoluteLink: boolean}
  | {kind: 'shared'; anchor: {filePath: string; keyword: string}; absolutePath: string; exists: boolean};

export type NoteRelocation =
  | {kind: 'none'}
  | {kind: 'missing'}
  | {
      kind: 'own';
      /** The note's current absolute path. */
      from: string;
      /** The folder the note moves into (created if missing). */
      toFolder: string;
      /** File name without extension, and the extension (".note", or ''), for a collision-free name. */
      stem: string;
      ext: string;
      /** The relative folder part of the stored notePath ("Todos"), '' for none - the new notePath is `<relativeDir>/<name>`. */
      relativeDir: string;
    }
  | {kind: 'shared'; file: string; exists: boolean; newNotePath: string};

function splitName(fileName: string): {stem: string; ext: string} {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return {stem: fileName, ext: ''};
  return {stem: fileName.slice(0, dot), ext: fileName.slice(dot)};
}

/** The plan for `notePath` (stored relative to the source folder) when its entry moves to `targetFolder`. */
export function planNoteRelocation(notePath: string, note: ClassifiedNotePath, targetFolder: string): NoteRelocation {
  if (!notePath || note.kind === 'none') return {kind: 'none'};
  if (note.kind === 'shared') {
    if (note.anchor.filePath.startsWith('/')) return {kind: 'none'}; // already absolute
    return {kind: 'shared', file: note.absolutePath, exists: note.exists, newNotePath: `${note.absolutePath}#${note.anchor.keyword}`};
  }
  if (note.isAbsoluteLink) return {kind: 'none'};
  if (!note.exists) return {kind: 'missing'};
  const slash = notePath.lastIndexOf('/');
  const relativeDir = slash >= 0 ? notePath.slice(0, slash) : '';
  const fileName = slash >= 0 ? notePath.slice(slash + 1) : notePath;
  const target = joinNotePath(targetFolder, notePath);
  const toFolder = target.slice(0, target.lastIndexOf('/'));
  return {kind: 'own', from: note.absolutePath, toFolder, ...splitName(fileName), relativeDir};
}

/** The stored notePath after an own note moved and got `fileName`. */
export function relocatedNotePath(relocation: Extract<NoteRelocation, {kind: 'own'}>, fileName: string): string {
  return relocation.relativeDir ? `${relocation.relativeDir}/${fileName}` : fileName;
}
