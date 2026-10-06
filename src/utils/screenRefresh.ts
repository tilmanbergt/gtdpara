/**
 * Explicit e-ink refresh for this plugin's own view.
 *
 * When a screen's data-prep (file reads, cache rebuilds, aggregation) takes
 * a while, the resulting content may not appear on the device until some
 * unrelated system UI action (e.g. dragging down the top menu) forces a
 * refresh. The React tree is correct; the e-ink panel just never gets told
 * to flush the changed pixels, because that flush is tied to the host's own
 * input-driven refresh scheduling, not to every RN commit. An async state
 * update with no user gesture right before it can commit "silently".
 *
 * sn-plugin-lib's NativePluginManager offers `invalidatePluginView()`
 * ("Refresh plugin view"), a fire-and-forget native call. Calling it on
 * every render would be wasteful and could fire visible full refresh sweeps
 * in quick succession (several panels finishing their loads together), so
 * a trailing debounce coalesces a burst into a single refresh.
 *
 * Double-rAF before flushing: `useLayoutEffect` firing only means React has
 * dispatched the native view mutations across the bridge, not that the
 * native UI thread has drawn them, so refreshing right when the debounce
 * fires can capture a stale frame. Two requestAnimationFrame callbacks is
 * the standard RN pattern for "wait until natively painted". Both the
 * debounce-fire and the post-rAF flush are logged, so a capture shows this
 * stage's timing directly in the ReactNativeJS tag.
 */
import {useEffect, useRef} from 'react';
import {NativePluginManager} from 'sn-plugin-lib';
import {log, logError} from './log';
import {perfMark} from './perf';
import {errorMessage} from './errorMessage';

const DEBOUNCE_MS = 150;
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Asks the host to refresh the e-ink display for this plugin's view.
 * Debounced app-wide (not per-caller) so a burst of near-simultaneous
 * callers - several panels on one screen finishing their own independent
 * loads together - still only triggers one actual refresh. See the module
 * doc comment's "Double-rAF before flushing" note for why the actual
 * native call is deferred two frames past the debounce firing.
 */
export function requestEinkRefresh(): void {
  perfMark('eink:requested');
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    log('requestEinkRefresh: debounce fired, waiting two frames before flush');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        perfMark('eink:flush');
        log('requestEinkRefresh: flushing (invalidatePluginView)');
        try {
          NativePluginManager.invalidatePluginView();
        } catch (e) {
          logError('requestEinkRefresh: invalidatePluginView failed', errorMessage(e));
        }
      });
    });
  }, DEBOUNCE_MS);
}

/**
 * Calls requestEinkRefresh() exactly on the falling edge of `loading` (true
 * -> false) - i.e. the moment a screen/panel's own async page-prep finishes
 * and its real content replaces whatever was showing before (spinner,
 * stale data, or nothing). Deliberately edge-triggered rather than "on every
 * change" so it neither fires while still loading nor repeatedly while
 * already-loaded content re-renders for unrelated reasons.
 */
export function useEinkRefreshOnLoad(loading: boolean): void {
  const prevLoading = useRef(loading);
  useEffect(() => {
    if (prevLoading.current && !loading) {
      requestEinkRefresh();
    }
    prevLoading.current = loading;
  }, [loading]);
}
