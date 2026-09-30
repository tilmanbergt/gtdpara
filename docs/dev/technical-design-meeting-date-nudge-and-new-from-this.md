# Technical design - Shared DateInput with nudge buttons + "New from this" (2026-09-20, rev. 3)

Status: **IMPLEMENTED and committed to device 2026-09-20 - not yet device-tested** (see "As built" at the end). Requirements clarified in chat 2026-09-20 (rev. 2: Week view needs the Project/Area tag; date buttons on the Todo due date too, as a shared component. rev. 3: centre note is `Copied "<title, 16 chars…>" - adjust, then Add`; Capture/Review adoption confirmed; name "New from this" confirmed).

Touches:
- `src/domain/dateNudge.ts` (new, pure)
- `src/ui/DateInput.tsx` (new, shared date field + nudge strip)
- `src/ui/QuickAddWidget.tsx` (uses DateInput for Meeting date + Todo due date; "New from this")
- `src/screens/WeekView.tsx` (**one new prop**: `editingItemPath`)
- `screens/CaptureScreen.tsx`, `screens/ReviewScreen.tsx` adopt DateInput (the only two other date fields in the app; own commit step)

Read alongside: `technical-design-unified-quickadd.md` (widget rows/drafts), `technical-design-abbrev-quick-file.md` (the `#ABBR` tag mechanism reused in B), and the clipboard-overlay notes in `QuickAddWidget.tsx` / `ClipboardTextInput.tsx` (pattern reused in A).

**Correction to rev. 1:** rev. 1 said "no screen changes". That was wrong - `WeekView.tsx` is a fifth call site of `QuickAddWidget` (the others: ProjectDataPanel, InboxScreen, DailyView, ReviewScreen) and it was missed. It edits meetings from every file but does not pass `editingItemPath`. See B / "Call sites".

---

## A. Shared `DateInput` with nudge buttons

### Requirement
While a date field has focus, a small button strip appears above it (same look and mechanics as the Select All/Copy/Cut/Paste strip): **-1 · Today · +1 · +7**.

| Button | Field holds a valid date D | Field empty / not a valid date |
|---|---|---|
| Today | today | today |
| -1 | D - 1 day | yesterday |
| +1 | D + 1 day | tomorrow |
| +7 | D + 7 days | today + 7 (= same weekday next week) |

The rules collapse into one: **base = D if D is a real YYYY-MM-DD date, else today; result = base + delta** (Today ignores the base). "Invalid" includes half-typed text ("2026-09-") and impossible dates ("2026-02-31") - a button replaces it. Accepted: nobody types half a date and then nudges.

### Where it applies
Built once as `ui/DateInput.tsx`, used by:
1. QuickAddWidget - **Meeting date** (Row 2).
2. QuickAddWidget - **Todo due date** (Row 2, the field the 📅 icon unfolds).
3. CaptureScreen's meeting date field and ReviewScreen's "Set due date" field - the only other date inputs in the app (grep of `YYYY-MM-DD` placeholders). **Confirmed in scope (Tilman, 2026-09-20).** Same semantics apply. In ReviewScreen the strip will hover over the action-pill row above the field while it's focused - acceptable (only while focused), check on device. Committed as its own step so it can be reverted independently.

### Pure logic - `domain/dateNudge.ts` (new; imports `todayIso`/`MEETING_DATE_RE` from `meetingTime.ts`)
```ts
export type DateNudge = 'minus1' | 'today' | 'plus1' | 'plus7';
export const DATE_NUDGES: {kind: DateNudge; label: string}[];      // order + labels: '-1', 'Today', '+1', '+7'
export function isValidIsoDate(s: string): boolean;                  // MEETING_DATE_RE + round-trip through new Date(y, m-1, d)
export function addDaysToIso(iso: string, days: number): string;    // calendar-field arithmetic, DST-safe (same technique as isoDateOffset)
export function nudgeIsoDate(current: string, nudge: DateNudge, now?: Date): string;
```
`nudgeIsoDate`: `today` -> `todayIso(now)`; else `base = isValidIsoDate(current.trim()) ? current.trim() : todayIso(now)`, then `addDaysToIso(base, {minus1:-1, plus1:1, plus7:7}[nudge])`. Zero RN imports, `now` injectable (domain/ convention) -> unit-testable.

### Component - `ui/DateInput.tsx`
```ts
interface Props {
  value: string;
  onChangeText: (next: string) => void;     // called for typing AND for nudges - parent's existing setter, so it keeps clearing "just added"/notes etc.
  placeholder?: string;
  placeholderColor: string; textColor: string; borderColor: string;
  onSubmitEditing?: () => void;
  editable?: boolean;                        // default true
  containerStyle?: StyleProp<ViewStyle>;     // layout (flex/width/margins) of the wrapper
  inputStyle?: StyleProp<TextStyle>;         // default = today's QuickAddWidget `dueInput`: FONT.small, width 140
}
// forwardRef -> { focus(): void }
```
- Renders `<View style={[{position:'relative'}, containerStyle]}>` containing the `TextInput` (owns its `focused` state via `onFocus`/`onBlur`) and the strip.
- Strip: absolute, `right: 0`, `bottom: '100%'`, `marginBottom: 3` - flush above the field, zero layout cost. Styles copied from QuickAddWidget's `clipboardOverlay`/`clipboardButton` (white bg, 1px border, radius 4, small padding, `zIndex 20`, `elevation 4`); the small duplication is deliberate - the clipboard code is fresh off a device-verified bugfix and stays untouched (note in technical_debt: unify the two strip styles later).
- **Always mounted, `display:none` unless focused** (`!focused && styles.hidden`) - identical reasoning to the clipboard strip (blur fires on touch-down; unmounting the strip would eat the tap).
- Each button: `onChangeText(nudgeIsoDate(value, kind))`; `hitSlop={6}`; ASCII labels.
- **Risk to verify on device:** the strip sits outside its wrapper's bounds; RN-Android hit-testing of children outside a parent's bounds has historically been unreliable. The existing clipboard strip uses the same geometry (outside `row2`) and works, so this should too - first thing to tap-test.
- Todo due field is 140 wide and the strip ~150 wide, right-aligned -> it overhangs slightly to the left; harmless.

### QuickAddWidget changes for A
- Meeting Row 2: the bare date `TextInput` -> `<DateInput value={meetingFields.date} onChangeText={setMeetingDate} placeholder="YYYY-MM-DD" ... />`.
- Todo Row 2: the due `TextInput` inside `dateInline` -> `<DateInput ref={dueInputRef} value={taskFields.dueDate} onChangeText={setTaskDueDate} placeholder="Due YYYY-MM-DD" ... />`; the ✕ clear button stays where it is, beside it.
- **Unfold focuses the field**: tapping 📅 (`openTaskDueDate`) unfolds the field and, via a small effect after commit (same pattern as the existing `hasEditFields` focus effect), calls `dueInputRef.current?.focus()` - so the strip is there immediately instead of needing a second tap. Only on the user's tap, *not* when an edit starts with an existing due date (that must keep focusing the text field). Easy to drop if focusing pops the handwriting box unexpectedly.
- `styles.dueInput` moves into DateInput (default `inputStyle`); nothing else in the widget references it.

### E-ink
Strip appears/disappears with focus only; a press changes one text field. No list re-layout, no scrolling. Same refresh profile as the clipboard strip.

---

## B. "New from this" (edit-mode button, Meetings)

### Name
**"New from this"** (recommended - still to be confirmed). Rejected: "Duplicate" (it isn't one), "Copy…" (collides with the clipboard **Copy** button in this widget), anything with "template" (collides with Note Templates), "Repeat" (implies recurrence).

### Behaviour
In Meeting **edit** mode Row 4 becomes: `[Delete] [New from this] [Refile | File: <Name>]  ·  centre note  ·  Cancel  Save`. Pressing it:

1. **Cancels the edit** via the screen's existing `onCancelEdit()` -> row highlight disappears; nothing is saved; the original is untouched.
2. **Switches the widget to Create mode on the Meeting tab** (`setActiveType('meeting')`; `editFields` clears through the existing `wasEditingRef` transition effect).
3. **Pre-fills the Meeting draft** from the *current form values* (unsaved tweaks carry over): title, date, time.
4. **Shows a short note** in Row 4's centre (create mode's centre slot is empty apart from the "Added" message, so there's room): `Copied "<title, 16 chars…>" - adjust, then Add` (title = the original's display title, i.e. without `#prepped`/`#reviewed` and without the auto-inserted Project/Area tag; cut to 16 characters + "…" via the existing `truncateItemName(name, 16)`). Cleared on the first edit of title/date/time (the existing `clearMeetingJustAdded` path), on Add, and replaced by the normal "✓ Added …" message after a successful Add.

### What is / isn't carried over
| Field | Carried? | Why |
|---|---|---|
| title incl. context `#tags` | yes | same Tag Rules -> same note template / prep-review tracking |
| `#prepped` / `#reviewed` | **stripped** (`meetingDisplayTitle`) | tick-state stored as bare tags in the title (meetingTracking.ts); a copy starts un-ticked |
| date, time | yes | copy -> `+7` -> Add |
| linked file, note path | no | belong to the original; new meeting goes through normal `onAddMeeting` -> `notePath: ''`, `linkedFile: ''` |
| recurrence / occurrences / cancelled | no | not editable here; plain one-off |

### Destination: "same file as the original", made visible as a tag
The create target is normally `fixedDestination`. That already equals the original's file on the Project/Area "Current" tab, the Inbox tab and Review's Inbox-to-zero. **On Daily and Week it does not** - both use `fixedDestination = Inbox` while the edited meeting may live in any Project/Area.

Solution, reusing the existing abbreviation quick-file machinery: when the original lives elsewhere than the create target, **insert that Project/Area's abbreviation tag into the draft title** (e.g. `Weekly sync #AT`). Already implemented by feature_abbrev_quick_file, so:
- `resolveAbbrevFileTarget` matches it -> Row 4 button reads **"+ Add to <Name>"**; `submitMeetingCreate` sends the meeting there;
- TagChips shows it upper-cased/pinned as a recognized tag;
- `submitMeetingCreate` strips the tag before saving ("removed again once filed" - nothing new to build);
- deleting the tag (chip tap or text) overrides -> falls back to `fixedDestination` (Inbox).

Insert **only if**: original path known (`editingItemPath !== undefined ? editingItemPath : fixedExcludePath`) and differs from `fixedExcludePath`; an item with that path exists in `getCachedData()` with a non-null `abbrev`; its status is Active/On Hold (same eligibility `resolveAbbrevFileTarget` applies - otherwise the tag would just sit there as noise); and the title doesn't already contain a recognized abbreviation tag (an explicit tag the user typed wins). Otherwise nothing is inserted and the copy is created at `fixedDestination`, exactly like today's create mode. Appended with `insertTagAtPosition(title, item.abbrev, null)` (stored casing).

### Call sites (all five checked)
| Screen | Meeting edit mode? | `editingItemPath` passed? | Tag inserted? |
|---|---|---|---|
| ProjectDataPanel (Current tab) | yes | no - not needed, `fixedDestination` = the item itself | never |
| InboxScreen | yes | no - originals are always Inbox | never |
| ReviewScreen Inbox-to-zero | yes | no - originals are always Inbox | never |
| **DailyView** | yes | **yes** (real path, `null` for Inbox) | yes, when original is in an eligible Project/Area |
| **WeekView** | yes | **no -> add it** | yes, same rule |
| ReviewScreen bare cards (`taskOnly`) | no | - | - |

**WeekView change (only screen edit):** pass `editingItemPath={editingMeetingEntry && editingMeetingEntry.item.kind !== 'inbox' ? editingMeetingEntry.item.path : null}` - same expression DailyView already uses (`WeeklyMeetingEntry.item` is the same `DailyItemRef`). WeekView's `handleAddMeeting` already supports `destination.type === 'item'`, so the create side needs nothing. Side effect of passing the prop: in edit mode the abbreviation self-exclusion now uses the meeting's real file (correct; WeekView has no `onQuickFile`/`onRefile`, so nothing else changes).

### Draft conflict
The Meeting create draft is a single slot. "New from this" **replaces** it, including an unsent title. The note is the single `Copied "…" - adjust, then Add` form (no separate "replaced your unsent draft" variant). (Alternative if this ever stings: refuse while the draft has a title.)

### Code shape - `QuickAddWidget.tsx`
```ts
const [meetingCopyNote, setMeetingCopyNote] = useState<string | null>(null);

const handleNewFromThis = () => {
  if (editFields?.kind !== 'meeting' || !onCancelEdit) return;
  Keyboard.dismiss();
  const f = editFields.fields;
  let title = meetingDisplayTitle({title: f.title});               // strip #prepped/#reviewed
  const originPath = editingItemPath !== undefined ? editingItemPath : fixedExcludePath;
  const origin = originPath && originPath !== fixedExcludePath
    ? cachedAbbrevItems.find(i => i.path === originPath) : undefined;
  if (origin?.abbrev && (origin.status === 'active' || origin.status === 'on-hold')
      && !resolveAbbrevFileTarget(title, cachedAbbrevItems, fixedExcludePath)) {
    title = insertTagAtPosition(title, origin.abbrev, null).text;
  }
  setMeetingDraft({title, date: f.date, time: f.time});
  meetingLastSelectionRef.current = null;
  setMeetingTagPage(0);
  setMeetingJustAdded(null);
  setMeetingCopyNote(`Copied "${truncateItemName(meetingDisplayTitle(f), 16)}" - adjust, then Add`);
  setError(null);
  setActiveType('meeting');
  onCancelEdit();                                                  // screen clears its edit target -> highlight off
};
```
- `clearMeetingJustAdded` also `setMeetingCopyNote(null)`; `submitMeetingCreate`'s `.then` does too. `statusText` for the meeting type: `meetingCopyNote ?? (meetingJustAdded ? '✓ Added "…"' : null)` (the "✓ Added" formatting moves from the shared `centerText` line into the per-type status, since the copy note is a complete string).
- Row 4: Meeting-edit-only ghost button between Delete and the Refile/File slot, `numberOfLines={1}`, `disabled={pending}`.
- One event handler -> one batched render; the draft is set *before* the edit ends, so no frame shows an empty draft.

---

## Edge cases
- **Row 4 width.** Widest case: Delete + New from this + "File: <14 chars…>" + Cancel + Save; the centre text is `flex:1` and shrinks first. Verify on Daily/Week (narrower columns); fallback: hide the third button while a `File:` button shows, or make it icon-only.
- **Daily/Week visibility.** A copy nudged outside the shown day/week is created correctly but won't be listed there - the "✓ Added" note is the confirmation (existing behaviour for any out-of-range add).
- **Copy pressed while `pending`** - button disabled.
- **Blocked message** ("Finish edit!") is cleared by each screen's own cancel.
- **DateInput inside a `display:none` row** (Meeting row2 hidden while Todo tab active): its focused state can't be true then; strip stays hidden.

## Deliberately out of scope
- "New from this" for **Todos**.
- Nudge buttons for the **time** field.

## Verification plan
1. Scratch unit script for `nudgeIsoDate`/`addDaysToIso`: empty, garbage, "2026-02-31", 2026-12-31 +1, 2028-02-28 +1 (leap), DST weekends (2026-03-29, 2026-10-25) +1/+7, -1 on the 1st of a month.
2. Scratch `tsc --noEmit` (existing recipe), strict + `noUnusedLocals`; diff against the known 16 pre-existing errors -> zero new.
3. Existing Jest smoke-render harness still mounts `<App />`.
4. On-device checklist for Tilman: strip appears only while the date field is focused and is tappable; each button incl. empty-field cases, for Meeting date and Todo due; 📅 unfold focuses the field; New from this on Project tab / Inbox tab / Daily / **Week** (Project meeting -> "+ Add to <Name>" + visible tag; Inbox meeting -> plain "+ Add"); row highlight clears; note reads `Copied "<title 16…>" - adjust, then Add`; `#prepped` not copied; Capture + Review date fields show the strip; Add files to the right place and strips the tag; Row 4 not cramped.
5. After each commit: re-stage twice + md5 (standing rule; ReviewScreen.tsx has the revert history).

## Sequencing
1. `domain/dateNudge.ts` + scratch tests. 2. `ui/DateInput.tsx`. 3. QuickAddWidget: DateInput swaps (Meeting date, Todo due) + unfold-focus. 4. QuickAddWidget: "New from this" + status refactor; WeekView `editingItemPath`. 5. Verification 1-3, commit, re-stage/md5. 6. CaptureScreen + ReviewScreen adopt DateInput (separate commit). 7. `design-overview.md` (§2 as-built, §5 decisions), `technical_debt` note (two strip style copies).

---

## As built (2026-09-20)

Files (all committed to device, byte-verified by re-stage + md5):
- new `src/domain/dateNudge.ts`, new `src/ui/DateInput.tsx`
- `src/ui/QuickAddWidget.tsx` - Meeting date + Todo due via `DateInput`; 📅 unfold focuses the due field (`dueInputRef` + `dueFocusRequested` effect); `handleNewFromThis`, `meetingCopyNote`, Row 4 button (Meeting edit only, between Delete and Refile/File); `createStatusMessage` refactor; unused `styles.dueInput` removed; module doc comment extended.
- `src/screens/WeekView.tsx` - `editingItemPath` prop (only screen change for B).
- `src/screens/CaptureScreen.tsx`, `src/screens/ReviewScreen.tsx` - date field -> `DateInput` (Capture: `width={130}` + new `meetingDateWrap` style for the 6px gap; Review: `width={120}` - was `minWidth: 120` - plus `dueDateWrap` (margins) and a slimmed `dueDateInput` (pill corners/padding only); ReviewScreen's now-unused `TextInput` import removed).

Deviations from the design text above:
- `DateInput` takes a `width` prop (default 140) in addition to `containerStyle`/`inputStyle` - Capture (130) and Review (120) needed different widths without fighting the wrapper's margins.
- Review's field is now a fixed 120px instead of `minWidth: 120` (content-sized above that); immaterial for a 10-character date.

Verification done:
- `nudgeIsoDate`/`addDaysToIso`/`isValidIsoDate`: 26 checks (empty, garbage, half-typed, impossible date, month/year rollover, leap day, DST weekends both directions), all pass in Europe/Berlin, America/New_York, UTC, Pacific/Auckland.
- Scratch `tsc --noEmit` (TS 7.0.2, strict) over the whole `src/` + `App.tsx` with stubbed native modules: 17 pre-existing errors before, the same 17 after - **zero new**; same result with `noUnusedLocals`/`noUnusedParameters` (after removing the one import this change orphaned).
- Scratch Jest + react-test-renderer run against the real `QuickAddWidget`/`DateInput` (native modules mocked): 9/9 - button only in Meeting edit mode; title/date/time copied; `#prepped` stripped; origin tag appended only when it can resolve (Daily/Week-shaped call: yes; Project screen: no; Inbox original: no; Done or abbreviation-less origin: no; title already carrying a recognized tag: no); "+ Add to <Name>" appears and Add files to the origin with the tag stripped; note text incl. 16-char cut + "…"; note cleared by the first edit; strip hidden until focus and back on blur; every nudge button incl. empty-field cases through both the Meeting date and the Todo due fields. Tests are throwaway (not committed), as with earlier scratch harnesses.

Not verified (needs the device): strip tappability (outside-parent-bounds hit testing), Row 4 width on Daily/Week with a `File: <Name>` button, whether the 📅-focus opens the handwriting box unexpectedly, e-ink refresh of the strip/note, ReviewScreen's strip overlapping the pill row above the field, and the copy actually landing in the right file via Week/Daily (the widget side is tested; the screens' existing `handleAddMeeting` destination branches were read, not run).

Follow-ups: unify the two floating-strip style copies (clipboard strip in QuickAddWidget/ClipboardTextInput, nudge strip in DateInput); optional "New from this" for Todos.

---

## Follow-up fixes (2026-09-21, from on-device use)

- **WeekView now has the abbreviation quick-file in meeting edit mode.** The "WeekView has no `onQuickFile`/`onRefile`, so nothing else changes" statement in the call-site section above no longer holds for `onQuickFile`: `WeekView.tsx` passes `onQuickFile` (meeting-only `handleQuickFileEdit`, the twin of Daily's: `appendMeetingToTarget` then `saveEntryMeetings` removal, edit closes on success). Still no `onRefile` (no Files pane on this screen). Typing `#ABBR` into the title of a meeting being edited on Week shows "File: <Name>" exactly as on Daily; a tag naming the meeting's own file shows nothing (self-exclusion via `editingItemPath`).
- **Delete is a trash icon** (`TrashIcon` in `ui/icons.tsx`) in Row 4's edit style, leftmost, `hitSlop` 4 (the text buttons keep 8) - frees ~40px so Delete + New from this + File: <Name> + Cancel + Save fit with room to spare. Behaviour unchanged (one tap, marks the meeting cancelled).
- **Known limitation, unchanged by this fix:** a meeting that already has a linked note keeps its *relative* `notePath` when filed into another Project/Area (Daily, Week, and every Refile path), so the note link then resolves against the new folder and no longer finds the file. Not handled anywhere yet.
