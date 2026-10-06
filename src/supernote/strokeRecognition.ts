/**
 * Handwriting recognition from saved stroke data (docs/dev/technical-design-
 * lasso-0.8.md §2.1, §3.4) - one path for Capture and for marks.
 *
 * The strokes are rebuilt as new elements from their points, moved to the
 * top-left first (domain/marks.ts shiftStrokes), and recognized with the
 * page size. On the A5 X the points use a larger EMR range than the page
 * size implies; with the original positions everything below ~1368 px fell
 * outside and failed (117) or came back partial.
 *
 * One recognition at a time: calls are chained, the host recognizer is
 * never asked twice at once.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {shiftStrokes, StoredStroke} from '../domain/marks';
import {log, logWarn} from '../utils/log';
import {
  ELEMENT_TYPE_STROKE,
  errorMessage,
  errText,
  fillAccessor,
  recycleElements,
  SdkElement,
  SdkResponse,
} from './sdkElements';

type Size = {width: number; height: number};

export interface RecognitionResult {
  /** Recognized handwriting and text-box text, joined by a line break ('' when nothing). */
  text: string;
  /** The host's error, e.g. '117: Recognition failed. Please try again!'; null when it worked. */
  error: string | null;
  ms: number;
}

let chain: Promise<unknown> = Promise.resolve();

function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

async function buildStrokes(strokes: StoredStroke[], page: number): Promise<SdkElement[]> {
  const built: SdkElement[] = [];
  try {
    for (const s of strokes) {
      const created = (await PluginCommAPI.createElement(ELEMENT_TYPE_STROKE)) as SdkResponse<SdkElement>;
      if (!created?.success || !created.result) {throw new Error('createElement: ' + errText(created, 'failed'));}
      const el = created.result;
      built.push(el);
      el.pageNum = page;
      if (s.layerNum != null) {el.layerNum = s.layerNum;}
      if (s.thickness != null) {el.thickness = s.thickness;}
      if (!el.stroke?.points) {throw new Error('created stroke has no points accessor');}
      if (s.penColor != null) {el.stroke.penColor = s.penColor;}
      if (s.penType != null) {el.stroke.penType = s.penType;}
      const pts = [];
      for (let i = 0; i + 1 < s.points.length; i += 2) {pts.push({x: s.points[i], y: s.points[i + 1]});}
      if (!(await fillAccessor(el.stroke.points, pts))) {throw new Error('could not fill stroke points');}
      if (el.stroke.pressures && s.pressures.length > 0) {await fillAccessor(el.stroke.pressures, s.pressures);}
    }
  } catch (e) {
    recycleElements(built);
    throw e;
  }
  return built;
}

/**
 * Recognizes `strokes` and appends `textBoxText`. Never throws: a failure
 * comes back as `error` with whatever text there is (the text boxes').
 * `size` is the page size the strokes were drawn on (display size preferred).
 */
export function recognizeStrokes(
  strokes: StoredStroke[],
  textBoxText: string,
  size: Size | null,
  page = 0,
): Promise<RecognitionResult> {
  const boxText = textBoxText.trim();
  if (strokes.length === 0) {return Promise.resolve({text: boxText, error: null, ms: 0});}
  return serial(async () => {
    const t0 = Date.now();
    let built: SdkElement[] = [];
    let recognized = '';
    let error: string | null = null;
    let buildMs = 0;
    try {
      if (!size) {throw new Error('no page size');}
      built = await buildStrokes(shiftStrokes(strokes), page);
      buildMs = Date.now() - t0;
      const r = (await PluginCommAPI.recognizeElements(built, size)) as SdkResponse<string>;
      if (r?.success) {recognized = (r.result ?? '').trim();}
      else {error = errText(r, 'recognition failed');}
    } catch (e) {
      error = errorMessage(e);
    } finally {
      recycleElements(built);
    }
    const text = [recognized, boxText].filter(part => part.length > 0).join('\n');
    const ms = Date.now() - t0;
    if (error) {logWarn('strokeRecognition: failed', `strokes=${strokes.length}`, `ms=${ms}`, error);}
    else {log('strokeRecognition: done', `strokes=${strokes.length}`, `chars=${text.length}`, `ms=${ms}`, `build=${buildMs}`);}
    return {text, error, ms};
  });
}
