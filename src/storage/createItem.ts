/**
 * Creates a brand-new Project or Area: an empty folder under the configured
 * Projects/Areas root plus its data file, scaffolded like any other fresh
 * project.txt/area.txt (domain/markdown.ts's ensureSkeleton) - `status: active`,
 * empty Scope/Tasks/Meetings sections (docs/dev/history/technical-design-item-scope.md -
 * Scope is there to type into from Obsidian before the app touches the file),
 * no further fields. Backs the "Create Project"/"Create Area" row on
 * screens/ItemsList.tsx's Projects/Areas tabs.
 *
 * Deliberately its own module, same shape as storage/archive.ts (the other
 * folder-lifecycle action) - a single function ItemsList.tsx calls, not
 * spread across dataCache.ts/projectFile.ts.
 *
 * Abbreviation (docs/dev/history/technical-design-project-area-abbreviations.md):
 * a brand-new item gets its default abbrev assigned right here,
 * via dataCache.ts's assignDefaultAbbrevIfMissing - not left for the next
 * full rebuild's migrateMissingAbbrevs pass to fill in, since that could be
 * a while (only runs on app open/foreground or an explicit 🔄), and the new
 * item's ItemDetail screen is typically opened immediately after creating
 * it.
 */
import {invalidFileNameChars} from '../domain/fileName';
import {ensureSkeleton} from '../domain/markdown';
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {ensureFileReadPermission} from '../supernote/pluginPermissions';
import {ensureFolderExists, listFolderEntries, writeTextFile} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {assignDefaultAbbrevIfMissing, CachedItem, ensureItemCached} from './dataCache';
import {dataFilePath} from './projectFile';

/**
 * Validates `name` and checks for a same-name folder (case-insensitive)
 * against a *fresh* listing of the target root - not just the in-memory
 * cache, which can be stale or may never have been built at all. This
 * matters because `ensureFolderExists` silently succeeds on a folder that
 * already exists: skipping this check could let a second "Create Project"
 * with a name that collides with an existing (but not-yet-cached) folder
 * quietly overwrite its project.txt with a blank skeleton. Throws
 * (surfacing a message meant to be shown directly, same convention as
 * storage/archive.ts's describeAreaArchiveBlock) without creating anything
 * if validation or the collision check fails.
 */
export async function createItem(
  kind: 'project' | 'area',
  name: string,
  settings: GtdParaSettings,
): Promise<CachedItem> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a name.');
  // The shared file name rule (domain/fileName.ts, D2 of
  // docs/dev/history/technical-design-cleanup-0.5.md): reject rather than silently
  // rename - the folder gets exactly the name the user typed, or none.
  const invalid = invalidFileNameChars(trimmed);
  if (invalid.length > 0) throw new Error(`A name can't contain ${invalid.map(c => `"${c}"`).join(', ')}.`);

  const paths = resolvePaths(settings);
  const root = kind === 'project' ? paths.projects : paths.areas;
  // The Inbox folder sits in Areas but is never an Area (docs/dev/history/technical-design-inbox-as-area.md §3.2).
  if (kind === 'area' && `${root}/${trimmed}`.toLowerCase() === paths.inboxFolder.toLowerCase()) {
    throw new Error('That name is used by the Inbox folder.');
  }

  const granted = await ensureFileReadPermission();
  if (!granted) throw new Error('File read permission was not granted.');

  const existing = await listFolderEntries(root);
  const collision = existing.find(e => e.isFolder && e.name.toLowerCase() === trimmed.toLowerCase());
  if (collision) throw new Error(`"${trimmed}" already exists.`);

  const path = `${root}/${trimmed}`;
  log('createItem: start', kind, path);
  await ensureFolderExists(path);
  await writeTextFile(dataFilePath(kind, path), ensureSkeleton('', kind));

  const item = await ensureItemCached(kind, trimmed, path);
  await assignDefaultAbbrevIfMissing(item);
  log('createItem: done', kind, path);
  return item;
}
