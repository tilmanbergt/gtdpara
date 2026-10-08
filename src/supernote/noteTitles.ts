/**
 * Title elements (headings) for note pages
 * (docs/dev/history/technical-design-projects-findable-notes.md §2.3, §2.6).
 * Ratta's flow for a note that need not be open: create an element of type
 * 100, put the covered textbox's `numInPage` into `title.controlTrailNums`,
 * insert it on that page. Style and `controlTrailNums` live on
 * `element.title` (sn-plugin-lib model/Element.ts's `Title`), not on the
 * element itself.
 *
 * `fileSystem.ts`'s `Element` stays as it is; the title part is typed here.
 */
import {NOTE_HEADING_USERDATA} from '../domain/meetingNoteBlock';
import {TITLE_ELEMENT_TYPE} from '../domain/noteFindability';
import {NoteHeadingStyle} from '../domain/settings';
import {createElement, Element, Rect} from './fileSystem';

export const ELEMENT_TYPE_TITLE = TITLE_ELEMENT_TYPE;

/** sn-plugin-lib's `Title`. */
export interface ElementTitle {
  X: number;
  Y: number;
  width: number;
  height: number;
  /** 0-based page. */
  page: number;
  /** 0 remove, 1 black background, 2 light grey, 3 dark grey, 4 shadow. */
  style: number;
  /** The covered elements' positions on the page ("values start from 1"). */
  controlTrailNums: number[];
}

/** A page element as getElements returns it, with the parts a title element carries. */
export interface ElementWithTitle extends Element {
  title?: ElementTitle | null;
}

export interface TitleElementSpec {
  /** 0-based page the title goes on. */
  page: number;
  /** `numInPage` of the textbox the title covers. */
  textBoxNum: number;
  /** The textbox's `textRect`. */
  rect: Rect;
  style: NoteHeadingStyle;
}

/** A title element over one textbox, marked as gtdpara's (NOTE_HEADING_USERDATA), ready for insertElements. */
export async function buildTitleElement(spec: TitleElementSpec): Promise<ElementWithTitle> {
  const element = (await createElement(ELEMENT_TYPE_TITLE)) as ElementWithTitle;
  element.pageNum = spec.page;
  element.layerNum = 0;
  element.userData = NOTE_HEADING_USERDATA;
  element.title = {
    X: spec.rect.left,
    Y: spec.rect.top,
    width: spec.rect.right - spec.rect.left,
    height: spec.rect.bottom - spec.rect.top,
    page: spec.page,
    style: spec.style,
    controlTrailNums: [spec.textBoxNum],
  };
  return element;
}
