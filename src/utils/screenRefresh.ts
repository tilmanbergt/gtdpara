/**
 * Explicit e-ink refresh for this plugin's own view.
 *
 * The symptom (reported by Tilman, 2026-09-07): when a screen's data-prep
 * (file reads, cache rebuilds, aggregation - "bigger file operations or
 * calculation") takes a bit of time, the resulting content sometimes just
 * doesn't appear on the device until some unrelated system UI action (e.g.
 * dragging down the top menu) happens to force a screen refresh. The React
 * tree is correct the whole time - state updates and re-renders happen
 * normally - the e-ink panel itself just never gets told to flush the
 * changed pixels, because that flush is apparently tied to the host's own
 * input-driven refresh scheduling, not to every RN commit. An async state
 * update that lands with no direct user gesture right before it (a Promise
 * resolving in the background) can commit "silently" as far as the e-ink
 * layer is concerned.
 *
 * sn-plugin-lib's NativePluginManager exposes exactly the missing piece:
 * `invalidatePluginView()` ("Refresh plugin view"). It's a fire-and-forget
 * native call (no Promise) - cheap enough to call from a hook, but calling
 * it unconditionally on every render would be wasteful and, worse, risks
 * firing a visible full e-ink refresh sweep repeatedly in quick succession
 * (e.g. several sibling panels on the same screen each finishing their own
 * load within milliseconds of each other) - hence the trailing debounce
 * below, which coalesces a burst of finishes into a single refresh.
 *
 * Double-rAF before flushing (2026-09-13, Tilman: Review's Week-ahead step
 * confirmed - via ReviewScreen.tsx's own tap/render/commit/effect diagnostic
 * logs - to sometimes never visually appear despite every JS-side signal,
 * including this module's own invalidatePluginView() call, completing
 * normally and quickly) - `useLayoutEffect` firing only means React has
 * dispatched the native view mutations across the bridge, not that the
 * native UI thread has actually finished drawing them. Calling
 * invalidatePluginView() the instant the debounce timer fires can therefore
 * capture a stale frame even though React is completely convinced the
 * update is already live. Two requestAnimationFrame callbacks is the
 * standard RN pattern for "wait until natively painted" - each rAF doesn't
 * resolve until the native side has processed a frame, so by the second
 * one, the just-dispatched mutations are guaranteed to have been drawn.
 * Logged at both the debounce-fire and post-rAF flush points so a capture
 * can see this stage's own timing directly in the ReactNativeJS tag,
 * without cross-referencing the native PluginApp tag by hand.
 */
import {useEffect, useRef} from 'react';
import {NativePluginManager} from 'sn-plugin-lib';
import {log, logError} from './log';
import {perfMark} from './perf';

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
          logError('requestEinkRefresh: invalidatePluginView failed', e instanceof Error ? e.message : String(e));
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
