/**
 * The icons "Mark for later" puts into a note (docs/dev/technical-design-
 * lasso-0.8.md §3.8): a black bookmark at the top right inside the lassoed
 * area, carrying `userData = gtdpara:mark:<id>`; after saving it becomes a
 * check mark (same element, new points, `:done`); Discard removes it.
 *
 * Rules from the spike (docs/dev/spike-lasso-marks.md §8):
 * - inserted with insertPageElements (insertGeometry can't carry userData),
 *   one retry on error 105, then saveCurrentNote (unsaved icons were lost
 *   when the note closed);
 * - changed or removed ONLY when its element number is unique on the page -
 *   in a PDF's mark layer numbers repeat, and deleting by number once hit a
 *   stroke;
 * - in the note open in the host: page-level calls + save; any other file:
 *   file-level calls.
 */
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {
  bookmarkPolygon,
  checkPolygon,
  iconBox,
  markDoneUserData,
  markUserData,
  parseMarkUserData,
  PxPoint,
  PxRect,
} from '../domain/marks';
import {log, logWarn} from '../utils/log';
import {ensureFileReadPermission, ensureFileWritePermission} from './pluginPermissions';
import {
  ELEMENT_TYPE_GEO,
  errorMessage,
  errText,
  recycleElements,
  SdkElement,
  SdkResponse,
  sleep,
} from './sdkElements';

const ICON_PEN = {penColor: 0x00, penType: 10, penWidth: 200};
/** How many pages to look through when the icon isn't on its stored page (pages may have moved). */
const MAX_PAGES_SCANNED = 200;

export interface IconInsertResult {
  placed: boolean;
  box: PxRect;
  retried: boolean;
  saved: boolean;
  error: string | null;
}

async function insertOnce(page: number, box: PxRect, id: string): Promise<string | null> {
  const created = (await PluginCommAPI.createElement(ELEMENT_TYPE_GEO)) as SdkResponse<SdkElement & Record<string, unknown>>;
  if (!created?.success || !created.result) {return 'createElement: ' + errText(created, 'failed');}
  const el = created.result;
  try {
    el.userData = markUserData(id);
    el.pageNum = page;
    el.geometry = {...ICON_PEN, type: 'GEO_polygon', points: bookmarkPolygon(box)};
    const res = (await PluginCommAPI.insertPageElements([el], page, null)) as SdkResponse<boolean>;
    return res?.success ? null : 'insertPageElements: ' + errText(res, 'failed');
  } finally {
    recycleElements([el]);
  }
}

async function saveCurrentNote(): Promise<boolean> {
  try {
    const r = (await PluginNoteAPI.saveCurrentNote()) as SdkResponse<boolean>;
    return !!r?.success && r.result !== false;
  } catch (e) {
    logWarn('markIcons: saveCurrentNote threw', errorMessage(e));
    return false;
  }
}

/** Puts the bookmark into the open note's `page`. Never throws. */
export async function insertBookmark(page: number, lassoRect: PxRect, id: string): Promise<IconInsertResult> {
  const box = iconBox(lassoRect);
  let retried = false;
  let error: string | null = null;
  try {
    error = await insertOnce(page, box, id);
    if (error && error.includes('105')) {
      retried = true;
      await sleep(500);
      error = await insertOnce(page, box, id);
    }
  } catch (e) {
    error = errorMessage(e);
  }
  const placed = error === null;
  const saved = placed ? await saveCurrentNote() : false;
  if (placed) {log('markIcons: bookmark placed', id, `page=${page}`, `retried=${retried}`, `saved=${saved}`);}
  else {logWarn('markIcons: bookmark not placed', id, error);}
  return {placed, box, retried, saved, error};
}

// ---- finding and changing an icon later ----

export interface IconRef {
  id: string;
  /** Absolute path of the note/PDF. */
  path: string;
  /** 0-based page where it was placed. */
  page: number;
}

interface FoundIcon {
  page: number;
  element: SdkElement;
  unique: boolean;
  pageElements: SdkElement[];
}

async function pageElements(path: string, page: number): Promise<SdkElement[]> {
  const r = (await PluginFileAPI.getElements(page, path)) as SdkResponse<SdkElement[]>;
  if (!r?.success) {throw new Error('getElements: ' + errText(r, 'failed'));}
  return Array.isArray(r.result) ? r.result : [];
}

function findOnPage(elements: SdkElement[], id: string): SdkElement | undefined {
  return elements.find(e => parseMarkUserData(e.userData)?.id === id);
}

async function pageCount(path: string): Promise<number | null> {
  try {
    const r = (await PluginFileAPI.getNoteTotalPageNum(path)) as SdkResponse<number>;
    return r?.success && typeof r.result === 'number' ? r.result : null;
  } catch {
    return null;
  }
}

/** Finds the icon by its userData: on its page first, then on the other pages. */
async function findIcon(ref: IconRef): Promise<FoundIcon | null> {
  const tryPage = async (page: number): Promise<FoundIcon | null> => {
    const els = await pageElements(ref.path, page);
    const hit = findOnPage(els, ref.id);
    if (!hit) {
      recycleElements(els);
      return null;
    }
    const unique = els.filter(e => e.numInPage === hit.numInPage).length === 1;
    return {page, element: hit, unique, pageElements: els};
  };
  const onStored = await tryPage(ref.page);
  if (onStored) {return onStored;}
  const total = await pageCount(ref.path);
  if (total == null) {return null;}
  for (let p = 0; p < Math.min(total, MAX_PAGES_SCANNED); p++) {
    if (p === ref.page) {continue;}
    const found = await tryPage(p);
    if (found) {return found;}
  }
  return null;
}

function boundsOf(points: PxPoint[]): PxRect | null {
  if (points.length === 0) {return null;}
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  return {left, top, right, bottom};
}

export type IconChange = 'done' | 'remove';

export interface IconChangeResult {
  /** True when the icon now looks as wanted - or is gone for 'remove'. */
  ok: boolean;
  /** Worth trying again later (busy note, error 105); false for "not found" or "number not unique". */
  retry: boolean;
  detail: string;
}

/**
 * Turns the bookmark into the check icon ('done') or removes it ('remove').
 * `currentPath` is the note open in the host right now (page-level calls
 * there, file-level calls for any other file). Never throws.
 */
export async function changeMarkIcon(ref: IconRef, change: IconChange, currentPath: string | null): Promise<IconChangeResult> {
  let found: FoundIcon | null = null;
  try {
    if (!(await ensureFileReadPermission()) || !(await ensureFileWritePermission())) {
      return {ok: false, retry: true, detail: 'file permission not granted'};
    }
    found = await findIcon(ref);
    if (!found) {
      // Removed by hand, or the file is gone: nothing left to change.
      return {ok: change === 'remove', retry: false, detail: 'icon not found'};
    }
    if (change === 'done' && parseMarkUserData(found.element.userData)?.done) {
      return {ok: true, retry: false, detail: 'already done'};
    }
    if (!found.unique) {
      return {ok: false, retry: false, detail: `number ${found.element.numInPage} is not unique on the page - left as it is`};
    }
    const inOpenNote = currentPath !== null && currentPath === ref.path;
    const num = found.element.numInPage;
    let res: SdkResponse<unknown>;
    if (change === 'remove') {
      res = inOpenNote
        ? ((await PluginCommAPI.deletePageElements([num], found.page, null)) as SdkResponse<unknown>)
        : ((await PluginFileAPI.deleteElements(ref.path, found.page, [num])) as SdkResponse<unknown>);
    } else {
      const box = boundsOf(found.element.geometry?.points ?? []);
      if (!box) {return {ok: false, retry: false, detail: 'icon has no shape'};}
      const modified: SdkElement = {
        ...found.element,
        userData: markDoneUserData(ref.id),
        geometry: {...ICON_PEN, ...(found.element.geometry ?? {}), type: 'GEO_polygon', points: checkPolygon(box)},
      };
      res = inOpenNote
        ? ((await PluginCommAPI.modifyPageElements([modified], found.page, null)) as SdkResponse<unknown>)
        : ((await PluginFileAPI.modifyElements(ref.path, found.page, [modified])) as SdkResponse<unknown>);
    }
    if (!res?.success || res.result === false) {
      const detail = errText(res, 'failed');
      logWarn('markIcons: change failed', ref.id, change, inOpenNote ? 'open note' : 'file', detail);
      return {ok: false, retry: true, detail};
    }
    if (inOpenNote) {await saveCurrentNote();}
    log('markIcons: changed', ref.id, change, inOpenNote ? 'open note' : 'file', `page=${found.page}`);
    return {ok: true, retry: false, detail: change};
  } catch (e) {
    const detail = errorMessage(e);
    logWarn('markIcons: change threw', ref.id, change, detail);
    return {ok: false, retry: true, detail};
  } finally {
    if (found) {recycleElements(found.pageElements);}
  }
}
