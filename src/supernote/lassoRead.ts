/**
 * Reads the active lasso once into plain data (docs/dev/technical-design-
 * lasso-0.8.md §3.4): where it is, its text boxes' text, and every stroke's
 * points and pressures. Capture and "Mark for later" both start here, so
 * recognition never works on live elements with the page size again (the
 * root cause of the "second lasso recognizes nothing" bug, §2.1).
 */
import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {joinInReadingOrder, PxPoint, PxRect, StoredStroke, TextPiece} from '../domain/marks';
import {log, logWarn} from '../utils/log';
import {
  ELEMENT_TYPE_STROKE,
  errText,
  isTextBoxType,
  recycleElements,
  SdkElement,
  SdkResponse,
} from './sdkElements';
import {errorMessage} from '../utils/errorMessage';

type Size = {width: number; height: number};

export interface LassoSnapshot {
  /** The open note or PDF; null when the host didn't say. */
  path: string | null;
  /** 0-based page; null when unknown. */
  page: number | null;
  rect: PxRect | null;
  displaySize: Size | null;
  pageSize: Size | null;
  /** Text-box text in reading order ('' when none). */
  textBoxText: string;
  strokes: StoredStroke[];
  elementCount: number;
  /** Problems on the way (each step still ran). */
  errors: string[];
  timingsMs: Record<string, number>;
}

async function timed<T>(timings: Record<string, number>, key: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    timings[key] = Date.now() - start;
  }
}

async function readStroke(el: SdkElement): Promise<StoredStroke | null> {
  if (!el.stroke?.points) {return null;}
  const n = await el.stroke.points.size();
  const pts: PxPoint[] = n > 0 ? await el.stroke.points.getRange(0, n) : [];
  let pressures: number[] = [];
  if (el.stroke.pressures) {
    const m = await el.stroke.pressures.size();
    pressures = m > 0 ? await el.stroke.pressures.getRange(0, m) : [];
  }
  const points: number[] = [];
  for (const p of pts) {points.push(Math.round(p.x), Math.round(p.y));}
  return {
    thickness: el.thickness ?? null,
    penColor: el.stroke.penColor ?? null,
    penType: el.stroke.penType ?? null,
    layerNum: el.layerNum ?? null,
    points,
    pressures: pressures.map(v => Math.round(v * 1000) / 1000),
  };
}

/** Never throws; whatever couldn't be read is null/empty and listed in `errors`. */
export async function readLasso(): Promise<LassoSnapshot> {
  const timings: Record<string, number> = {};
  const errors: string[] = [];
  let elements: SdkElement[] = [];
  const snap: LassoSnapshot = {
    path: null,
    page: null,
    rect: null,
    displaySize: null,
    pageSize: null,
    textBoxText: '',
    strokes: [],
    elementCount: 0,
    errors,
    timingsMs: timings,
  };
  try {
    const pathR = (await timed(timings, 'path', () => PluginCommAPI.getCurrentFilePath())) as SdkResponse<string>;
    snap.path = pathR?.success && pathR.result ? pathR.result : null;
    if (!snap.path) {errors.push('getCurrentFilePath: ' + errText(pathR, 'no path'));}

    const pageR = (await timed(timings, 'page', () => PluginCommAPI.getCurrentPageNum())) as SdkResponse<number>;
    snap.page = pageR?.success && typeof pageR.result === 'number' ? pageR.result : null;
    if (snap.page == null) {errors.push('getCurrentPageNum: ' + errText(pageR, 'no page'));}

    const rectR = (await timed(timings, 'rect', () => PluginCommAPI.getLassoRect())) as SdkResponse<PxRect>;
    snap.rect = rectR?.success && rectR.result ? rectR.result : null;
    if (!snap.rect) {errors.push('getLassoRect: ' + errText(rectR, 'no rect'));}

    const elR = (await timed(timings, 'elements', () => PluginCommAPI.getLassoElements())) as SdkResponse<SdkElement[]>;
    elements = elR?.success && Array.isArray(elR.result) ? elR.result : [];
    if (!elR?.success) {errors.push('getLassoElements: ' + errText(elR, 'failed'));}
    snap.elementCount = elements.length;

    const dispR = (await timed(timings, 'displaySize', () => PluginCommAPI.getPageDisplaySize())) as SdkResponse<Size>;
    snap.displaySize = dispR?.success && dispR.result ? dispR.result : null;
    if (snap.path && snap.page != null) {
      try {
        const sizeR = (await timed(timings, 'pageSize', () =>
          PluginFileAPI.getPageSize(snap.path!, snap.page!),
        )) as SdkResponse<Size>;
        snap.pageSize = sizeR?.success && sizeR.result ? sizeR.result : null;
      } catch (e) {
        logWarn('lassoRead: getPageSize failed', errorMessage(e));
      }
    }

    const pieces: TextPiece[] = elements
      .filter(e => isTextBoxType(e.type))
      .map(e => ({text: e.textBox?.textContentFull ?? '', rect: e.textBox?.textRect ?? null}));
    snap.textBoxText = joinInReadingOrder(pieces);

    const t = Date.now();
    for (const el of elements) {
      if (el.type !== ELEMENT_TYPE_STROKE) {continue;}
      try {
        const stroke = await readStroke(el);
        if (stroke && stroke.points.length > 0) {snap.strokes.push(stroke);}
      } catch (e) {
        errors.push('stroke: ' + errorMessage(e));
      }
    }
    timings.strokes = Date.now() - t;
  } catch (e) {
    errors.push(errorMessage(e));
  } finally {
    recycleElements(elements);
  }
  log(
    'lassoRead: done',
    `elements=${snap.elementCount}`,
    `strokes=${snap.strokes.length}`,
    `textBoxChars=${snap.textBoxText.length}`,
    `page=${snap.page}`,
    JSON.stringify(timings),
    errors.length ? `errors=${errors.join(' | ')}` : '',
  );
  return snap;
}

/** True when there is nothing to capture or mark. */
export function isEmptyLasso(snap: LassoSnapshot): boolean {
  return snap.strokes.length === 0 && snap.textBoxText.trim().length === 0;
}

/**
 * Saves a picture of the active lasso to `target` (PNG). Must run while the
 * lasso is still there. Resolves the path actually written (the host may
 * return its own), or null when it failed.
 */
export async function saveLassoPreview(target: string): Promise<string | null> {
  try {
    const r = (await PluginCommAPI.generateLassoPreview(target)) as SdkResponse<{imagePath?: string}>;
    if (!r?.success) {
      logWarn('lassoRead: preview failed', errText(r, 'failed'));
      return null;
    }
    return r.result?.imagePath || target;
  } catch (e) {
    logWarn('lassoRead: preview threw', errorMessage(e));
    return null;
  }
}
