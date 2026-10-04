/**
 * Old note file names that break Obsidian links (docs/dev/technical-design-
 * files-0.6.md §3.5): before 0.5.0 gtdpara kept `#` (and `[ ] ^`) in note
 * names. Pure planning - storage/fileNameFix.ts finds the references and
 * renames.
 *
 * Renamed (after one confirm, all at once): notes linked by a relative
 * notePath (own note, or the file of a shared page) from a live Project, Area
 * or the Inbox. A shared file referenced by several entries is renamed once
 * and every reference rewritten; the page keyword stays as it is.
 *
 * Report only: absolute links (lasso source notes are the user's own
 * notebooks), files also referenced from an archived item (archived items
 * are left as they are), and Project/Area folder names (renaming one
 * changes the item's identity: `area:` references, focus, abbreviations).
 */
import {invalidFileNameChars, sanitizeFileNameComponent} from './fileName';
import {GtdParaKind} from './types';

/** One entry's link to a note, already resolved against the disk. */
export interface NoteRef {
  itemKind: GtdParaKind;
  itemPath: string;
  inArchive: boolean;
  entityKind: 'task' | 'meeting';
  /** The todo text / meeting title, for the report. */
  entityLabel: string;
  /** The stored notePath. */
  notePath: string;
  /** The note file's absolute path. */
  file: string;
  /** The page keyword when notePath is a shared anchor, else null. */
  keyword: string | null;
}

export interface FileFixRef {
  ref: NoteRef;
  /** The stored notePath after the rename, for the file name `newName` the caller settles on. */
  newNotePath: (newName: string) => string;
}

export interface FileFix {
  /** Absolute path of the file to rename. */
  file: string;
  folder: string;
  oldName: string;
  /** Sanitized name without extension, and the extension - the caller picks a free name from these. */
  newStem: string;
  ext: string;
  /** The characters that made the name unsafe. */
  chars: string[];
  refs: FileFixRef[];
}

export interface ReportOnlyName {
  file: string;
  chars: string[];
  reason: string;
  refs: NoteRef[];
}

function splitName(fileName: string): {stem: string; ext: string} {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return {stem: fileName, ext: ''};
  return {stem: fileName.slice(0, dot), ext: fileName.slice(dot)};
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The stored notePath with its file name replaced, keeping the folder part and the page keyword. */
function rewriteNotePath(ref: NoteRef, newName: string): string {
  const filePart = ref.keyword === null ? ref.notePath : ref.notePath.slice(0, ref.notePath.length - ref.keyword.length - 1);
  const slash = filePart.lastIndexOf('/');
  const dir = slash >= 0 ? filePart.slice(0, slash + 1) : '';
  return `${dir}${newName}${ref.keyword === null ? '' : `#${ref.keyword}`}`;
}

/** Groups `refs` by file and splits the unsafe names into renames and report-only ones. Safe names are dropped. */
export function planFileNameFixes(refs: NoteRef[]): {fixes: FileFix[]; reportOnly: ReportOnlyName[]} {
  const byFile = new Map<string, NoteRef[]>();
  for (const ref of refs) {
    const chars = invalidFileNameChars(splitName(baseName(ref.file)).stem);
    if (chars.length === 0) continue;
    const list = byFile.get(ref.file) ?? [];
    list.push(ref);
    byFile.set(ref.file, list);
  }

  const fixes: FileFix[] = [];
  const reportOnly: ReportOnlyName[] = [];
  for (const [file, fileRefs] of byFile) {
    const oldName = baseName(file);
    const {stem, ext} = splitName(oldName);
    const chars = invalidFileNameChars(stem);
    const absolute = fileRefs.some(r => r.notePath.startsWith('/'));
    const archived = fileRefs.some(r => r.inArchive);
    if (absolute || archived) {
      reportOnly.push({
        file,
        chars,
        reason: absolute ? 'linked by its full path (a note of your own) - rename it by hand if needed' : 'also linked from an archived item - left as it is',
        refs: fileRefs,
      });
      continue;
    }
    fixes.push({
      file,
      folder: file.slice(0, file.lastIndexOf('/')),
      oldName,
      newStem: sanitizeFileNameComponent(stem),
      ext,
      chars,
      refs: fileRefs.map(ref => ({ref, newNotePath: (newName: string) => rewriteNotePath(ref, newName)})),
    });
  }
  return {fixes, reportOnly};
}

/** Project/Area folder names with unsafe characters - report only. */
export function unsafeFolderNames(items: Array<{itemKind: GtdParaKind; itemPath: string; name: string}>): Array<{itemKind: GtdParaKind; itemPath: string; name: string; chars: string[]}> {
  return items
    .filter(item => item.itemKind !== 'inbox')
    .map(item => ({...item, chars: invalidFileNameChars(item.name)}))
    .filter(item => item.chars.length > 0);
}

/** The confirm before renaming: one line, plus up to `maxLines` "old → new" lines and "and k more". */
export function fileNameFixConfirmText(fixes: FileFix[], maxLines = 8): {text: string; detail: string; actionLabel: string} {
  const n = fixes.length;
  const lines = fixes.slice(0, maxLines).map(f => `${f.oldName} → ${f.newStem}${f.ext}`);
  if (n > maxLines) lines.push(`and ${n - maxLines} more`);
  return {
    text: `Rename ${n} file${n === 1 ? '' : 's'} so links work in Obsidian? Their links in your projects and areas are updated.`,
    detail: lines.join('\n'),
    actionLabel: 'Rename',
  };
}

/** The result line after renaming. */
export function fileNameFixDoneText(renamed: number, linksUpdated: number, failed: number): string {
  const base = `Renamed ${renamed} file${renamed === 1 ? '' : 's'} and updated ${linksUpdated} link${linksUpdated === 1 ? '' : 's'}.`;
  return failed > 0 ? `${base} ${failed} could not be renamed - see the log.` : base;
}
