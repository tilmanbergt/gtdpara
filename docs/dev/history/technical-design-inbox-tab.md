# Technical design: Inbox as its own tab, Daily integration, Status/Archive relocation

**Status (2026-09-03): implemented, not yet verified on-device.** All code changes described below have been written (see `docs/dev/design-overview.md` §2.16 for the as-built summary, including a real index-safety bug found and fixed in `ProjectDataPanel.tsx`'s existing "Hide done tasks" grouping during this pass). No `device_bash`/on-device build access was available in the implementing session, so verification was limited to a TypeScript-compiler-API syntax check (parse-only) and manual prop-shape cross-referencing against every caller — a full `tsc --noEmit`/`eslint` pass and an on-device smoke test are still outstanding (`docs/dev/design-overview.md` §4). Requirements clarified in chat this session (see project memory `feature_daily_compact_ui.md` for the log). This supersedes `technical-design-daily-compact-ui.md` §5 ("Inbox as its own tab", explicitly descoped there on 2026-09-03) — that section's extraction ideas (`InboxItemList`, reusing `MeetingQuickAdd`/`TaskQuickAdd`, reusing `fileInboxTask`/`fileInboxMeeting`) are still the right instincts, but the concrete shape changes based on what was clarified this round: a two-column layout (Meetings | Tasks, not one stacked list), full row parity (inline-edit + note-linking, not just File/Done/Cancel), and Inbox items now feeding Daily view's Calendar/Open-tasks rather than staying in their own always-shown Daily section. This document also covers a second, independent change requested in the same round: relocating Status/Archive on the Current tab.

Guiding instruction (same as the doc this supersedes): reuse existing components/patterns wherever possible, keep the architecture uniform.

## Clarified requirements (2026-09-03)

1. Inbox becomes its own tab. It is the fallback destination for tasks/meetings with no Project/Area (unchanged from today).
2. It looks like the Current tab (Projects/Areas detail) *minus* Status/Focus/Archive/Files — and since there's no Files pane, **Meetings go where Files was (left), Tasks go where the rest was (right)**.
3. Row actions get full parity with every other surface: inline tap-to-edit (`TaskEditCard`, plus inline meeting-field editing), note-linking (📓/+📓), *and* File/Done/Cancel (the capability unique to Inbox rows, since only Inbox rows can be filed elsewhere).
4. The tab shows everything, unfiltered — no today/tomorrow-style window. Keep the existing "hide done tasks" toggle (`hideDoneInboxTasks` already exists in `GtdParaSettings`).
5. Daily view: Inbox tasks/meetings stop being their own always-shown section and instead join the normal Calendar/Open-tasks rules — a meeting shows if dated today/tomorrow (same as any Project/Area meeting), a task shows if `#next` **or** due today-or-earlier (same as the existing rule, minus the daily-focus leg, which has no Inbox equivalent).
6. Daily view labels Inbox-sourced rows: Open Tasks gets an "Inbox" group header like any other source; Calendar rows carry an "Inbox" tag.
7. Separately: on the Current tab, the Status section (including the Archive button) moves from the top of the right pane to the bottom of the left pane, below Files. Focus stays where it is today (right pane, above Todos).

## 1. Row-component extraction (biggest reuse win, unlocks everything else)

**Problem.** Task-row and meeting-row markup is currently duplicated three times with small variations: `DailyView.renderTaskEntry`/`renderMeetingEntry` (checkbox, inline edit via `TaskEditCard`, note-link, cancel — no File), `ProjectDataPanel`'s `TodosSection`/`MeetingsSection` row rendering (same, plus flow-state grouping), and `ReviewScreen`'s `renderInboxZero` cards (File/Done/Cancel — no inline edit, no note-link). Inbox's new full-parity requirement is the union of all three. Rather than write a fourth near-duplicate (or grow `ReviewScreen`'s cards with edit/note-link support that only Inbox needs), extract the row markup once, the same way this codebase already extracted `TaskQuickAdd`/`MeetingQuickAdd`/`TaskBadges`/`TaskEditCard`/`FlowStateChips` the moment a second caller needed the same shape (see `technical-design-daily-compact-ui.md` §6 for the precedent).

**New `ui/TaskRow.tsx`** — one task row, covering every existing call site plus Inbox's new one:

```ts
interface Props {
  task: Task;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (nextText: string) => Promise<void>;
  onToggleDone?: () => void;        // omit to hide the checkbox (not needed today, kept optional for symmetry)
  onCancel: () => void;
  onCreateNote: () => void;
  onOpenNote: () => void;
  onFile?: () => void;              // NEW — renders a "File" affordance only when provided (Inbox rows only)
  context: 'flat' | 'grouped';      // passed straight through to TaskBadges, unchanged meaning
  textColor: string; borderColor: string; placeholderColor: string;
}
```

Body is `DailyView.renderTaskEntry`'s existing JSX (checkbox → tap-to-edit-or-`TaskEditCard`, badges, note-link, cancel), moved verbatim, plus one more conditional icon when `onFile` is set (reusing the `noteAction`/`cancelText`-style small-icon convention, e.g. `📤` or a text "File" — a small on-device call once built). `DailyView.renderTaskEntry` and `ProjectDataPanel.TodosSection`'s row become thin call sites; `ReviewScreen`'s task card in `renderInboxZero` also switches to this (now gaining edit/note-link for free, harmless since Review's Inbox-to-zero step already lets you interact with the same tasks Daily/Inbox do — no behavior *removed*, only added).

**New `ui/MeetingRow.tsx`** — same idea, covering `DailyView.renderMeetingEntry`, `ProjectDataPanel.MeetingsSection`'s `renderMeetingRow`, and `ReviewScreen`'s meeting card:

```ts
interface Props {
  meeting: Meeting;
  isEditing: boolean;
  draft: {title: string; date: string; time: string};
  onDraftChange: (next: {title: string; date: string; time: string}) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancel: () => void;
  onCreateNote: () => void;
  onOpenNote: () => void;
  onFile?: () => void;              // NEW, same as TaskRow
  showSource?: {name: string; onPress: () => void};  // Daily's "jump to item" subtext — only DailyView's meeting rows use this today
  textColor: string; borderColor: string; placeholderColor: string;
}
```

**New `ui/FileToPicker.tsx`** — promoted verbatim from `ReviewScreen.tsx`'s private `FileToPicker` (already exactly right: `destinationCandidates` over Active items, focused-first). Both `TaskRow`/`MeetingRow` render it inline when `onFile` is provided and expanded (each row owns its own `filingOpen` boolean, same as `ReviewScreen`'s current `filingKey` pattern generalized from "one open picker at a time" to "each row owns its own" — simpler, and each row already owns its own edit-state independently in `DailyView`/`ProjectDataPanel` today, so this matches). `ReviewScreen.tsx` drops its private copy and imports the shared one.

**Net effect:** `DailyView.tsx`, `ProjectDataPanel.tsx`, and `ReviewScreen.tsx` all shrink (their row-rendering functions become thin wrappers passing handlers into `TaskRow`/`MeetingRow`); the new `InboxScreen.tsx` is built entirely from already-shared parts, adding zero new row markup of its own.

## 2. `screens/InboxScreen.tsx`

Structurally mirrors `ItemDetail.tsx`'s two-pane layout (heading row, then a `body` row with `leftPane`/`rightPane`, same styles reused) but:

- Heading: "Inbox" (no kind tag).
- **Left pane — Meetings** (replaces Files): `MeetingQuickAdd` with `fixedDestination={{type: 'inbox'}}` above the list; below it, `splitAndSortMeetings` (already shared, `domain/meetingTime.ts`) into Upcoming/Past, each rendered via the new `MeetingRow` with `onFile` wired to `fileInboxMeeting`.
- **Right pane — Tasks** (replaces ProjectDataPanel): `TaskQuickAdd` with `fixedDestination={{type: 'inbox'}}` above the list; `groupTasksByFlowState` (already shared, `domain/flowState.ts`) for the Next/Waiting For/Someday/Maybe/Other sections — same grouping `ProjectDataPanel.TodosSection` already uses, so Inbox tasks get the same flow-state organization Project/Area tasks do (not asked for explicitly, but it's the existing convention and the "keep it uniform" instruction favors it over a flat list). Each row via `TaskRow`, `onFile` wired to `fileInboxTask`. "Hide done tasks" reuses `hideDoneInboxTasks` exactly as `DailyView`'s current embedded Inbox section already does (state loaded/saved the same way).

**Data loading.** Same pattern `DailyView`/`ReviewScreen` already use: `loadProjectFile('inbox', paths.base)` for the Inbox file itself, `getCachedData()`/`rebuildCache` for `items` (the `FileToPicker`/`destinationCandidates` candidate list). Registers with the shared refresh icon (`onRegisterRefresh`/`onRefreshingChange`), same convention as every other tab.

**Mutations.** `fileInboxTask`/`fileInboxMeeting` (`storage/inboxFiling.ts`) reused as-is for File. Edit/cancel/note-link/toggle-done reuse the exact save-shape `DailyView`'s existing `handleToggleInboxTask` already established for Inbox (`saveTasks('inbox', basePath, ...)` then `setInbox({...})`) — generalized into an `saveInboxTasks(mutate)`/`saveInboxMeetings(mutate)` pair mirroring `DailyView`'s `saveEntryTasks`/`saveEntryMeetings` shape (re-fetch-index, apply, write, update local state), just against `inbox` state instead of a cache item. `DailyView.tsx` can eventually delegate to the same two functions if lifted into a shared module (`storage/inboxMutations.ts` or similar) — flagged as a nice-to-have, not required for this design to land, since duplicating this one small pair once (Inbox tab + Daily's remaining Inbox-row actions) is a minor, acceptable amount of overlap compared to the row-markup extraction above.

**Tab registration.** `AppTab` widens to include `'inbox'`, placed right after `'daily'` (`Projects, Areas, Daily, Inbox, Current, Review, Settings`) — same placement `technical-design-daily-compact-ui.md` §5.4 already proposed and reasoned through (Daily/Inbox both "flow" tabs, grouped ahead of the structural ones). `DailyView.tsx`'s own Inbox section (heading, task rows, read-only meeting rows, hide-done toggle) is deleted entirely — see §3, it's replaced by Inbox items flowing into the normal Calendar/Open-tasks rules instead.

## 3. Daily view integration

**`storage/dailyAggregate.ts` changes.** `buildDailyAggregate` gains an `inbox: {tasks: Task[]; meetings: Meeting[]} | null` parameter (or reads it the same way `items` is passed today) and a `basePath: string` for the synthetic item's `path`. A synthetic `DailyItemRef` represents Inbox:

```ts
const INBOX_ITEM = (basePath: string): DailyItemRef => ({
  kind: 'inbox',       // DailyItemRef.kind widens from 'project'|'area' to GtdParaKind (domain/types.ts already has this type — reused, not reinvented)
  name: 'Inbox',
  path: basePath,       // same address loadProjectFile('inbox', basePath) already uses
  dailyFocus: false,
  weeklyFocus: false,
});
```

Inbox tasks are scanned with the same per-task rule as Project/Area tasks, minus the daily-focus leg (Inbox has no such concept): skip if `flowState` is `waiting-for`/`someday`/`maybe`; include if `flowState === 'next'` or `dueDate <= today`. Inbox meetings are scanned with the identical today/tomorrow/not-cancelled rule already used for every other meeting, then merged into the same sorted `meetings` array (no separate list).

**Labeling reuses existing mechanisms, not new UI.** Because the synthetic item's `name` is `'Inbox'`, `groupDailyTasksByItem`'s existing group-header rendering (`group.item.name`) shows "Inbox" automatically — zero new rendering code for the Open Tasks side. `renderMeetingEntry`'s existing `rowSource` subtext (`entry.item.name`) equally shows "Inbox" automatically for Calendar rows — also zero new code. The one open call: **group/sort order.** `groupDailyTasksByItem` currently sorts focused-groups-first, then arrival order. Inbox is never "focused" (`dailyFocus: false` above), so under the existing rule its group would sort wherever it happens to land among the unfocused groups — not deliberately first or last. Recommendation: give Inbox's group a fixed first position (ahead of every Project/Area group, focused or not) since it represents not-yet-triaged items that deserve visual priority — a one-line special case in `groupDailyTasksByItem` (`if (a.item.kind === 'inbox') return -1; ...`) rather than folding it into the focus-based sort. Flagging this as the proposed default, easy to flip to "last" or "wherever it falls alphabetically" if it reads wrong once seen.

**Row actions.** Since Daily's Inbox-sourced rows now need full parity (per the clarified requirement), they render via the same `TaskRow`/`MeetingRow` components §1 introduces, with `onFile` **omitted** here (Daily view was never a filing surface — filing stays specific to the Inbox tab and Weekly Review's Inbox-to-zero step) but edit/cancel/note-link wired to the generalized `saveInboxTasks`/`saveInboxMeetings` pair from §2, alongside the existing `saveEntryTasks`/`saveEntryMeetings` for Project/Area rows — `DailyView`'s per-row render functions branch on `entry.item.kind === 'inbox'` to pick which pair of handlers to call, same shape either way from `TaskRow`/`MeetingRow`'s point of view.

**Toggle-done for Inbox tasks on Daily** now goes through the same `TaskRow` as everything else (checkbox still present, `onToggleDone` wired to a toggle over `saveInboxTasks`) — replaces `handleToggleInboxTask`, which is deleted along with the rest of `DailyView`'s standalone Inbox section per §2.

## 4. Status/Archive relocation (Current tab)

**Today:** `ItemDetail`'s left pane is Files only; its right pane is `ProjectDataPanel`, which internally renders `StatusSection` → `FocusSection` → `ArchiveAction` → divider → Todos → divider → Meetings in one `ScrollView`, all backed by one `PanelState` loaded once via `ensureItemCached`.

**Target:** Status + Archive move to the bottom of the left pane, below Files. Focus stays in the right pane, unchanged position (still above Todos).

**Approach — extract, don't lift.** Rather than lifting `PanelState`/`changeStatus`/`handleArchivePress` up into `ItemDetail` (which would turn `ItemDetail` into a second owner of item data and require prop-drilling status back down into `ProjectDataPanel` for `FocusSection`'s `disabled={status !== 'active'}` check), keep this codebase's existing pattern of **independent per-section state, synchronized only through the shared cache + write-through** (`design-overview.md` §3's "reads should prefer the cache") — the same pattern `DailyFocusKindSection`, `ItemsList`, and `ProjectDataPanel` itself already all use side-by-side without sharing state directly.

**New `ui/ItemStatusPanel.tsx`** — `StatusSection` and `ArchiveAction` (both function components, unchanged) plus a thin wrapper that does its own minimal load/mutate, lifted verbatim from `ProjectDataPanel`'s existing `changeStatus`/`handleArchivePress`/`archiving`/`archiveError` and the `status` slice of `PanelState`:

```ts
interface Props {
  kind: 'project' | 'area';
  name: string;
  path: string;
  onArchived?: () => void;
  refreshToken?: number;   // same convention as ProjectDataPanel's own prop
  textColor: string; borderColor: string;
}
```

Internally: `ensureItemCached(kind, name, path)` on mount (and on `refreshToken` change — identical dependency-array shape to `ProjectDataPanel`'s own mount effect) to read `status`/`dailyFocus`/`weeklyFocus`/`rawContent`/`frontMatterExtraLines` — the exact same four fields `changeStatus`/`archiveItem` already need, just read independently rather than shared via a parent. `setItemStatus`/`archiveItem` calls are unchanged (same storage functions, same write-through to `dataCache`).

`ProjectDataPanel.tsx` loses `StatusSection`, `ArchiveAction`, `changeStatus`, `handleArchivePress`, `archiving`, `archiveError` — `FocusSection` keeps reading `status` off its own already-loaded `state.status` for the `disabled` check (unaffected; `ProjectDataPanel` still loads `status` for this one purpose, it just no longer renders or mutates it).

`ItemDetail.tsx` renders `ItemStatusPanel` inside `leftPane`, after the existing Files `ScrollView`/`openError` block:

```tsx
<View style={[styles.leftPane, {borderColor}]}>
  {/* ...unchanged Files heading/breadcrumb/list/openError... */}
  <View style={[styles.divider, {backgroundColor: borderColor}]} />
  <ItemStatusPanel
    kind={kind} name={name} path={path}
    onArchived={() => onArchived?.(kind)}
    refreshToken={refreshToken}
    textColor={textColor} borderColor={borderColor}
  />
</View>
```

`onArchived` wiring is unchanged in shape (still bubbles up to `App.tsx` the same way), just sourced from `ItemStatusPanel` instead of `ProjectDataPanel`. No changes needed to `App.tsx`.

**Flag, not a blocker:** the left pane's Files list currently has no explicit `flex`/height cap on its own `ScrollView`, relying on the outer `leftPane`'s `flex: 1`; adding a second block below it means Files effectively gets less vertical room than today. Worth an on-device layout check once built (same standing caveat as every other feature here — no on-device build access this session).

## 5. Type/data-model changes summary

- `storage/dailyAggregate.ts`: `DailyItemRef.kind` widens from `'project' | 'area'` to `GtdParaKind` (reusing the existing `domain/types.ts` type, not a new one). `buildDailyAggregate` gains an inbox-tasks/meetings input. `groupDailyTasksByItem` gains the Inbox-always-first special case (§3).
- New files: `ui/TaskRow.tsx`, `ui/MeetingRow.tsx`, `ui/FileToPicker.tsx` (promoted from `ReviewScreen.tsx`), `ui/ItemStatusPanel.tsx`, `screens/InboxScreen.tsx`.
- No changes to `domain/markdown.ts`, file format, or the cache/write-through rules — this is all UI-layer reorganization plus one aggregation-logic widening, same category as the design doc this supersedes.

## 6. Suggested implementation phases

1. **Row extraction** (§1) — `ui/TaskRow.tsx`, `ui/MeetingRow.tsx`, `ui/FileToPicker.tsx`; rewire `DailyView.tsx`, `ProjectDataPanel.tsx`, `ReviewScreen.tsx` to use them. Independently testable/shippable, zero visible behavior change (a pure refactor) except Review's cards gaining edit/note-link.
2. **Status/Archive relocation** (§4) — `ui/ItemStatusPanel.tsx`, `ItemDetail.tsx`, `ProjectDataPanel.tsx` (trim). Independent of everything else.
3. **Daily aggregate widening** (§3) — `storage/dailyAggregate.ts`, `DailyView.tsx` (branch row handlers on `item.kind`, delete the old standalone Inbox section). Depends on phase 1 for `TaskRow`/`MeetingRow`.
4. **Inbox tab** (§2) — `screens/InboxScreen.tsx`, `ui/TabBar.tsx`/`App.tsx` (new tab). Depends on phase 1.

## 7. Verification plan

Same standing convention as every prior feature (`design-overview.md` §3): standalone Node scripts for the new pure logic, `tsc --noEmit` + `eslint`, no Jest.

- Extend `verify-aggregate.ts`: Inbox tasks/meetings correctly included/excluded by the widened rule (mirror the existing Project/Area cases, minus the focus leg); Inbox's group always sorts first regardless of focus elsewhere.
- On-device smoke test items (no `device_bash` this session, same caveat as always): Inbox tab's two-column layout at actual e-ink width; `TaskRow`/`MeetingRow`'s File-picker interaction on Daily-sourced-from-Inbox rows and the Inbox tab both; `ItemStatusPanel`'s left-pane placement vs. the Files list's available height (§4's flagged risk); Review's Inbox-to-zero cards after gaining edit/note-link, confirm nothing regressed there.
