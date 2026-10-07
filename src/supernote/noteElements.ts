/**
 * Builds the textbox `Element` the note-writing code inserts with
 * insertElements. The one place that spells out the createElement(ELEMENT_TYPE_TEXT)
 * + `textBox` literal (docs/dev/history/technical-design-gmail-email-note.md 3.6) - used by
 * storage/textNote.ts from the start; storage/meetingNoteContent.ts's two copies
 * are to be migrated later (Phase 3, behaviour-identical).
 */
import {createElement, Element, ELEMENT_TYPE_TEXT, toRect} from './fileSystem';

export interface TextboxElementSpec {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** Marker for finding the element again later (see Element.userData); omitted = none. */
  userData?: string;
  /** 0-indexed page the element goes on. Default 0. */
  pageNum?: number;
  /** true (default) = stays a normal, tap-to-edit Supernote textbox afterwards. */
  editable?: boolean;
}

export async function buildTextboxElement(spec: TextboxElementSpec): Promise<Element> {
  const element = await createElement(ELEMENT_TYPE_TEXT);
  if (spec.userData !== undefined) element.userData = spec.userData;
  element.pageNum = spec.pageNum ?? 0;
  element.layerNum = 0;
  element.textBox = {
    fontSize: spec.fontSize,
    fontPath: null,
    textContentFull: spec.text,
    textRect: toRect(spec.x, spec.y, spec.width, spec.height),
    textDigestData: null,
    textAlign: 0,
    textBold: 0,
    textItalics: 0,
    textFrameWidthType: 0,
    textFrameStyle: 0,
    textEditable: spec.editable === false ? 0 : 1,
  };
  return element;
}
