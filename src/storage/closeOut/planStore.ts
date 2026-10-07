/**
 * Load/save of a project's close-out plan (domain/closeOut/plan.ts) - the
 * `## Close-out` section of its project.txt (docs/dev/technical-design-project-
 * close-out.md §4.2). Always builds on the CACHED rawContent and writes the
 * cache through (updateItemRawContent), the same invariant every other
 * project-file save here keeps: a stale copy would otherwise drop the
 * section on the next task/meeting save, or drop that save here.
 */
import {ensureSkeleton} from '../../domain/markdown';
import {CloseOutPlan, parsePlan, writePlanIntoContent} from '../../domain/closeOut/plan';
import {writeTextFile} from '../../supernote/fileSystem';
import {findCachedItem, updateItemRawContent} from '../dataCache';
import {dataFilePath} from '../projectFile';

/** The plan of the cached project at `path`; `found` is false when the project has no close-out section yet. */
export function loadPlan(path: string): {plan: CloseOutPlan; found: boolean} {
  const item = findCachedItem(path);
  if (!item) throw new Error('This project is no longer in the cache - Settings → Advanced → Reload all files.');
  return parsePlan(item.rawContent);
}

async function writeContent(path: string, transform: (content: string) => string): Promise<void> {
  const item = findCachedItem(path);
  if (!item) throw new Error('This project is no longer in the cache - Settings → Advanced → Reload all files.');
  const next = transform(ensureSkeleton(item.rawContent, item.kind));
  await writeTextFile(dataFilePath(item.kind, item.path), next);
  updateItemRawContent(item.path, next);
}

export function savePlan(path: string, plan: CloseOutPlan): Promise<void> {
  return writeContent(path, content => writePlanIntoContent(content, plan));
}
