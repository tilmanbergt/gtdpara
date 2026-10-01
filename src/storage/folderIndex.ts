/**
 * The disposable folder index (design-overview.md §4): a from-scratch scan
 * of each configured PARA root, cached in memory so leaving and returning
 * to Home doesn't force a rescan. Rebuilt only on explicit request (a "Scan
 * folders" tap), never automatically on mount - scanning is a real device
 * call with real (and on this hardware, sometimes surprising) latency, so
 * it shouldn't happen silently every time a screen opens.
 */
import {isInboxFolder, GtdParaSettings, ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {FolderEntry, listFolderEntries} from '../supernote/fileSystem';
import {ensureFileReadPermission} from '../supernote/pluginPermissions';
import {log, logError} from '../utils/log';

export type SectionKey = 'projects' | 'areas' | 'resources' | 'archive';

// Resources/Archive are hidden from Home for now (per current request) - not
// scanning them too means one less pair of native calls (and one less way
// for a bad path to time out the whole scan) while they're not shown
// anyway. SCANNED_SECTIONS is the only thing rescanFolders actually fetches;
// the other two keys stay present on FolderIndex.entries (always empty)
// so callers don't need an optional-chaining dance if Resources/Archive
// come back later.
const SCANNED_SECTIONS: SectionKey[] = ['projects', 'areas'];

export interface FolderIndex {
  scannedAt: number;
  paths: ResolvedParaPaths;
  entries: Record<SectionKey, FolderEntry[]>;
}

let cached: FolderIndex | null = null;

export function getCachedIndex(): FolderIndex | null {
  return cached;
}

export function clearCachedIndex(): void {
  cached = null;
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

/**
 * Rebuilds the folder index from scratch by listing each configured PARA
 * root. Each section is timed out independently so one stuck path (wrong
 * root, permission problem) can't hang the whole scan forever - the
 * previous version had no timeout at all, which is how it got stuck
 * "scanning" with no way out.
 */
export async function rescanFolders(settings: GtdParaSettings): Promise<FolderIndex> {
  log('rescanFolders: start', settings);

  const granted = await ensureFileReadPermission();
  if (!granted) {
    logError('rescanFolders: file read permission not granted');
    throw new Error('File read permission was not granted.');
  }

  const paths = resolvePaths(settings);
  const allPaths: Record<SectionKey, string> = {
    projects: paths.projects,
    areas: paths.areas,
    resources: paths.resources,
    archive: paths.archive,
  };
  const sections = SCANNED_SECTIONS.map(key => ({key, path: allPaths[key]}));

  const results = await Promise.all(
    sections.map(section =>
      withTimeout(
        listFolderEntries(section.path),
        SCAN_TIMEOUT_MS,
        `scanning ${section.key} (${section.path})`,
      ).catch(e => {
        logError('rescanFolders: section failed', section.key, section.path, e);
        throw e;
      }),
    ),
  );

  const entries: Record<SectionKey, FolderEntry[]> = {
    projects: [],
    areas: [],
    resources: [],
    archive: [],
  };
  sections.forEach((section, index) => {
    // The Inbox folder lives in Areas but is never an Area (technical-design-inbox-as-area.md §3.2).
    entries[section.key] = results[index].filter(entry => entry.isFolder && !(section.key === 'areas' && isInboxFolder(paths, entry.path)));
  });

  const index: FolderIndex = {scannedAt: Date.now(), paths, entries};
  cached = index;
  log('rescanFolders: done', {
    projects: entries.projects.length,
    areas: entries.areas.length,
  });
  return index;
}
