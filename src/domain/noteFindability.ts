/**
 * Pure planning for findable notes (docs/dev/history/technical-design-projects-findable-notes.md
 * §2.6): which elements a page refresh deletes before it writes the rule's
 * pieces again. No SDK, no I/O - storage/meetingNoteContent.ts reads the
 * page and does the deleting.
 */
import {isNoteTemplateManagedElement, NOTE_HEADING_USERDATA} from './meetingNoteBlock';

/** sn-plugin-lib `Element.TYPE_TITLE`: a title element (a heading in the note's table of contents). */
export const TITLE_ELEMENT_TYPE = 100;

/** What `staleManagedNums` reads of a page element (the SDK's Element fits). */
export interface PageElementInfo {
  type: number;
  /** 1-based position within the page - what deleteElements takes. */
  numInPage: number;
  userData?: string | null;
  /** Present only on title elements: the `numInPage`s of the elements the title covers. */
  title?: {controlTrailNums?: number[] | null} | null;
}

/**
 * The `numInPage`s to delete before a page is written again, ascending:
 *
 * - every element gtdpara wrote (`isNoteTemplateManagedElement`: textboxes,
 *   links, legacy blocks, our title marker);
 * - every other title element whose `controlTrailNums` point only at
 *   elements of the first kind - a title the user put on one of our textboxes
 *   by hand goes with that textbox, so no title is left pointing at nothing.
 *
 * Titles on the user's own strokes or textboxes, and titles that cover ours
 * and the user's together, are kept.
 */
export function staleManagedNums(elements: readonly PageElementInfo[]): number[] {
  const managed = new Set(elements.filter(el => isNoteTemplateManagedElement(el.userData)).map(el => el.numInPage));
  const stale = new Set(managed);
  for (const el of elements) {
    if (el.type !== TITLE_ELEMENT_TYPE || stale.has(el.numInPage)) continue;
    const covered = el.title?.controlTrailNums ?? [];
    if (covered.length > 0 && covered.every(num => managed.has(num))) stale.add(el.numInPage);
  }
  return [...stale].sort((a, b) => a - b);
}

/** Whether an element is one of gtdpara's heading titles. */
export function isOurHeading(el: Pick<PageElementInfo, 'type' | 'userData'>): boolean {
  return el.type === TITLE_ELEMENT_TYPE && el.userData === NOTE_HEADING_USERDATA;
}
