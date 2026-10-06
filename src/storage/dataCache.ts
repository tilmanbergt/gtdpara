/**
 * The disposable cross-project cache (design-overview.md §4), covering both
 * halves the design doc describes: which Project/Area folders exist, AND
 * each one's own parsed Tasks/Meetings - so Home and Daily don't read every
 * file on every open, which gets slow as the number of Projects/Areas grows.
 *
 * Kept current in these ways:
 *
 * 1. A full rebuild (rebuildCache) - rereads every project.txt/area.txt
 *    from scratch. On demand via Settings → Advanced → "Reload all files",
 *    after a Settings save, and whenever refreshCache (4. below) can't work
 *    incrementally (first open, folders changed).
 * 2. Write-through (updateItemTasks/updateItemMeetings) - every
 *    plugin-initiated save (adding/toggling/cancelling a task or meeting,
 *    linking a note) updates its item's cache entry in the very same
 *    operation that writes the file, so every other screen (Daily, or
 *    re-opening the same item later) sees the change immediately without
 *    needing a rebuild.
 *
 * 3. Change notification (subscribeCache/getCacheVersion,
 *    docs/dev/technical-design-cache-subscription-and-shared-add-path.md §A) -
 *    write-through mutates cache items IN PLACE (the very same array and item
 *    objects a screen already holds), so a screen's `setItems(cache.items)`
 *    alone would be a same-reference no-op and React would not re-render.
 *    Every mutation below bumps a version and notifies subscribers;
 *    ui/useCachedItems.ts turns that into a re-render plus a fresh array
 *    identity per change, so no screen has to remember a manual refresh step.
 *
 * 4. Incremental refresh (refreshCache, docs/dev/technical-design-
 *    files-0.6.md §3.2) - what App.tsx runs on every open: lists the
 *    Project/Area folders, stats every data file plus Inbox.txt in one
 *    native call, and re-reads only files whose stamp (exists, modified
 *    time, size) differs from the one recorded when they were read. Notifies
 *    only when something really changed. "Reload all files" stays a full
 *    rebuild.
 *
 * Fully disposable: rebuildCache always reproduces the cache correctly from
 * the files, which remain the only real data - this is a responsiveness
 * layer on top, never a second source of truth. A single item that isn't in
 * the cache yet (ensureItemCached) is loaded on demand rather than forcing a
 * full rebuild just to open one Project/Area.
 *
 * Resources/Archive stay unscanned - they're hidden from Home (a deliberate
 * decision).
 */
import {ExistingAbbrev, generateDefaultAbbrev} from '../domain/abbrev';
import {GtdParaSettings, ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {FrontMatterFields} from '../domain/markdown';
import {ItemStatus, Mark, Meeting, MonthlyGoal, Task, WeeklyGoal} from '../domain/types';
import {FileStat, listFolderEntries, statFiles} from '../supernote/fileSystem';
import {ensureFileReadPermission} from '../supernote/pluginPermissions';
import {log, logError} from '../utils/log';
import {perfEnd, perfMark, perfStart} from '../utils/perf';
import {dataFilePath, loadProjectFile, parseProjectFileContent, ProjectFileState, saveFrontMatter} from './projectFile';
import {errorMessage} from '../utils/errorMessage';

export interface CachedItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
  rawContent: string;
  tasks: Task[];
  meetings: Meeting[];
  taskExtraLines: string[];
  meetingExtraLines: string[];
  /** From the `## Scope` span (docs/dev/technical-design-item-scope.md) - see storage/projectFile.ts's ProjectFileState doc comment. '' until a scope is set, even though the heading itself is scaffolded from item creation. */
  scope: string;
  /** From the `## Weekly Goals` span (docs/dev/technical-design-weekly-goals.md) - see storage/projectFile.ts's ProjectFileState doc comment. */
  weeklyGoals: WeeklyGoal[];
  weeklyGoalsExtraLines: string[];
  /** From the `## Monthly Goals` span (docs/dev/technical-design-monthly-view.md §2.2). */
  monthlyGoals: MonthlyGoal[];
  monthlyGoalsExtraLines: string[];
  /** From the `## Marks` span (docs/dev/technical-design-lasso-0.8.md §3.1) - open "Mark for later" lines whose note lives in this item's folder. */
  marks: Mark[];
  marksExtraLines: string[];
  /** From the frontmatter block - see domain/markdown.ts's parseFrontMatter, storage/focusSlots.ts and storage/statusControl.ts. */
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  /** Which Resources subfolder this item's Files pane defaults its "Resources" root to, or null - see technical-design-linked-files.md §3.1. */
  defaultResourceFolder: string | null;
  /** The Area this Project supports, by bare folder name, or null - Projects only, always null for Areas (technical-design-project-area-assignment.md §2). */
  area: string | null;
  /** This item's short abbreviation (docs/dev/technical-design-project-area-abbreviations.md), or null - filled in for every item by the one-time migration `doRebuildCache` runs below, so in practice this is only null for an item not yet seen by a rebuild, or one whose migration write failed and will retry on the next rebuild. */
  abbrev: string | null;
  frontMatterExtraLines: string[];
  /** Set when this item's own file failed to load during the last rebuild - the item still shows (the folder itself was found fine) but with empty tasks/meetings until a rebuild succeeds. */
  loadError?: string;
}

export interface DataCache {
  scannedAt: number;
  paths: ResolvedParaPaths;
  items: CachedItem[];
}

let cached: DataCache | null = null;
/** De-dupes concurrent rebuilds - see rebuildCache's own doc comment. */
let rebuildInFlight: Promise<DataCache> | null = null;
/** De-dupes concurrent refreshes - see refreshCache. */
let refreshInFlight: Promise<DataCache> | null = null;

/** A data file's state when it was last read into the cache (technical-design-files-0.6.md §3.2). Compared for equality, not "newer than". */
export interface FileStamp {
  exists: boolean;
  lastModified: number;
  size: number;
}

/** Data file path (project.txt/area.txt/Inbox.txt) -> its stamp at the last read. Refilled by every rebuild; a file without a stamp counts as changed. */
const fileStamps = new Map<string, FileStamp>();

function stampOf(stat: FileStat): FileStamp {
  return {exists: stat.exists, lastModified: stat.lastModified, size: stat.size};
}

function sameStamp(a: FileStamp | undefined, b: FileStamp | undefined): boolean {
  return !!a && !!b && a.exists === b.exists && a.lastModified === b.lastModified && a.size === b.size;
}

/** Stats `paths` in one native call. Null when the native build has no statFiles or the call fails - callers then fall back to reading everything. */
async function statStamps(paths: string[]): Promise<Map<string, FileStamp> | null> {
  try {
    const stats = await statFiles(paths);
    if (!stats) return null;
    return new Map(stats.map(stat => [stat.path, stampOf(stat)]));
  } catch (e) {
    logError('dataCache: statFiles failed', errorMessage(e));
    return null;
  }
}

/** Bumped by every mutation below - see the module doc comment's change-notification note. */
let cacheVersion = 0;
const cacheListeners = new Set<() => void>();

/** Registers `listener` to be called after every cache mutation (rebuild, write-through, add/remove item). Returns the unsubscribe function. */
export function subscribeCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

/** Monotonic counter, +1 per mutation - ui/useCachedItems.ts compares it to know whether to hand out a fresh items array. */
export function getCacheVersion(): number {
  return cacheVersion;
}

function notifyCacheChanged(): void {
  cacheVersion += 1;
  perfMark('cache:notify', {listeners: cacheListeners.size});
  // Copy first: a listener may unsubscribe (component unmount) while we iterate.
  Array.from(cacheListeners).forEach(listener => listener());
}

export function getCachedData(): DataCache | null {
  return cached;
}

export function clearCachedData(): void {
  cached = null;
  fileStamps.clear();
  setCachedInbox(null);
  notifyCacheChanged();
}

// ---- The Inbox (docs/dev/technical-design-files-0.6.md §3.3) ----
// Inbox.txt lives outside `items` (it is no Project/Area), but every screen
// shares this one copy: a screen's `setInbox(...)` writes here, and every
// screen showing the Inbox re-renders from it (ui/useCachedInbox.ts). Its own
// listener set, so an Inbox change doesn't re-render item-only screens.
let cachedInbox: ProjectFileState | null = null;
let inboxVersion = 0;
const inboxListeners = new Set<() => void>();

export function getCachedInbox(): ProjectFileState | null {
  return cachedInbox;
}

export function getInboxVersion(): number {
  return inboxVersion;
}

export function subscribeInbox(listener: () => void): () => void {
  inboxListeners.add(listener);
  return () => {
    inboxListeners.delete(listener);
  };
}

/**
 * Replaces the shared Inbox state - same call shape as a React state setter
 * (a value or an updater), so screens use it as their `setInbox`. Notifies
 * only when the state object actually changes.
 */
export function setCachedInbox(
  next: ProjectFileState | null | ((prev: ProjectFileState | null) => ProjectFileState | null),
): void {
  const value = typeof next === 'function' ? next(cachedInbox) : next;
  if (value === cachedInbox) return;
  cachedInbox = value;
  inboxVersion += 1;
  Array.from(inboxListeners).forEach(listener => listener());
}

/** Re-reads Inbox.txt into the shared Inbox state - for storage code that wrote the file itself (copy from Google, capture, close-out). Never throws: a failed read is logged and the old state kept. */
export async function reloadCachedInbox(inboxFolder: string): Promise<void> {
  try {
    setCachedInbox(await loadProjectFile('inbox', inboxFolder));
  } catch (e) {
    logError('dataCache: Inbox reload failed', errorMessage(e));
  }
}

export function findCachedItem(path: string): CachedItem | undefined {
  return cached?.items.find(item => item.path === path);
}

const SCAN_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function loadOneItem(kind: 'project' | 'area', name: string, path: string): Promise<CachedItem> {
  try {
    const file = await loadProjectFile(kind, path);
    return {kind, name, path, ...file};
  } catch (e) {
    const message = errorMessage(e);
    logError('dataCache: item load failed', path, message);
    return {
      kind,
      name,
      path,
      rawContent: '',
      tasks: [],
      meetings: [],
      taskExtraLines: [],
      meetingExtraLines: [],
      scope: '',
      weeklyGoals: [],
      weeklyGoalsExtraLines: [],
      monthlyGoals: [],
      monthlyGoalsExtraLines: [],
      marks: [],
      marksExtraLines: [],
      status: 'active',
      dailyFocus: false,
      weeklyFocus: false,
      monthlyFocus: false,
      defaultResourceFolder: null,
      area: null,
      abbrev: null,
      frontMatterExtraLines: [],
      loadError: message,
    };
  }
}

/**
 * ONE-TIME MIGRATION (docs/dev/technical-design-project-area-
 * abbreviations.md) - fills in a generated `abbrev` for every item that
 * doesn't have one yet, every time the cache does a full rebuild (which
 * runs automatically on plugin open/foreground - App.tsx's `reorient` - so
 * real items pick one up on their own, no separate action needed).
 * Idempotent: only touches items with `abbrev === null`, so running it again
 * after everything has one is a fast no-op scan. Meant as a one-time pass:
 * once every real Project/Area has picked one up (spot-check, or a rebuild
 * with nothing left to fill), DELETE this function and its one call site in
 * doRebuildCache below - the `abbrev` field stays, this is just the backfill
 * for items that predate it.
 *
 * Processes items in the order doRebuildCache already produced them
 * (folder-scan order), reserving each freshly generated value into
 * `existing` immediately so two items migrated in the same pass can never
 * collide with each other, not just with already-set abbrevs.
 */
async function migrateMissingAbbrevs(items: CachedItem[]): Promise<void> {
  const existing: ExistingAbbrev[] = items
    .filter((i): i is CachedItem & {abbrev: string} => i.abbrev !== null)
    .map(i => ({value: i.abbrev, itemName: i.name}));

  for (const item of items) {
    if (item.abbrev !== null || item.loadError) continue;
    const generated = generateDefaultAbbrev(item.name, existing);
    existing.push({value: generated, itemName: item.name});
    try {
      const rawContent = await saveFrontMatter(item.kind, item.path, item.rawContent, {
        ...frontMatterOf(item),
        abbrev: generated,
      });
      // Same object the cache already holds a reference to (see
      // doRebuildCache: `next.items` and this function's `items` param are
      // the same array) - mutating in place is enough, no separate
      // updateItemFrontMatter call needed.
      item.rawContent = rawContent;
      item.abbrev = generated;
    } catch (e) {
      logError('migrateMissingAbbrevs: failed for', item.path, errorMessage(e));
      // Left null - picked up again on the next rebuild.
    }
  }
  // Items were mutated in place above (abbrev + rawContent) - tell subscribers.
  notifyCacheChanged();
}

/**
 * Assigns a freshly generated default abbrev to `item` if it doesn't have
 * one yet, and writes it through immediately (file + cache) - same
 * generate-then-saveFrontMatter shape migrateMissingAbbrevs above uses for
 * the backfill pass, but for exactly one item. storage/createItem.ts calls
 * this right after creating a brand-new Project/Area, so it shows a real
 * abbreviation immediately rather than waiting for the next full rebuild to
 * pick it up (migrateMissingAbbrevs only ever runs inside doRebuildCache
 * below). No-op if `item.abbrev` is already set - defensive, since a fresh
 * item never has one yet, but keeps this safe to call unconditionally.
 *
 * `existing` is read from whatever cache is currently warm (excluding
 * `item` itself, in case it's already been pushed into `cached.items` by
 * ensureItemCached by the time this runs) - an empty list, same as
 * migrateMissingAbbrevs starting from scratch, if no cache exists yet.
 */
export async function assignDefaultAbbrevIfMissing(item: CachedItem): Promise<void> {
  if (item.abbrev !== null) return;
  const existing: ExistingAbbrev[] = (cached?.items ?? [])
    .filter((i): i is CachedItem & {abbrev: string} => i.path !== item.path && i.abbrev !== null)
    .map(i => ({value: i.abbrev, itemName: i.name}));
  const generated = generateDefaultAbbrev(item.name, existing);
  try {
    const rawContent = await saveFrontMatter(item.kind, item.path, item.rawContent, {
      ...frontMatterOf(item),
      abbrev: generated,
    });
    item.rawContent = rawContent;
    item.abbrev = generated;
    notifyCacheChanged();
  } catch (e) {
    logError('assignDefaultAbbrevIfMissing: failed for', item.path, errorMessage(e));
    // Left null - migrateMissingAbbrevs picks it up on the next rebuild.
  }
}

/**
 * Full rebuild: scans the Projects and Areas folders, then loads every
 * item's own data file (in parallel). Replaces the entire cache on success
 * - a partial failure on one item doesn't fail the rebuild, it's recorded
 * on that item's `loadError` instead (see loadOneItem).
 *
 * De-duped: App.tsx's `reorient` kicks off a background rebuild on every
 * plugin open/foreground, and most screens' own `load()` falls back to
 * `await rebuildCache(...)` when they find no cache yet (DailyView/
 * InboxScreen/ReviewScreen/CaptureScreen). A caller that arrives while a
 * rebuild is already running gets that same in-flight promise back instead
 * of starting a second, redundant full-vault scan - same pattern as
 * storage/googleCalendarCache.ts's `refreshGoogleCalendar` /
 * supernote/pluginPermissions.ts's `pending` map. A `settings` argument
 * arriving while another call's rebuild is in flight is ignored in favor of
 * whichever settings started that rebuild - two rebuild requests landing
 * within milliseconds of each other essentially never disagree on settings.
 */
export function rebuildCache(settings: GtdParaSettings): Promise<DataCache> {
  if (rebuildInFlight) {
    perfMark('cache:rebuildJoined');
    return rebuildInFlight;
  }
  const perfToken = perfStart();
  // A refresh still running finishes first, so the two never write the cache at the same time.
  const pending = refreshInFlight ? refreshInFlight.catch(() => undefined) : Promise.resolve();
  rebuildInFlight = pending.then(() => doRebuildCache(settings)).finally(() => {
    rebuildInFlight = null;
    perfEnd('cache:rebuild', perfToken);
  });
  return rebuildInFlight;
}

interface FolderItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

/** Lists the Projects and Areas folders (2 calls) - the item folders the cache holds. */
async function scanItemFolders(paths: ResolvedParaPaths): Promise<FolderItem[]> {
  const [projectEntries, areaEntries] = await Promise.all([
    withTimeout(listFolderEntries(paths.projects), SCAN_TIMEOUT_MS, `scanning projects (${paths.projects})`),
    withTimeout(listFolderEntries(paths.areas), SCAN_TIMEOUT_MS, `scanning areas (${paths.areas})`),
  ]);
  return [
    ...projectEntries.filter(e => e.isFolder).map(e => ({kind: 'project' as const, name: e.name, path: e.path})),
    ...areaEntries
      // The Inbox folder lives under Areas but is never an Area.
      .filter(e => e.isFolder && e.path.replace(/\/+$/, '') !== paths.inboxFolder)
      .map(e => ({kind: 'area' as const, name: e.name, path: e.path})),
  ];
}

async function doRebuildCache(settings: GtdParaSettings): Promise<DataCache> {
  log('rebuildCache: start');

  const granted = await ensureFileReadPermission();
  if (!granted) {
    throw new Error('File read permission was not granted.');
  }

  const paths = resolvePaths(settings);
  const folderItems = await scanItemFolders(paths);

  // Stamps first, then the reads: a file changed in between just gets read
  // again on the next refresh (technical-design-files-0.6.md §3.2).
  const stamps = await statStamps([...folderItems.map(f => dataFilePath(f.kind, f.path)), paths.inbox]);
  fileStamps.clear();
  stamps?.forEach((stamp, filePath) => fileStamps.set(filePath, stamp));

  const perfItems = perfStart();
  const [items] = await Promise.all([
    Promise.all(folderItems.map(({kind, name, path}) => loadOneItem(kind, name, path))),
    reloadCachedInbox(paths.inboxFolder),
  ]);
  perfEnd('cache:loadItems', perfItems, {items: items.length});

  const next: DataCache = {scannedAt: Date.now(), paths, items};
  cached = next;
  perfMark('cache:replaced', {items: items.length});
  notifyCacheChanged();
  // ONE-TIME MIGRATION - see migrateMissingAbbrevs's own doc comment; safe
  // to delete this call (and that function) once every real item has an
  // abbrev.
  await migrateMissingAbbrevs(items);
  log('rebuildCache: done', `${items.length} items`);
  return next;
}

/**
 * Incremental refresh (docs/dev/technical-design-files-0.6.md §3.2) - what
 * App.tsx runs on every plugin open. Re-reads only the data files that
 * changed on disk since they were read (Obsidian, sync, a file copied in),
 * picks up added and removed Project/Area folders, and the Inbox. Falls back
 * to a full rebuild when there is no cache yet, the folders in Settings
 * differ from the cached ones (or the Inbox still sits at its old place), or
 * the native build can't stat files.
 *
 * Subscribers are notified only when something really changed: a file whose
 * stamp differs but whose text is the same (gtdpara's own saves don't update
 * the stamp) is re-read once and then kept as it was.
 *
 * De-duped like rebuildCache; joins a rebuild already running.
 */
export function refreshCache(settings: GtdParaSettings): Promise<DataCache> {
  if (rebuildInFlight) return rebuildInFlight;
  if (refreshInFlight) {
    perfMark('cache:refreshJoined');
    return refreshInFlight;
  }
  const perfToken = perfStart();
  refreshInFlight = doRefreshCache(settings).finally(() => {
    refreshInFlight = null;
    perfEnd('cache:refresh', perfToken);
  });
  return refreshInFlight;
}

function samePaths(cachedPaths: ResolvedParaPaths, configured: ResolvedParaPaths): boolean {
  return (
    cachedPaths.base === configured.base &&
    cachedPaths.projects === configured.projects &&
    cachedPaths.areas === configured.areas &&
    cachedPaths.inboxFolder === configured.inboxFolder
  );
}

async function doRefreshCache(settings: GtdParaSettings): Promise<DataCache> {
  const current = cached;
  const configuredPaths = resolvePaths(settings);
  if (!current || !samePaths(current.paths, configuredPaths)) {
    log('refreshCache: full rebuild', current ? 'folders changed' : 'no cache yet');
    return doRebuildCache(settings);
  }
  if (!(await ensureFileReadPermission())) {
    throw new Error('File read permission was not granted.');
  }
  const paths = current.paths;
  const folderItems = await scanItemFolders(paths);
  const dataFiles = folderItems.map(f => dataFilePath(f.kind, f.path));
  const stamps = await statStamps([...dataFiles, paths.inbox]);
  if (!stamps) {
    log('refreshCache: full rebuild', 'files cannot be checked');
    return doRebuildCache(settings);
  }

  const oldByPath = new Map(current.items.map(item => [item.path, item]));
  const toRead = folderItems
    .map((folder, i) => ({folder, dataFile: dataFiles[i], old: oldByPath.get(folder.path)}))
    .filter(
      ({folder, dataFile, old}) =>
        !old || old.kind !== folder.kind || !!old.loadError || !sameStamp(fileStamps.get(dataFile), stamps.get(dataFile)),
    );
  const inboxStampChanged = !sameStamp(fileStamps.get(paths.inbox), stamps.get(paths.inbox));

  const perfItems = perfStart();
  const [readItems, readInbox] = await Promise.all([
    Promise.all(toRead.map(({folder}) => loadOneItem(folder.kind, folder.name, folder.path))),
    inboxStampChanged
      ? loadProjectFile('inbox', paths.inboxFolder).catch(e => {
          logError('refreshCache: Inbox read failed', errorMessage(e));
          return null;
        })
      : Promise.resolve(null),
  ]);
  perfEnd('cache:refreshItems', perfItems, {items: readItems.length});

  if (cached !== current) {
    // Replaced meanwhile (Settings saved, Reload all files) - that one wins.
    log('refreshCache: cache replaced meanwhile, result dropped');
    return cached ?? current;
  }

  // Keep the old object when the text is the same (our own save, a touch):
  // nothing to re-render, only the stamp moves on.
  const replacement = new Map<string, CachedItem>();
  let changed = 0;
  let added = 0;
  toRead.forEach(({dataFile, old}, i) => {
    const item = readItems[i];
    if (!item.loadError) {
      const stamp = stamps.get(dataFile);
      if (stamp) fileStamps.set(dataFile, stamp);
    }
    if (!old) added += 1;
    else if (old.kind === item.kind && !old.loadError && !item.loadError && old.rawContent === item.rawContent) return;
    else changed += 1;
    replacement.set(item.path, item);
  });
  const nextItems = folderItems.map(folder => replacement.get(folder.path) ?? (oldByPath.get(folder.path) as CachedItem));
  const kept = new Set(folderItems.map(f => f.path));
  const removed = current.items.filter(item => !kept.has(item.path)).length;

  let inboxChanged = false;
  if (readInbox) {
    const inboxStamp = stamps.get(paths.inbox);
    if (inboxStamp) fileStamps.set(paths.inbox, inboxStamp);
    if (readInbox.rawContent !== getCachedInbox()?.rawContent) {
      setCachedInbox(readInbox);
      inboxChanged = true;
    }
  }

  log('refreshCache:', `${changed} changed, ${added} added, ${removed} removed, inbox ${inboxChanged ? 'changed' : 'unchanged'}`, `(${toRead.length} read)`);
  perfMark('cache:refreshed', {changed, added, removed, inbox: inboxChanged ? 1 : 0});
  if (changed === 0 && added === 0 && removed === 0) return current;

  const next: DataCache = {scannedAt: Date.now(), paths, items: nextItems};
  cached = next;
  notifyCacheChanged();
  for (const item of replacement.values()) {
    if (!item.loadError && item.abbrev === null) await assignDefaultAbbrevIfMissing(item);
  }
  return next;
}

/**
 * Returns this item from the cache if it's already there; otherwise loads
 * just this one item's file and, if a cache already exists, adds it in
 * (so it's visible cache-wide from then on) rather than forcing a full
 * rebuild to open a single Project/Area. If no cache exists at all yet
 * (rebuildCache has never completed), the loaded item is still returned for
 * this one call, just not stored anywhere - the next rebuild picks it up
 * properly.
 */
export async function ensureItemCached(
  kind: 'project' | 'area',
  name: string,
  path: string,
): Promise<CachedItem> {
  const existing = findCachedItem(path);
  if (existing) {
    perfMark('cache:itemHit', {path});
    return existing;
  }

  const item = await loadOneItem(kind, name, path);
  if (cached) {
    cached.items.push(item);
    notifyCacheChanged();
  }
  return item;
}

/** Write-through after saving an item's Tasks span - see the module doc comment. No-op if this item isn't (yet) in the cache. */
export function updateItemTasks(
  path: string,
  rawContent: string,
  tasks: Task[],
  taskExtraLines: string[],
): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.tasks = tasks;
  item.taskExtraLines = taskExtraLines;
  item.loadError = undefined;
  notifyCacheChanged();
}

/** Write-through after saving an item's Meetings span - see updateItemTasks. */
export function updateItemMeetings(
  path: string,
  rawContent: string,
  meetings: Meeting[],
  meetingExtraLines: string[],
): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.meetings = meetings;
  item.meetingExtraLines = meetingExtraLines;
  item.loadError = undefined;
  notifyCacheChanged();
}

/** Write-through after saving an item's Scope span - see updateItemTasks. */
export function updateItemScope(path: string, rawContent: string, scope: string): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.scope = scope;
  item.loadError = undefined;
  notifyCacheChanged();
}

/** Write-through after saving an item's Weekly Goals span - see updateItemTasks. */
export function updateItemWeeklyGoals(
  path: string,
  rawContent: string,
  weeklyGoals: WeeklyGoal[],
  weeklyGoalsExtraLines: string[],
): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.weeklyGoals = weeklyGoals;
  item.weeklyGoalsExtraLines = weeklyGoalsExtraLines;
  item.loadError = undefined;
  notifyCacheChanged();
}

/** Write-through after saving an item's Monthly Goals span - see updateItemTasks. */
export function updateItemMonthlyGoals(
  path: string,
  rawContent: string,
  monthlyGoals: MonthlyGoal[],
  monthlyGoalsExtraLines: string[],
): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.monthlyGoals = monthlyGoals;
  item.monthlyGoalsExtraLines = monthlyGoalsExtraLines;
  item.loadError = undefined;
  notifyCacheChanged();
}

/**
 * Write-through for a save that changed ONLY a section no cached field is
 * parsed from (the close-out plan's `## Close-out` section - docs/technical-
 * design-project-close-out.md §4.2). Every other save builds on
 * `item.rawContent`, so skipping this would make the next task/meeting save
 * silently write the old section back.
 */
export function updateItemRawContent(path: string, rawContent: string): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  notifyCacheChanged();
}

/**
 * Write-through for a file that was written outside the item's own save
 * paths - storage/markStore.ts adds or removes a `## Marks` line after
 * reading the file fresh from disk (the Mark button runs while this cache
 * may be old). The whole text is parsed again, so the next task/meeting
 * save (which builds on `item.rawContent`) keeps the mark line.
 * No-op when there is no cache or the item isn't in it.
 */
export function applyItemRawContent(path: string, rawContent: string): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  Object.assign(item, parseProjectFileContent(rawContent));
  item.loadError = undefined;
  notifyCacheChanged();
}

/** The Inbox twin of applyItemRawContent - only when the Inbox is cached at all. */
export function applyInboxRawContent(rawContent: string): void {
  if (cachedInbox === null) return;
  setCachedInbox(parseProjectFileContent(rawContent));
}

/** The flat frontmatter fields `CachedItem`/`ProjectFileState` carry - what `frontMatterOf` reads. */
export type FrontMatterSource = Pick<
  CachedItem,
  | 'status'
  | 'dailyFocus'
  | 'weeklyFocus'
  | 'monthlyFocus'
  | 'defaultResourceFolder'
  | 'area'
  | 'abbrev'
  | 'frontMatterExtraLines'
>;

/**
 * An item's current frontmatter as one `FrontMatterFields` object
 * (docs/dev/technical-design-monthly-view.md §2.1) - the ONE place that knows
 * which flat item fields make up the frontmatter. Every save builds
 * `{...frontMatterOf(item), <changed field>}`, so a field a call site
 * doesn't touch is always carried through unchanged.
 */
export function frontMatterOf(item: FrontMatterSource): FrontMatterFields {
  return {
    status: item.status,
    dailyFocus: item.dailyFocus,
    weeklyFocus: item.weeklyFocus,
    monthlyFocus: item.monthlyFocus,
    defaultResourceFolder: item.defaultResourceFolder,
    area: item.area,
    abbrev: item.abbrev,
    extraLines: item.frontMatterExtraLines,
  };
}

/** Write-through after saving an item's frontmatter - see updateItemTasks. Takes the exact `fm` object that was just saved (see frontMatterOf). */
export function updateItemFrontMatter(path: string, rawContent: string, fm: FrontMatterFields): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.status = fm.status;
  item.dailyFocus = fm.dailyFocus;
  item.weeklyFocus = fm.weeklyFocus;
  item.monthlyFocus = fm.monthlyFocus;
  item.frontMatterExtraLines = fm.extraLines;
  item.defaultResourceFolder = fm.defaultResourceFolder;
  item.area = fm.area;
  item.abbrev = fm.abbrev;
  item.loadError = undefined;
  notifyCacheChanged();
}

/**
 * Drops `path` from the cache entirely - used after storage/archive.ts
 * moves an item's folder out of Projects/Areas, since it then sits under
 * neither root and every other write-through here assumes the item stays
 * put. No-op if there's no cache yet or the item isn't in it.
 */
export function removeCachedItem(path: string): void {
  if (!cached) return;
  cached.items = cached.items.filter(item => item.path !== path);
  notifyCacheChanged();
}
