/**
 * Thin wrappers around the PluginCommAPI calls the lasso-capture flow needs
 * (screens/CaptureScreen.tsx; reading and recognizing the lasso itself lives in
 * supernote/lassoRead.ts and supernote/strokeRecognition.ts since 0.8) - same logging/error-shape conventions as
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
