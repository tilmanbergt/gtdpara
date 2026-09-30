/**
 * Load/save of a project's close-out plan (domain/closeOut/plan.ts) - the
 * `## Close-out` section of its project.txt (docs/dev/technical-design-project-
 * close-out.md §4.2). Always builds on the CACHED rawContent and writes the
 * cache through (updateItemRawContent), the same invariant every other
 * project-file save here keeps: a stale copy would otherwise drop the
 * section on the next task/meeting save, or drop that save here.
 */
import {ensureSkeleton} from '../../domain/markdown';
import {CloseOutPlan, parsePlan, removePlanFromContent, writePlanIntoContent} from '../../domain/closeOut/plan';
import {writeTextFile} from '../../supernote/fileSystem';
import {findCachedItem, updateItemRawContent} from '../dataCache';
import {dataFilePath} from '../projectFile';

/** The plan of the cached project at `path`; `found` is false when the project has no close-out section yet. */
export function loadPlan(path: string): {plan: CloseOutPlan; found: boolean} {
  const item = findCachedItem(path);
  if (!item) throw new Error('This project is no longer in the cache - tap 🔄 to refresh.');
  return parsePlan(item.rawContent);
}

async function writeContent(path: string, transform: (content: string) => string): Promise<void> {
  const item = findCachedItem(path);
  if (!item) throw new Error('This project is no longer in the cache - tap 🔄 to refresh.');
  const next = transform(ensureSkeleton(item.rawContent, item.kind));
  await writeTextFile(dataFilePath(item.kind, item.path), next);
  updateItemRawContent(item.path, next);
}

export function savePlan(path: string, plan: CloseOutPlan): Promise<void> {
  return writeContent(path, content => writePlanIntoContent(content, plan));
}

/** Removes the close-out section entirely ("Start over"). */
export function clearPlan(path: string): Promise<void> {
  return writeContent(path, removePlanFromContent);
}

/**
 * Plan save for a project file at a path that is NOT in the cache - the
 * executor's last journal line, written after the folder has already moved
 * into the archive (docs/dev/technical-design-project-close-out.md §7).
 */
export async function savePlanAt(kind: 'project' | 'area', itemPath: string, rawContent: string, plan: CloseOutPlan): Promise<string> {
  const next = writePlanIntoContent(ensureSkeleton(rawContent, kind), plan);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}
