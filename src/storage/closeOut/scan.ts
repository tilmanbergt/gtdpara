/**
 * Scans a project for the close-out (docs/dev/history/technical-design-project-close-out.md
 * §5.2): every file in its folder (recursive), note page counts, the keyword
 * pages of the shared notes its todos/meetings point into, and the files
 * its todos/meetings link to OUTSIDE the folder. Device I/O only - all
 * classification happens in domain/closeOut/inventory.ts.
 */
import {FileType, OutsideFile, ProjectScan, ScanFile, fileTypeOf} from '../../domain/closeOut/inventory';
import {ResolvedParaPaths} from '../../domain/settings';
import {parseSharedNoteAnchor} from '../../domain/sharedNotePages';
import {Meeting, PROJECT_FILE_NAME, Task} from '../../domain/types';
import {fileExists, listFolderEntries} from '../../supernote/fileSystem';
import {getNotePageCount} from '../../supernote/pdfNative';
import {GMAIL_ATTACHMENTS_SUBFOLDER, GMAIL_EMAILS_SUBFOLDER} from '../gmailAttachments';
import {resolveLinkedFilePath} from '../linkedFiles';
import {readAllKeywords} from '../sharedNotePages';
import {log, logError} from '../../utils/log';
import {errorMessage} from '../../utils/errorMessage';

const MAX_DEPTH = 6;

async function walk(root: string, rel: string, depth: number, out: {relPath: string; name: string; type: FileType}[]): Promise<void> {
  const entries = await listFolderEntries(rel ? `${root}/${rel}` : root);
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isFolder) {
      if (depth < MAX_DEPTH) await walk(root, childRel, depth + 1, out);
      continue;
    }
    if (!rel && e.name === PROJECT_FILE_NAME) continue; // the data file itself becomes the record pages
    out.push({relPath: childRel, name: e.name, type: fileTypeOf(e.name)});
  }
}

async function pageCountOf(absPath: string): Promise<number | null> {
  const r = await getNotePageCount(absPath);
  return r.ok && typeof r.result === 'number' ? r.result : null;
}

export interface ScanItem {
  path: string;
  tasks: Task[];
  meetings: Meeting[];
}

/**
 * `onProgress` gets "Reading <name>" while page counts are read (one host call
 * per note - the slow part on a large project).
 */
export async function scanProject(item: ScanItem, paths: ResolvedParaPaths, onProgress?: (label: string) => void): Promise<ProjectScan> {
  const root = item.path.replace(/\/+$/, '');
  const raw: {relPath: string; name: string; type: FileType}[] = [];
  await walk(root, '', 0, raw);

  const files: ScanFile[] = [];
  for (const f of raw) {
    let pageCount: number | null = null;
    if (f.type === 'note') {
      onProgress?.(`Reading ${f.name}`);
      pageCount = await pageCountOf(`${root}/${f.relPath}`);
    }
    files.push({...f, pageCount});
  }

  // Keyword pages of shared notes referenced by anchors.
  const sharedKeywords: ProjectScan['sharedKeywords'] = {};
  const anchorFiles = new Set<string>();
  for (const x of [...item.tasks, ...item.meetings]) {
    const anchor = x.notePath ? parseSharedNoteAnchor(x.notePath) : null;
    if (anchor && !anchor.filePath.startsWith('/')) anchorFiles.add(anchor.filePath.replace(/^\.?\/+/, ''));
  }
  for (const rel of anchorFiles) {
    if (!files.some(f => f.relPath === rel)) continue;
    try {
      onProgress?.(`Reading pages of ${rel}`);
      sharedKeywords[rel] = (await readAllKeywords(`${root}/${rel}`)).keywords;
    } catch (e) {
      logError('closeOut scan: keywords failed', rel, errorMessage(e));
    }
  }

  // Files linked from outside the folder.
  const byLinked = new Map<string, OutsideFile>();
  const gmailEmails = `${paths.resources.replace(/\/+$/, '')}/${GMAIL_EMAILS_SUBFOLDER}/`;
  const gmailAttachments = `${paths.resources.replace(/\/+$/, '')}/${GMAIL_ATTACHMENTS_SUBFOLDER}/`;
  const linked: {linkedFile: string; label: string}[] = [
    ...item.tasks.map(t => ({linkedFile: t.linkedFile, label: t.text})),
    ...item.meetings.map(m => ({linkedFile: m.linkedFile, label: `${m.date} ${m.title}`})),
  ].filter(l => l.linkedFile);
  for (const l of linked) {
    const absPath = resolveLinkedFilePath(paths, l.linkedFile);
    if (absPath.startsWith(`${root}/`)) continue; // inside the folder - already scanned
    const existing = byLinked.get(l.linkedFile);
    if (existing) {
      existing.linkedBy.push(l.label);
      continue;
    }
    const name = absPath.slice(absPath.lastIndexOf('/') + 1);
    const type = fileTypeOf(name);
    const exists = await fileExists(absPath);
    const pageCount = exists && type === 'note' ? await pageCountOf(absPath) : null;
    byLinked.set(l.linkedFile, {
      linkedFile: l.linkedFile,
      absPath,
      name,
      type,
      pageCount,
      exists,
      linkedBy: [l.label],
      isGmail: absPath.startsWith(gmailEmails) || absPath.startsWith(gmailAttachments),
      isGmailEmailNote: absPath.startsWith(gmailEmails) && type === 'note',
    });
  }

  log('closeOut scan: done', root, `${files.length} files`, `${anchorFiles.size} shared`, `${byLinked.size} outside`);
  return {projectPath: root, files, sharedKeywords, outside: [...byLinked.values()]};
}
