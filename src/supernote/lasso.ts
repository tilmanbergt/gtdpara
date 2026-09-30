/**
 * Thin wrappers around the PluginCommAPI calls the lasso-capture flow needs
 * (screens/CaptureScreen.tsx) - same logging/error-shape conventions as
 * supernote/fileSystem.ts, but these are UI/comm APIs, not file I/O, so
 * (unlike fileSystem.ts) none of them need FILE:READ/WRITE permission.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {log, logError} from '../utils/log';

interface ApiResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

function resultOrThrow<T>(label: string, response: ApiResponse<T> | null | undefined, fallbackMessage: string): T {
  if (!response || !response.success) {
    const message = response?.error?.message || fallbackMessage;
    logError(`${label}: failed`, message);
    throw new Error(message);
  }
  return response.result as T;
}

/**
 * The elements currently inside the active lasso selection. Requires an
 * active lasso context - i.e. this should only be called right after the
 * user pressed the Lasso toolbar button, while their selection is still
 * live. Elements come back with EMR-coordinate stroke data (per the plugin
 * SDK's coordinate-system split) - callers pass them straight through to
 * recognizeElements rather than interpreting them directly.
 */
export async function getLassoElements(): Promise<Object[]> {
  log('getLassoElements: start');
  const response = (await PluginCommAPI.getLassoElements()) as ApiResponse<Object[]>;
  const result = resultOrThrow('getLassoElements', response, 'Could not read the lasso selection.');
  const elements = result ?? [];
  log('getLassoElements: done', `${elements.length} elements`);
  return elements;
}

/** Current page's display size in pixels - the `size` param recognizeElements needs alongside the lassoed elements. */
export async function getPageDisplaySize(): Promise<{width: number; height: number}> {
  log('getPageDisplaySize: start');
  const response = (await PluginCommAPI.getPageDisplaySize()) as ApiResponse<{width: number; height: number}>;
  const size = resultOrThrow('getPageDisplaySize', response, 'Could not read the page size.');
  log('getPageDisplaySize: done', size.width, size.height);
  return size;
}

/**
 * Recognizes a set of elements (as returned by getLassoElements) as text.
 * Resolves to '' rather than throwing on a host-side recognition failure or
 * an empty result - recognition is a best-effort starting point for the
 * capture screen's editable text field, never something that should block
 * capture entirely (the user can always type the text by hand instead).
 */
export async function recognizeElements(
  elements: Object[],
  size: {width: number; height: number},
): Promise<string> {
  log('recognizeElements: start', `${elements.length} elements`);
  try {
    const response = (await PluginCommAPI.recognizeElements(elements, size)) as ApiResponse<string>;
    if (!response || !response.success) {
      logError('recognizeElements: failed', response?.error?.message || 'unknown error');
      return '';
    }
    const text = response.result ?? '';
    log('recognizeElements: done', `${text.length} chars`);
    return text;
  } catch (e) {
    logError('recognizeElements: threw', e instanceof Error ? e.message : String(e));
    return '';
  }
}

/**
 * Sets the lasso box state: 0=show, 1=hide, 2=completely remove. Used with
 * state=2 after a successful capture save, to clear the lasso the user just
 * turned into a Todo/Meeting - left alone (never called) when the user
 * cancels capture, so a cancelled capture doesn't also destroy their
 * in-progress lasso selection out from under them.
 */
export async function setLassoBoxState(state: number): Promise<void> {
  log('setLassoBoxState: start', state);
  const response = (await PluginCommAPI.setLassoBoxState(state)) as ApiResponse<boolean>;
  resultOrThrow('setLassoBoxState', response, 'Could not update the lasso selection.');
  log('setLassoBoxState: done', state);
}
