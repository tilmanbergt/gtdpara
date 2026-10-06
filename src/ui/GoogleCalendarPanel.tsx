/**
 * The shared Google Calendar mini-view (docs/dev/technical-design-google-
 * calendar.md §8) - embedded identically as tab 2 of a MiniTabs switcher in
 * DailyView/ProjectDataPanel/InboxScreen/ReviewScreen's Week-ahead step, one
 * shared component rather than four bespoke UIs.
 *
 * The fetch always covers today..+30 days (storage/googleCalendarCache.ts);
 * this component only narrows that down for *display* via `maxDays` - the
 * shared cache itself is never re-fetched with a different window per
 * caller. `dateRange` (docs/dev/technical-design-weekly-view.md §5) is an
 * optional inclusive `{start, end}` window for screens/WeekView.tsx's Google
 * mini-tab, since `maxDays` can only express "today .. +N days". When given,
 * it wins over `maxDays`; a caller passes exactly one of the two.
 *
 * Refresh UX:
 * - No auto-fetch on mount - a refresh only happens on an explicit tap, so
 *   it's always a deliberate choice, never a side effect of opening a tab.
 * - Loading/elapsed-time state is read from the shared cache module
 *   (getGoogleCalendarLoadingState/subscribeGoogleCalendarLoading) rather
 *   than a local `loading` flag, so switching tabs away and back mid-fetch
 *   (which unmounts/remounts this component) shows the real "still
 *   refreshing, Ns" state instead of resetting to idle and firing a second
 *   fetch (the de-dupe lives in googleCalendarCache.ts's refreshGoogleCalendar).
 * - The spinner and an elapsed-seconds counter show for every refresh, so a
 *   refresh is visible even when stale data is already listed.
 *
 * "Hide existing" toggle: a small text toggle next to Refresh that filters
 * out already-copied (checkmarked) events. Defaults to hiding, so the list
 * opens showing just what's left to copy. Local state, reset on every mount.
 *
 * Layout (docs/dev/technical-design-pagination-fixed-height.md §3.3): the
 * list is one `ui/PagedSection.tsx` - `header` is the resolved range via
 * `formatDateRangeHeader`, `subHeader` is the Refresh (with "last updated"
 * in its label)/Show-existing row. Callers pass a pixel `viewportHeight`.
 *
 * Tapping a row selects it (`expandedUid`), and a single fixed footer below
 * the `PagedSection` shows the picker/Copy button for the selected event.
 * The footer is not inline under the row because `PagedSection`'s box is a
 * fixed-height, `overflow:'hidden'` viewport that would clip it. The
 * footer's idle height is one small hint line, always present so its
 * position never moves; the picker/button may grow the component past that
 * baseline transiently (including `DestinationPicker`'s open dropdown), the
 * same as `QuickAddWidget`'s identical `DestinationPicker` usage.
 *
 * `viewportHeight` is optional, for a caller where this is the sole occupant
 * of a bounded flex:1 box (e.g. one of DailyView's Calendar-column
 * MiniTabs). The outer `<View>` and the internal `PagedSection` then
 * self-measure via flex:1, with the `subHeader` row and the copy-footer as
 * natural-height siblings - the same composition-over-arithmetic idea
 * ui/PagedSection.tsx's doc comment describes.
 */
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {Destination} from '../domain/destination';
import {formatDateRange} from '../domain/dateFormat';
import {isoDateOffset, todayIso} from '../domain/meetingTime';
import {meetingTimeCell, MeetingTimeMode} from '../domain/meetingDisplay';
import {Meeting} from '../domain/types';
import {GoogleCalendarEvent} from '../domain/googleCalendarEvent';
import {CachedItem} from '../storage/dataCache';
import {
  alreadyCopiedKeys,
  getGoogleCalendarCache,
  getGoogleCalendarLoadingState,
  googleEventKey,
  refreshGoogleCalendar,
  subscribeGoogleCalendarLoading,
  whenGoogleCalendarCacheHydrated,
} from '../storage/googleCalendarCache';
import {buildMeetingFromEvent, copyGoogleEventToDestination} from '../storage/googleCalendarCopy';
import {loadProjectFile} from '../storage/projectFile';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import DestinationPicker from './DestinationPicker';
import {MEETING_ROW_HEIGHT, TIME_COLUMN_DP} from './MeetingRow';
import PagedSection from './PagedSection';
import {COLORS, FONT} from './theme';
import {useErrorStatus} from './status/StatusProvider';
import MarkWrap from './status/StatusMark';
import {usePerfRender} from '../utils/perf';

/** Single-line event row - the same 37 dp as a 1-line meeting row
 * (docs/dev/technical-design-meeting-lists.md §2.3, step 8): paddingVertical 7 x 2
 * + one 22 dp line, the same time column width and wording
 * (domain/meetingDisplay.ts's meetingTimeCell), so the Google tab and the
 * Meetings tab next to it read as the same list. */
export const GOOGLE_EVENT_ROW_PX = MEETING_ROW_HEIGHT.oneLine;
/** The `subHeader` row's own height (Refresh/Show-existing line, `FONT.small`
 * text ~18 + a small `marginBottom` 6) - exported so a caller composing a
 * multi-tab column that must keep the same total height across tabs
 * (screens/DailyView.tsx's Calendar column) can subtract it from its own
 * per-tab budget, as it does for `PagedSection`'s header row. Other callers
 * can ignore it - this component already accounts for its own subHeader. */
export const GOOGLE_SUBHEADER_ROW_PX = 24;
/** The copy-footer's own baseline (idle, nothing selected) height - one
 * small hint line (`FONT.small` ~18 + `marginTop` 8). Only the baseline is
 * budgeted; the expanded picker+button state is transient (see the module
 * doc comment). Exported for the same caller as `GOOGLE_SUBHEADER_ROW_PX`. */
export const GOOGLE_COPY_FOOTER_BASELINE_PX = 26;

interface Props {
  /** When true, a copied event becomes a Month highlight (`#monthly`) right away - the Month view's Google tabs (docs/dev/technical-design-monthly-view.md). */
  copyAsHighlight?: boolean;
  /** How many of the shared 30-day cache's events to actually show, counting from today: 2 (Daily), 7 (Review), 30 (Project/Area/Inbox). Ignored when `dateRange` is provided - see this file's module doc comment. */
  maxDays?: number;
  /** An explicit, inclusive YYYY-MM-DD display window - screens/WeekView.tsx's own Google mini-tab (docs/dev/technical-design-weekly-view.md §5), which needs an arbitrary start point `maxDays` can't express. Wins over `maxDays`; every other caller omits this. */
  dateRange?: {start: string; end: string};
  /** Fixed pixel height for the event-list box (docs/technical-
   * design-pagination-fixed-height.md §3.3). Tunable per caller, since this
   * component is reused across screens whose available space differs.
   *
   * Omit it when this component is the sole occupant of a bounded flex:1 box
   * (e.g. screens/DailyView.tsx's Calendar column). The root then becomes
   * `flex:1` and the internal `PagedSection` self-measures too, between the
   * natural-height `subHeader` and copy-footer - composition, not arithmetic.
   * `GOOGLE_SUBHEADER_ROW_PX`/`GOOGLE_COPY_FOOTER_BASELINE_PX` are then not
   * needed. */
  viewportHeight?: number;
  defaultDestination: Destination;
  /** For dedup against Project/Area meetings and as DestinationPicker's candidate list. */
  items: CachedItem[];
  /** '' = not configured - renders the empty state instead of a list. */
  icsUrl: string;
  inboxPath: string;
  onOpenSettings: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

function withinWindow(event: GoogleCalendarEvent, maxDays: number, today: string): boolean {
  // Both are YYYY-MM-DD, so plain string comparison orders them.
  return event.date >= today && event.date <= isoDateOffset(maxDays - 1);
}

/** `dateRange`'s own window check (see this file's module doc comment) - a plain inclusive-range comparison, no "today" involved at all, unlike withinWindow above which always counts from today. */
function withinDateRange(event: GoogleCalendarEvent, range: {start: string; end: string}): boolean {
  return event.date >= range.start && event.date <= range.end;
}

/** Compact "how long ago" for the persisted-cache hint - lets the user tell
 * a freshly-fetched list apart from one restored from a previous session
 * without needing an exact timestamp. */
function formatFetchedAt(fetchedAt: number): string {
  const minutes = Math.floor((Date.now() - fetchedAt) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function GoogleCalendarPanel({
  copyAsHighlight,
  maxDays,
  dateRange,
  viewportHeight,
  defaultDestination,
  items,
  icsUrl,
  inboxPath,
  onOpenSettings,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  usePerfRender('GoogleCalendarPanel');
  const [events, setEvents] = useState<GoogleCalendarEvent[]>(() => getGoogleCalendarCache()?.events ?? []);
  const [error, setError] = useState<string | undefined>(() => getGoogleCalendarCache()?.error);
  // A failed refresh -> central status slot + ⚠ on the Refresh link; the
  // events from the last successful fetch stay listed (docs/technical-
  // design-status-slot.md §7.5).
  useErrorStatus('calendar.refresh', error ? `Google Calendar refresh failed: ${error}` : null, () => setError(undefined));
  // Distinct from `events.length === 0` - that's also true before anything
  // has ever been fetched this session, and the two need different copy
  // (an explicit "not loaded yet" prompt vs. a genuine "nothing in this
  // window" empty state). A persisted cache restored from a previous session
  // (see the hydration effect below) also counts as loaded - "loaded" means
  // "there's something to show", not "fetched this session".
  const [hasLoaded, setHasLoaded] = useState<boolean>(() => getGoogleCalendarCache() !== null);
  // When the shown events were actually fetched - null until hasLoaded, from
  // either a same-session fetch or a restored persisted cache. Drives the
  // "updated Ns/m/h/d ago" hint so a restored-from-disk list reads visibly
  // different from a just-refreshed one.
  const [fetchedAt, setFetchedAt] = useState<number | null>(() => getGoogleCalendarCache()?.fetchedAt ?? null);
  const [loading, setLoadingFlag] = useState(() => getGoogleCalendarLoadingState().loading);
  // Explicit e-ink refresh once a fetch actually lands - see
  // src/utils/screenRefresh.ts. The ICS fetch/parse is a large enough
  // operation that the e-ink screen would otherwise not redraw.
  useEinkRefreshOnLoad(loading);
  const [startedAt, setStartedAt] = useState<number | null>(() => getGoogleCalendarLoadingState().startedAt);
  // Hides already-copied (checkmarked) events. Local to this mount, not
  // shared/persisted like the loading state above - resetting to the default
  // each time the tab opens is fine and simpler. Defaults to hiding so the
  // list opens showing just what's left to copy.
  const [hideExisting, setHideExisting] = useState(true);
  const [, forceTick] = useState(0);
  const [inboxMeetings, setInboxMeetings] = useState<Meeting[]>([]);
  const [justCopiedKeys, setJustCopiedKeys] = useState<Set<string>>(new Set());
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [pickerDestination, setPickerDestination] = useState<Destination>(defaultDestination);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copyingUid, setCopyingUid] = useState<string | null>(null);
  // Same flag/pattern as ui/PagedSection.tsx's own `selfMeasuring` - see
  // this component's `viewportHeight` prop doc comment above.
  const selfMeasuring = viewportHeight == null;

  const syncFromCache = React.useCallback(() => {
    const state = getGoogleCalendarCache();
    if (state) {
      setEvents(state.events);
      setError(state.error);
      setHasLoaded(state.fetchedAt !== null || state.events.length > 0);
      setFetchedAt(state.fetchedAt);
    }
  }, []);

  const runRefresh = React.useCallback(async () => {
    if (!icsUrl) return;
    await refreshGoogleCalendar(icsUrl);
    syncFromCache();
  }, [icsUrl, syncFromCache]);

  // Restores a persisted cache from a previous session - a pure disk read,
  // not a fetch, so it doesn't touch the explicit-tap-only rule below.
  // Usually resolves near-instantly (hydration runs once at module load),
  // but this covers a panel that is the very first thing to mount. If a real
  // fetch already landed in the meantime, syncFromCache just reflects that -
  // the cache module decides who wins (see whenGoogleCalendarCacheHydrated).
  useEffect(() => {
    let cancelled = false;
    whenGoogleCalendarCacheHydrated().then(() => {
      if (!cancelled) syncFromCache();
    });
    return () => {
      cancelled = true;
    };
  }, [syncFromCache]);

  // Reflects the one shared fetch (googleCalendarCache.ts) regardless of
  // which panel instance triggered it, and regardless of this component
  // unmounting/remounting mid-fetch (switching MiniTabs away and back) -
  // see this file's top doc comment.
  useEffect(() => {
    return subscribeGoogleCalendarLoading(state => {
      setLoadingFlag(state.loading);
      setStartedAt(state.startedAt);
      if (!state.loading) {
        syncFromCache();
      }
    });
  }, [syncFromCache]);

  // Ticks once a second only while loading, purely to re-render so the
  // elapsed-seconds text below stays live.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!icsUrl) return;
    let cancelled = false;
    loadProjectFile('inbox', inboxPath).then(state => {
      if (!cancelled) setInboxMeetings(state.meetings);
    });
    return () => {
      cancelled = true;
    };
  }, [icsUrl, inboxPath]);

  // Dedup/hide-existing: computed unconditionally (like `visible`/`paged`
  // below) since none of it is a hook and it's cheap even when icsUrl is
  // unset - keeps the `!icsUrl` early return simple.
  const copiedKeys = new Set([...alreadyCopiedKeys(items, inboxMeetings), ...justCopiedKeys]);
  // Paginated (docs/dev/technical-design-pagination-edit-reuse.md §2/§4) - this
  // panel is shared across Daily, Review's week-ahead, Project/Area/Inbox's
  // own Calendar tab and Week (docs/dev/technical-design-weekly-view.md §5),
  // so without pagination a wide window could scroll indefinitely.
  // Computed/called unconditionally, before the `!icsUrl` early return below,
  // since hooks can't follow a conditional return. `dateRange` wins over
  // `maxDays` when provided - see this file's module doc comment.
  const windowed = dateRange
    ? events.filter(e => withinDateRange(e, dateRange))
    : events.filter(e => withinWindow(e, maxDays ?? 30, todayIso()));
  // "Hide existing" filters out events that already have a checkmark - i.e.
  // already copied to a local Meeting - leaving just what's left to copy.
  // Filtered before pagination so page counts reflect what's actually shown.
  const visible = hideExisting ? windowed.filter(e => !copiedKeys.has(googleEventKey(e))) : windowed;
  // The shown range, for the header.
  const rangeStart = dateRange?.start ?? todayIso();
  const rangeEnd = dateRange?.end ?? isoDateOffset((maxDays ?? 30) - 1);
  // Searched from the full `events` list, not `visible` - so the copy
  // footer keeps showing the selected event even if `hideExisting` toggles
  // it out of the row list while it's selected.
  const expandedEvent = expandedUid ? events.find(e => e.uid === expandedUid) ?? null : null;

  if (!icsUrl) {
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyText, {color: textColor}]}>
          No Google Calendar linked yet.
        </Text>
        <Pressable onPress={onOpenSettings}>
          <Text style={styles.link}>Open Calendar Settings</Text>
        </Pressable>
      </View>
    );
  }

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;

  const handleCopy = async (event: GoogleCalendarEvent) => {
    setCopyingUid(event.uid);
    try {
      await copyGoogleEventToDestination(event, pickerDestination, inboxPath, {highlight: copyAsHighlight});
      const key = googleEventKey(event);
      setJustCopiedKeys(prev => new Set(prev).add(key));
      if (pickerDestination.type === 'inbox') {
        setInboxMeetings(prev => [...prev, buildMeetingFromEvent(event, {highlight: copyAsHighlight})]);
      }
      setExpandedUid(null);
      setPickerOpen(false);
    } finally {
      setCopyingUid(null);
    }
  };

  const timeMode: MeetingTimeMode = rangeStart === rangeEnd ? 'time' : 'dateTime';
  const renderEvent = (event: GoogleCalendarEvent) => {
    const key = googleEventKey(event);
    const copied = copiedKeys.has(key);
    const isExpanded = expandedUid === event.uid;
    // Same wording as a meeting row: a single-day window shows the time
    // only, a longer one the date too ("29.9. 10:00", today time-only).
    const displayTime = meetingTimeCell({date: event.date, time: event.time, endTime: event.endTime ?? ''}, undefined, timeMode).oneLine;
    return (
      <Pressable
        key={event.uid}
        style={[styles.row, {borderColor}]}
        disabled={copied}
        onPress={() => {
          if (copied) return;
          setExpandedUid(isExpanded ? null : event.uid);
          setPickerDestination(defaultDestination);
          setPickerOpen(false);
        }}>
        <Text style={[styles.time, {color: textColor, width: TIME_COLUMN_DP[timeMode].oneLine}]} numberOfLines={1}>
          {displayTime}
        </Text>
        <Text
          style={[styles.title, {color: textColor}, isExpanded && styles.titleSelected]}
          numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.check}>{copied ? '✓' : ''}</Text>
      </Pressable>
    );
  };

  return (
    <View style={selfMeasuring ? styles.selfMeasuringRoot : undefined}>
      <PagedSection
        header={formatDateRange(rangeStart, rangeEnd, todayIso())}
        subHeader={
          <View style={styles.headerLeft}>
            <MarkWrap mark={error && !loading ? 'warning' : null} textColor={textColor}>
              <Pressable onPress={runRefresh} disabled={loading}>
                <Text style={styles.link}>
                  {loading
                    ? `Refreshing… ${elapsedSeconds}s`
                    : hasLoaded && fetchedAt !== null
                    ? `Refresh (last ${formatFetchedAt(fetchedAt)})`
                    : 'Load Google Calendar'}
                </Text>
              </Pressable>
            </MarkWrap>
            {/* Toggle label reads as the action tapping it takes next (like
                a "Show more"/"Show less" button), not the current state. */}
            <Pressable onPress={() => setHideExisting(h => !h)} hitSlop={8} style={styles.toggleButton}>
              <Text style={[styles.link, styles.toggleText]}>
                {hideExisting ? 'Show existing' : 'Hide existing'}
              </Text>
            </Pressable>
          </View>
        }
        rows={loading || !hasLoaded ? [] : visible}
        rowHeight={() => GOOGLE_EVENT_ROW_PX}
        viewportHeight={viewportHeight}
        renderRow={renderEvent}
        viewportContent={
          loading ? (
            <ActivityIndicator style={styles.spinner} />
          ) : !hasLoaded ? (
            <Text style={[styles.emptyText, {color: textColor}]}>
              {error
                ? 'Nothing loaded - see the message at the top, then tap "Load Google Calendar".'
                : 'Not loaded yet - tap "Load Google Calendar" above to fetch it.'}
            </Text>
          ) : undefined
        }
        emptyHint={
          windowed.length === 0
            ? 'Nothing in this window.'
            : 'All events in this window are already copied. Tap "Show existing" to see them.'
        }
        textColor={textColor}
        borderColor={borderColor}
      />
      {/* Fixed copy-footer - see this file's module doc comment. Always
          mounted so its position never moves; shows just a hint line when
          idle, swaps to the picker+Copy button for the selected event. */}
      <View style={styles.copyFooter}>
        {expandedEvent && !copiedKeys.has(googleEventKey(expandedEvent)) ? (
          <>
            <Text style={[styles.copyFooterTitle, {color: textColor}]} numberOfLines={1}>
              Copy "{expandedEvent.title}" to:
            </Text>
            <DestinationPicker
              destination={pickerDestination}
              onSelect={setPickerDestination}
              open={pickerOpen}
              onToggleOpen={() => setPickerOpen(!pickerOpen)}
              items={items}
              textColor={textColor}
              borderColor={borderColor}
            />
            <Pressable
              style={styles.copyButton}
              disabled={copyingUid === expandedEvent.uid}
              onPress={() => handleCopy(expandedEvent)}>
              <Text style={styles.copyButtonText}>
                {copyingUid === expandedEvent.uid ? 'Copying…' : 'Copy to ' + destinationShortLabel(pickerDestination)}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={[styles.copyHint, {color: placeholderColor}]}>Tap an event above to copy it.</Text>
        )}
      </View>
    </View>
  );
}

function destinationShortLabel(destination: Destination): string {
  return destination.type === 'inbox' ? 'Inbox' : destination.name;
}

const styles = StyleSheet.create({
  // Self-measuring mode only (viewportHeight omitted) - see this file's own
  // `viewportHeight` prop doc comment and ui/PagedSection.tsx's identical
  // `selfMeasuringRoot`, which this mirrors: this component's own root needs
  // flex:1 to receive real space from its caller, so its internal
  // PagedSection (itself flex:1 when self-measuring) gets a real number to
  // measure instead of a lone, unbounded flex:1 with no bounded ancestor.
  selfMeasuringRoot: {
    flex: 1,
  },
  emptyState: {
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginBottom: 6,
  },
  link: {
    fontSize: FONT.small,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // subHeader row (Refresh/Show-existing) - no marginBottom of its own
  // (PagedSection's own headerRow already carries a borderBottomWidth/
  // marginBottom above it); GOOGLE_SUBHEADER_ROW_PX budgets this exact row.
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  toggleButton: {
    marginLeft: 16,
  },
  toggleText: {
    fontWeight: '400',
    opacity: 0.75,
  },
  spinner: {
    marginTop: 12,
  },
  errorText: {
    fontSize: FONT.small,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  time: {
    fontSize: FONT.medium,
    lineHeight: 22,
    marginRight: 8,
  },
  title: {
    fontSize: FONT.medium,
    lineHeight: 22,
    flex: 1,
  },
  // The row currently shown in the copy footer below - a plain weight bump
  // (grayscale-safe, ui/theme.ts's own "weight/fill/border, never hue"
  // convention) since the footer does not sit right under this row.
  titleSelected: {
    fontWeight: '700',
  },
  check: {
    fontSize: FONT.medium,
    width: 20,
    textAlign: 'right',
  },
  // Fixed copy-footer (see this file's own module doc comment) -
  // GOOGLE_COPY_FOOTER_BASELINE_PX budgets copyHint's own idle-state height;
  // the picker/Copy button that replace it once an event is selected are
  // allowed to grow past that baseline (same transient-growth precedent
  // QuickAddWidget's own DestinationPicker usage already has).
  copyFooter: {
    marginTop: 8,
  },
  copyFooterTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  copyHint: {
    fontSize: FONT.small,
    opacity: 0.6,
  },
  copyButton: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: COLORS.accentText,
    fontSize: FONT.small,
    fontWeight: '600',
  },
});
