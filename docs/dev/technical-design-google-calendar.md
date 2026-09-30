# Technical Design — Google Calendar (ICS) Integration

Short/starter spec — requirements were clarified over three chat rounds (see project memory `feature_google_calendar.md`); this covers just enough to begin implementation, not exhaustive prose. Read `docs/dev/design-overview.md` §3 (architectural guidelines) before touching shared modules.

## 1. Scope

Read-only preview of a user-linked Google Calendar (ICS URL), shown as a second mini-tab wherever the app already shows meetings (Daily, Current/Project/Area, Inbox, Review's Week-ahead step), plus a "copy to local" action that turns a Google event into a normal one-off `Meeting`. No write-back to Google, no recurrence created locally, no persistence of fetched events beyond an in-memory session cache. First network-touching feature in this codebase — everything else stays 100% local-file (§3's "files are the single source of truth" is unaffected: Google Calendar data never enters `dataCache.ts`).

Feasibility (permission string, fetch/parse approach) is already validated against the sibling `SNFolio` project — port from there per each section below rather than re-deriving or adding new npm dependencies.

## 2. Data model

`domain/settings.ts` — add one field, no migration needed (existing `{...DEFAULT_SETTINGS, ...parsed}` merge in `settingsStorage.ts` covers old saved blobs):

```ts
googleCalendarIcsUrl: string; // '' = not configured
```
`DEFAULT_SETTINGS.googleCalendarIcsUrl = ''`.

No changes to `Meeting`/`Task`/`FrontMatter` — dedup is title+date+time (decided), so no schema/parser/serializer work.

New, small domain type (new file `domain/googleCalendarEvent.ts`):

```ts
export interface GoogleCalendarEvent {
  uid: string;
  title: string;
  date: string;   // YYYY-MM-DD, local
  time: string;   // HH:mm 24h, or '' for all-day — same convention as Meeting.time
  allDay: boolean;
}
```

Deliberately much smaller than SNFolio's `CalendarEvent` (no attendees/description/action-items/task-mirroring) — this feature only ever needs to display and copy title+date+time.

## 3. Permission (`supernote/pluginPermissions.ts`)

Port SNFolio's `ensureInternetPermission`, keeping gtdpara's existing `ensurePluginPermission`/`withTimeout` machinery as-is (already handles the timeout gtdpara added after a real stuck-bridge bug; SNFolio's own version doesn't have it but that's not evidence it's unneeded here):

```ts
export const INTERNET_PERMISSION = 'plugin.permission.INTERNET';

export function ensureInternetPermission(): Promise<boolean> {
  return ensurePluginPermission(
    INTERNET_PERMISSION,
    'Allow GtdPara to fetch your linked Google Calendar.',
  );
}
```

Call site: only inside the actual fetch (§5), never from Settings-save, never from rendering an empty panel — matches the confirmed SNFolio call pattern.

## 4. ICS parsing (`domain/icsParser.ts`, new)

Port and trim from `SNFolio/src/domain/icsParser.ts` (zero-dependency, already tested there — mirror its test file too, `verify`-script style per §3's verification convention rather than Jest, consistent with the rest of this codebase's `domain/`). Keep:

- `unfoldIcsContent` (RFC 5545 line unfolding)
- `parseIcsDate` (incl. `VALUE=DATE` all-day, `TZID` via `Intl.DateTimeFormat` — no VTIMEZONE parsing, no bundled tz database)
- `parseIcsContent(icsText): ParsedEvent[]` — trim the per-event shape to `{uid, summary, start, end, allDay, rrule, exceptionDates, recurrenceId, recurringSeriesId}` (drop attendees/description/priority/task fields, not needed)
- RRULE expansion (`expandRruleInstances`) — port as-is, it's generic
- Add a new `expandEventsForRange(events, rangeStart, rangeEnd): ParsedEvent[]` (adapt SNFolio's per-day `expandEventsForDate` into a single range pass — this feature always wants "today..+30 days", never a single day)

A separate small mapper turns `ParsedEvent[]` into `GoogleCalendarEvent[]` (§2), taking only the first occurrence's own date/time per instance (already what the RRULE expansion produces — each expanded instance already carries its own `start`).

## 5. Fetch + cache (`storage/googleCalendarCache.ts`, new)

Mirrors `dataCache.ts`'s shape (module-level, disposable, `withTimeout`-guarded) but **kept entirely separate** — never merged into `DataCache`/`CachedItem`.

```ts
interface GoogleCalendarCacheState {
  fetchedAt: number;
  events: GoogleCalendarEvent[]; // today..+30 days, sorted ascending, upcoming only
  error?: string;
}

let cached: GoogleCalendarCacheState | null = null;
export function getGoogleCalendarCache(): GoogleCalendarCacheState | null { return cached; }

export async function refreshGoogleCalendar(icsUrl: string): Promise<GoogleCalendarCacheState> {
  // 1. ensureInternetPermission() — bail into {fetchedAt, events: [], error} if denied, don't throw
  // 2. withTimeout(fetch(icsUrl), FETCH_TIMEOUT_MS, 'fetching Google Calendar') — same pattern as dataCache's SCAN_TIMEOUT_MS
  // 3. reject non-ok status / non-ICS-looking body (SNFolio's `BEGIN:VCALENDAR` sniff) with a clear Error
  // 4. parseIcsContent + expandEventsForRange(now, now+30d) → map to GoogleCalendarEvent[], filter out past, sort
  // 5. cached = {fetchedAt: Date.now(), events}; return cached
  // On any failure: cached = {fetchedAt: Date.now(), events: cached?.events ?? [], error: message} — never throw past this function, callers render `error` inline
}
```

One shared cache instance is what makes checkmarks/refresh consistent across all 4 surfaces without redundant fetches — every mounted panel reads `getGoogleCalendarCache()` first and only calls `refreshGoogleCalendar` when nothing's cached yet or the user taps Refresh.

`FETCH_TIMEOUT_MS`: reuse the same constant style as `SCAN_TIMEOUT_MS`/`PERMISSION_TIMEOUT_MS` (suggest 15000).

## 6. Dedup (fold into `storage/googleCalendarCache.ts` or a small `isAlreadyCopied` helper alongside it)

```ts
function localMeetingKey(m: Pick<Meeting, 'title' | 'date' | 'time'>): string {
  return `${m.title.trim().toLowerCase()}|${m.date}|${m.time}`;
}

export function alreadyCopiedKeys(items: CachedItem[], inboxMeetings: Meeting[]): Set<string> {
  const all = items.flatMap(i => i.meetings).concat(inboxMeetings);
  return new Set(all.map(localMeetingKey));
}
```
Caller (the panel, §8) builds this set once from `getCachedData()?.items ?? []` + a direct `loadProjectFile('inbox', paths.base)` read (same as `InboxScreen.tsx` already does — Inbox.txt isn't in `dataCache`), then checks each `GoogleCalendarEvent` against it using the same key shape. Accepted limitation: archived items are excluded from `dataCache` entirely (same as everywhere else in the app), so an event copied into a later-archived item can re-offer as uncopied — not new behavior, consistent with how Archive already makes items invisible elsewhere.

## 7. Copy action (`storage/googleCalendarCopy.ts`, new — or fold into inboxFiling.ts-style helper)

```ts
export async function copyGoogleEventToDestination(
  event: GoogleCalendarEvent,
  destination: Destination,
  paths: ResolvedParaPaths,
): Promise<void>
```

Builds `{title: event.title, date: event.date, time: event.time, tags: [], cancelled: false, recurrence: null, notePath: '', occurrences: []}` and writes it through the *existing* machinery — no new write path:
- `destination.type === 'item'`: `ensureItemCached` → append to `item.meetings` → `saveMeetings(item.kind, item.path, item.rawContent, nextMeetings, item.meetingExtraLines)` → `updateItemMeetings(...)` (file-then-cache, same order as every other mutation, §3's write-through rule).
- `destination.type === 'inbox'`: `loadProjectFile('inbox', paths.base)` → `saveMeetings('inbox', paths.base, ...)` — no cache write-through (Inbox.txt was never part of `dataCache`, same as `InboxScreen.tsx`'s own saves).

## 8. Shared UI

**`ui/MiniTabs.tsx`** (new) — a small generic segmented switcher, 2+ tabs:
```ts
interface Props<K extends string> {
  tabs: {key: K; label: string}[];
  activeKey: K;
  onChange: (key: K) => void;
  textColor: string; borderColor: string;
}
```
Used two ways: 2-way (existing view | Google Calendar) in every calendar area, and 3-way (Folders | Focus | Calendar) in Settings — one component, per the "uniform across the app" decision.

**`ui/GoogleCalendarPanel.tsx`** (new) — the shared mini-view:
```ts
interface Props {
  maxDays: number;                 // 2 (Daily), 7 (Review), 30 (Project/Area/Inbox)
  defaultDestination: Destination; // Inbox (Daily/Inbox), current item (Project/Area)
  items: CachedItem[];
  onOpenSettings: () => void;      // empty-state link target, see §9
}
```
Behavior: if `settings.googleCalendarIcsUrl` is empty → empty state (short note + "Open Calendar Settings" link calling `onOpenSettings`). Otherwise: reads `getGoogleCalendarCache()`, triggers `refreshGoogleCalendar` on first mount if nothing cached, filters the shared 30-day cache down to `maxDays` for *display* (the fetch itself always covers the full 30 days regardless of `maxDays` — decided), renders each event as a row (date/time + title + ✓ if in `alreadyCopiedKeys`), tapping an uncopied row expands the existing `DestinationPicker` defaulted to `defaultDestination` with a confirm button calling `copyGoogleEventToDestination`. A small "Refresh" text link at the top (not the shared tab-bar icon — decided) calls `refreshGoogleCalendar` again and shows `cache.error` inline on failure without blocking the rest of the screen.

## 9. Integration points

- **`DailyView.tsx`** — Calendar column wraps in `<MiniTabs>`: tab 1 = existing Today/Tomorrow toggle + list (unchanged), tab 2 = `<GoogleCalendarPanel maxDays={2} defaultDestination={{type:'inbox'}} .../>`.
- **`ProjectDataPanel.tsx` (Current tab's MeetingsSection)** — same wrap: tab 1 = existing meetings list, tab 2 = `<GoogleCalendarPanel maxDays={30} defaultDestination={{type:'item', kind, name, path}} .../>` (smart-defaults to the open item, same instinct as `CaptureScreen`'s enclosing-item default).
- **`InboxScreen.tsx`** — same wrap on its Meetings pane: tab 2 = `<GoogleCalendarPanel maxDays={30} defaultDestination={{type:'inbox'}} .../>`.
- **`ReviewScreen.tsx`'s Week-ahead step** — same wrap around its existing 7-day list: tab 2 = `<GoogleCalendarPanel maxDays={7} defaultDestination={{type:'inbox'}} .../>`.
- **`App.tsx`** — add an `openSettingsCalendar` handler (mirrors the existing `openInbox` cross-tab pattern) that switches to the Settings tab with its Calendar sub-tab pre-selected, for `GoogleCalendarPanel`'s empty-state link.

## 10. Settings restructuring (`screens/Settings.tsx`)

Wrap the whole screen body in `<MiniTabs tabs={[Folders, Focus, Calendar]} .../>`:
- **Folders** tab = today's `FIELDS` block (baseRoot + 4 folder names), unchanged.
- **Focus** tab = today's `FOCUS_COUNT_FIELDS` block, unchanged.
- **Calendar** tab (new) = `googleCalendarIcsUrl` `TextInput` + a "Paste from clipboard" button (new dependency, `@react-native-clipboard/clipboard` — confirmed acceptable, first third-party native module besides `GtdParaFileModule.kt`, needs an Android rebuild after `npm install`).

Save button stays one shared action across all three tabs (simplest — avoids three separate save states); `clearCachedData()` on save stays scoped to the folder fields as today, since a URL change doesn't affect `dataCache.ts`.

## 11. Build order (suggested)

1. `domain/settings.ts` — add `googleCalendarIcsUrl`.
2. `supernote/pluginPermissions.ts` — add `ensureInternetPermission`.
3. `domain/googleCalendarEvent.ts` + `domain/icsParser.ts` (ported/trimmed from SNFolio) — verify with a standalone Node script per §3's convention, porting SNFolio's test cases.
4. `storage/googleCalendarCache.ts` — fetch/parse/cache + dedup helper.
5. `storage/googleCalendarCopy.ts` — copy-to-destination write.
6. `ui/MiniTabs.tsx`.
7. `ui/GoogleCalendarPanel.tsx`.
8. Wire into `DailyView.tsx`, `ProjectDataPanel.tsx`, `InboxScreen.tsx`, `ReviewScreen.tsx` (in that order — Daily first since it's the narrowest/simplest window).
9. `Settings.tsx` restructuring + clipboard dependency + `App.tsx`'s `openSettingsCalendar`.
10. `tsc --noEmit` + `eslint` pass (standing gap on every recent feature per §4 of `design-overview.md` — worth actually doing this time if `device_bash` is available), then an on-device smoke test: configure a real ICS URL, confirm permission prompt appears once, confirm the 30-day fetch + per-surface display windows, confirm dedup checkmarks agree across all 4 surfaces after copying from one of them.

## Known open assumptions (carried from chat clarification, stated rather than blocking)

- Multi-day all-day events display on their start date only.
- `DestinationPicker`'s existing Active-only/focused-first filtering applies unchanged to the copy target.
