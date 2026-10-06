# Technical design: central status slot

Status: **v4 (2026-09-29)**. All questions answered (§1, §8, §9). Preview slice (step 1 + 2) implemented and device-tested 2026-09-29 (§10); steps 3-7 implemented 2026-09-29, not yet device-tested (§11).
Trigger: the Files pane's "Select Attachment ✕" badge sits at the right end of the pane's tab row. On the Project page that is nearly off-screen.

## 1. Decisions so far (chat, 2026-09-29)

| # | Decision |
|---|---|
| D1 | One **reserved, fixed-height strip** directly under the TabBar. It is always present, so showing or hiding a message never shifts the layout. The TabBar gets more compact to pay for the space. |
| D2 | **QuickAdd messages move to the slot entirely** (option b). This covers validation, save failures, "blocked", and "✓ Added". The field that caused a problem only gets a small **⚠ mark** in place. |
| D3 | **"Mark in place, text in the slot"** is a general pattern. Other places use it too, e.g. Gmail and Calendar refresh failures show a ⚠ on the Refresh pill, and the text goes to the slot. |
| D4 | **Focus mode gets the slot too**, at the very top of the screen. It is normally empty there. |
| D5 | **Load errors** (a pane that failed to load shows only the error and Retry) **stay in place**. The pane has nothing else to show anyway. |
| D6 | **No auto-hide timers.** On e-ink, every timeout costs a refresh, and a message can vanish before anyone looks. A message is cleared by its owner, by ✕, or when its screen unmounts. The only exception is the tap-to-expand overlay (D12). |
| D7 | **TabBar moves up.** The 40 px above the tabs is unused (the Supernote has no system status bar). `paddingTop` drops to ~8 px, which pays for the slot almost entirely. |
| D8 | **Several messages at once**: one is visible, with `‹ n/m ›` navigation at the right end of the slot. The arrow style is the same as `PagedSection`'s paging. The most important message is always 1/m. |
| D9 | **Success = ✓ mark in place + a longer text in the slot**, e.g. mark next to Add, slot says "Added meeting "Kickoff" to Project Alpha - 2 Oct 10:00". The slot is also meant for other useful success messages later. |
| D10 | **All native pop-ups go.** Every `Alert.alert` and two-tap confirm becomes a slot **confirm**: text, one action button, ✕ = cancel. Long explanations are reached by tapping the text (D12). |
| D11 | **CaptureScreen gets the slot** at its top too. |
| D12 | **Tap on the slot text** opens an overlay below the slot with the full text, drawn over the content (nothing shifts). It collapses back after a few seconds or on a tap. |
| D13 | **Background errors are global.** A failure arriving after its screen was left (e.g. a Gmail archive) still shows, on whatever screen is open. |
| D14 | **Pick messages are longer** and say what to tap (§7.2). |
| D15 | **Empty slot stays blank.** |

## 2. Inventory: every message, error and status in the codebase today

Scan of `App.tsx`, `src/screens/*` and `src/ui/*` on 2026-09-29. The last column says where each one ends up.

### A. Modal / "armed" states (6 sources, 1 renderer)
`FileBrowserPane` renders the badge at the right of the MiniTabs row. When there is only one root, it gets its own row.

| Source | Label | Goes to |
|---|---|---|
| `ProjectDataPanel` (link / refile) | "Select Attachment" / "Refile to…" | Slot, **modal** |
| `InboxScreen` (link / refile) | same | Slot, modal |
| `ReviewScreen` Inbox-to-zero step (link / refile) | same | Slot, modal |
| `ItemStatusPanel` (assign Area) | "Select Area" | Slot, modal |
| `DailyFocusPanel` (focus pick) | "Select Project/Area" | Slot, modal |
| `PeriodFocusPanel` (weekly/monthly focus pick) | "Select Project/Area" | Slot, modal |

### B. Global / system
| Source | What | Goes to |
|---|---|---|
| `ui/StaleBuildBanner` (App.tsx, under TabBar) | "old version still loaded" + Restart | Slot, **warning**, global scope, action "Restart". Today it pushes all content down when it appears. |

### C. QuickAddWidget, row 4 centre text (one copy per widget instance)
| What | Goes to |
|---|---|
| Validation: 11 strings from `domain/meetingTime.ts` (time format, end > start, days, title, date), "A todo needs some text." | Slot, **error** + ⚠ mark on the offending field |
| "Switch the Files pane back to Project Files/Area Files to add a note here." | Slot, error |
| Save failures (`.catch(e => setError(...))`, 6 sites) | Slot, error |
| `blockedMessage` (edit already open elsewhere). The state is duplicated in ProjectDataPanel, InboxScreen, DailyView and ReviewScreen, and passed in as a prop. | Slot, **warning**. The prop is removed. |
| "✓ Added "…"", "✓ Added "…" - <where>", "Copied "…" - adjust, then Add" | Slot, **success** |

**Bug found during the scan:** in *edit* mode, the widget's own `error` is never rendered. Row 4 only shows `blockedMessage` there (`QuickAddWidget.tsx` ~l.1531). An invalid time, or an emptied todo text, on Save therefore does nothing visible. Moving everything to the slot fixes this as a side effect.

### D. `widgetError`: a second error line under the QuickAdd widget, owned by the screen
ProjectDataPanel, InboxScreen, DailyView (×2 layouts), MonthView, WeekPlanner (via `usePlanningScreen`). Failures of the screen's own `onAdd`/`onSave` callbacks. → Slot, error.

### E. Action errors rendered inline in sections (~35 sites)
`tasksActionError`/`meetingsActionError`/`actionError` in DailyView, InboxScreen, ProjectDataPanel (Todos + Meetings sections), MonthView, WeekPlanner. Also: ReviewScreen `inboxActionError` + 6 sub-step `error`/`actionError`; ItemFocusPanel `actionError`; ItemStatusPanel `archiveError`/`areaError`/`actionError`; DailyFocusPanel and PeriodFocusPanel `pickError`/`actionError`; ReviewHub `saveError` (×2); InlineTextEditor `error`; ItemDetail `saveError`; ItemsList `createError`; FileBrowserPane `openError`; CloseOutWizard `actionError`; closeOut PdfStep/ArchiveStep `run.error`; Settings `saveError`/`clipboardError`/`templatesSaveError`.
→ All go to the slot as **error**. Today every one of them inserts a line into the layout, so it also shifts pagination. Moving them removes that source of layout jumps.

### F. Load errors (stay in place, D5)
`LoadErrorNotice` (WeekView, ReviewWeekAhead, InboxScreen, MonthView, ReviewScreen, DailyView). Hand-rolled equivalents: ProjectDataPanel, ItemsList, ItemDetail, ItemFocusPanel/ItemStatusPanel `loadError`, FileBrowserPane `error`, CaptureScreen `loadError`, CloseOutWizard `loadError`, TemplatePicker/Settings `myStyleError`, DailyView "Couldn't read N item(s)".
→ No move. Optional cleanup: route the hand-rolled ones through `LoadErrorNotice`.

### G. Background refresh status
| Source | Today | Goes to |
|---|---|---|
| Gmail (ReviewScreen): `gmailError`, `gmailArchiveError` | ⚠ line under Refresh | ⚠ mark on the Refresh pill + slot error |
| Gmail refresh pill: "Refreshing… Ns" / "Refresh (last …)" | label on the pill | stays (it is the button's own state) |
| GoogleCalendarPanel `error` | **replaces the whole list** with "⚠ …" | ⚠ mark on the Refresh pill + slot error. The list keeps showing the events from the last *successful* refresh (see §7.5) |

### H. Native `Alert.alert` dialogs
| Source | Goes to |
|---|---|
| ItemStatusPanel "Can't archive yet" (info, OK only) | Slot, warning |
| ItemStatusPanel "Move to Archive?" (long text, destructive confirm) | Slot **confirm**: short text + "Archive" + ✕; full text via tap (D12) |
| Settings "Integrity Check" result / failure | Slot, success / error |

### I. Transient notices / confirms
| Source | Goes to |
|---|---|
| Settings Templates `addNotice` ("Saved.", "Added X to the rule.", "Text deleted.", …) | Slot, success/info |
| Settings two-tap "Confirm delete" + notice | Slot **confirm**: "Delete" + ✕ |
| GmailBodyPane "Copied ✓" (button label, 1.5 s timer) | stays: it is button feedback, not a message |

### J. Out of scope
ActivityIndicators and "Loading…" hints; the TabBar refresh spinner; state marks inside rows (✓ done, ⚠ overdue badge, StepIndicator ✓); the email-link progress labels on Review buttons.

## 3. Model

```ts
// src/ui/status/types.ts
export type StatusKind = 'modal' | 'confirm' | 'error' | 'warning' | 'success' | 'info';

export interface StatusAction {
  label: string;
  onPress: () => void;
  primary?: boolean;
}

export interface StatusMessage {
  kind: StatusKind;
  text: string;
  /** Optional full text for the tap-to-expand overlay (D12); defaults to `text` when that was truncated. */
  detail?: string;
  /** Buttons, right-aligned. 'confirm' has exactly one (the action); 'modal' none (Cancel comes from onCancel). */
  actions?: StatusAction[];
  /** ✕ shown when set; called on tap. Owner clears its own state here. */
  onDismiss?: () => void;
  /** 'modal' and 'confirm': what Cancel / ✕ does. Required for both. */
  onCancel?: () => void;
  /** 'screen' (default): cleared automatically when the publishing component unmounts, e.g. on tab switch. 'global': survives (stale build). */
  scope?: 'screen' | 'global';
}
```

**Priority:** confirm > modal > error > warning > success > info. Within the same priority the newest message wins. One message is visible; the others stay in the list and can be reached with `‹ n/m ›` (D8). When the visible one clears, the next one in priority order takes its place.

Rules per kind:
- `confirm`: blocks nothing else technically, but always shows as 1/m. The action runs, then the owner clears it. ✕ = cancel.
- `modal` (pick states): cleared by the pick, by Cancel, or by unmount.
- `success`: replaced by the owner's next message (or cleared on its next action), cleared by unmount. Also dismissible via ✕.

## 4. API: declarative, so the existing state stays where it is

Almost every site already has `const [x, setX] = useState<string|null>()` plus a `{x && <Text>⚠ {x}</Text>}` render. The cheapest migration keeps the state and replaces only the render:

```ts
// src/ui/status/useStatus.ts
/** Publishes `msg` under `id` while it's non-null; clears on null or unmount. */
export function useStatus(id: string, msg: StatusMessage | null): void;

// imperative escape hatch for one-shot notices (success/info)
export function useStatusApi(): {show(id: string, msg: StatusMessage): void; clear(id: string): void};
```

Example (InboxScreen):

```ts
useStatus('inbox.tasksAction', tasksActionError
  ? {kind: 'error', text: tasksActionError, onDismiss: () => setTasksActionError(null)}
  : null);
```

- **IDs** are `'<screen>.<purpose>'` strings. Re-publishing the same id replaces the message in place (no duplicates).
- **Unmount clears.** `App.tsx` unmounts inactive tabs, so tab switching clears every screen-scoped message and cancels arming with no extra code. That was a requirement from the first discussion.
- **Provider**: `StatusProvider` in `App.tsx` holds a `Map<id, entry>` and exposes the current top message. It is a plain React context: no new dependency, and it follows the same callback-registration shape as `RefreshHandle`.

## 5. Rendering: `ui/status/StatusSlot.tsx`

- **Fixed height**, one line: `FONT.small`, height ≈ 34 px (vertical padding 6). It is always rendered. When empty it is a blank strip with no border.
- **Layout**: `[icon] text (numberOfLines 1, tail ellipsis) ……… [action] [Cancel|✕] [‹ n/m ›]`. The pager only shows when m > 1.
  - A slot line fits ~110 characters at A5X width. The longest current validation string is ~60, so it fits.
- **Tap-to-expand (D12)**: tapping the text, when it is truncated or has a `detail`, opens an absolutely-positioned box directly under the slot (full width, white, 2 px border, `zIndex` above the content). It shows the full text and closes after `STATUS_EXPAND_MS` (3 s, §8 Q11) or on any tap. It costs two e-ink refreshes (open and close), which is acceptable for an explicit tap.
- **Per-kind styling** (grayscale, e-ink):
  - `modal`: **inverted** (black background, white text, white Cancel pill), so an armed state is unmistakable.
  - `confirm`: inverted like `modal`, with the one action as a white primary pill and ✕.
  - `error`: `WarningIcon` + bold text, 2 px black border.
  - `warning`: `WarningIcon` + normal text, 1 px border.
  - `success`: "✓" + normal text, no border.
  - `info`: plain text, no border.
- **E-ink**: the slot calls `requestEinkRefresh()` whenever the visible message changes, as `StaleBuildBanner` does today. Without it, the change only shows after the next full redraw (see bugfix_eink_refresh).
- **Placement**:
  - Normal: `App.tsx` → `<TabBar/>` → `<StatusSlot/>` → body. `<StaleBuildBanner/>` is removed from that spot.
  - Focus mode: `App.tsx` renders `<StatusSlot/>` as the first child above `<DailyView focusMode/>`.
  - CaptureScreen (D11): `<StatusSlot/>` at its top; its own `paddingTop: 40` shrinks the same way.
  - **TabBar compaction (D7)**: `paddingTop: 40 → 8`, `paddingBottom: 8 → 4`. That frees ~36 px, i.e. the slot costs roughly nothing net.
- **Pagination**: all paginated panes self-measure (`usePagedByHeight`/`PagedSection`), so the strip is absorbed automatically. `docs/dev/design-device-rendering.md`'s budget table needs one new row.

## 6. The "mark in place" component: `ui/status/StatusMark.tsx`

A small icon placed next to or inside the element concerned: `WarningIcon` (size 14) for error/warning, a "✓" for success (D9). It is tappable: a tap re-publishes its message to the slot, so a message the user dismissed with ✕ can be brought back. A mark lives exactly as long as its message.

Users:
- **QuickAdd**: ⚠ on the field (title, date, time, todo text); ✓ next to the Add/Save button after a successful add/save. For this, `validateMeetingFields`/`validateTime` results get a `field: 'title' | 'date' | 'time'` so the widget knows which field to mark. This is a pure `domain/` change and gets a Node script check.
- **Gmail Refresh pill**, **Calendar Refresh pill**: a mark while the last refresh or archive failed.
- Later: anything else that fits D3.

## 7. Per-area changes

1. **Infrastructure**: `ui/status/{types.ts,StatusProvider.tsx,StatusFrame.tsx}` (+ `StatusMark.tsx` with step 3); `App.tsx` wiring (normal + focus); TabBar padding. `StaleBuildBanner` becomes a publisher: it renders `null` and calls `useStatus('app.staleBuild', {kind:'warning', scope:'global', actions:[Restart]})`.
2. **Arming (the reported bug)**: `FileBrowserPane` publishes `useStatus('files.arming', linkTarget?.mode === 'arming' ? {kind:'modal', text: linkTarget.label ?? DEFAULT, onCancel: linkTarget.onCancel} : null)`. Both badge renderings are deleted. This one change covers all 6 sources in §2A. Longer texts (D14), set by each source through the existing `label`:
   - link: "Select attachment: tap a file in the Files pane to link it to this todo/meeting"
   - refile: "Refile: tap the Project or Area to move this todo/meeting to"
   - ItemStatusPanel: "Select Area: tap the Area this project belongs to"
   - Daily focus: "Pick a Project/Area for today's focus: tap it in the list"
   - Period focus: "Pick a Project/Area for this week's/month's focus: tap it in the list"
   (Wording to be checked on device. Where the item's name is at hand it can replace "this todo/meeting".)
3. **QuickAdd**: row-4 centre text removed. `error`, `blockedMessage` and the success texts are published from the widget, id `quickadd.<instanceKey>`. Success texts get the longer form (D9): "Added todo "…" to <Project/Area/Inbox>", "Added meeting "…" to <…> - <when>", "Saved "…"". Field marks are added, the `blockedMessage` prop is removed (4 screens), and `widgetError` (6 sites) goes to the slot. This also fixes the edit-mode error bug.
4. **Action errors (§2E)**: mechanical `{x && <Text>}` → `useStatus(...)`, ~35 sites.
5. **Background refresh (§2G)**: marks + slot; `gmailArchiveError` is `scope:'global'` (D13), published from the archive queue's failure path via `useStatusApi` held at App level. Calendar: on a failed refresh `storage/googleCalendarCache.ts` already keeps `previousEvents`, but the panel hides them and shows only the error. Change: keep rendering them. **Bug found on the way:** the failure path sets `fetchedAt: Date.now()`, so the pill says "last just now" after a *failed* refresh. Fix: keep the previous `fetchedAt` on failure.
6. **Alerts and notices (§2H/I)**: the 3 `Alert.alert` calls and the Settings two-tap delete become `confirm`/`warning`/`success` messages (D10). "Move to Archive?" slot text: "Move "<name>" to <target>?" + "Archive"; the full current explanation goes into `detail`.
7. **Docs**: `design-overview.md` §2 as-built entry, a §3 guideline ("user-facing messages go through `useStatus`; only load errors render in place"), and the rendering guide budget row.

Order: 1+2 first (they fix the reported bug and prove the slot on device), then 3, then the rest.

Estimated size: step 1 ~5 new small files + App/TabBar/CaptureScreen edits; step 2 one file + 5 label strings; step 3 QuickAddWidget + 6 screens; step 4 ~35 mechanical sites in ~20 files; steps 5-6 ~6 files. Verification: tsc scratch project; Node script for the `field` addition in `meetingTime.ts`; Jest smoke render of `<App/>` (the slot sits in App's root, which is exactly where tsc can't catch a broken export).

## 8. v2 answers (2026-09-29)

- **Q11** → overlay closes after **3 s** (`STATUS_EXPAND_MS = 3000`).
- **Q12** → a pick stays armed underneath a confirm or background error; it reappears when that message clears (or via `‹ ›`).
- **Q13** → the ✓ mark (and its success message) clears **as soon as the user starts typing the next item** in that widget.
- **Q14** → first a preview slice that fixes a real issue (step 1 + step 2: slot infrastructure + the arming message), tested on device; then standardize the rest.
- **Calendar** → confirmed: keep already-fetched events when a refresh fails; show the failure in the slot (+ ⚠ on Refresh).

Open (v3): none blocking the preview slice. Deferred to the standardization pass: CaptureScreen's slot (D11) and its own `paddingTop: 40`.

## 9. v1 answers (for the record)
Q1 → D7, Q2 → D8, Q3 → D9, Q4 → D10, Q5 → D11, Q6 → D13, Q7 → D12, Q8 → §7.5 (keep last successful events visible), Q9 → D14, Q10 → D15.

## 10. As-built: preview slice (step 1 + 2), 2026-09-29

Device-tested OK by Tilman (2026-09-29): the pick bar is clearly visible and the longer texts help.

**New files**
- `src/ui/status/types.ts`: `StatusKind` (incl. `confirm`), `StatusMessage` (+ `detail`), `STATUS_PRIORITY`, `STATUS_SLOT_HEIGHT = 36`, `STATUS_EXPAND_MS = 3000`.
- `src/ui/status/StatusProvider.tsx`: `StatusProvider` (two contexts: a stable API, and the sorted list), `useStatus(id, msg|null)` (declarative; re-publishes only when visible content changes; callbacks run the latest closures via a ref; clears on null/unmount unless `scope: 'global'`), `useStatusApi()` (imperative show/clear), `useStatusList()`.
- `src/ui/status/StatusFrame.tsx`: `<StatusFrame>` = fixed slot row + body + tap-to-expand overlay. The overlay is a sibling inside the frame rather than an overflow child of the slot, so Android delivers its taps. Per-kind styling as §5; `‹ n/m ›` pager; `requestEinkRefresh()` on every visible change.

**Changed files**
- `App.tsx`: `export default App` is now just `<StatusProvider><StaleBuildBanner/><AppShell/></StatusProvider>`. The former body is `AppShell`. The tabs body and focus mode are wrapped in `<StatusFrame>`. Capture mode has no slot yet (D11 is deferred to the standardization pass).
- `src/ui/TabBar.tsx`: `paddingTop 40 → 8`, `paddingBottom 8 → 4` (D7).
- `src/ui/StaleBuildBanner.tsx`: renders `null` and publishes a global `warning` with a "Restart" action.
- `src/ui/FileBrowserPane.tsx`: both inline arming badges and their styles are removed. While armed, the pane publishes a `modal` (`files.arming.<n>`, one id per pane instance). New export `ARMING_TEXT` holds the longer pick texts (D14).
- Pick labels now come from `ARMING_TEXT`: `ProjectDataPanel`, `InboxScreen`, `ReviewScreen` (link/refile by todo/meeting), `ItemStatusPanel` (area), `DailyFocusPanel` / `PeriodFocusPanel` (focus by scope and kind).

**Verification**
- `tsc --noEmit` over `App.tsx` + `src/`: the error set is identical before and after (only pre-existing errors, none in the touched files).
- Jest smoke render (throwaway, not committed): `<App/>` mounts with no "Element type is invalid". A slot test covers priority (modal over error), the `1/2` pager, Cancel, promotion to the next message, and clearing on unmount.

## 11. As-built: standardization (steps 3-7), 2026-09-29

Not yet device-tested.

**New**
- `src/ui/status/StatusMark.tsx`: `MarkWrap` (⚠ / ✓ badge on a control's top-right corner, absolutely positioned, so the layout doesn't change).
- `StatusProvider.tsx`: `useErrorStatus(name, error, onDismiss)` (per-instance id suffix).
- `domain/meetingTime.ts`: `validateMeetingFields` failures carry `field: 'title' | 'date' | 'time'`.

**Quick Add (step 3)**
- The row-4 centre text is gone (`centerSpacer` keeps the layout). The widget publishes four ids per instance: `.error` (validation/save; fixes edit mode never showing it), `.blocked` (the `blockedMessage` prop is kept, but now rendered via the slot), `.success` and `.info` ("Copied … adjust, then Add").
- Success texts are longer: `Added todo "…" to <Inbox/Project/Area>`, `Added meeting "…" to <…> - <when>`, `Created note "…"`, `Saved todo/meeting "…"`.
- ⚠ marks sit on the todo text, meeting title, date and time fields, or on Add/Save for errors that aren't about a field. The ✓ mark sits on Add. Errors, ✓ and success messages all clear as soon as anything is typed in the widget (Q13).
- `widgetError` (ProjectDataPanel, InboxScreen, DailyView, usePlanningScreen → Month/Week) goes to the slot.

**Action errors (step 4)**: about 35 inline lines are replaced by `useErrorStatus`: DailyView, InboxScreen, ProjectDataPanel (both sections), ReviewScreen (Inbox-to-zero, the sub-step components, `saveError` from ReviewHub), ItemFocusPanel, ItemStatusPanel, DailyFocusPanel, PeriodFocusPanel, InlineTextEditor, FileBrowserPane `openError`, ItemsList create, ItemDetail abbreviation (+ ⚠ on the field), CloseOutWizard (+ PDF/archive run errors), Settings. Load errors stay in place.

**Background refresh (step 5)**
- Gmail: the refresh error goes to the slot (screen scope). The archive failure goes to the slot as **global**, via `useStatusApi`, so it still appears after leaving Review. ⚠ on the Refresh pill.
- Calendar: the refresh error goes to the slot, with ⚠ on the Refresh link. The list keeps showing the last successfully fetched events. `googleCalendarCache.fetchedAt` is now `number | null` and only changes on success.

**Pop-ups and notices (step 6)**: ItemStatusPanel "Can't archive yet" → warning; "Move to Archive?" → confirm (short question + "Move to Archive"; the full explanation opens with a tap on the text). Settings Integrity Check → success/warning/error. Settings "Saved." and the Templates notices → success. The Templates two-tap delete → confirm with "Delete" (the second tap on Delete still works). No `Alert.alert` is left in the app.

**Capture screen (step 7)**: `App.tsx` wraps CaptureScreen in `StatusFrame`, and its `paddingTop` goes 40 → 8. The save error and recognition warning go to the slot.

**Verification**
- tsc: no new errors against the pre-change baseline.
- Jest (throwaway, not committed): `<App/>` mounts; the slot orders/pages/clears messages; Quick Add shows the missing-title error in the slot with a ⚠ mark, typing clears it, and Add shows `Added todo "Call Anna" to Inbox` with ✓, which clears on the next keystroke; `validateMeetingFields` reports the right `field`.
