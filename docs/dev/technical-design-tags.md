# Technical Design — Task Tags (Next / Waiting For / Someday / Maybe / Due)

*Companion to docs/dev/design-overview.md. Written before implementation, per the project's workflow (requirements → technical design → implementation). Once built, fold the "as-built" parts of this into design-overview.md §2/§4/§5 and retire this file, same as any other feature's technical draft.*

Requirements this implements: project memory `feature_tags.md` (decided 2026-09-02) and the UI sketch published alongside it. Builds directly on the tag/due-date mechanism `feature_focus_selection.md` already put in place (`domain/markdown.ts`'s `deriveTaskFields`, `Task.tags`/`Task.dueDate`), and sits next to the just-shipped Weekly Review feature (`feature_weekly_review.md`, `screens/ReviewScreen.tsx`) — §7 below is specifically about how the two fit together, per this design's brief.

---

## 1. Flow-state model

```ts
// domain/types.ts
export type FlowState = 'next' | 'waiting-for' | 'someday' | 'maybe' | null;
```

`null` means "no flow-state tag" — the "Other" bucket in grouping (§4), no badge on Daily (§5.2). Exclusivity (`feature_tags.md`'s decision) is enforced by the UI going forward (tapping a chip clears any other flow-state chip first, §5.1) but the *parser* stays permissive the same way `ItemStatus`/`parseFrontMatter` already are about a hand-edited file: if a line somehow carries two flow tags (`#next #someday`, hand-typed or left over from before this feature), `deriveFlowState` below picks one by a fixed priority rather than throwing or picking arbitrarily by array order — never invent structure, but never load-bearing-fail on messy input either, same posture as every other parser in `domain/markdown.ts`.

`Task` gains two derived fields, computed the exact same way `tags`/`dueDate` already are — never a separate source of truth, always re-derived from `text` on every parse and every edit:

```ts
// domain/types.ts — Task
export interface Task {
  text: string;
  done: boolean;
  cancelled: boolean;
  tags: string[];
  dueDate: string | null;
  /** NEW — derived from tags, see domain/flowState.ts. Exclusive by UI convention, permissive by parse. */
  flowState: FlowState;
  /** NEW — derived from a `#waiting-for:<slug>` tag, or null. Only meaningful when flowState === 'waiting-for'. */
  waitingOn: string | null;
  notePath: string;
}
```

### Waiting-on encoding (resolves `feature_tags.md`'s open question)

`domain/markdown.ts`'s `TAG_RE` only allows `[\w-]+` in a tag's `:value` segment — the same constraint `#due:YYYY-MM-DD` already lives inside. Free text like "Meier & Sohn" can't go in losslessly. Decision: reuse the exact same mechanism `#due:` already established rather than inventing a second one — `#waiting-for:<slug>`, where `<slug>` is produced by slugifying whatever the user types into the "Waiting on" field (lowercase, non-`[a-z0-9-]` runs collapsed to a single `-`, trimmed). This is genuinely lossy (punctuation, exact capitalization, "&" are gone) — accepted trade-off, flagged here for visibility rather than silently decided. The badge (§5.2) re-titlecases the slug for display (`meier-sohn` → `Meier Sohn`); re-opening the task for edit shows the stored slug in the Waiting-on field, not an attempt to reconstruct the original text — the round-trip is slug-to-slug from then on, only the initial free-text-to-slug step is lossy.

## 2. Derivation & mutation helpers (new `domain/flowState.ts`)

Pure, zero RN/SDK imports, same convention as everything else in `domain/` — unit-testable via the existing standalone Node scripts, no device needed.

```ts
// domain/flowState.ts
import {FlowState} from './types';

const FLOW_STATE_WORDS: Exclude<FlowState, null>[] = ['next', 'waiting-for', 'someday', 'maybe'];

/** Priority order matters only for messy/hand-edited input carrying more than one flow tag — the UI never produces that state itself (§5.1). */
export function deriveFlowState(tags: string[]): FlowState {
  for (const word of FLOW_STATE_WORDS) {
    if (tags.some(t => t === word || t.startsWith(`${word}:`))) return word;
  }
  return null;
}

const WAITING_FOR_VALUE_RE = /^waiting-for:([\w-]+)$/;

export function deriveWaitingOn(tags: string[]): string | null {
  for (const tag of tags) {
    const match = WAITING_FOR_VALUE_RE.exec(tag);
    if (match) return match[1];
  }
  return null;
}

/** Free text → tag-safe slug for the "Waiting on" field. Lossy — see §1. */
export function slugifyWaitingOn(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `meier-sohn` → `Meier Sohn`, for badge display (§5.2). */
export function titleCaseSlug(slug: string): string {
  return slug.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const FLOW_STATE_TAG_RE = /#(next|waiting-for(?::[\w-]+)?|someday|maybe)\b/gi;

/**
 * Removes any existing flow-state tag (bare, or `waiting-for:<slug>`) from
 * `text` and appends the new one, if any. The one place UI code edits `text`
 * for flow-state — callers re-derive tags/dueDate/flowState immediately
 * after via `deriveTaskFields` (domain/markdown.ts), same as every other
 * text edit in this codebase (text is hand-typed truth, tags are a read).
 */
export function setFlowStateTag(text: string, next: FlowState, waitingOnSlug?: string): string {
  const stripped = text.replace(FLOW_STATE_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (!next) return stripped;
  const tag = next === 'waiting-for' && waitingOnSlug ? `#waiting-for:${waitingOnSlug}` : `#${next}`;
  return `${stripped} ${tag}`.trim();
}
```

`domain/markdown.ts` gets the `#due:` counterpart (same shape, kept there since that's where `DUE_TAG_RE` already lives) and `deriveTaskFields` widens to call both:

```ts
// domain/markdown.ts
const DUE_TAG_ANY_RE = /#due:\d{4}-\d{2}-\d{2}\b/gi;

export function setDueTag(text: string, dueDate: string | null): string {
  const stripped = text.replace(DUE_TAG_ANY_RE, '').replace(/\s{2,}/g, ' ').trim();
  return dueDate ? `${stripped} #due:${dueDate}`.trim() : stripped;
}

export function deriveTaskFields(text: string): {
  tags: string[];
  dueDate: string | null;
  flowState: FlowState;      // NEW
  waitingOn: string | null;  // NEW
} {
  const tags = extractTags(text);
  return {
    tags,
    dueDate: deriveDueDate(tags),
    flowState: deriveFlowState(tags),
    waitingOn: deriveWaitingOn(tags),
  };
}
```

Because every call site that builds a `Task` already spreads `...deriveTaskFields(text)` (`DailyView.tsx`'s `submitNewTask`/`commitTaskEdit`, `ProjectDataPanel.tsx`'s `TodosSection.handleAdd`/`commitEdit`, `parseTasksSpan`), **no call site needs to change to pick up the two new fields** — this is a pure additive widening of an already-universal pattern.

## 3. Daily aggregate — the exclusion rule (`storage/dailyAggregate.ts`)

`buildDailyAggregate`'s task filter gains one line, placed before the existing inclusion check so it wins outright over due-date and focus-membership both, per `feature_tags.md`'s decision:

```ts
cachedItem.tasks.forEach((task, taskIndex) => {
  if (task.done || task.cancelled) return;
  // NEW — Waiting For / Someday / Maybe never show on Daily, full stop.
  if (task.flowState === 'waiting-for' || task.flowState === 'someday' || task.flowState === 'maybe') return;
  const isNext = task.flowState === 'next';               // was: task.tags.includes('next')
  const isDueTodayOrOverdue = task.dueDate !== null && task.dueDate <= todayDate;
  const isDailyFocusItem = cachedItem.dailyFocus;
  if (isNext || isDueTodayOrOverdue || isDailyFocusItem) {
    tasks.push({item, taskIndex, task});
  }
});
```

Net effect, stated plainly since it's the concrete answer to "Daily shows only #next": the only flow-state a task on Daily can ever display is Next (§5.2 only ever renders that one badge in the `'flat'` context). Update the module doc comment's "Scope" paragraph to describe the new exclusion — it currently only documents the three inclusion reasons.

## 4. Project/Area grouping (`domain/flowState.ts`, consumed by `ProjectDataPanel.tsx`)

```ts
// domain/flowState.ts
import {Task} from './types';

export interface TaskGroup {
  key: Exclude<FlowState, null> | 'other';
  label: string;
  entries: Array<{task: Task; index: number}>;
}

const GROUP_ORDER: Array<{key: TaskGroup['key']; label: string}> = [
  {key: 'next', label: 'Next'},
  {key: 'waiting-for', label: 'Waiting For'},
  {key: 'someday', label: 'Someday'},
  {key: 'maybe', label: 'Maybe'},
  {key: 'other', label: 'Other'},
];

/** Pure grouping over an item's own tasks — not cancelled, done tasks stay in their group (with strikethrough, same as today). Empty groups are omitted, same convention technical-design-status-archive.md §7 already established for the Projects/Areas list's status sections. */
export function groupTasksByFlowState(tasks: Task[]): TaskGroup[] {
  const indexed = tasks.map((task, index) => ({task, index})).filter(({task}) => !task.cancelled);
  const buckets: Record<TaskGroup['key'], Array<{task: Task; index: number}>> = {
    next: [], 'waiting-for': [], someday: [], maybe: [], other: [],
  };
  for (const entry of indexed) {
    buckets[entry.task.flowState ?? 'other'].push(entry);
  }
  return GROUP_ORDER.map(g => ({...g, entries: buckets[g.key]})).filter(g => g.entries.length > 0);
}
```

`ProjectDataPanel.tsx`'s `TodosSection` (currently a flat `visible.map(...)`, ~line 502) renders `groupTasksByFlowState(tasks)` instead, one `<Text style={styles.subheading}>` per non-empty group followed by that group's rows — no other change to how a row itself renders (§5, §6). No cross-cutting "Due" section, per `feature_tags.md`'s decision — due-date stays a per-row badge, orthogonal to grouping.

## 5. Shared UI components — where this feature does the reuse work

Two pieces of shared UI already exist from the Weekly Review build (`ui/TaskQuickAdd.tsx`, `ui/DestinationPicker.tsx` — the codebase's first genuinely shared *presentation*, per that feature's own deliberate deviation from design-overview.md §3). This feature adds three more, and — because it has to touch task-row rendering in `DailyView.tsx` *and* `ProjectDataPanel.tsx` *and* extend a component `ReviewScreen.tsx` already imports — it's the natural point to also close two duplications those two features left open, rather than adding a fourth/fifth hand-copy of task UI.

### 5.1 `ui/FlowStateChips.tsx` — new

Visually identical to `ProjectDataPanel.tsx`'s existing `StatusSection` pill row (`statusOption`/`statusOptionSelected`/`statusOptionText`, ~lines 909-927: border `#dddddd` → `#2f6feb` + white text when selected, `FONT.small`, radius 6, padding 8/14) — same visual language, reused rather than reinvented. One real behavioral difference from `StatusSection`: a flow-state chip can be *un*selected (tap the already-selected chip to clear it back to `null`), where Status always has exactly one value selected. Controlled component:

```ts
interface Props {
  value: FlowState;
  onChange: (next: FlowState) => void;
  textColor: string;
  borderColor: string;
  disabled?: boolean;
}
```

Renders Next / Waiting For / Someday / Maybe as pills; `onPress` calls `onChange(value === option ? null : option)`. *(Bonus opportunity, not required for this feature: `StatusSection` could eventually be rebuilt on top of this same chip primitive — noted, not pursued here, to avoid putting the already-shipped Status feature at risk over an unrelated refactor.)*

### 5.2 `ui/TaskBadges.tsx` — new

One small function/component every task-row surface imports, so "what a badge says and looks like" has exactly one definition:

```ts
export function taskBadgeLabels(task: Task, context: 'flat' | 'grouped', today: string): string[] {
  const badges: string[] = [];
  if (context === 'flat' && task.flowState === 'next') badges.push('Next');
  if (task.flowState === 'waiting-for' && task.waitingOn) {
    badges.push(`Waiting on: ${titleCaseSlug(task.waitingOn)}`);
  }
  if (task.dueDate) {
    badges.push(`${task.dueDate < today ? 'Overdue' : 'Due'} ${task.dueDate}`);
  }
  return badges;
}
```

`context: 'flat'` (Daily's Open-tasks list, Daily's Inbox rows, Review's Inbox cards — nothing there is grouped by flow-state) shows the Next badge; `context: 'grouped'` (Project/Area's Todos list, §4) omits it since the section header already says it. Both contexts show the Waiting-on and Due badges — those are orthogonal to grouping. A thin render wrapper (`<TaskBadges task={...} context={...} textColor={...} borderColor={...} />`, `FONT.small`, `1px solid #dddddd` pill, no fill — `ui/theme.ts`'s own doc comment already earmarks `FONT.small` for "tag-like labels") sits next to the row text in every caller.

### 5.3 `ui/TaskQuickAdd.tsx` — extended, not replaced

This is the highest-leverage change in this design. `TaskQuickAdd` is already imported in three places today: `DailyView.tsx`'s Tasks-column quick-add, and `ReviewScreen.tsx`'s Week-ahead step *and* its per-card quick-add on every stalled-project/neglected-area card (`ReviewItemCard`, ~line 792). Adding the chip row and due field *inside* `TaskQuickAdd` itself — rather than around each call site — means all three surfaces gain tag support simultaneously, with zero changes to `DailyView.tsx`'s or `ReviewScreen.tsx`'s own calling code. This is §7's main point of contact with the Review flow, so it's worth being explicit about why it's free:

```ts
// TaskQuickAdd's onAdd contract, unchanged:
onAdd: (text: string, destination: Destination) => Promise<void>;
```

`text` was already an opaque, fully-composed string as far as every caller is concerned (`DailyView.handleAddTask`, `ReviewScreen`'s equivalent) — neither reads or interprets it, both just pass it straight into `saveTasks`. So `TaskQuickAdd` composing the flow-state/due tags into `text` before calling `onAdd` requires touching nothing outside this one file:

```tsx
// ui/TaskQuickAdd.tsx — new local state
const [flowState, setFlowState] = useState<FlowState>(null);
const [waitingOnText, setWaitingOnText] = useState('');
const [dueDate, setDueDate] = useState('');

const submit = () => {
  Keyboard.dismiss();
  const trimmed = text.trim();
  if (!trimmed) return;
  let finalText = setFlowStateTag(
    trimmed,
    flowState,
    flowState === 'waiting-for' ? slugifyWaitingOn(waitingOnText) : undefined,
  );
  finalText = setDueTag(finalText, dueDate || null);
  setError(null);
  setPending(true);
  onAdd(finalText, fixedDestination ?? destination)
    .then(() => { setText(''); setFlowState(null); setWaitingOnText(''); setDueDate(''); })
    .catch(e => setError(e instanceof Error ? e.message : String(e)))
    .finally(() => setPending(false));
};
```

New markup: a `<FlowStateChips>` row plus a small due-date `<TextInput>` (`meetingFieldInput`-style, width ~110, placeholder `YYYY-MM-DD`) below the existing text-input/Add-button row, and a "Waiting on" `<TextInput>` that only renders when `flowState === 'waiting-for'` — same layout the sketch showed for Daily's Add-task block. `DestinationPicker` (or its absence, when `fixedDestination` is set) is unaffected, still rendered below.

**This is also where `ReviewScreen.tsx`'s stale doc comment needs fixing** — line 8 currently reads "Task tags are explicitly out of scope (not much supported yet); nothing here reads or writes them." That stops being true the moment this ships: Week-ahead's quick-add and every stalled-project/neglected-area card's quick-add can now set a flow-state/due date on the task they create, without `ReviewScreen.tsx` itself doing anything new. Update the comment; no logic in that file needs to change for this part.

### 5.4 `screens/ProjectDataPanel.tsx` — migrate its quick-add to `TaskQuickAdd`

`TodosSection.handleAdd` (~line 517) is currently its own bespoke `newText`/`addRow` implementation — the third independent "add a task" implementation in the codebase (`DailyView.tsx` and `ReviewScreen.tsx` both already use the shared `TaskQuickAdd`; `ProjectDataPanel.tsx` never got migrated when Weekly Review did this extraction, since that work `[per feature_weekly_review.md]` deliberately targeted `DailyView.tsx`'s versions specifically). `TaskQuickAdd` already has exactly the mode this needs — `fixedDestination` set, no picker shown — because `ReviewScreen.tsx`'s `ReviewItemCard` already uses that same mode for the identical "add a task straight to this one item" case:

```tsx
<TaskQuickAdd
  fixedDestination={{type: 'item', kind, name, path: itemPath}}
  onAdd={async (text) => { await onSave([...tasks, {text, done: false, cancelled: false, ...deriveTaskFields(text), notePath: ''}]); }}
  label="Add todo"
  placeholder="New todo"
  textColor={textColor}
  borderColor={borderColor}
  placeholderColor={placeholderColor}
/>
```

replaces the hand-rolled `addRow`/`newText` state and `handleAdd` function entirely. This collapses three parallel "add a task" implementations down to one, which is the concrete answer to "strengthens reuse of UI components" for the create side of this feature.

### 5.5 `ui/TaskEditCard.tsx` — new

`DailyView.tsx`'s `renderTaskEntry` (~line 547) and `ProjectDataPanel.tsx`'s `TodosSection` row map (~line 595) each carry their own inline `editingIndex`/`draftText`/bare-`TextInput` edit branch today — two near-identical, independently-maintained pieces of UI, and both need to grow the same three new fields (chips, waiting-on, due). One shared component instead of growing both in parallel:

```ts
interface Props {
  task: Task;
  onSave: (nextText: string) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}
```

Internally: a bordered card (same visual shape `MeetingsSection`'s existing `meetingEditRow` already uses for meeting edits — column layout, border, padding — rather than DailyView/ProjectDataPanel's current bare single-line `TextInput` for tasks) holding the text input, `FlowStateChips`, the due field, the waiting-on field (shown conditionally), and a Save button. On Save it composes `nextText` via the same `setFlowStateTag`/`setDueTag` pair §5.3 uses and calls `onSave(nextText)`.

Callers change from:

```ts
// today, e.g. DailyView.commitTaskEdit
tasks[entry.taskIndex] = {...tasks[entry.taskIndex], text, ...deriveTaskFields(text)};
```

to the same one-liner, just invoked from `TaskEditCard`'s `onSave` instead of a bare `TextInput`'s `onSubmitEditing`/`onBlur`:

```tsx
<TaskEditCard
  task={entry.task}
  onSave={nextText => saveEntryTasks(entry, tasks => {
    tasks[entry.taskIndex] = {...tasks[entry.taskIndex], text: nextText, ...deriveTaskFields(nextText)};
    return tasks;
  })}
  textColor={textColor} borderColor={borderColor} placeholderColor={placeholderColor}
/>
```

No change to the underlying persistence path (`saveEntryTasks`/`onSave` still do exactly what they did before) — `TaskEditCard` only changes what produces `nextText`.

## 6. Row-level wiring

- **`DailyView.tsx`'s `renderTaskEntry`** (~line 547): non-editing branch gains `<TaskBadges task={entry.task} context="flat" .../>` next to `entry.task.text`; editing branch swaps its bare `TextInput` for `<TaskEditCard>` (§5.5).
- **`DailyView.tsx`'s Inbox task rows** (~line 688): currently just a checkbox + raw `task.text`, no edit/badges at all (deliberately minimal, per that section's own doc comment) — add `<TaskBadges context="flat">` only, read-only, consistent with the section staying capture-triage-only otherwise.
- **`ProjectDataPanel.tsx`'s `TodosSection`**: restructured per §4 (grouped sections); each row's non-editing branch gains `<TaskBadges context="grouped">`; editing branch swaps to `<TaskEditCard>` (§5.5); add-block swaps to shared `TaskQuickAdd` (§5.4).
- **`ReviewScreen.tsx`'s `renderInboxZero`** (~line 428): the inbox-task card currently shows raw `task.text` only, no badges — add `<TaskBadges context="flat">` next to it (read-only; File/Done/Cancel already cover every action this step offers, no edit surface needed here).

## 7. Interaction with Weekly Review

Called out explicitly per this design's brief ("locks in with the new review flow"):

- **Free propagation, no `ReviewScreen.tsx` logic changes**: because `TaskQuickAdd`'s `onAdd(text, destination)` contract already treats `text` as an opaque, fully-composed string (§5.3), extending `TaskQuickAdd` itself means Week-ahead's quick-add and every `ReviewItemCard`'s quick-add gain flow-state/due support automatically. The only edit needed in `ReviewScreen.tsx` is the stale doc-comment line (§5.3).
- **Read-only badge on the Inbox step** (§6): the one other touch to `ReviewScreen.tsx`, purely additive.
- **Flagging, not resolving — `storage/reviewAggregate.ts`'s stalled/neglected detection**: `buildReviewAggregate` currently defines "stalled" as an Active project with zero tasks that are `!done && !cancelled` (~line 111). Now that flow-state is a real, first-class thing, a project whose only open tasks are all tagged Someday/Maybe arguably has no *actionable* work either — but changing that definition is a Weekly-Review-scope decision (it changes already-shipped, already-decided behavior for that feature), not a Tags-scope one. Not changed by this design; flagged here since the two features now genuinely overlap on this point, worth a short follow-up conversation if you want it addressed.
- **Flagging, not resolving — the four Review steps `feature_weekly_review.md` dropped as "tag-dependent"** (no-clear-next-action, Waiting For, Someday/Maybe, overdue-tasks): those were dropped because tags weren't real yet. They're not automatically back in scope just because this design ships — reinstating any of them into Review's step list is a separate requirements conversation for that feature (new step, new UI, new "what does the step's action set look like" questions), not something this design decides unilaterally. Worth raising with you directly once Tags is live, if you want to revisit that list.
- **`CaptureScreen.tsx` (Lasso capture) is explicitly out of scope for this design** — it still keeps its own separate, unmigrated copy of task-add logic (`ui/DestinationPicker.tsx`'s own doc comment already notes this from the Weekly Review work). It does not gain chips/due-field here. Flagged as a real gap (a task captured via Lasso can't get a flow-state at creation time, only later via edit) and a natural fast-follow, not silently dropped.
- **`Meeting.tags` stays untouched** — this feature is Task-only, per `feature_tags.md`'s decision; the general "group/filter meetings by context" gap design-overview.md §4 already flags is unaffected either way.

## 8. Build order (suggested)

1. `domain/flowState.ts` (§1-2) + `domain/markdown.ts`'s `setDueTag`/`deriveTaskFields` widening + `Task.flowState`/`waitingOn` — pure, unit-testable via the existing Node scripts (extend `verify-markdown.ts`), no device needed.
2. `storage/dailyAggregate.ts`'s exclusion rule (§3) — pure, testable via `verify-aggregate.ts`.
3. `groupTasksByFlowState` (§4) — pure, testable.
4. `ui/FlowStateChips.tsx` + `ui/TaskBadges.tsx` (§5.1-5.2) — presentational; needs an on-device/emulator look once built, but no new logic risk.
5. `ui/TaskQuickAdd.tsx` extended (§5.3) — the highest-leverage step; verify it still behaves correctly in all three existing call sites (Daily, Week-ahead, `ReviewItemCard`) plus fix `ReviewScreen.tsx`'s stale doc comment.
6. `ui/TaskEditCard.tsx` (§5.5) — new; wire into `DailyView.tsx` and `ProjectDataPanel.tsx`'s edit branches.
7. `ProjectDataPanel.tsx`'s `TodosSection`: grouped rendering (§4) + migrate its add-block to `TaskQuickAdd` (§5.4) + badges on rows (§6).
8. `DailyView.tsx` + `ReviewScreen.tsx`: badges on rows (§6) — last, since these are the smallest, lowest-risk additions and depend on everything above already existing.

Front-loads the pure/testable domain-layer work exactly as `technical-design-status-archive.md`'s own build order does, leaves the two flagged open questions (§7) for a follow-up conversation rather than blocking this build on them.
