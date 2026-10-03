/**
 * Setting a Project/Area's lifecycle status (technical-design-status-archive.md
 * §4) - the plain 3-way (Projects: Active/On Hold/Done) or 2-way (Areas:
 * Active/On Hold) picker in ProjectDataPanel's new Status section. Deliberately
 * separate from storage/archive.ts: `setItemStatus` only ever writes
 * 'active'/'on-hold'/'done' - reaching 'archived' always goes through
 * `archiveItem`, which couples the frontmatter write to the physical folder
 * move so the two can never disagree (see that module's doc comment).
 *
 * Same "write the file, then update the cache, in that order" shape as
 * storage/focusSlots.ts's setItemFocus, and the same one-file-write
 * discipline: a status change and its auto-unfocus (below) are saved
 * together, never as two separate writes.
 */
import {assignedProjects} from './areaAssignment';
import {CachedItem, FrontMatterSource, findCachedItem, frontMatterOf, updateItemFrontMatter} from './dataCache';
import {saveFrontMatter} from './projectFile';
import {isoDate, readLifecycleDate, writeLifecycleDate} from '../domain/lifecycleDates';

export type SettableStatus = 'active' | 'on-hold' | 'done';

type StatusItem = Pick<CachedItem, 'kind' | 'name' | 'path' | 'rawContent'> & FrontMatterSource;

/**
 * Moving to On Hold *or* Done clears both focus flags in the same write -
 * on hold, this was the very first decision (a deliberate signal stronger
 * than just running low on slots); Done was confirmed to follow the same
 * rule rather than keep a finished project occupying a focus slot. Moving
 * back to Active never re-focuses anything - both flags are already false
 * by the time that's possible, since focus only ever clears on the way out.
 *
 * `area` is carried through unchanged on every write (added alongside
 * `defaultResourceFolder` - technical-design-project-area-assignment.md
 * §2) - a status change must never silently clear a Project's Area
 * assignment.
 *
 * **Area → On Hold cascade** (technical-design-project-area-assignment.md
 * §3.2, §5): when `item.kind === 'area'` and `nextStatus === 'on-hold'`,
 * every currently-Active Project in `assignedProjects(item.name)` is also
 * moved to On Hold, via this same function (so each one's own focus
 * auto-clear fires too, unchanged). Deliberately **not** symmetric - Area
 * On Hold → Active never reactivates those projects, the same
 * one-directional posture the focus-flag auto-clear above already has
 * ("moving back to Active never re-focuses anything"). Areas never reach
 * `done` (2-way picker), so there is no Done-cascade to design here.
 */
export async function setItemStatus(
  item: StatusItem,
  nextStatus: SettableStatus,
): Promise<{rawContent: string; status: SettableStatus; dailyFocus: boolean; weeklyFocus: boolean; monthlyFocus: boolean; frontMatterExtraLines: string[]}> {
  // All three focus levels clear together (docs/dev/technical-design-monthly-view.md §2.1).
  const clearsFocus = nextStatus !== 'active';
  // doneAt (docs/dev/technical-design-project-close-out.md §4.1): stamped the
  // first time a Project becomes Done (an existing date is kept - e.g. Done
  // -> On Hold -> Done keeps the original), cleared on reactivation. It
  // decides the archive year.
  const currentDoneAt = readLifecycleDate(item.frontMatterExtraLines, 'doneAt');
  const nextDoneAt =
    nextStatus === 'active' ? null : nextStatus === 'done' && item.kind === 'project' ? currentDoneAt ?? isoDate(new Date()) : currentDoneAt;
  const fm = {
    ...frontMatterOf(item),
    extraLines: writeLifecycleDate(item.frontMatterExtraLines, 'doneAt', nextDoneAt),
    status: nextStatus,
    dailyFocus: clearsFocus ? false : item.dailyFocus,
    weeklyFocus: clearsFocus ? false : item.weeklyFocus,
    monthlyFocus: clearsFocus ? false : item.monthlyFocus,
  };
  const rawContent = await saveFrontMatter(item.kind, item.path, item.rawContent, fm);
  updateItemFrontMatter(item.path, rawContent, fm);
  const {dailyFocus, weeklyFocus, monthlyFocus} = fm;

  if (item.kind === 'area' && nextStatus === 'on-hold') {
    const toCascade = assignedProjects(item.name).filter(p => p.status === 'active');
    for (const project of toCascade) {
      await setItemStatus(project, 'on-hold');
    }
  }

  return {rawContent, status: nextStatus, dailyFocus, weeklyFocus, monthlyFocus, frontMatterExtraLines: fm.extraLines};
}

/**
 * Sets a Done Project's `doneAt` date by hand (close-out checklist "Done on
 * · Edit" - docs/dev/technical-design-project-close-out.md §4.1): it decides the
 * archive year, and projects marked Done before doneAt existed have none.
 */
export async function setDoneDate(path: string, date: string): Promise<void> {
  const item = findCachedItem(path);
  if (!item) throw new Error('This project changed on disk - Settings → Advanced → Reload all files.');
  const fm = {...frontMatterOf(item), extraLines: writeLifecycleDate(item.frontMatterExtraLines, 'doneAt', date)};
  const rawContent = await saveFrontMatter(item.kind, item.path, item.rawContent, fm);
  updateItemFrontMatter(item.path, rawContent, fm);
}
