/**
 * Archiving a Project/Area (technical-design-status-archive.md §5; target
 * layout since 2026-09-28: docs/dev/technical-design-project-close-out.md §5.1 -
 * Archive/<year>/[<Area>/]<Project>/ for Projects, Archive/<year>/<Area>/
 * merged for Areas, plus an `archivedAt:` date): the one
 * action that moves the folder out of Projects/Areas and into Archive/ AND
 * stamps `status: archived` into its data file, together. Deliberately not
 * reachable through storage/statusControl.ts's plain status picker -
 * decoupling the frontmatter write from the physical move would let a
 * folder sit in Projects/ marked archived while still being scanned as if
 * it belonged there, so the two are kept coupled in this one function.
 *
 * One-way door at the product level (design-overview.md §2.1's existing
 * "Resources/Archive are hidden and not scanned at all" decision extends
 * to this): once archived, nothing in the app reads the item back from
 * Archive/ - there's no restore/browse-Archive UI. Bringing something back
 * means moving the folder by hand in Supernote's own file browser.
 */
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {assignedProjects} from './areaAssignment';
import {CachedItem, FrontMatterSource, frontMatterOf, removeCachedItem} from './dataCache';
import {saveFrontMatter} from './projectFile';
import {deleteEmptyFolder, displayPath, folderExists, moveFolder, moveFolderMerge} from '../supernote/fileSystem';
import {areaArchiveTarget, archiveYear, projectArchiveTargets} from '../domain/closeOut/archivePaths';
import {isoDate, readLifecycleDate, writeLifecycleDate} from '../domain/lifecycleDates';
import {log, logError} from '../utils/log';

/**
 * Moves `item`'s folder into its year/area archive folder (archiveTargetsFor
 * below - an Area MERGES into an existing Archive/<year>/<Area>/, rejecting
 * before anything moves if a name collides), then stamps
 * `status: archived` (and clears both focus flags, same as any other
 * status change) into the file at its *new* location, then drops the item
 * from the cross-project cache since it's no longer under Projects/Areas.
 *
 * Ordering matters: the physical move happens first, so if the frontmatter
 * write in step 2 fails, the folder is still correctly out of Projects/
 * Areas (the part that matters for the one-way-door behavior) - it just
 * keeps whatever status it had before archiving. That's an acceptable
 * degraded state, not worth building rollback/retry machinery around;
 * logged and surfaced like any other error here.
 *
 * Throws (surfacing the native module's message, e.g. a same-name folder
 * already in Archive/) without changing anything if the move itself fails.
 *
 * **Area-specific precondition and cascade** (technical-design-project-
 * area-assignment.md §3.3, §5), checked before any of the above runs when
 * `item.kind === 'area'`:
 * - **Blocked** outright if any Project in `assignedProjects(item.name)`
 *   is currently Active or On Hold - the error names them, surfaced
 *   through the same `archiveError` text ui/ItemStatusPanel.tsx already
 *   renders. The confirmation dialog is never even offered in that case
 *   (the caller runs this check - or lets this throw - before opening it).
 * - Otherwise, every assigned Project that's currently **Done** is
 *   archived too, via a recursive call to this same function, *before*
 *   the Area's own folder moves. If any of those cascaded archives
 *   throws, this function stops immediately and propagates that error -
 *   the Area itself is left unarchived rather than completing over a
 *   partial cascade.
 * - The cascaded Projects' own `area` field is left untouched: since
 *   assignment is stored by bare folder name and archiving an Area
 *   doesn't rename it (only moves its parent folder), the reference stays
 *   correct after the move - nothing here needs to rewrite it.
 * - By construction, once an Area finishes archiving, no non-archived
 *   Project can still reference it: Active/On-Hold ones are a hard block,
 *   Done ones are cascaded.
 */
/**
 * The Active/On-Hold-project block, factored out so ui/ItemStatusPanel.tsx
 * can run it *before* even opening the "Move to Archive?" confirmation for
 * an Area - the destructive dialog should never appear for an Area that
 * can't actually be archived yet. `archiveItem` below calls this too, as a
 * defense-in-depth safety net (e.g. a caller that skipped the preflight
 * check). Returns the error message, or null if archiving may proceed.
 */
export function describeAreaArchiveBlock(areaName: string): string | null {
  const blocking = assignedProjects(areaName).filter(p => p.status === 'active' || p.status === 'on-hold');
  if (blocking.length === 0) return null;
  const names = blocking.map(p => `"${p.name}"`).join(', ');
  const isOne = blocking.length === 1;
  return `"${areaName}" has ${blocking.length} project${isOne ? '' : 's'} that ${isOne ? 'is' : 'are'} still Active or On Hold: ${names}. Move or reassign ${isOne ? 'it' : 'them'} before archiving this area.`;
}

/**
 * Archive targets for `item` today (docs/dev/technical-design-project-close-out.md
 * §5.1): a Project goes to Archive/<doneAt year>/[<Area>/]<name>/, an Area to
 * Archive/<this year>/<name>/ (merged). Exported for the close-out wizard,
 * which shows these paths before anything moves.
 */
export function archiveTargetsFor(
  item: Pick<CachedItem, 'kind' | 'name'> & FrontMatterSource,
  settings: GtdParaSettings,
  today: Date = new Date(),
): {folder: string; pdf: string | null; merge: boolean} {
  const paths = resolvePaths(settings);
  if (item.kind === 'area') {
    return {folder: areaArchiveTarget(paths.archive, item.name, archiveYear(null, today)), pdf: null, merge: true};
  }
  const year = archiveYear(readLifecycleDate(item.frontMatterExtraLines, 'doneAt'), today);
  const t = projectArchiveTargets(paths.archive, item.name, item.area, year);
  return {folder: t.folder, pdf: t.pdf, merge: false};
}

/**
 * True when archiving `item` will MERGE into an archive folder that already
 * exists - the only case that leaves an empty source folder behind. Callers
 * use it to name that folder in the confirmation text before archiving
 * (docs/dev/technical-design-inkhub-submission.md §3.4/§3.8).
 */
export async function archiveLeavesEmptyFolder(
  item: Pick<CachedItem, 'kind' | 'name'> & FrontMatterSource,
  settings: GtdParaSettings,
  today: Date = new Date(),
): Promise<boolean> {
  const target = archiveTargetsFor(item, settings, today);
  return target.merge && (await folderExists(target.folder));
}

export interface ArchiveResult {
  path: string;
  /** The empty source folder left after a merge, when it was NOT deleted (user said no / permission refused). */
  keptEmptyFolder: string | null;
}

export async function archiveItem(
  item: Pick<CachedItem, 'kind' | 'name' | 'path' | 'rawContent'> & FrontMatterSource,
  settings: GtdParaSettings,
  today: Date = new Date(),
  /**
   * Set only when the user's confirmation named the empty folder that a
   * merge leaves behind: then it is deleted (FILE:DELETE is requested with
   * a text naming it). Otherwise the empty folder stays and is reported in
   * the result.
   */
  options: {deleteEmptySource?: boolean} = {},
): Promise<ArchiveResult> {
  if (item.kind === 'area') {
    const block = describeAreaArchiveBlock(item.name);
    if (block) throw new Error(block);
    const toCascade = assignedProjects(item.name).filter(p => p.status === 'done');
    for (const project of toCascade) {
      await archiveItem(project, settings, today);
    }
  }

  const {folder: toPath, merge} = archiveTargetsFor(item, settings, today);

  log('archiveItem: start', item.path, '->', toPath, merge ? '(merge)' : '');
  let keptEmptyFolder: string | null = null;
  if (merge) {
    await moveFolderMerge(item.path, toPath);
    // A merge into an existing folder moves the contents and leaves the
    // (now empty) source folder; a plain rename leaves nothing.
    if (await folderExists(item.path)) {
      const reason = `Delete the empty folder ${displayPath(item.path)} - its contents were just moved to ${displayPath(toPath)}.`;
      let deleted = false;
      if (options.deleteEmptySource) {
        try {
          deleted = await deleteEmptyFolder(item.path, reason);
        } catch (e) {
          // The move itself succeeded - a failed clean-up must not turn the archive into an error.
          logError('archiveItem: deleting the empty source folder failed', item.path, e instanceof Error ? e.message : String(e));
        }
      }
      if (!deleted) {
        keptEmptyFolder = item.path;
        log('archiveItem: empty source folder kept', item.path);
      }
    }
  } else {
    await moveFolder(item.path, toPath);
  }

  try {
    await saveFrontMatter(item.kind, toPath, item.rawContent, {
      ...frontMatterOf(item),
      extraLines: writeLifecycleDate(item.frontMatterExtraLines, 'archivedAt', isoDate(today)),
      status: 'archived',
      dailyFocus: false,
      weeklyFocus: false,
      monthlyFocus: false,
    });
  } catch (e) {
    // The folder is already moved - that's the part that matters for the
    // one-way-door behavior. Log and carry on rather than trying to undo
    // the move; see the module doc comment.
    logError(
      'archiveItem: folder moved but stamping status failed',
      toPath,
      e instanceof Error ? e.message : String(e),
    );
  }

  removeCachedItem(item.path);
  log('archiveItem: done', item.path, '->', toPath);
  return {path: toPath, keptEmptyFolder};
}
