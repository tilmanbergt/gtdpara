/**
 * Pure planning for findable notes (docs/dev/history/technical-design-projects-findable-notes.md
 * §2.6, §2.7): which elements a page refresh deletes before it writes the
 * rule's pieces again, and which keywords a page gtdpara wrote for an item
 * should carry. No SDK, no I/O - storage/meetingNoteContent.ts and
 * storage/noteFindability.ts read the page and do the writing.
 */
import {isNoteTemplateManagedElement} from './meetingNoteBlock';
import {Meeting, Task} from './types';

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

const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A keyword that is only an ISO date (`2026-10-08`) - on a page gtdpara wrote for an item, such a keyword is gtdpara's (§2.7). */
export function isBareDateKeyword(keyword: string): boolean {
  return BARE_DATE_RE.test(keyword);
}

/**
 * The date keyword of an item's page (§2.1 R5): a meeting's date, a todo's
 * creation date (`[created:: …]`, never the due date, which moves). Null when
 * there is none or it is not a valid `YYYY-MM-DD`.
 */
export function itemDateKeyword(item: Pick<Meeting, 'date'> | Pick<Task, 'fields'>): string | null {
  const date = 'fields' in item ? item.fields.created : item.date;
  if (!date || !isBareDateKeyword(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d ? date : null;
}

/** One keyword on the page, with its position (what deleteKeyWord takes). */
export interface PageKeywordAt {
  keyword: string;
  index: number;
}

export interface PageKeywordPlan {
  add: string[];
  /** Positions to delete, highest first (each delete shifts the ones after it). */
  deleteIndexes: number[];
}

/**
 * What to change so a page carries the item's date keyword and tags (§2.7):
 * add `date` when it is missing; delete every other bare date (a moved
 * meeting); add each tag that is missing. Tags are never deleted (removed
 * tags stay, the user may have added keywords by hand), and keywords with
 * text after a date - a shared page's anchor - are never touched.
 */
export function planPageKeywords(params: {onPage: readonly PageKeywordAt[]; date: string | null; tags: readonly string[]}): PageKeywordPlan {
  const {onPage, date, tags} = params;
  const present = new Set(onPage.map(k => k.keyword));
  const add: string[] = [];
  if (date && !present.has(date)) add.push(date);
  for (const tag of tags) {
    if (!present.has(tag) && !add.includes(tag)) add.push(tag);
  }
  const deleteIndexes = onPage
    .filter(k => isBareDateKeyword(k.keyword) && k.keyword !== date)
    .map(k => k.index)
    .sort((a, b) => b - a);
  return {add, deleteIndexes};
}
