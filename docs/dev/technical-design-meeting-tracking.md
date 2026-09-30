# Technical design: Meeting prep/review tracking

Status: implemented 2026-09-20 in two rounds - round 1 (domain, Settings, Daily row, Review step) and round 2 (uniform meeting display: tracking wired into every screen that lists meetings through the shared `MeetingRow`). All committed and byte-verified; **not yet device-tested** - see §9. Requirements were clarified in chat first (Tilman, 2026-09-19/20); this doc records the resulting design and what was built.

## 1. Problem

Meetings almost always carry two standing to-dos - *prepare it* before, *review and follow up on it* after - and writing them as real todos floods the todo list, while a heavier per-meeting workflow makes meetings complicated. The plugin needs a way to track those two checkpoints with the least new machinery.

## 2. Decisions (all made in the requirements chat)

- **Tracking is a per-Tag-Rule setting for the Meeting context**: "Prepare before" and "Review after", both default off. There is no separate mechanism: a Tag Rule (formerly "note template", `NoteCreationDefinition`) already is "per tag, for a context, do X automatically" - tracking is one more X.
- **One resolved rule per meeting.** The existing `resolveNoteTemplate` (first enabled tag match in list order, else the context default, else none; case-insensitive) supplies both the note layout and the tracking flags. No union of several rules, no "create note from this rule" switch: a rule that tracks but has no template is not a supported case - if a meeting should track, its rule also defines the note.
- **State is a bare tag on the meeting line**: `#prepped` / `#reviewed`, no dates. Same mechanism as `#now` on tasks; the meeting text stays the single source of truth, tags are a derived read.
- **The phase follows the clock, not a flag.** Before the meeting is over the relevant checkpoint is *prep*; after it, *review*. "Over" is `meetingAutoUpdateCutoffMs` (start + 1 h, end of day for a date-only meeting) - deliberately the instant that already freezes the meeting's note, so the app has one notion of "the meeting is over". Cancelled meetings are never tracked.
- **Daily row**: one icon just before the 📓 note icon - `P` (prep open), `R` (review open) or a check (the current tracked phase is done); nothing when the current phase isn't tracked. Tapping toggles. Daily's visibility window is unchanged.
- **Weekly Review** gets a "Meetings to close out" step: past meetings, review tracked, not `#reviewed`, within the last 14 days.
- **UI label**: the Settings "Templates" tab is now "Tag Rules". A label change only; the type and storage names are unchanged (see §8).

## 3. Architecture and reuse

Everything decision-bearing lives in one pure module, `domain/meetingTracking.ts` (zero RN imports, standalone-testable). Every consumer calls the same functions, so the Daily icon, the Review list and the Settings summary cannot disagree:

| Function | Consumers |
|---|---|
| `resolveMeetingTracking(meeting, definitions, now)` -> `{kind: 'prep'\|'review', done} \| null` | `ui/MeetingRow.tsx` (icon and sizing - the only UI consumer of the resolver besides the Review detail panel), `isReviewOutstanding` |
| `isReviewOutstanding(meeting, definitions, now)` | `storage/reviewAggregate.ts` (`meetingsToClose`) |
| `toggleMeetingTracking(meeting, kind)` / `toggleMeetingTrackingAt(meetings, index, kind)` | `...At` is the one-line body of every screen's toggle handler; the single-meeting form backs Review's "Mark reviewed" |
| `meetingDisplayTitle(meeting)` | every place a meeting title is *shown* (rows, note title piece and file name, Review lists) - state tags never leak into titles |
| `trackingSummary(rule)` | Tag Rules list meta ("prep + review") |
| `REVIEW_LOOKBACK_DAYS = 14` | aggregate + Review empty-state copy |

Generic bare-tag helpers were added to `domain/flowState.ts` rather than a second copy of the `#now` code: `hasBareTag`, `setBareTag`, `stripBareTags`, and one `RESERVED_BARE_TAGS` list (`next`, `someday`, `maybe`, `now`, `prepped`, `reviewed`) that `isContextTag` consumes - a new bare tag can no longer be added to the helpers and forgotten in the context-tag exclusion (which would make it appear as a filter tag/suggestion chip). `deriveNow`/`setNowTag` became thin wrappers, call sites unchanged. The tag regex has a trailing lookahead so `#now` does not match `#nowhere`/`#now-x`/`#now:x` (regression-tested).

## 4. Data model

`NoteCreationDefinition` gains optional `trackPrep?` / `trackReview?` (absent = false, so existing saved rules load unchanged; `createEmptyDefinition` sets both false). The flags are only meaningful when `context === 'meeting'`; switching a rule's context in Settings clears them. No settings migration.

## 5. Surfaces

**Settings -> Tag Rules.** Two check toggles under a meeting rule ("Prepare before", "Review after"); list rows show `trackingSummary`. Shared `CheckToggle` component.

**Meeting row - one shared implementation** (`ui/MeetingRow.tsx`, `ui/icons.tsx`'s `TrackingBoxIcon`: stroke-only rect with a P / R / check path - no emoji, per the e-ink rendering rules). Tracking is owned by the row, not by the screens:

- A screen builds one `MeetingTrackingConfig = {rules, onToggle(kind)}` per meeting (`rules` = `settings.noteCreationDefinitions`, `onToggle` = its persist step) and passes that **same object** to the row's `tracking` prop and to the sizing helpers. The row resolves the phase and icon state itself (`resolveMeetingTracking`); the sizing helpers ask the same predicate (`isTracked`) whether the icon's width (`TRACKING_ICON_ALLOWANCE_PX`, 36) narrows the title. There is no separate `tracked` flag to keep in sync any more - that contract, which round 1 left in DailyView, is gone.
- `meetingRowSizing(meeting, columnWidthPx, tracking)` returns `{height, numberOfLines}` - the pair a PagedSection caller must pass together. Use `.height` as `rowHeight` and spread the result onto the row. (`meetingEntryHeight`/`meetingRowLines` still exist underneath; their third parameter is now the config, not a boolean.)
- A screen's toggle handler is a single line through its existing meetings mutator: `meetings => toggleMeetingTrackingAt(meetings, index, kind)`, followed by `requestEinkRefresh()` (a direct tap changing a small icon is exactly the repaint that doesn't reliably reach the panel on its own). The mutators differ per screen because the screens hold their data differently (entry re-fetch in Daily/Week, `withMeetings` in Project/Area, `saveInboxMeetings` in Inbox, local Inbox state in Review) - unifying those save paths is the existing duplicated-screen-logic debt, not part of this feature.

Wired into: Daily (Today/Tomorrow), Week (compact rows - single line, fixed height, so only the title truncates slightly earlier), Project/Area meetings list, Inbox meetings, Review's Inbox-to-zero meetings. Deliberately **not** tracked: Review's read-only "All meetings" list in the Done/On-Hold detail (a look-then-decide panel over items that are done or paused; those rows pass no `tracking`), and Google Calendar event rows (external events, not meetings in the files). `#prepped`/`#reviewed` are hidden in every `MeetingRow` title via `meetingDisplayTitle` regardless.

**Review step "Meetings to close out"** (step 3 of 10, after Week ahead). `buildReviewAggregate(items, now, definitions)` fills `meetingsToClose` (most recent first). The screen is a `ReviewMasterDetail` like the item-based steps: frozen membership per visit, `closeOutActedOn` checkmarks (a ticked meeting stays listed and can be un-ticked), reset via `stepEntryToken`. Left row: title over "date time · Project". Detail: title, date and item (tap opens the item), **Mark reviewed** (toggle), **Open note** (when the meeting has one), a task-only `QuickAddWidget` fixed to the meeting's Project/Area for follow-up todos, and "Related open todos" (`relatedItemsFor` on the meeting's context tags, capped at 5 with "+N more" since a detail column can't scroll). Write-through is `saveMeetings` + `updateItemMeetings` + `refreshFromCache` + `requestEinkRefresh`.

## 6. Scope notes

The app has no recurring meetings - one line is one meeting - so per-line state is exactly per-meeting state (`Meeting.recurrence`/`occurrences` exist in the type but are unused).

Meetings still sitting in the **Inbox** are not part of Review's "Meetings to close out": the aggregate walks filed Projects/Areas only, and Inbox-to-zero (the next step) files them, after which they qualify. They do show and toggle the icon on the Inbox tab, in Daily and in Inbox-to-zero like any other meeting.

## 7. Uniformity check

Every `<MeetingRow` call site and its tracking status: Daily (tracked), WeekView (tracked), ProjectDataPanel (tracked), InboxScreen (tracked), ReviewScreen Inbox-to-zero (tracked), ReviewScreen Done/On-Hold "All meetings" (intentionally read-only, untracked). A new screen that lists meetings gets tracking by passing `tracking` + `meetingRowSizing` - nothing else to copy.

## 8. Technical debt recorded

- Rename `NoteCreationDefinition` -> `TagRule` (types, settings field `noteCreationDefinitions`, docs) - deferred to avoid a settings-storage migration in this change.
- `ReviewScreen.tsx` repeats the same per-step trio (snapshot state, acted-on set, freeze in effect + `goToStep` + reload reset) six times now; a `useFrozenStepList` hook would remove ~40 lines of bookkeeping per step.
- Pre-existing `tsc` errors untouched: CaptureScreen/googleCalendarCopy/GoogleCalendarPanel `linkedFile`, `hitSlop` on `Text`, and ReviewScreen's Week-ahead/Inbox-to-zero read-only rows missing required props.

## 9. Verification

- Type check against the pre-change baseline: no new errors.
- Standalone tests (`tsx`): `meetingRowSizing` (line count and height change only for a tracked row: matching rule + current phase tracked + not cancelled; empty rules equal no config; the height/lines pair is consistent, run against the real `ui/MeetingRow.tsx` with the RN modules stubbed) plus 69 checks for bare-tag helpers (incl. `#now` regression and `isContextTag`), phase boundaries, first-match-wins resolution, 14-day lookback, toggle round trip, display title, `trackingSummary`; plus aggregate checks for `meetingsToClose` (membership, most-recent-first, index preserved, no rules -> empty).
- Every committed file re-staged from the device and md5-compared.

**On-device checklist (not yet done):**

1. Settings -> Tag Rules: a meeting rule shows the two toggles; a non-meeting rule doesn't; the list meta reads "prep", "review" or "prep + review".
2. A meeting tagged for a tracking rule shows `P` before its end and `R` after; tap toggles to the check and back; the row height/wrapping stays right for a long title.
3. A meeting with no matching rule, or whose rule doesn't track the current phase, shows no icon; a cancelled meeting never shows one.
4. The note title/file name of a `#prepped`/`#reviewed` meeting contains no state tag.
5. Weekly Review step 3 lists only past, tracked, un-reviewed meetings (<= 14 days); Mark reviewed checkmarks the row and it stays listed; the Daily icon becomes a check.
6. Open note and the follow-up quick-add work from the detail panel; the panel doesn't overflow at 5 related todos.
7. Uniform display: the same P/R/check icon appears and toggles in Week view (compact rows), a Project's and an Area's meetings list, the Inbox tab and Review's Inbox-to-zero; a tracked meeting with a title that wraps to two lines in the wide lists keeps its row height (no clipping); Review's Done/On-Hold "All meetings" shows no icon.
