# Technical Design: Unified Quick-Add Widget

Status: draft, not yet implemented. Requirements clarified in chat 2026-09-08 across four rounds, mockup iterated live as a published Artifact ("Unified Quick-Add" — five click-through states, three live micro-interactions). This design covers merging `ui/TaskQuickAdd.tsx` and `ui/MeetingQuickAdd.tsx` into one widget.

## 1. Goals and motivation

Every screen that lets you add a Todo or a Meeting currently renders **two** independent fixed-slot widgets side by side — `TaskQuickAdd` and `MeetingQuickAdd` — each with its own heading, its own input, its own buttons. In every real call site both widgets already share one `fixedDestination` (confirmed by reading all 9 call sites — see §8), so nothing about *where things get filed* stands in the way of merging them.

Stated reasons for unifying (chat, 2026-09-08):

- **(a) Screen estate.** Two forms' worth of vertical space collapses to one.
- **(b) A clear, consistent spot at the top for text input**, regardless of which type you're adding.
- **(c) No more surprise closes.** Today, editing a Todo and then tapping a Meeting row silently cancels the Todo edit in a different part of the screen. One widget makes that transition visible and contained.
- **(d) Room for more.** A slightly wider date field for meetings, and a reserved spot for a future "refile" action — both easier to add to one widget than to two.

## 2. New component: `ui/QuickAddWidget.tsx`

Replaces `ui/TaskQuickAdd.tsx` and `ui/MeetingQuickAdd.tsx`, both deleted at the end of this work — the same "absorb, don't run two forms in parallel" move `TaskQuickAdd` already made once with `ui/TaskEditCard.tsx`. `ui/FlowStateChips.tsx` is kept and reused inside it (see §4 for its one change).

```ts
interface QuickAddWidgetProps {
  /** Every add/edit goes to this one destination — same contract as today's fixedDestination on both old components. */
  fixedDestination: Destination;
  /** Default false. When true, row 1 still renders both tabs (uniform shape everywhere — chat decision), but Meeting is permanently greyed and non-interactive, and activeType is locked to 'task'. Used by ReviewScreen's week-ahead step and its stalled-project/neglected-area cards — see §8. */
  taskOnly?: boolean;
  /** Meeting create-mode default date (e.g. Daily's Today/Tomorrow toggle). Ignored while editing a meeting. */
  initialDate?: string;

  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;

  /** Mutually exclusive, same invariant every call site already keeps today via its own single edit-target state (see §6). */
  editingTask?: Task;
  editingMeeting?: Meeting;
  onSaveEditTask?: (nextText: string, nextLinkedFile: string) => Promise<void>;
  onSaveEditMeeting?: (fields: MeetingQuickAddFields, nextLinkedFile: string) => Promise<void>;
  onCancelEdit?: () => void;
  onDeleteEdit?: () => void;
  linkedFileMissing?: boolean;

  /** Set by the caller when a row tap was blocked because an edit is already open (§6). Shown centered in row 4; cleared by the caller, not the widget. */
  blockedMessage?: string;

  placeholder?: string; // task input only; defaults to "New task" — see §8's note on dropping the old per-screen `label` prop
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}
```

Dropped from the old API: `label` (row 1's tabs replace the static "Add task"/"Add meeting" heading text, so there's nothing left for a label to say). `placeholder` stays, task-only, and this pass also standardizes it to `"New task"` everywhere — `ProjectDataPanel.tsx`'s current `"New todo"` override goes away as an incidental cleanup (flag if that inconsistency was actually load-bearing for some reason; I don't see one).

## 3. Layout: four fixed rows, same slots in every style

Matches the mockup exactly (five click-through states, three live micro-interactions — chip/waiting-on toggle, date-icon unfold, blocked-tap message).

| Row | Create · Todo | Edit · Todo | Create · Meeting | Edit · Meeting |
|---|---|---|---|---|
| **1 — Tabs** | Todo *on*, Meeting selectable | Todo *on*, Meeting greyed (locked) | Meeting *on*, Todo selectable | Meeting *on*, Todo greyed (locked) |
| **2 — Input** | task text + due-date icon | task text, prefilled + due date (icon or inline — see §5) | title + date, both always visible | title, prefilled + date, prefilled |
| **3 — Metadata** | flow chips (w/f, Maybe, Someday, Next) | flow chips + attachment | time only | time + attachment |
| **4 — Actions** | status (center) · Add (right) | Delete + Refile (left) · blocked-message (center) · Cancel + Save (right) | status (center) · Add (right) | Delete + Refile (left) · blocked-message (center) · Cancel + Save (right) |

`taskOnly` mode renders exactly the Create · Todo column with Meeting permanently greyed in row 1 — there's no separate fifth layout, just the existing Create · Todo styling with the tab locked.

The widget renders at a fixed height regardless of style (short styles like Create · Meeting simply leave more empty space in row 3) — carries forward the row-height-stability principle from `docs/dev/history/technical-design-pagination-edit-reuse.md` §3, applied to the whole widget instead of per-row.

**Placement**: the widget lives at the top of the Meetings column/section only, *above* that column's own "Meetings" label (it isn't Meetings-exclusive — the label now describes only the read-only list beneath it). The Tasks column/section keeps its list but loses its own add-slot entirely.

## 4. `FlowStateChips.tsx`: reorder only

One-line change to the `OPTIONS` array:

```ts
// before: next, waiting-for, someday, maybe
// after:
const OPTIONS: Array<{value: Exclude<FlowState, null>; label: string}> = [
  {value: 'waiting-for', label: 'w/f'},
  {value: 'maybe', label: 'Maybe'},
  {value: 'someday', label: 'Someday'},
  {value: 'next', label: 'Next'},
];
```

No other change to that component — it's still a plain controlled `value`/`onChange`, still toggle-to-clear. Every existing usage picks up the new order for free (only `QuickAddWidget` uses it once `TaskEditCard.tsx` is gone).

## 5. Internal state: two persistent drafts + one edit-fields slot

This is the part that most changes how the old components worked, so it gets its own section.

```ts
interface TaskDraft {
  text: string;
  flowState: FlowState;
  waitingOnText: string;
  dueDate: string;
  /** Whether the due-date field has been unfolded — independent of dueDate's value. Once true, stays true for the life of this draft (chat decision: "no need to hide date field again once shown"). */
  dueDateOpen: boolean;
}
interface MeetingDraft {
  title: string;
  date: string;
  time: string;
}
```

State inside `QuickAddWidget`:

- `activeType: 'task' | 'meeting'` — which tab is showing. Defaults `'task'`. Forced to match `editingTask`/`editingMeeting` while either is set; freely togglable by the user otherwise (unless `taskOnly`).
- `taskDraft: TaskDraft`, `meetingDraft: MeetingDraft` — one each, created once, **never reset by switching `activeType` or by starting/ending an edit.** This is what makes "two drafts at once" and "draft survives an edit detour" work: they're just not touched by anything except their own submit/clear.
- `editFields: (TaskEditFields | MeetingEditFields) | null` — populated by a `useEffect` that watches `editingTask`/`editingMeeting`, *not* by remounting. See the warning below.

**Important departure from the old pattern — no more `key`-remount trick.** `TaskQuickAdd`/`MeetingQuickAdd` today rely on every call site passing `key={editingTaskKey ?? 'add'}` (or similar), so the whole component remounts and re-runs its `useState` initializers whenever the edit target changes. That trick is how `editingTask` "gets into" the form fields today. It cannot survive into this design: remounting the widget on every edit-target change would also wipe `taskDraft`/`meetingDraft`, defeating the entire point of §6/§7 below. `QuickAddWidget` must be a **stable, long-lived instance per screen** — call sites stop passing a changing `key`, and field population moves to a `useEffect([editingTask, editingMeeting])` that seeds `editFields` (and forces `activeType`) when either prop becomes set, and clears `editFields` back to `null` when both become `undefined` again (Cancel/Save/Delete completed). This is the one piece of this design most likely to bite during implementation if missed — worth a deliberate check during the tsc/manual-audit pass, not just a passing mention.

`editFields.dueDateOpen` seeds from `!!editingTask.dueDate` (chat decision: value decides visibility) and, same as the draft version, stays open once tapped even if the value is cleared.

## 6. One edit at a time — the guard lives in the screen, not the widget

The widget only ever renders whichever of `editingTask`/`editingMeeting` it's handed — it has no way to know about the other rows on screen. So "tapping another row while already editing does nothing" has to be enforced where rows get tapped: in each screen's own "start editing this row" handler.

Concretely, every in-scope screen already has (or, per §8, will have) a single lifted edit-target state — `ProjectDataPanel.tsx`/`InboxScreen.tsx` call it `editTarget: EditTarget | null` today (`EditTarget = {type: 'task'|'meeting', index: number}`). The guard is one line at the top of whatever currently does `setEditTarget({type, index})` on a row tap:

```ts
function startEdit(target: EditTarget) {
  if (editTarget !== null) {
    setBlockedNotice(true); // -> QuickAddWidget's blockedMessage="Finish edit!"
    return;
  }
  setEditTarget(target);
}
```

`blockedNotice` is cleared wherever the screen already handles Cancel/Save/Delete completing (it wraps the same callbacks it passes as `onCancelEdit`/`onSaveEditTask`/`onSaveEditMeeting`/`onDeleteEdit` — no new completion path to hook). Text is static ("Finish edit!"), no animation, centered in row 4 between the Delete/Refile cluster and Cancel/Save (chat decision — explicitly not a flash/blink).

## 7. Refile: reserved, not built

Row 4's left cluster in both Edit styles always renders a `Refile` control next to Delete. This pass wires it as visually present but inert — no `onRefile` prop, no picker. `docs/dev/history/technical-design-filing-unification.md` deliberately removed the app's last destination picker (§7 there) and centralized filing into the Inbox tab / Review's arm-based File action; reopening that is out of scope here and gets its own design pass later, informed by whatever this Refile button turns out needing (likely something close to `ui/DestinationPicker.tsx`, still on disk from before that removal).

## 8. Per-screen call site changes

All 9 existing `<TaskQuickAdd`/`<MeetingQuickAdd` usages (grepped 2026-09-08) collapse to 6 `<QuickAddWidget` usages — 3 of them (Review's week-ahead step and every stalled-project/neglected-area card) were already single-type and just need `taskOnly`.

| Screen | Today | Change |
|---|---|---|
| `DailyView.tsx` | Calendar column's `MeetingQuickAdd` (line ~851, under the Meetings sub-tab of its own `MiniTabs`, `fixedDestination=Inbox`) + Open-tasks column's `TaskQuickAdd` (line ~949, `fixedDestination=Inbox`). **Two separate edit states**: `editingTaskKey`/`editingMeetingKey`. | One `QuickAddWidget` in the Calendar column (still gated behind the same Meetings-vs-Google-Calendar `MiniTabs`), above its own "Meetings" heading; Open-tasks column keeps its list, loses its add-slot. **Needs a state merge**: `editingTaskKey`+`editingMeetingKey` → one `editTarget`-shaped state, mirroring `ProjectDataPanel.tsx`'s existing pattern (not currently unified here). |
| `ProjectDataPanel.tsx` | `TodosSection`'s `TaskQuickAdd` (line ~735) + `MeetingsSection`'s `MeetingQuickAdd` (line ~1007), both `fixedDestination={item}`. Already unified: `editTarget`/`armTarget` lifted at the panel level. | One `QuickAddWidget` above the Meetings section's list. Least rework of the four screens — `editTarget` already has the right shape, just needs the guard from §6 added at its one call site. |
| `InboxScreen.tsx` | `TaskQuickAdd` (line ~744) + `MeetingQuickAdd` (line ~813), both `fixedDestination=Inbox`. Already unified: `editTarget`. | Same treatment as `ProjectDataPanel.tsx` — least rework. |
| `ReviewScreen.tsx` — Inbox-to-zero step | `TaskQuickAdd` (line ~1148) + `MeetingQuickAdd` (line ~1205), both `fixedDestination=Inbox`. **Two separate edit states**: `editingInboxTaskIndex`/`editingInboxMeetingIndex`. | One `QuickAddWidget`. **Needs the same state merge as `DailyView.tsx`.** |
| `ReviewScreen.tsx` — week-ahead step | `TaskQuickAdd` (line ~1068), `fixedDestination=Inbox`, add-only (no `editingTask`/key today). | `QuickAddWidget taskOnly`. No edit-state change needed — this step never supported editing before either. |
| `ReviewScreen.tsx` — stalled-project / neglected-area cards | `TaskQuickAdd` (line ~1577, inside the per-card component), `fixedDestination` = that card's own item, add-only. | `QuickAddWidget taskOnly`, one per card, same as today. No edit-state change. |

Everywhere a call site currently passes `key={editingXKey ?? 'add'}` (all six editable sites), **that prop is removed** per §5's warning.

## 9. Explicitly not in this pass

- Refile's actual picker/action (§7) — reserved slot only.
- Any change to `Task`/`Meeting`/`FrontMatter` (`domain/types.ts`) — no new fields needed; `dueDate`/`flowState`/`waitingOn`/`linkedFile` (Task) and `date`/`time`/`linkedFile` (Meeting) already cover everything both styles show.
- `ui/DestinationPicker.tsx` stays untouched and unused (kept on disk per `technical-design-filing-unification.md` §7 in case Refile ends up needing it later).
- Google Calendar's own add flow (`ui/GoogleCalendarPanel.tsx`) — separate component, not one of the two being merged.

## 10. Rough sequencing / effort shape

1. `ui/QuickAddWidget.tsx` itself: four-row layout, two-draft state, edit-fields effect (§5), `FlowStateChips` reorder (§4). Buildable and visually checkable in isolation before touching any screen.
2. `ProjectDataPanel.tsx` and `InboxScreen.tsx` first — already-unified `editTarget`, so this is close to a like-for-like swap plus the §6 guard. Good place to catch integration issues cheaply.
3. `DailyView.tsx` and `ReviewScreen.tsx`'s Inbox-to-zero step — same swap, plus the `editingTaskKey`/`editingMeetingKey` → `editTarget` state merge in both.
4. `ReviewScreen.tsx`'s week-ahead step and stalled/neglected cards — `taskOnly`, smallest of the six.
5. Delete `ui/TaskQuickAdd.tsx`, `ui/MeetingQuickAdd.tsx`, and confirm `ui/TaskEditCard.tsx` (already dead per `feature_list_pagination_edit_reuse.md`) has no new reason to survive.
6. `tsc --noEmit` + eslint pass, then on-device smoke test covering: add/edit both types on a two-column screen (Inbox) and a single-column one (`ProjectDataPanel`), the blocked-tap message, tab-switch draft persistence, and the `taskOnly` cards in Review.

Comparable in size to the linked-files pass — expect it to span more than one implementation session; §8's per-screen breakdown is a reasonable session-by-session split.
