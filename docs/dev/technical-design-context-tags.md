# Technical Design: Context Tags

Status: draft, not yet implemented. Requirements clarified in chat across two rounds, then a Claude Design canvas ("GtdPara Context Tags", 6 artboards) iterated over two more rounds. This covers: (1) extracting `#tag`s from Meetings the same way Tasks already do, (2) a tag-suggestion/insert row in `ui/QuickAddWidget.tsx`'s Row 3, (3) tapping a tag already in a saved Task/Meeting's text to set a Daily-scoped "context" filter, and (4) Daily view's list rules changing while a context is active.

## 1. Goals and motivation

`Task.tags` (and, per the parser's field shape, `Meeting.tags`) already capture every `#word` in a Task/Meeting's text — general GTD flow-state (`#next`/`#waiting-for`/`#someday`/`#maybe`), due dates (`#due:YYYY-MM-DD`), and freeform context (`#alice`, `#team-jf`) all share one mechanism (design-overview.md §3, "one tag mechanism, no separate status field"). Flow-state and due tags got dedicated UI in the Tags feature (technical-design-tags.md); plain context tags never did — flagged explicitly as the one open gap there ("no UI surfaces plain context tags... even though the underlying `tags: string[]` already captures everything") and again in design-overview.md §4.

The idea (Tilman, chat): if a Meeting and a Todo share a tag (e.g. `#mh`), tapping that tag should let you see just the two of them together — a lightweight, tag-scoped view layered on top of Daily, not a new screen or a new data structure.

## 2. Scope for this pass

Confirmed in chat:

- **Tag extraction and the Row 3 add/insert UI are app-wide** — they're a property of `ui/QuickAddWidget.tsx`, which every screen (Daily, Current/`ProjectDataPanel`, Inbox, Review) already shares. A tag typed on a Project's Todo is exactly as real as one typed on Daily.
- **The context *filter* (viewing only tag-matching items) is Daily-only for v1** — explicitly scoped down ("reduce scope... start with Daily") from an earlier open question about whether it should be app-wide.
- **Composing with `#now`/focus mode is out of scope** — that shipped today (2026-09-11, `docs/dev/technical-design-now-focus-mode.md`) as its own one-column Daily mode; this design doesn't touch it.
- **No gesture change to existing rows** (see §7) — short-tap-to-edit stays exactly as it is everywhere.

I'm flagging the first bullet prominently because it's a wider surface than "Daily-only" might suggest at a glance — the Row 3 tag row and Meeting-tag extraction touch every screen that renders `QuickAddWidget`/`TaskRow`/`MeetingRow`, not just Daily. If that's not actually wanted, this is the point to say so before §4 below multiplies across six files.

## 3. Meeting tag extraction

`Meeting` already has a `tags: string[]` field (`domain/types.ts:174`) — it's just never populated. Every Meeting-construction site hardcodes `tags: []` literally, confirmed by reading the actual repo (not assumed):

| Site | Purpose |
|---|---|
| `domain/markdown.ts:433` (`parseMeetingsSpan`) | Every meeting read from a file |
| `screens/DailyView.tsx:886` | New meeting via Daily's quick-add |
| `screens/ProjectDataPanel.tsx:491` | New meeting via Current tab |
| `screens/InboxScreen.tsx:545` | New meeting via Inbox tab |
| `screens/ReviewScreen.tsx:985` | New meeting via Review |
| `screens/CaptureScreen.tsx:259` and `:285` | New meeting via Lasso capture (two destination branches) |

This mirrors `Task`'s own history exactly — `Task.tags`/`dueDate`/`flowState`/`waitingOn`/`now` are all produced by one exported `deriveTaskFields(text)` in `domain/markdown.ts`, spread (`...deriveTaskFields(text)`) at every Task-construction site (7 of them, same file list). The fix for Meeting is the same shape: add

```ts
// domain/markdown.ts, beside deriveTaskFields
export function deriveMeetingFields(title: string): {tags: string[]} {
  return {tags: extractTags(title)};
}
```

(`extractTags` already exists as a private helper in that file — no change needed to it, just a second caller.) Replace every `tags: []` above with `...deriveMeetingFields(title)` (add sites) — matching the constructor pattern already used for Task at the same call sites.

**Edit sites need the same treatment, and are less obvious.** I checked one directly: `ProjectDataPanel.tsx:519`'s `commitMeetingEdit` does `next[index] = {...next[index], title: fields.title, date: fields.date, time: fields.time, linkedFile: nextLinkedFile}` — `tags` is left as whatever the *previous* title produced, so editing a title to add or remove a `#tag` wouldn't update `tags` at all. Every Task edit site already avoids this by re-spreading `...deriveTaskFields(nextText)` on every save (`DailyView.tsx:611/678/737`, `ReviewScreen.tsx:516/611/893`, `InboxScreen.tsx:410`, `ProjectDataPanel.tsx:507`) — Meeting's edit sites need the equivalent `...deriveMeetingFields(fields.title)` added. I've only confirmed the one instance above; the others almost certainly have the same shape (each screen's meeting-edit handler mirrors its task-edit handler) but should be checked individually during implementation, not assumed.

## 4. Reserved tags: `isContextTag`

Flow-state/due/`#now` tags share the same `tags: string[]` array as freeform context tags, so the suggestion row and the tap-to-set-context behavior both need to know which tags are "real" context tags. New helper in `domain/flowState.ts` (alongside `deriveFlowState`/`setFlowStateTag`/`setNowTag`, which already own this vocabulary):

```ts
export function isContextTag(tag: string): boolean {
  if (tag === 'next' || tag === 'someday' || tag === 'maybe' || tag === 'now') return false;
  if (tag === 'waiting-for' || tag.startsWith('waiting-for:')) return false;
  if (tag.startsWith('due:')) return false;
  return true;
}
```

`#now` is included deliberately — it's not something we discussed explicitly in chat, but it's the same kind of reserved flow tag as the other four and would otherwise show up as a nonsense "context tag" once someone uses focus mode. Flagging it here since it's new since our last round, not because it seemed ambiguous.

This same helper does double duty in §6 below: a Someday/Maybe task surfaced on Daily by an active context still has its `#someday`/`#maybe` token sitting in the *displayed* text, because `ui/TaskBadges.tsx`'s `isFlowStateConveyed`/`displayTaskText` only strip flow-state tags from view when something else on screen conveys them (a badge, or the grouped section heading) — and on Daily's `'flat'` context, Someday/Maybe never gets a badge, so it's never stripped. `isContextTag` is what keeps that surviving `#someday` token from rendering as a tappable context-tag pill in §7's row-text splitting — it renders as inert plain text, same as any other word.

## 5. Tag recency: `storage/tagUsage.ts` (new)

"Last applied" ordering needs bookkeeping that doesn't exist anywhere today — tags are just substrings in files, with no timestamp. This is plugin-internal UI state, not PARA content (nobody needs to hand-edit "which tags I used recently" outside the plugin), so it follows `storage/settingsStorage.ts`'s existing AsyncStorage convention exactly rather than living in a project/area file:

```ts
const TAG_USAGE_KEY = 'gtdpara:tagUsage:v1';
interface TagUsageEntry { tag: string; lastUsedAt: number }

export async function recordTagsUsed(tags: string[]): Promise<void> { /* move-to-front, cap at 30, dedupe */ }
export async function getRecentTags(limit = 30): Promise<string[]> { /* most-recent first */ }
```

`recordTagsUsed` is called once per successful Task/Meeting add or edit save, from inside `QuickAddWidget`'s existing `.then()` chains (`submitTaskCreate`/`submitTaskEdit`/`submitMeetingCreate`/`submitMeetingEdit` — see `ui/QuickAddWidget.tsx:294-369`) — extracting tags from the just-saved `finalText`/title via `extractTags` and filtering through `isContextTag`. This is the one place every add/edit already funnels through regardless of screen, so it's a single call site rather than one per screen (unlike §3's construction fix, which has no single choke point because Meeting objects are built directly rather than always round-tripping through a shared submit function). Recording happens whether the tag was tapped in from Row 3 or typed by hand — both are equally "applied," which is what makes case-insensitive, typed-tags-count-too tag reuse actually workable, per the chat decision that this bookkeeping was worth the cost.

## 6. Daily view: context state, indicator, filtering

### State

`screens/DailyView.tsx` gains local state: `const [dailyContext, setDailyContext] = useState<string | null>(null)`. Not persisted — resets to off every time the plugin reopens, same "nothing new to remember across a reopen unless it has to be" posture `docs/dev/technical-design-now-focus-mode.md` §5 already uses for focus mode's own state. Open question, not decided: should it survive a reopen instead? Easy to flip later; defaulting to session-only for v1.

One shared setter, used both by the top-right indicator's ✕ and by any tag tap (§7): `toggleContext(tag: string) { setDailyContext(c => c === tag ? null : tag); }` — tapping the currently-active tag again clears it, tapping a different tag switches to it (single-select, matches the mockup).

### Indicator

Small, quiet, in Daily's own content area (top-right, above the two-column body) — not the shared `ui/TabBar.tsx`, since that chrome renders identically on all seven tabs and this filter is Daily-only. Inactive: an outline "#" mark, no text. Active: a filled pill (`background: #2f6feb`, white text) showing `#{dailyContext}` plus a small "✕" — same visual and interaction convention `QuickAddWidget`'s existing `clearX`/`attachRemove` styles already use (small, `opacity: 0.7`, own `hitSlop`). Simple enough to write inline in `DailyView.tsx` rather than a new shared file, matching how the also-new-today `ExitFocusModeIcon` is rendered inline there rather than extracted early.

### Confirmed filter semantics

Two chat rounds combine into one rule — restating it precisely here so it's checkable, since I'm synthesizing across both: **when `dailyContext` is set, Daily shows only Tasks/Meetings whose `tags` include it — full stop, replacing the normal inclusion rule rather than adding to it** (this is the original ask: "once it is set, it will only show the meetings and todos with that tag"). Among those tag-matches, which flow-states are eligible is *relaxed* from the normal rule: `next`, due-today-or-earlier, `waiting-for`, and `someday` all qualify; `maybe` does not, even with a matching tag. Meetings are tag-filtered the same way, still within the existing today/tomorrow window (context doesn't widen the date range, just narrows within it).

### `storage/dailyAggregate.ts` changes

`buildDailyAggregate` (`storage/dailyAggregate.ts:106`) gains an optional fourth parameter:

```ts
export function buildDailyAggregate(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  basePath: string,
  now: Date = new Date(),
  contextTag: string | null = null,
): DailyAggregate
```

Inside the per-item task loop (`:133-143`) and the Inbox task loop (`:153-164`), branch on `contextTag`:

```ts
if (contextTag) {
  if (!task.tags.includes(contextTag)) return; // hard filter
  if (task.flowState === 'maybe') return;       // still excluded
  tasks.push({item, taskIndex, task});
  return;
}
// ...existing next/due/daily-focus/waiting-for-someday-maybe-exclusion logic, unchanged
```

Meeting loops (`:144-148`, `:165-169`) get the equivalent: when `contextTag` is set, additionally require `meeting.tags.includes(contextTag)`, keeping the existing today/tomorrow/not-cancelled checks as-is.

`DailyView.tsx` passes `dailyContext` through to its `buildDailyAggregate` call, re-deriving whenever `dailyContext` changes (it's a pure synchronous function over the already-warm cache, per the file's own module doc comment — no new I/O, no new cache-rebuild trigger needed).

### Someday's missing badge

Someday tasks get no badge at all today (`ui/TaskBadges.tsx`'s own doc comment: "Someday and Maybe get no badge at all today"). Surfaced under an active context, a Someday task would look indistinguishable from a normal Next task. The design canvas adds a small light "Someday" tag next to it as a visual cue — my own addition, flagged there and again here as not yet confirmed. If wanted, this is a small `TaskBadges` addition scoped to `context === 'flat' && task.flowState === 'someday' && contextTag matched` (Waiting For already gets a badge — "Waiting on: X" — so it needs no new treatment).

## 7. Tag-in-text tap target (`TaskRow`/`MeetingRow`)

### Splitting the text

`ui/TaskRow.tsx` currently renders one `<Text numberOfLines={2}>{displayTaskText(task, context)}</Text>` inside a `<Pressable onPress={onStartEdit}>` wrapping the whole row. New domain helper (`domain/markdown.ts`, beside `extractTags`):

```ts
export function splitTextWithTags(text: string): Array<{kind: 'text'; value: string} | {kind: 'tag'; value: string}>
```

— reuses the existing `TAG_RE` to walk the string once, yielding alternating plain/tag segments (tag segments carry the lowercased tag exactly as `extractTags` would extract it, for exact-match against `dailyContext`). `TaskRow` renders this over `displayTaskText(task, context)`'s *output* (already has flow-state/due tags conditionally stripped by the existing logic — see §4's note on why Someday/Maybe survive that stripping under `'flat'` context) — the splitter doesn't re-implement any stripping, just segments what's left. `MeetingRow` runs the same splitter directly over `meeting.title` (no stripping step exists there today, nothing to compose with).

Each `{kind: 'tag'}` segment where `isContextTag(value)` is true renders as its own nested `<Text onPress={...}>` — filled-pill style (matching a selected `FlowStateChips` chip) when `value === contextTag`, outlined when not. A tag segment that fails `isContextTag` (a stray `#someday` per §4, or `#now`) renders as plain text, same as any other word — not tappable, no pill. `onPress` on a tag segment calls the shared `toggleContext(value)` from §6 and does **not** propagate to the row.

### Why this doesn't need the row's own edit-tap to change

Nested `<Text onPress>` inside a parent `<Text>`/`<Pressable>` is not new territory for this codebase — `ui/TaskBadges.tsx` already renders several independent small `Pressable`s (the flow-state badge, the waiting-on badge, the due badge) sitting right next to the row's own tap-to-edit text, and the Next/Now badge already stacks *two* gestures on one element (single tap reveals its label, double tap toggles `#now` — see `TaskBadges.tsx`'s `handlePress`). Embedding a tappable span *inside* the flowing text rather than appended after it is a step further, but the same mechanism: React Native resolves a touch to the innermost element carrying its own `onPress`, so a tap landing on a tag segment goes to that segment's handler, and a tap anywhere else on the row falls through to the row's existing `onStartEdit` unchanged.

We discussed (and I'm recommending against) solving this instead by making edit a long-press and freeing up short-tap for tags: the long-press version is more foundational — it'd change the single most common gesture in the app, on every row, everywhere, whether or not that row even has a tag — for a risk that turns out to be a comfortable-hit-target problem (solvable with `hitSlop`, same as every other small control in this codebase) rather than a real gesture conflict. Keeping short-tap-to-edit as-is and using `hitSlop` on tag segments is the plan; a long-press fallback stays on the table only if real on-device testing shows mis-taps are an actual problem.

**This is the one piece of this design without a shipped precedent to point at** (badges-after-text and double-tap-on-one-badge are both proven in this codebase; a tap target *inside* a wrapped, multi-line `<Text>` isn't). Worth an early, isolated on-device check before building the rest around it.

## 8. `ui/QuickAddWidget.tsx`: the tag row

### New component: `ui/TagChips.tsx`

Mirrors `ui/FlowStateChips.tsx`'s shape (controlled, stateless-ish) but owns its own pagination:

```ts
interface Props {
  text: string;                 // current draft/edit text, to find already-present tags
  recentTags: string[];         // from storage/tagUsage.ts, already isContextTag-filtered
  capacity: number;             // how many chips fit per page — see below
  onInsertTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  textColor: string;
  borderColor: string;
}
```

Page 0 always pins tags already present in `text` first (filled/selected style, tapping again removes — symmetric with `FlowStateChips`' own toggle-to-clear), filling remaining slots with the front of `recentTags` (excluding anything already pinned). Later pages page through the rest of `recentTags` in order, up to all 30. Tapping an unselected chip calls `onInsertTag`; tapping a pinned/selected one calls `onRemoveTag`.

### Layout: confirmed across two rounds

Row 3 stays one line, reusing existing horizontal space rather than adding a new row:

- **Todo, page 0**: `FlowStateChips` (unchanged) + `TagChips` (`capacity: 2`, roughly — real number depends on on-device width, same "guess then check" posture as every other fixed-width control here per design-overview.md §2.6) + the existing attachment cluster (edit mode only).
- **Todo, page 1+**: `FlowStateChips` is replaced entirely by `TagChips` at `capacity: ~6` — this was the correction from the second chat round: paging doesn't just swap the tag cluster, it drops the flow chips too, since there still isn't room otherwise. A `‹` chip returns to page 0 (and the flow chips reappear there).
- **Meeting**: no flow chips ever compete for the space, so `TagChips` runs at the wider `capacity: ~6` from page 0 on — and (this message's correction) still needs `‹`/`›` paging once tag count exceeds one page, exactly like Todo's page-1+ view. The first design round showed a Meeting artboard with a trailing `›` but no actual page-2 state; the canvas now has both.

Page state lives inside `TagChips` itself; needs a reset when the edit/create target changes (new draft vs a different task/meeting being edited) — the natural place is alongside `QuickAddWidget`'s existing `wasEditingRef` transition effect (`ui/QuickAddWidget.tsx:207-240`), which already knows exactly when that happens.

### Insert-at-cursor

"Add at current position, or the end if in doubt." `TextInput` doesn't expose cursor position by default; `onSelectionChange` does. Plan: `TaskDraft`/`TaskEditFields` (and the Meeting equivalents) gain a `lastSelection: {start: number; end: number} | null`, updated on every `onSelectionChange` — tracked, not used to control the input in normal typing (fully-controlled `selection` is a known source of jank on RN/Android; better to leave the field normally-uncontrolled and only reach for `lastSelection` at the moment of insertion). New domain helper:

```ts
export function insertTagAtPosition(text: string, tag: string, position: number | null): {text: string; cursor: number}
```

— inserts `#tag` at `position` (clamped to text length when null/out of range — the "in doubt, at the end" fallback), adding a space on either side only where the adjacent character isn't already whitespace or a string boundary. After calling it, `TagChips`' `onInsertTag` updates the draft/edit text *and* — for that one update only — sets the `TextInput`'s `selection` prop to the returned cursor, so typing continues from right after the inserted tag rather than jumping to the end. This interaction (controlled selection immediately after a programmatic text change) is exactly the kind of thing this project has repeatedly had to verify and retune against the real device rather than trust in the abstract (§2.6's `dueInput` lesson) — flagging it as a specific on-device check, not assuming it works as designed.

`onRemoveTag` uses a companion `removeTagFromText(text: string, tag: string): string` (regex-remove the `#tag` token plus one adjacent space, collapse any resulting double space) — same "read/write the tag in text" shape `setFlowStateTag`/`setDueTag` already establish.

## 9. Files touched (summary)

- `domain/types.ts` — no change (`Meeting.tags` already exists).
- `domain/markdown.ts` — `deriveMeetingFields`, `splitTextWithTags`, `insertTagAtPosition`, `removeTagFromText`; fix the 6 add-sites and however many edit-sites §3 finds, listed there.
- `domain/flowState.ts` — `isContextTag`.
- `storage/tagUsage.ts` (new) — `recordTagsUsed`/`getRecentTags`, AsyncStorage-backed.
- `storage/dailyAggregate.ts` — `buildDailyAggregate`'s new `contextTag` param, both task loops and both meeting loops.
- `ui/TagChips.tsx` (new).
- `ui/QuickAddWidget.tsx` — wire `TagChips` into task/meeting Row 3 per §8, cursor tracking, call `recordTagsUsed` in the four submit `.then()`s.
- `ui/TaskRow.tsx`, `ui/MeetingRow.tsx` — segment-rendered text per §7, new optional `contextTag`/`onToggleContext` props (present only on Daily's instances — other screens don't pass them, so their tags stay plain, unstyled text, same as today).
- `ui/TaskBadges.tsx` — optional Someday visual cue (§6), if wanted.
- `screens/DailyView.tsx` — `dailyContext` state, the top-right indicator, threading `contextTag`/`onToggleContext` into its row instances, passing `dailyContext` into `buildDailyAggregate`.
- `docs/dev/design-overview.md` — new as-built section once this is implemented (not part of this design pass).

## 10. Explicitly out of scope

- Context filter on any screen other than Daily.
- Composing context with `#now`/focus mode.
- Any gesture change to existing rows (long-press-to-edit) — see §7.
- Persisting `dailyContext` across a plugin reopen.
- Any way to set context besides tapping a tag (a dedicated tag picker/list) — "some other options could also be offered later," not now.

## 11. Open questions carried into implementation

1. Exact per-page tag capacity (2-3 for Todo page 0, ~6 for everything else) is a starting-point guess like every other fixed-width control in this app — check and retune against the real device rather than trust the number here.
2. Whether `dailyContext` should persist across a plugin reopen (§6) — defaulting to no.
3. The Someday visual cue (§6) — my own addition, not yet confirmed as wanted.
4. §7's tap-inside-wrapped-text mechanism is the one piece without a shipped precedent in this codebase — worth an isolated on-device spike before the rest of this is built around it.
5. §3's meeting-edit call sites — only one (`ProjectDataPanel.tsx`) has been directly confirmed to need the `deriveMeetingFields` fix; the rest need checking during implementation, not assumed identical.

## 12. Reference

Design canvas: "GtdPara Context Tags" (Claude Design, 6 artboards) — Daily context off/active, Todo edit tag-row pages 1-2, Meeting edit tag-row pages 1-2. See [[gtdpara_project]] for repo layout/workflow mode, [[feature_tags]] for the flow-state chip/badge conventions this builds on, [[feature_unified_quickadd]] for `QuickAddWidget`'s row structure.
