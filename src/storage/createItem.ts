/**
 * Creates a brand-new Project or Area (2026-09-11): an empty folder under
 * the configured Projects/Areas root plus its data file, scaffolded exactly
 * like any other fresh project.txt/area.txt (domain/markdown.ts's
 * ensureSkeleton) - `status: active`, empty Scope/Tasks/Meetings sections
 * (Scope added 2026-09-14, docs/dev/technical-design-item-scope.md - already
 * there to type into from Obsidian, before the app ever touches the file),
 * no further fields. Backs the "Create Project"/"Create Area" row on
 * screens/ItemsList.tsx's Projects/Areas tabs.
 *
 * Deliberately its own module, same shape as storage/archive.ts (the other
 * folder-lifecycle action) - a single function ItemsList.tsx calls, not
 * spread across dataCache.ts/projectFile.ts.
 *
 * Abbreviation (docs/dev/technical-design-project-area-abbreviations.md,
 * 2026-09-14): a brand-new item gets its default abbrev assigned right here,
 * via dataCache.ts's assignDefaultAbbrevIfMissing - not left for the next
 * full rebuild's migrateMissingAbbrevs pass to fill in, since that could be
 * a while (only runs on app open/foreground or an explicit 🔄), and the new
 * item's ItemDetail screen is typically opened immediately after creating
 * it.
 */
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
  if (/[/\\]/.test(trimmed)) throw new Error('Name can\'t contain "/" or "\\".');

  const paths = resolvePaths(settings);
  const root = kind === 'project' ? paths.projects : paths.areas;

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
