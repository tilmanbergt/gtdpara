/**
 * "Fix file names" (docs/dev/technical-design-files-0.6.md §3.5): renames the
 * note files the Integrity Check planned (domain/fileNameFix.ts) and rewrites
 * every link to them. Runs after one confirm in Settings.
 *
 * 1. Rename each file to a free, safe name in its folder. A failure on one
 *    file is logged and doesn't stop the rest; its links stay unchanged.
 * 2. Rewrite the links item by item, from the file on disk (a link is only
 *    rewritten while it still reads exactly as planned), through the usual
 *    write-through (cache entry / shared Inbox).
 *
 * No journal: a crash between 1 and 2 leaves a link to a missing file, which
 * the Integrity Check reports; the log names every rename (old -> new).
 */
import {FileFix} from '../domain/fileNameFix';
import {GtdParaKind, Meeting, Task} from '../domain/types';
import {moveFile} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {findCachedItem, reloadCachedInbox, updateItemMeetings, updateItemTasks} from './dataCache';
import {collisionFreeName} from './fileNaming';
import {loadProjectFile, saveMeetings, saveTasks} from './projectFile';
import {errorMessage} from '../utils/errorMessage';

export interface FileNameFixResult {
  renamed: number;
  linksUpdated: number;
  failed: Array<{file: string; error: string}>;
}

interface ItemRewrite {
  kind: GtdParaKind;
  path: string;
  /** old notePath -> new notePath, per span. */
  tasks: Map<string, string>;
  meetings: Map<string, string>;
}

async function rewriteItem(item: ItemRewrite): Promise<number> {
  const file = await loadProjectFile(item.kind, item.path);
  let updated = 0;
  const rewrite = <T extends Task | Meeting>(entries: T[], map: Map<string, string>): T[] =>
    entries.map(entry => {
      const next = map.get(entry.notePath);
      if (next === undefined) return entry;
      updated += 1;
      return {...entry, notePath: next};
    });
  const tasks = rewrite(file.tasks, item.tasks);
  const meetings = rewrite(file.meetings, item.meetings);
  if (updated === 0) return 0;

  let raw = file.rawContent;
  if (item.tasks.size > 0) raw = await saveTasks(item.kind, item.path, raw, tasks, file.taskExtraLines);
  const afterTasks = raw;
  if (item.meetings.size > 0) raw = await saveMeetings(item.kind, item.path, raw, meetings, file.meetingExtraLines);

  if (item.kind === 'inbox') {
    await reloadCachedInbox(item.path);
  } else if (findCachedItem(item.path)) {
    updateItemTasks(item.path, afterTasks, tasks, file.taskExtraLines);
    updateItemMeetings(item.path, raw, meetings, file.meetingExtraLines);
  }
  return updated;
}

export async function applyFileNameFixes(fixes: FileFix[]): Promise<FileNameFixResult> {
  const result: FileNameFixResult = {renamed: 0, linksUpdated: 0, failed: []};
  const items = new Map<string, ItemRewrite>();

  for (const fix of fixes) {
    try {
      const newName = await collisionFreeName(fix.folder, fix.newStem, fix.ext);
      const to = `${fix.folder}/${newName}`;
      await moveFile(fix.file, to);
      log('applyFileNameFixes: renamed', fix.file, '->', to);
      result.renamed += 1;
      for (const {ref, newNotePath} of fix.refs) {
        const item = items.get(ref.itemPath) ?? {kind: ref.itemKind, path: ref.itemPath, tasks: new Map(), meetings: new Map()};
        (ref.entityKind === 'task' ? item.tasks : item.meetings).set(ref.notePath, newNotePath(newName));
        items.set(ref.itemPath, item);
      }
    } catch (e) {
      const error = errorMessage(e);
      logError('applyFileNameFixes: rename failed', fix.file, error);
      result.failed.push({file: fix.file, error});
    }
  }

  for (const item of items.values()) {
    try {
      result.linksUpdated += await rewriteItem(item);
    } catch (e) {
      const error = errorMessage(e);
      // The files are renamed already - the Integrity Check now reports these links as missing.
      logError('applyFileNameFixes: link rewrite failed', item.path, error, JSON.stringify([...item.tasks, ...item.meetings]));
      result.failed.push({file: item.path, error});
    }
  }
  log('applyFileNameFixes: done', `${result.renamed} renamed`, `${result.linksUpdated} links`, `${result.failed.length} failed`);
  return result;
}
