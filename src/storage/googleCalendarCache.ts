/**
 * The Google Calendar feature's fetch + cache (docs/technical-
 * design-google-calendar.md §5) - deliberately kept entirely separate from
 * storage/dataCache.ts's DataCache/CachedItem, never merged into it. This is
 * the app's first network-touching module; everything else in storage/ is
 * local-file I/O only (design-overview.md §3's "files are the single
 * source of truth" is unaffected by this cache, since it's disposable and
 * never a second source of truth for Meeting content - it only ever
 * *offers* events for the user to copy, at which point they become a real
 * Meeting via googleCalendarCopy.ts, same as anything else in this app).
 *
 * One shared module-level cache (not per-screen) is what lets every mounted
 * ui/GoogleCalendarPanel.tsx instance across Daily/Current/Inbox/Review
 * agree on the same events and dedup checkmarks without redundant fetches -
 * same instinct as dataCache.ts's single shared cache, just for a different
 * kind of data.
 *
 * Persistence (2026-09-11, Tilman's request): the last successful fetch is
 * also mirrored to AsyncStorage (same mechanism as storage/settingsStorage.ts
 * - plugin-internal, disposable, not part of the PARA vault, not something
 * the user browses to) so it survives a plugin/app restart. Only successful
 * fetches are persisted - an error never overwrites good data on disk, same
 * "stale but shown" principle `doRefresh` already applies to the in-memory
 * `cached` variable. `hydrateFromDisk` runs once at module load and fills in
 * `cached` if nothing's there yet; `whenGoogleCalendarCacheHydrated()` lets a
 * panel await that one-time read before its first render so cold-opening the
 * app shows last-known events immediately, with no network call and without
 * touching the explicit-tap-only rule for *fetching* (2026-09-07 decision) -
 * a disk read isn't a fetch.
 */
import {meetingDisplayTitle} from '../domain/meetingTracking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  expandEventsForRange,
  parseIcsContent,
  toGoogleCalendarEvents,
} from '../domain/icsParser';
import {GoogleCalendarEvent} from '../domain/googleCalendarEvent';
import {Meeting} from '../domain/types';
import {ensureInternetPermission} from '../supernote/pluginPermissions';
import {log, logError} from '../utils/log';
import {CachedItem} from './dataCache';
import {onActiveProfileChange, profileScopedKey} from './profileKeys';
import {errorMessage} from '../utils/errorMessage';

const PERSIST_KEY = 'gtdpara:googleCalendarCache:v1';

/** What's actually persisted - fetchedAt + events only, never `error`. */
interface PersistedGoogleCalendarCache {
  fetchedAt: number;
  events: GoogleCalendarEvent[];
}

export interface GoogleCalendarCacheState {
  /** When `events` were last fetched SUCCESSFULLY - a failed refresh keeps the previous value (null = never fetched), so "Refresh (last …)" never claims a failed attempt as an update (docs/dev/technical-design-status-slot.md §7.5). */
  fetchedAt: number | null;
  /** Today .. +30 days, sorted ascending - see refreshGoogleCalendar. Callers narrow this down to their own display window (2/7/30 days) themselves; the fetch itself always covers the full 30 days regardless of who's asking (decided). */
  events: GoogleCalendarEvent[];
  /** Set when the last refresh failed - `events` is left as whatever was cached before (stale-but-shown) rather than cleared, so a transient network blip doesn't blank an otherwise-working panel. */
  error?: string;
}

export interface GoogleCalendarLoadingState {
  loading: boolean;
  /** Date.now() when the in-flight refresh actually started - lets a panel
   * that mounts (or remounts) mid-refresh show accurate elapsed time
   * instead of restarting its own counter from 0. Null when not loading. */
  startedAt: number | null;
}

let cached: GoogleCalendarCacheState | null = null;
let inFlight: Promise<GoogleCalendarCacheState> | null = null;
let loadingStartedAt: number | null = null;
const loadingListeners = new Set<(state: GoogleCalendarLoadingState) => void>();

export function getGoogleCalendarCache(): GoogleCalendarCacheState | null {
  return cached;
}

/** Nothing in this feature calls this today (kept for completeness/testing, same as before) - now also clears the persisted copy, so it'd be a real reset if something ever wires it up. */
export function clearGoogleCalendarCache(): void {
  cached = null;
  AsyncStorage.removeItem(profileScopedKey(PERSIST_KEY)).catch(e => {
    logError('clearGoogleCalendarCache: failed to clear persisted cache', errorMessage(e));
  });
}

/** Fire-and-forget write of a successful fetch's result - never persists an error state (see this file's top doc comment). Failures are logged, not thrown - persistence is a nice-to-have, never something a refresh should fail over. */
function persistToDisk(state: PersistedGoogleCalendarCache): void {
  AsyncStorage.setItem(profileScopedKey(PERSIST_KEY), JSON.stringify(state)).catch(e => {
    logError('persistToDisk: failed to persist Google Calendar cache', errorMessage(e));
  });
}

/**
 * One-time read of the persisted cache at module load, so a cold app start
 * has last-known events available immediately (§ this file's top doc
 * comment). Only fills `cached` if nothing's there yet - a real fetch that
 * somehow completes before this resolves always wins, never gets clobbered
 * by an older on-disk copy. Never throws; a missing/corrupt entry just means
 * no hydration happens, same as "never fetched yet".
 */
async function hydrateFromDisk(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(profileScopedKey(PERSIST_KEY));
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedGoogleCalendarCache;
    if (cached) return; // a real fetch already landed while we were reading disk
    cached = {fetchedAt: parsed.fetchedAt, events: parsed.events};
    log('hydrateFromDisk: restored persisted Google Calendar cache', `${parsed.events.length} events`);
  } catch (e) {
    logError('hydrateFromDisk: failed to restore persisted cache', errorMessage(e));
  }
}

let hydrationPromise: Promise<void> = hydrateFromDisk();

// One cache per profile (docs/dev/technical-design-profiles-demo-space.md §3.3):
// on a switch, forget the in-memory events and load the new profile's copy.
onActiveProfileChange(() => {
  cached = null;
  hydrationPromise = hydrateFromDisk();
});

/** Lets a panel await the one-time disk read before syncing its first render off `getGoogleCalendarCache()` - resolves once hydration has been attempted (success or failure), never rejects. */
export function whenGoogleCalendarCacheHydrated(): Promise<void> {
  return hydrationPromise;
}

/** Synchronous read of whether a refresh is in flight right now (and when it
 * started) - for a newly-mounted ui/GoogleCalendarPanel.tsx's initial
 * render, before subscribeGoogleCalendarLoading's first callback fires. */
export function getGoogleCalendarLoadingState(): GoogleCalendarLoadingState {
  return {loading: inFlight !== null, startedAt: loadingStartedAt};
}

/**
 * Notified whenever a refresh starts or finishes, regardless of which
 * GoogleCalendarPanel instance (if any, on any screen) called
 * refreshGoogleCalendar - lets every mounted panel reflect the one real
 * shared fetch instead of each tracking its own local `loading` flag.
 *
 * 2026-09-07 fix: previously each panel's own `loading` state reset to
 * false on mount and its effect re-triggered a fetch whenever
 * getGoogleCalendarCache() was still null - which is true for the entire
 * duration of an in-flight fetch, not just "never fetched". Switching a
 * screen's MiniTabs away from Google Calendar and back before the first
 * fetch resolved (or opening the tab on a second screen while one was
 * already running) therefore fired a redundant second concurrent fetch.
 * Now the cache module is the single source of truth for loading state and
 * de-dupes the fetch itself (see refreshGoogleCalendar); panels just
 * subscribe and reflect it.
 */
export function subscribeGoogleCalendarLoading(
  listener: (state: GoogleCalendarLoadingState) => void,
): () => void {
  loadingListeners.add(listener);
  return () => {
    loadingListeners.delete(listener);
  };
}

function setLoading(loading: boolean): void {
  loadingStartedAt = loading ? Date.now() : null;
  const state: GoogleCalendarLoadingState = {loading, startedAt: loadingStartedAt};
  loadingListeners.forEach(listener => listener(state));
}

const FETCH_TIMEOUT_MS = 15000;
const FETCH_WINDOW_DAYS = 30;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Accepts webcal:// (upgraded to https://) same as a plain https:// link; rejects anything else - Google's own "secret address in iCal format" is always https. */
function normaliseIcsUrl(raw: string): string | null {
  const url = raw.trim().replace(/^webcal:\/\//i, 'https://');
  return url.startsWith('https://') ? url : null;
}

function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fetches and parses the configured ICS URL, replacing the cache on
 * success. Never throws past this function - every failure path (bad URL,
 * permission denied, network error, timeout, non-ICS response) resolves to
 * a GoogleCalendarCacheState with `error` set and `events` left at whatever
 * was cached before, so a caller always has something safe to render.
 * `ensureInternetPermission()` is called here and only here - never
 * eagerly, never from Settings just because a URL was typed in (decided).
 *
 * De-duped: a refresh already in flight is returned as-is rather than
 * starting a second concurrent fetch - see subscribeGoogleCalendarLoading's
 * doc comment for why this matters (2026-09-07 fix).
 */
export function refreshGoogleCalendar(icsUrl: string): Promise<GoogleCalendarCacheState> {
  if (inFlight) return inFlight;
  setLoading(true);
  inFlight = doRefresh(icsUrl).finally(() => {
    inFlight = null;
    setLoading(false);
  });
  return inFlight;
}

async function doRefresh(icsUrl: string): Promise<GoogleCalendarCacheState> {
  const previousEvents = cached?.events ?? [];
  const previousFetchedAt = cached?.fetchedAt ?? null;
  const safeUrl = normaliseIcsUrl(icsUrl);
  if (!safeUrl) {
    cached = {
      fetchedAt: previousFetchedAt,
      events: previousEvents,
      error: 'Calendar link must be an https:// (or webcal://) URL.',
    };
    return cached;
  }

  try {
    const granted = await ensureInternetPermission('Allow GtdPara to download your Google Calendar (the ICS link you entered) - only when you tap Load or Refresh.');
    if (!granted) {
      cached = {fetchedAt: previousFetchedAt, events: previousEvents, error: 'Internet access was not allowed.'};
      return cached;
    }

    log('refreshGoogleCalendar: fetching', safeUrl);
    const response = await withTimeout(fetch(safeUrl), FETCH_TIMEOUT_MS, 'fetching Google Calendar');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new Error('That link did not return a calendar (iCal) file.');
    }

    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeEnd = new Date(rangeStart.getTime() + FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const parsed = parseIcsContent(text);
    const expanded = expandEventsForRange(parsed, rangeStart, rangeEnd);
    const todayStr = todayKey(now);
    const events = toGoogleCalendarEvents(expanded).filter(e => e.date >= todayStr);

    const fresh = {fetchedAt: Date.now(), events};
    cached = fresh;
    persistToDisk(fresh);
    log('refreshGoogleCalendar: done', `${events.length} events`);
    return cached;
  } catch (e) {
    const message = errorMessage(e);
    logError('refreshGoogleCalendar: error', message);
    cached = {fetchedAt: previousFetchedAt, events: previousEvents, error: message};
    return cached;
  }
}

// --- Dedup (docs/dev/technical-design-google-calendar.md §6) ---

function localMeetingKey(m: Pick<Meeting, 'title' | 'date' | 'time'>): string {
  return `${m.title.trim().toLowerCase()}|${m.date}|${m.time}`;
}

/**
 * The set of "title|date|time" keys already present as a local Meeting
 * anywhere in the cached Projects/Areas plus Inbox - a Google Calendar
 * event whose own key is in this set already has a checkmark (decided:
 * title+date+time match, not an ICS UID - no Meeting schema change).
 * Callers assemble `items` from storage/dataCache.ts's getCachedData() and
 * `inboxMeetings` from a direct loadProjectFile('inbox', ...) read, same as
 * screens/InboxScreen.tsx already does (Inbox.txt isn't part of dataCache).
 */
export function alreadyCopiedKeys(items: CachedItem[], inboxMeetings: Meeting[]): Set<string> {
  const all = items.flatMap(item => item.meetings).concat(inboxMeetings);
  // Compare on the displayed title: machine-managed tags added after the
  // copy (#monthly, #prepped, #reviewed) must not make an already-copied
  // event look new again.
  return new Set(all.map(m => localMeetingKey({...m, title: meetingDisplayTitle(m)})));
}

export function googleEventKey(event: Pick<GoogleCalendarEvent, 'title' | 'date' | 'time'>): string {
  return localMeetingKey(event);
}
