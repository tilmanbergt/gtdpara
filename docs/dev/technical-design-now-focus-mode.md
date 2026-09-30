# Technical Design: `#now` and Focus Mode

Status: requirements settled, ready for implementation. Clarified in chat across several rounds 2026-09-10/11, compared visually against an earlier separate-tab/hand-picked-batch design (mocked up, then set aside) in the published "GtdPara Focus Batch" design canvas (now at v8, two comparison pages — Page A superseded/reference-only, Page B is this design). Companion to `docs/dev/design-philosophy.md` §4 and §8, which this document implements literally — read those first for the *why*.

## 1. Goals and motivation

Give the user a way to mark a small number of tasks as what they're actually working on right now, and a screen that shows only those (plus near-term meetings and the ability to capture a stray thought), reachable and re-enterable without leaving Daily. Explicit design constraint carried through every section below: **reuse existing components and data flows wherever at all possible, and add the smallest amount of new persisted state that satisfies the requirements.** This is meant to be a simplification for the person using the app, not a reason to grow the app's internal complexity.

## 2. Data model: `Task.now`

`FlowState` (`src/domain/types.ts`) is exclusive by convention — one value, `next | waiting-for | someday | maybe | null`. `#now` is explicitly **not** exclusive with `#next` ("everything valid for #next should be valid for #now as well" — chat 2026-09-11), so it cannot be folded into `FlowState` without breaking that. It also needs to auto-clear independently of any other tag, on a rule (§4) that has nothing to do with flow-state at all. Both point the same way: a new, separate field.

```ts
// src/domain/types.ts, on Task
/** Whether this task is marked #now (technical-design-now-focus-mode.md) - layered on top of flowState, never a replacement for it. Derived from a `#now` tag the same way dueDate/flowState are derived from other tags - see domain/flowState.ts. */
now: boolean;
```

`src/domain/flowState.ts` gets the same three-function shape it already has for flow-state itself:

```ts
const NOW_TAG_RE = /#now\b/i;

export function deriveNow(tags: string[]): boolean {
  return tags.some(tag => tag === 'now');
}

/** Adds or removes a bare #now tag from `text`, same "strip then reappend" convention as setFlowStateTag/setDueTag. Does not touch any other tag, including flowState's own. */
export function setNowTag(text: string, value: boolean): string {
  const stripped = text.replace(NOW_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
  return value ? (stripped ? `${stripped} #now` : '#now') : stripped;
}
```

Callers re-derive `tags`/`now` from `text` immediately after any write, same as every other tag mutation in this codebase (`domain/markdown.ts`'s `deriveTaskFields` convention) — `now` is never a second source of truth, exactly like `flowState`/`dueDate`/`waitingOn` today.

**No session entity.** Deliberately not adding a session id, a start timestamp, or a list of task references anywhere. See §5 for why the two remaining requirements (checked-off tasks stay visible; reopening always returns to focus mode) don't need one.

## 3. Badge and gesture: `ui/TaskBadges.tsx`

Today the flat-context Next badge is always the glyph `▶` (U+25B6, filled). Going forward:

| State | Glyph | Label (tap-to-reveal) |
|---|---|---|
| `flowState === 'next'`, `now === false` | `▷` (U+25B7, outline) | "Next" |
| `flowState === 'next'`, `now === true` | `▶` (U+25B6, filled) | "Now" |

Same icon-only, grayscale-safe convention the module doc comment already commits to (no color dependency — this reads correctly on e-ink without any accent color, unlike the design-canvas mockup's blue fill, which was a mockup-only stand-in). `badgeInfos` gains one branch; `isFlowStateConveyed`/`displayTaskText` are unaffected since `#now` never appears as inline text the way `#next` does today — it's stripped from display the same way, additionally, via `setNowTag(text, false)` wherever `displayTaskText` already strips `#next`.

**Double-tap, scoped only to this one badge.** `TaskBadges`' existing `Pressable` already handles single-tap (reveal label for 2s, `REVEAL_MS`). Adding a second, distinct gesture to the *same* element needs to disambiguate single- from double-tap rather than always firing on the first tap:

```ts
const DOUBLE_TAP_MS = 350;
const lastTapRef = useRef<{index: number; at: number} | null>(null);

const handlePress = (index: number, info: BadgeInfo) => {
  const now = Date.now();
  const isNowBadge = info.label === 'Next' || info.label === 'Now';
  if (isNowBadge && lastTapRef.current?.index === index && now - lastTapRef.current.at < DOUBLE_TAP_MS) {
    lastTapRef.current = null;
    onToggleNow?.(); // new prop - see below
    return;
  }
  lastTapRef.current = {index, at: now};
  // existing single-tap reveal logic, unchanged, for every badge including this one
  ...
};
```

Only the Next/Now badge (`info.label === 'Next' || 'Now'`) gets the double-tap branch; Waiting-on and Due/Overdue badges keep single-tap-reveal only, unchanged. `TaskBadges` needs one new optional prop, `onToggleNow?: () => void`, wired by every call site the same way `TaskBadges` is already threaded today (`screens/DailyView.tsx`'s Open-tasks rows, `screens/ProjectDataPanel.tsx`'s grouped Todos rows) — each site already owns a task-write path (`handleAddTask`-adjacent mutation helpers), so this is a new one-line write call, not new plumbing.

## 4. Focus mode as a fourth `App.tsx` `Mode`

`App.tsx` already has exactly this shape for "full-screen, no `TabBar`, still not `loading`": `Mode = 'loading' | 'capture' | 'tabs'`, with `if (mode === 'capture') return <CaptureScreen .../>` rendered *before* the `TabBar`-wrapped `tabs` branch. Focus mode reuses that exact pattern rather than inventing a new one:

```ts
type Mode = 'loading' | 'capture' | 'tabs' | 'focus';
```

```tsx
if (mode === 'focus') {
  return <DailyView focusMode onExitFocusMode={handleExitFocusMode} /* + the same onOpenItem/onOpenInbox/onOpenCalendarSettings props tabs-mode already passes */ />;
}
```

No separate `DailyFocusView` screen component — same `DailyView`, same data-loading effect, same `QuickAddWidget` instance and `handleAddTask`/`handleAddMeeting` handlers, same `items`/`dailyFocus` data `DailyFocusPanel` already reads today (§6). A `focusMode` boolean prop switches its JSX between the existing two-column layout and the new one-column focus layout (§6) — this is a rendering branch inside an already-loaded screen, not a second screen with its own fetch.

**Persisted flag.** `domain/settings.ts`/`storage/settingsStorage.ts` gains one field, `focusModeActive: boolean` (default `false`), written whenever focus mode is entered or exited (§4.1/§4.2 below) and read once, inside `reorient()`, before its existing enclosing-item lookup:

```ts
const [loadedSettings, currentPath] = await Promise.all([loadSettings(), getCurrentNotePath()]);
...
setSettings(loadedSettings);
rebuildCache(loadedSettings).catch(...); // unchanged

if (loadedSettings.focusModeActive) {
  hasLandedRef.current = true;
  setMode('focus');
  return; // skip the enclosing-item/'current' logic entirely - never lands on a Project/Area view while focus mode is on
}
// existing enclosing-item / setActiveTab('daily') logic, unchanged
```

This is the entire "always returns to focus mode on reopen, never to Current" requirement — one flag, one early-return, no change to the existing lookup for the normal case.

### 4.1 Entering

A "Focus mode" affordance on Daily's normal (focus-off) view — the small button already sketched in the design canvas's B1 board — calls a new prop, e.g. `onEnterFocusMode`, threaded up to `App.tsx`: persists `focusModeActive: true` (`saveSettings`/whatever `settingsStorage.ts`'s existing write helper is) and `setMode('focus')`. No data changes — entering never itself marks anything `#now`; if some tasks already carry `#now` from earlier, the filtered view (§6) already reflects that the instant it renders.

### 4.2 Exiting

The focus screen's exit control calls `onExitFocusMode`: persists `focusModeActive: false`, `setMode('tabs')`, `setActiveTab('daily')` (landing back on normal Daily, not wherever `activeTab` last was — `activeTab` was never touched while in `'focus'` mode, so it may still say `'daily'` from before, but setting it explicitly is cheap and removes any doubt). Per chat: **exiting always ends the session outright** — it does not itself clear any `#now` tags (see §5 for why leaving them alone is correct and sufficient).

## 5. Sessions, held lightly — no new durable state

Two requirements sound like they need a "session" concept; neither actually does:

- **"Checked-off tasks stay visible until the whole set is done."** `#now` is not cleared per-task on Done. It's cleared for the *whole* currently-`#now` cohort, all at once, the instant zero of them remain not-done. Until that moment, a done `#now` task is simply `task.now === true && task.done === true` — already renders (checked, struck through) by the existing filtered query (`now === true`, no `!done` condition) with no extra bookkeeping. See §6 for exactly where the bulk-clear fires.
- **"Reopening always returns to the running session."** Fully covered by the single `focusModeActive` flag (§4) plus whatever tasks currently carry `#now` — there is nothing session-specific to resume, because the flag plus the live `#now` set *is* the entire state. Re-entering after an Exit, with old `#now` tasks still sitting there, looks identical to "resuming" but is implemented as nothing more than the ordinary filtered render running again. This is deliberately what "sessions are held lightly" cashes out to in code: the word "session" names a *pattern* in how `focusModeActive` and `Task.now` interact, not a stored thing.

## 6. Rendering, inside `DailyView.tsx`'s `focusMode` branch

All three states below read from the same already-loaded `items`/tasks data `DailyView` uses today (no new storage query):

**A. Filtered view — some `#now` tasks exist (done or not).**
`tasks.filter(t => t.now)`, grouped by item exactly like today's Open-tasks column, `TaskBadges` `context="flat"` unchanged. Meetings: today's Calendar-column data, filtered to a **4-hour look-ahead window** (`meeting.start - now() <= 4h`), computed **once when this screen is (re-)entered** (i.e. inside the same effect/branch-entry that already runs when `mode` becomes `'focus'` or `justCompletedTasks` clears back to state C→A) — not recomputed on a timer or on every render while the screen sits open. This matches the app's existing all-passive posture (§4 of `design-philosophy.md`: no clock, no ticking countdown) and means a meeting that crosses the 4h boundary while focus mode is already open simply doesn't appear until the next time the screen is entered — an acceptable, deliberately un-live staleness, not a bug to fix. Layout, top to bottom, per `design-philosophy.md` §8: the same `QuickAddWidget` instance (§7) first, then the task groups, then the meeting card(s) anchored at the bottom (a flexible spacer between, same as the design canvas mockup).

Task-done toggle, inside this branch specifically, gets one extra step appended to whatever the existing done-toggle handler already does: after marking a task done, recompute `tasks.filter(t => t.now && !t.done)`. If that's now empty **and** at least one task carries `now === true`: copy `tasks.filter(t => t.now)` into new local state `justCompletedTasks` (plain `useState`, unpersisted, same "owned by this screen, dies on unmount" convention `DailyFocusPanel`'s own local state already uses per its module doc comment), then clear `now` on every one of those tasks (batch write-through, same per-task save path already used elsewhere — no new storage primitive). This ordering (snapshot into local display state, *then* clear the tags) is what makes state B below possible without inventing a session.

**B. Session-complete — `justCompletedTasks` is non-empty.**
Header text **"Congratulations: All tasks done!"** — still one short line, no icon, no animation, no sound, but genuinely celebratory rather than a flat status readout (a small correction from an earlier, more clinical draft of this copy) — the `justCompletedTasks` list still rendered exactly as checked/struck-through as it was a moment ago, and one button, "Create new session". Tapping it clears `justCompletedTasks` (`setJustCompletedTasks([])`) and falls through to state C on the same render pass — no navigation, no unmount, matching "tasks remain visible until any screen change" (leaving the screen any other way — Exit, or `DailyView` unmounting because the app was reoriented elsewhere — simply drops this local state for free, same as `DailyFocusPanel`'s arm-state today).

**C. Picker — no `#now` tasks and nothing just finished.**
Same data `ui/DailyFocusPanel.tsx` already computes today (items where `dailyFocus === true`), filtered to their not-done `flowState === 'next'` tasks, rendered with the same `TaskBadges`/double-tap gesture as everywhere else (§3) — **but here double-tap only toggles selection** (`task.now = !task.now`, written straight through the same per-task save path, same as every other `#now` write), it does **not** by itself switch views. This is a correction from an earlier draft of this design, which had double-tap alone start the session; the problem with that is exactly what the picker is for — choosing *more than one* task — and a self-triggering toggle can't wait for a second, third, fourth selection. A single explicit **"Start focus session"** button (only reachable from this Picker state) is what actually commits the current selection and transitions into state A. Nothing is required to already be selected for the button to render — tapping it with nothing selected is simply a no-op session-with-nothing-in-it, not specially prevented, since state A's own empty-`#now` condition already falls straight back to this same Picker on the next render. This is also the state a completely fresh, never-used focus mode lands on.

## 7. Capture inside focus mode: the same `QuickAddWidget`, unchanged

Every state above renders the identical `<QuickAddWidget fixedDestination={FIXED_INBOX_DESTINATION} onAddTask={handleAddTask} onAddMeeting={handleAddMeeting} initialDate={...} .../>` instance normal Daily already places above its Open-tasks column (`screens/DailyView.tsx`, `docs/dev/technical-design-unified-quickadd.md`) — not a new, reduced capture box. It already supports a Todo/Meeting tab, flow-state chips, and a due-date field (§3 of that design doc), so "same options for date, flow-state and also meetings" (chat 2026-09-11) requires no new capability at all, only placing the existing widget first in the focus-mode column instead of re-deriving a stripped-down stand-in (the earlier design-canvas mockup's "Capture a thought — goes to Inbox" box was exactly that stand-in, now corrected). One open question, not yet asked: does `QuickAddWidget` need a `#now`-flow-state chip option added for a task created *from inside* focus mode (today's `FlowStateChips` options are next/waiting-for/someday/maybe) — flagged for a follow-up requirements pass, not blocking this design, since a task added from Inbox and later marked `#now` the ordinary way already covers the same outcome with one extra tap.

## 8. Explicitly out of scope here

- **Meeting↔Task relationship** (prep/follow-up tasks tied to a specific meeting) — `design-philosophy.md` §4's second meeting role. Needs its own requirements pass; nothing in this design depends on it.
- **Adding a task to `#now` while the filtered view (state A) is showing.** Only reachable via the Picker (state C) — i.e. before a set exists, or right after one finishes. Accepted trade-off, not a gap to close here (chat 2026-09-11).
- **Screen-dimension grounding.** Layout numbers in the design canvas mockup are still approximations, not measured against the real Supernote screen — deferred by the user, unrelated to this design's correctness.

## 9. Reuse summary

| Piece | Status |
|---|---|
| `Task.now` field + `deriveNow`/`setNowTag` | New, small — mirrors existing `flowState`/`dueDate` pattern exactly |
| `TaskBadges` glyph swap + double-tap | Extends existing component/gesture, one new optional prop |
| `App.tsx` `Mode: 'focus'` | New enum value, reuses the exact `'capture'` full-screen pattern |
| `focusModeActive` setting + `reorient()` override | One new persisted boolean, one early-return |
| Focus-mode layout (states A/B/C) | New JSX branch inside existing `DailyView.tsx`, existing data |
| `justCompletedTasks` | New local, unpersisted state — no session entity |
| Meetings source | Existing Calendar data, narrower (4h) time filter, refreshed only on screen entry |
| Picker's "Start focus session" | New button, only rendered in state C — commits the double-tap selections made there |
| Picker's task source | Existing `dailyFocus` query (`ui/DailyFocusPanel.tsx`'s own data) |
| Capture widget | Fully reused `QuickAddWidget` instance, zero changes |
