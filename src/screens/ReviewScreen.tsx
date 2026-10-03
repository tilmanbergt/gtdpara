/**
 * Weekly Review (design-overview.md, feature added 2026-09-02; hub rework
 * 2026-09-20, docs/dev/technical-design-review-hub.md): a hub page plus nine
 * steps - Week ahead, Meetings to close out, Inbox to zero, Stalled
 * projects, Done awaiting review, On Hold reconsideration, Neglected areas,
 * Unfocused next items, Focus reset (weekly + monthly) - built to keep integrity around
 * Projects/Areas/Meetings/Tasks by walking through every place things
 * quietly go stale, one step at a time, with cleanup actions right there on
 * the spot rather than a report to act on later. Task tags (technical-
 * design-tags.md, 2026-09-02) reach this screen two ways: every
 * ui/QuickAddWidget.tsx add here composes them in exactly as
 * DailyView.tsx's does (shared component, see the reuse note below), and
 * storage/reviewAggregate.ts's stalled/neglected check discounts
 * Someday/Maybe tasks when deciding an item has no open work - those
 * excluded tasks are surfaced right on the card (ReviewItemCard's
 * shelvedTasks) with a one-tap "→ Next" promotion, rather than just
 * silently ignored. The other tag-dependent Review ideas from that design
 * doc (e.g. reinstating steps for Waiting For follow-up) remain out of
 * scope for now.
 *
 * Meetings to close out (docs/dev/technical-design-meeting-tracking.md): past
 * meetings whose Tag Rule tracks "review after" and that aren't `#reviewed`
 * yet - a ReviewMasterDetail step like the item-based ones below (frozen
 * membership, acted-on checkmark, write-through via saveMeetings +
 * updateItemMeetings). The membership rule and the tick itself live in
 * domain/meetingTracking.ts, shared with the Daily row icon.
 *
 * Unfocused next items (2026-09-10, docs/dev/technical-design-daily-todo-
 * filter.md; widened 2026-09-16, Tilman feedback): once storage/
 * dailyAggregate.ts's own rule narrowed so a #next task only shows on Daily
 * when its Project/Area is in daily OR weekly focus, a #next task in a
 * completely unfocused item goes quiet everywhere with nothing pointing at
 * it. This step is that pointer - every Active Project/Area with an open
 * #next task but no daily AND no weekly focus slot gets a card here
 * (storage/reviewAggregate.ts's unfocusedNextItems), with per-task Someday/
 * Maybe/Done/Cancel/Set-due-date actions and a whole-item "Add to Daily/
 * Weekly focus" action. Same frozen-snapshot-per-step-visit pattern as
 * Stalled projects/Neglected areas below - see that section's own doc
 * comment.
 *
 * Hub (2026-09-20, docs/dev/technical-design-review-hub.md): the tab opens on a
 * page listing every step with how much is waiting in it and when it was
 * last reviewed (ui/ReviewHub.tsx), so one step can be done directly
 * without paging through the others. Inside a step, "Skip ›" and "Reviewed
 * ›" both go to the next step (after the last one: an end page with the
 * recap); only Reviewed stamps the step's review date. "Overview" and
 * "‹ Back" also leave the step, with Skip semantics. There is no "Finish
 * review" any more: what is persisted is one record per step
 * (settings.reviewSteps, domain/reviewSteps.ts) - its last-reviewed date and
 * the recap counts of its last recorded visit - and the "last review" is
 * the oldest of those dates. The recap counters (ReviewSummaryCounts) are a
 * per-VISIT tally now: `savedVisit` below is bumped inline by `bump` as
 * actions happen, and `leaveStep` turns it into the step's record (see
 * domain/reviewSteps.ts's applyStepVisit for the exact rule). Deliberately
 * coarse, per the original 2026-09-02 feedback ("don't track what is hard
 * to track"); projectsActivated/areasActivated are the one exception,
 * computed once when the stalled/neglected step is left, from that step's
 * frozen snapshot (see those below).
 *
 * Frozen snapshots (2026-09-02 feedback: "keep those projects and areas in
 * the list until user taps Next, ... sometimes it is good to add more than
 * one task here"): the Stalled projects and Neglected areas steps used to
 * render straight from the live `aggregate`, so a card would vanish the
 * moment its item picked up an actionable open task (the aggregate's own
 * membership rule). Now each step's card list is captured once into state
 * (stalledSnapshot/neglectedSnapshot) on entering that step and rendered
 * from there instead; only an explicit Archive/status-change action (the
 * handleStalled-/handleNeglected-prefixed wrappers below) removes a card early.
 * Each frozen ReviewItemCard still shows *live* task data though (its
 * open-tasks list and its shelvedTasks list are both recomputed against
 * the current cache on every render, via reviewAggregate.ts's exported
 * isActionableOpenTask/shelvedTasksFor) - only card *membership* in the
 * step is frozen, not what's shown on the card, so a just-added task or a
 * just-promoted shelved task both show up immediately. The snapshot
 * re-freezes fresh every time the user navigates into the step (enterStep)
 * or after a manual 🔄 reload (load) - deliberately not preserved across a
 * tab-switch-away-and-back, same "just refreeze" call the user made for
 * that case.
 *
 * Cross-project data comes from storage/reviewAggregate.ts's
 * buildReviewAggregate - the same "pure sync transform over the already-warm
 * dataCache.ts cache" pattern storage/dailyAggregate.ts uses for the Daily
 * tab, so this is effectively instant regardless of how many Projects/Areas
 * exist. Inbox.txt is loaded directly (loadProjectFile('inbox', inboxPath)),
 * same as screens/InboxScreen.tsx and DailyView.tsx's Inbox-sourced rows,
 * since it's a single flat file outside the cache's per-item scan.
 *
 * Component reuse (explicit requirement for this feature, an intentional
 * deviation from design-overview.md §3's usual per-screen-presentation
 * convention): every "add a task" moment here - Week ahead, and each
 * stalled-project/neglected-area card - uses the exact same
 * ui/QuickAddWidget.tsx (2026-09-09, docs/dev/technical-design-unified-
 * quickadd.md - replaces the old ui/TaskQuickAdd.tsx/ui/MeetingQuickAdd.tsx
 * pair) that DailyView.tsx uses, via a single shared handleAddTask below,
 * with `taskOnly` set (these three spots are add-only, single-type, and
 * always were). Week ahead's own quick-add is `fixedDestination: {type:
 * 'inbox'}` (docs/dev/technical-design-filing-unification.md §6) - like Daily's
 * own quick-adds, it no longer offers an unrestricted Inbox/Project/Area
 * picker; "file it properly" happens in the Inbox to zero step below
 * instead. The Inbox to zero step's own task/meeting cards (2026-09-03,
 * docs/dev/technical-design-inbox-tab.md §1) render via the shared ui/
 * TaskRow.tsx/ui/MeetingRow.tsx - the same row components DailyView.tsx's
 * Inbox-sourced rows and ProjectDataPanel.tsx use - gaining inline-edit and
 * note-linking for free in the process (this step previously only offered
 * File/Done/Cancel, then gained a read-only linked-file clip). This step's
 * own task+meeting add/edit now goes through one shared QuickAddWidget too
 * (2026-09-09) - see the "Inbox to zero's own edit-target state" note
 * further down. Filing and linking are now both arm-based (docs/technical-
 * design-filing-unification.md §5): this step gained its own ui/
 * FileBrowserPane.tsx (Resources/Browse tabs), the same "arm a tab,
 * browse, tap to pick" flow screens/InboxScreen.tsx already had -
 * `inboxZeroArmTarget` is this step's own one arm target (mirroring
 * InboxScreen's `armTarget`). Linking still arms straight from the row
 * (`onArmLink`); filing/refiling no longer does (storage/inboxFiling.ts's
 * module doc comment, 2026-09-09) - `armInboxFileTarget` is now called from
 * QuickAddWidget's "Refile" button in edit mode instead of a row-level
 * `onArmFile`, the same change screens/InboxScreen.tsx got.
 *
 * Inbox to zero's own edit-target state (2026-09-09): `editingInboxTaskIndex`/
 * `editingInboxMeetingIndex` used to be two independent `useState<number|
 * null>`s with no shared guard between them - merged into one `editTarget`
 * (design doc §6/§8), derived back into two same-named local consts of the
 * same type so every existing downstream reference (TaskRow/MeetingRow's
 * `isEditing`, handleInbox*Save/Cancel's index params, etc.) needed no
 * further change. `inboxActionError` already covered both types' edit/
 * delete failures from one place before this pass (this step's row-level
 * actions and its quick-add's edit/delete failures were always shown
 * together, unlike DailyView.tsx's two-column split) - so unlike DailyView.tsx/
 * ProjectDataPanel.tsx/InboxScreen.tsx, no separate `widgetError` state was
 * needed here; the widget's edit/delete callbacks just keep using
 * `inboxActionError` via the same functions as before.
 *
 * Step order is Week ahead before Inbox to zero (not the reverse) - a
 * meeting glanced at in the look-ahead sometimes surfaces a task that
 * belongs in Inbox, so Inbox gets triaged after those are already captured.
 *
 * Resume behavior: which view you're on (hub, a step, or the end page) is
 * kept in a module-level variable (savedView below), not React state alone
 * - App.tsx's tab switch genuinely unmounts this screen (conditional
 * rendering, no back-stack/display:none), so plain useState would reset on
 * every tab revisit. Reopening the plugin from a note opened here
 * (docs/dev/technical-design-return-to-origin.md) lands back on the same step
 * the same way. This is session-only (an app relaunch loses it, same as
 * storage/dataCache.ts's own cache); the hub is the initial value and what
 * you come back to after the end page. Only recording a step visit writes
 * anything durable (settings.reviewSteps, read by domain/reviewSteps.ts's
 * isReviewOverdue for the Review tab's badge in ui/TabBar.tsx).
 *
 * 2026-09-03 Daily-cleanup pass (technical-design-daily-compact-ui.md §1):
 * this screen's own "Weekly Review" heading + 🔄 button are gone (and since
 * 0.5 the tab bar's 🔄 too: every "manual 🔄 reload" mention above now means
 * reopening the tab or Settings → Advanced → Reload all files). Each ReviewItemCard's quick-add also
 * moved above its open-tasks/shelved-tasks lists, same overlap-with-the-
 * keyboard fix as DailyView.tsx/ProjectDataPanel.tsx's own quick-adds -
 * Week ahead's own quick-add was already at the top and needed no change.
 *
 * Google Calendar tab (docs/dev/technical-design-google-calendar.md §9): Week
 * ahead's "The coming week" section now sits behind a shared <MiniTabs>
 * (ui/MiniTabs.tsx) - "This week" is that section unchanged, "Google" is
 * the shared ui/GoogleCalendarPanel.tsx at `maxDays={7}` (matching this
 * step's own 7-day look-ahead) with copies defaulting to Inbox, same as
 * DailyView. `items`/`settings`/`inboxPath` are already loaded at this
 * screen's top level for the rest of the wizard, so the panel just reads
 * them rather than loading its own copy.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {AbbrevFileMatch} from '../domain/abbrev';
import {Destination, destinationLabel, isFocused} from '../domain/destination';
import {isContextTag, setFlowStateTag} from '../domain/flowState';
import {deriveTaskFields, setDueTag} from '../domain/markdown';
import {isTodayOrFuture} from '../domain/meetingTime';
import {
  meetingDisplayTitle,
  MeetingTrackingKind,
  REVIEW_LOOKBACK_DAYS,
  resolveMeetingTracking,
  toggleMeetingTracking,
  toggleMeetingTrackingAt,
} from '../domain/meetingTracking';
import {
  applyEmptyStamps,
  applyStepVisit,
  nextReviewStepId,
  prevReviewStepId,
  activeReviewSteps,
  reviewStepDef,
  ReviewStepId,
  ReviewSummaryCounts,
  ZERO_REVIEW_SUMMARY,
} from '../domain/reviewSteps';
import {GtdParaSettings, ResolvedParaPaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {isoWeekKey, weekAheadRangeIso} from '../domain/weekDate';
import {countMeetingsInRange} from '../domain/meetingSpan';
import {archiveItem, archiveLeavesEmptyFolder, archiveTargetsFor} from '../storage/archive';
import {archiveDoneText, emptyFolderConfirmNote} from '../domain/fileChangeText';
import {planStatusLabel} from '../domain/closeOut/plan';
import {
  CachedItem,
  findCachedItem,
  getCachedData,
  rebuildCache,
  updateItemMeetings,
  updateItemTasks,
} from '../storage/dataCache';
import {FocusScope, focusBlockedReason, setItemFocus} from '../storage/focusSlots';
import {
  appendMeetingToTarget,
  appendTaskToTarget,
  fileInboxMeeting,
  fileInboxTask,
  InboxFilingTarget,
  resolveFilingPick,
} from '../storage/inboxFiling';
import {linkedFileStatus, locateLinkedFile, resolveLinkedFilePath, toLinkedFile} from '../storage/linkedFiles';
import {MeetingRelevantTodo, relatedItemsFor} from '../storage/meetingNoteAggregate';
import {openOrCreateMeetingNote, openOrCreateTodoNote, refreshMeetingNoteBlock} from '../storage/meetingNoteContent';
import {useNoteCreateConfirm} from '../ui/useNoteCreateConfirm';
import {resolveNotePath} from '../storage/noteLinks';
import {addMeetingToDestination, addTaskToDestination, applyMeetingEdit, buildMeeting, buildTask, mutateEntryMeetings, mutateEntryTasks} from '../storage/itemMutations';
import {summarizeAttachmentsByExtension} from '../domain/attachmentSummary';
import {isAttachmentSupported, saveGmailAttachment} from '../storage/gmailAttachments';
import {saveGmailEmailAsNote} from '../storage/gmailEmailNote';
import {
  archiveGmailMessage,
  fetchGmailBody,
  GmailCacheMessage,
  getCachedGmailInbox,
  getGmailFetchedAt,
  isGmailConfigured,
  refreshGmailInbox,
} from '../storage/gmailInboxCache';
import {fetchAttachment as fetchGmailAttachmentBytes, GmailAttachmentInfo} from '../storage/gmailImapNative';
import {loadProjectFile, ProjectFileState, saveMeetings, saveTasks} from '../storage/projectFile';
import {
  buildReviewAggregate,
  buildReviewStepCounts,
  isActionableOpenTask,
  nextTasksFor,
  ReviewAggregate,
  ReviewItemRef,
  ReviewMeetingEntry,
  ReviewNextTaskEntry,
  ReviewProjectEntry,
  ReviewShelvedTaskEntry,
  ReviewUnfocusedNextEntry,
  shelvedTasksFor,
} from '../storage/reviewAggregate';
import {loadSettings, updateReviewSteps} from '../storage/settingsStorage';
import {SettableStatus, setItemStatus} from '../storage/statusControl';
import {displayPath, FolderEntry, openPath} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../utils/screenRefresh';
import FileBrowserPane, {ARMING_TEXT, FileBrowserRoot, LinkTarget} from '../ui/FileBrowserPane';
import DateInput from '../ui/DateInput';
import FocusedItemRow from '../ui/FocusedItemRow';
import {ClipIcon} from '../ui/icons';
import GmailBodyPane from '../ui/GmailBodyPane';
import ItemContextBlock from '../ui/ItemContextBlock';
import {COLUMN_WIDTH_PX, itemEntryDisplayText, itemEntryHeight, itemEntryLines} from '../ui/itemEntryRow';
import ReviewWeekAhead from './ReviewWeekAhead';
import MeetingRow, {MEETING_ROW_HEIGHT, MeetingRowLayout, MeetingTrackingConfig} from '../ui/MeetingRow';
import MeetingList, {LayoutSwitch} from '../ui/MeetingList';
import {useListLayout} from '../ui/listLayout';
import {useEditFlush} from '../ui/useEditFlush';
import PagedSection from '../ui/PagedSection';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import {ReviewEnd, ReviewHub} from '../ui/ReviewHub';
import ReviewMasterDetail from '../ui/ReviewMasterDetail';
import {displayTaskText} from '../ui/TaskBadges';
import TaskRow, {ReadOnlyTaskRow, taskRowHeight, taskRowLines} from '../ui/TaskRow';
import {useCachedItems} from '../ui/useCachedItems';
import {activeLineEstimator} from '../ui/textLineEstimator';
import {common} from '../ui/commonStyles';
import LoadErrorNotice from '../ui/LoadErrorNotice';
import {COLORS, FONT, useThemeColors} from '../ui/theme';
import {useFeatures} from '../ui/featureStore';
import {useErrorStatus, useStatusApi} from '../ui/status/StatusProvider';
import MarkWrap from '../ui/status/StatusMark';

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  /** Called after a step visit (or the hub's empty-step stamps) was written to settings.reviewSteps - lets App.tsx refresh the settings it feeds to TabBar's badge. */
  onReviewRecorded?: () => void;
  /** Switches to Settings' Calendar sub-tab (docs/dev/technical-design-google-calendar.md §9) - used by Week ahead's Google mini-tab empty state when no ICS URL is configured yet. */
  onOpenCalendarSettings?: () => void;
  /**
   * Opens the project close-out wizard (docs/dev/technical-design-project-close-
   * out.md §6.1/§8.3) - 'full' from the Done step's "Close out…", 'quick' for
   * every other place that used to archive a Project directly. When omitted,
   * Projects archive directly as before.
   */
  onStartCloseOut?: (projectPath: string, mode: 'full' | 'quick') => void;
}

/**
 * One Todo/Meeting created from a Gmail message during the current visit
 * (docs/dev/technical-design-review-gmail-inbox.md §8) - `index` is that item's
 * position in `inbox.tasks`/`inbox.meetings` (Gmail-created items are always
 * Inbox-resident, same fixedDestination as Week ahead's own quick-add), kept
 * so the detail panel can offer to link the email's own text or one of its
 * attachments onto exactly that item afterwards (linkedFile is single-valued
 * - domain/types.ts's Task/Meeting - so this is a one-shot "which file"
 * choice per created item, same as everywhere else linkedFile is set).
 */
interface GmailCreatedItem {
  type: 'task' | 'meeting';
  index: number;
  label: string;
  /**
   * What this item is currently linked to (set after a successful link on this
   * visit; linkedFile is single-valued, so a later link overwrites it). `key`
   * is 'body' for the email text (saved as a .note), otherwise the
   * attachment's partId - the panel uses it to mark the active pill "✓" and
   * to show the file name under the item.
   */
  linked?: {kind: 'body' | 'attachment'; name: string; key: string};
}

// Week ahead's quick-add always goes to Inbox now (docs/dev/technical-design-
// filing-unification.md §6) - same local-constant convention
// screens/InboxScreen.tsx's own FIXED_INBOX_DESTINATION uses.
const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};

// ui/QuickAddWidget.tsx's onAddMeeting prop is required even in `taskOnly`
// mode (Meeting stays permanently greyed/locked there, so it's never
// actually reachable) - Week ahead and every stalled-project/neglected-area
// card only ever add tasks, so this stands in rather than each call site
// inventing its own unreachable no-op.
const noopAddMeeting = async (): Promise<void> => {};

// Fresh screen budget for every converted step's left-list PagedSection
// (docs/dev/design-device-rendering.md §6, same method screens/ItemsList.tsx's
// own FULL_VIEWPORT_PX/HALF_VIEWPORT_PX use) - shared by all five Review
// master-detail steps below, since they all sit inside the same stepNavRow
// + stepScroll wrapper (see the render() at the bottom of this file).
// Tab bar (~80) + screen content top padding (16) - same GLOBAL_CHROME_PX
// figure ui/ItemsList.tsx already uses, since App.tsx wraps every screen
// identically.
const REVIEW_GLOBAL_CHROME_PX = 96;
// stepNavRow's own height (styles.stepNavRow below): paddingBottom 10 +
// marginBottom 12 + one FONT.medium (17px) text line (~20 incl. leading) +
// borderBottomWidth 1.
const REVIEW_STEP_NAV_ROW_PX = 10 + 12 + 20 + 1;
// Every PagedSection's own header row (ui/PagedSection.tsx's
// styles.headerRow) - same SECTION_HEADER_ROW_PX figure ui/ItemsList.tsx
// already uses: paddingVertical 4x2 + FONT.small line ~18 + marginBottom 4
// + borderBottomWidth 1.
const REVIEW_SECTION_HEADER_ROW_PX = 8 + 18 + 4 + 1;
// Kept but no longer passed to ReviewMasterDetail (2026-09-17, [[feature_
// pagination_fixed_height]]'s tabbed-pane follow-on) - all 5 steps below
// now omit `viewportHeight` and self-measure instead (ui/
// ReviewMasterDetail.tsx), same hand-summed-sibling-chrome shape that
// turned out ~400px off for DailyView.tsx's Open-tasks column. Left
// defined, unused, as the quickest rollback: pass it back into all 5 calls
// below to revert.
const REVIEW_LIST_VIEWPORT_PX =
  1872 - REVIEW_GLOBAL_CHROME_PX - REVIEW_STEP_NAV_ROW_PX - REVIEW_SECTION_HEADER_ROW_PX; // = 1702

// Inbox-to-zero step's own Tasks/Meetings PagedSections - flex weights now
// (docs/dev/technical-design-flex-weight-stacking.md §3.4, 2026-09-17),
// replacing the old REVIEW_INBOX_TASKS_VIEWPORT_PX/
// REVIEW_INBOX_MEETINGS_VIEWPORT_PX pixel budgets (which had anchored on
// PAGE_SIZE.stacked's own 1:1 value, independent of screens/InboxScreen.tsx's
// PAGE_SIZE.inboxTasks/inboxMeetings). Tilman explicitly asked
// (2026-09-17) for this step to share the same 8:6 ratio as
// InboxScreen.tsx's own Tasks/Meetings split instead of keeping its
// previously-independent 1:1 - both stacks are now literally the same
// weight pair (see screens/InboxScreen.tsx's own TASKS_WEIGHT/
// MEETINGS_WEIGHT). Each PagedSection is the sole occupant of its own
// weighted box (styles.stackedColumn below) and self-measures into it.
const REVIEW_INBOX_TASKS_WEIGHT = 8;
const REVIEW_INBOX_MEETINGS_WEIGHT = 6;

/** Which page the screen shows: the hub, one step, or the end page after the last step. */
type ReviewView = {kind: 'hub'} | {kind: 'step'; id: ReviewStepId} | {kind: 'end'};

/** See the module doc comment's "Resume behavior" note. */
let savedView: ReviewView = {kind: 'hub'};

/**
 * The recap tally of the step visit in progress (module doc comment's "Hub"
 * note) - null on the hub/end page. Module-level for the same reason as
 * savedView (survives a tab-switch-and-back), and no React mirror because
 * nothing renders the running tally; leaveStep turns it into the step's
 * persisted record.
 */
let savedVisit: {id: ReviewStepId; counts: ReviewSummaryCounts} | null = null;

function statusLabel(status: SettableStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'on-hold') return 'On Hold';
  return 'Done';
}

/**
 * A safe-default CachedItem for a frozen `ReviewItemRef` that's vanished
 * from the live cache between freezing a step's snapshot and rendering it
 * (item removed on disk outside the plugin, or a stale path) - same shape
 * `storage/dataCache.ts`'s own `loadOneItem` catch branch already uses for
 * a failed load, reused here rather than inventing a second "empty
 * CachedItem" shape. Lets every master-detail row/detail renderer below
 * call `ui/itemEntryRow.ts`'s helpers and `ui/ItemContextBlock.tsx`
 * unconditionally on a real `CachedItem`, instead of every call site
 * separately guarding a possibly-undefined lookup.
 */
function reviewFallbackItem(ref: ReviewItemRef): CachedItem {
  return {
    kind: ref.kind,
    name: ref.name,
    path: ref.path,
    rawContent: '',
    tasks: [],
    meetings: [],
    taskExtraLines: [],
    meetingExtraLines: [],
    scope: '',
    weeklyGoals: [],
    weeklyGoalsExtraLines: [],
    monthlyGoals: [],
    monthlyGoalsExtraLines: [],
    status: 'active',
    dailyFocus: false,
    weeklyFocus: false,
    monthlyFocus: false,
    defaultResourceFolder: null,
    area: null,
    abbrev: null,
    frontMatterExtraLines: [],
  };
}

/**
 * The live `CachedItem` for a frozen `ReviewItemRef`, falling back to
 * `reviewFallbackItem` above in the (normally unreachable) case it's gone
 * missing from `items` - same "look the item back up in the live cache on
 * every render" pattern the old `ReviewItemCard`/`UnfocusedNextCard` always
 * used for their own task/meeting lists (see this file's "Frozen snapshots"
 * module doc comment), now the single shared lookup every converted step's
 * row and detail renderer uses.
 */
function reviewCurrentItem(ref: ReviewItemRef, items: CachedItem[]): CachedItem {
  return items.find(i => i.path === ref.path) ?? reviewFallbackItem(ref);
}

/**
 * A close-out list row (docs/dev/technical-design-meeting-lists.md §3): the
 * standard MeetingRow as a selector - date+time column, the item as source,
 * no actions (the master-detail shell owns the tap). Reads the meeting and the
 * item's abbreviation from the live cache so an edit in the detail shows.
 */
function CloseOutMeetingRow({
  entry,
  items,
  layout,
  state,
  textColor,
  borderColor,
}: {
  entry: ReviewMeetingEntry;
  items: CachedItem[];
  layout: MeetingRowLayout;
  state?: 'selected' | 'done';
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const current = reviewCurrentItem(entry.item, items);
  return (
    <MeetingRow
      meeting={current.meetings[entry.meetingIndex] ?? entry.meeting}
      layout={layout}
      time="dateTime"
      source={{abbrev: current.abbrev ?? entry.item.name, name: entry.item.name}}
      state={state}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

/**
 * One left-list row, shared by Stalled projects / Neglected areas / Done
 * awaiting review / On Hold reconsideration (all four are a flat list of
 * single items, unlike Unfocused next items' own grouped rows) - same
 * itemEntryHeight/itemEntryLines/itemEntryDisplayText sizing/text-fit logic
 * `screens/ItemsList.tsx` uses for its own Projects/Areas list (docs/
 * technical-design-review-master-detail.md §6.5), so a project/area reads
 * identically wherever it's listed. `actedOn` prepends a checkmark and
 * mutes the row (still fully tappable, still re-selectable - the
 * "eine Haken reicht, aber auch Option es nochmal zu ändern" requirement);
 * `selected` gives the row a left accent bar, mirroring the mockup.
 */
function ReviewLeftRow({
  current,
  selected,
  actedOn,
  textColor,
  borderColor,
}: {
  current: CachedItem;
  selected: boolean;
  actedOn: boolean;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const heightPx = itemEntryHeight(current, COLUMN_WIDTH_PX);
  return (
    <View
      style={[
        styles.masterRow,
        {height: heightPx, minHeight: heightPx, borderColor},
        selected && styles.masterRowSelected,
      ]}>
      <Text
        style={[styles.masterRowText, {color: textColor}, actedOn && styles.masterRowActedOn]}
        numberOfLines={itemEntryLines(current, COLUMN_WIDTH_PX)}>
        {actedOn ? '✓ ' : ''}
        {itemEntryDisplayText(current)}
      </Text>
    </View>
  );
}

export default function ReviewScreen({
  onOpenItem,
  onReviewRecorded,
  onOpenCalendarSettings,
  onStartCloseOut,
}: Props): React.JSX.Element {
  const {isDarkMode, textColor, borderColor, placeholderColor} = useThemeColors();

  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  // Live view of storage/dataCache.ts (re-renders with a fresh array on every
  // cache mutation - docs/dev/technical-design-cache-subscription-and-shared-add-
  // path.md §A). Only `items` is live: `aggregate` below stays a deliberate
  // frozen snapshot (Review steps must not drop rows mid-review), rebuilt only
  // by load()/refreshFromCache().
  const items = useCachedItems();
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  // The Gmail step only while the experimental Gmail integration is on
  // (docs/dev/technical-design-about-debug-experimental.md §3.2).
  const features = useFeatures();
  const activeSteps = useMemo(() => activeReviewSteps(features), [features]);
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  // storage/linkedFiles.ts's resolveLinkedFilePath (the Inbox-to-zero step's
  // read-only onOpenLinkedFile below, technical-design-linked-files.md §9.1)
  // needs the full resolved path set, not just `inboxPath` - same "keep both"
  // shape screens/InboxScreen.tsx's own `inboxPath`/`paths` pair uses.
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  const [inbox, setInbox] = useState<ProjectFileState | null>(null);
  const [loading, setLoading] = useState(true);
  // Explicit e-ink refresh once the initial load or a manual refresh
  // actually lands - see src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(loading);
  const [error, setError] = useState<string | null>(null);

  const [inboxActionError, setInboxActionError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.inboxActionError', inboxActionError, () => setInboxActionError(null));
  // One shared edit-target for the Inbox-to-zero step's task+meeting rows
  // (2026-09-09, docs/dev/technical-design-unified-quickadd.md §6/§8) - see the
  // module doc comment's "Inbox to zero's own edit-target state" note.
  // `editingInboxTaskIndex`/`editingInboxMeetingIndex` below are derived
  // from this rather than being their own state, so every existing
  // reference to them elsewhere in this file keeps working unchanged.
  type InboxEditTarget = {type: 'task'; index: number} | {type: 'meeting'; index: number};
  const [editTarget, setEditTarget] = useState<InboxEditTarget | null>(null);
  // Shown as a warning in the central status slot (via QuickAddWidget) when a row tap is blocked because
  // an edit is already open elsewhere in this step (design doc §6).
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  /**
   * The one arm target for the Inbox-to-zero step's own Files pane
   * (docs/dev/technical-design-filing-unification.md §5.2) - this step never
   * had a Files pane or an arm concept before this feature (design-
   * overview.md §2.18 previously documented that as a deliberate gap).
   * Mirrors screens/InboxScreen.tsx's own armTarget shape exactly.
   */
  const [inboxZeroArmTarget, setInboxZeroArmTarget] = useState<{type: 'task' | 'meeting'; index: number; intent: 'link' | 'file'} | null>(
    null,
  );

  const [view, setView] = useState<ReviewView>(savedView);
  /** Set when persisting a step visit / empty stamp failed - shown on the hub and end page (ui/ReviewHub.tsx). */
  const [saveError, setSaveError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.saveError', saveError && `Couldn't save review progress: ${saveError}`, () => setSaveError(null));
  /** Frozen card lists for the Stalled projects / Neglected areas steps - see the module doc comment's "Frozen snapshots" note. Null means "not frozen yet for this visit". */
  const [stalledSnapshot, setStalledSnapshot] = useState<ReviewProjectEntry[] | null>(null);
  const [neglectedSnapshot, setNeglectedSnapshot] = useState<ReviewProjectEntry[] | null>(null);
  /** Same frozen-snapshot pattern, for the Unfocused next items step - see the module doc comment's "Unfocused next items" note. */
  const [unfocusedNextSnapshot, setUnfocusedNextSnapshot] = useState<ReviewUnfocusedNextEntry[] | null>(null);
  /**
   * Same frozen-snapshot pattern, now extended to Done awaiting review / On
   * Hold reconsideration (2026-09-16, docs/dev/technical-design-review-master-
   * detail.md §3) - these two steps had no frozen membership before the
   * master-detail rework (their card lists read straight off the live
   * `aggregate`, so a Reactivate/Archive action made the card vanish
   * immediately on the next render). The master-detail requirement that an
   * acted-on row stays visible, checkmarked, until the step is left applies
   * to all five converted steps now, not just Stalled/Neglected - this is
   * the direct generalization for these two.
   */
  const [doneSnapshot, setDoneSnapshot] = useState<ReviewItemRef[] | null>(null);
  const [onHoldSnapshot, setOnHoldSnapshot] = useState<ReviewItemRef[] | null>(null);
  /**
   * "Acted-on but still visible, checkmarked, reopenable" bookkeeping for
   * each of the five converted steps (docs/dev/technical-design-review-master-
   * detail.md §3) - a controlled prop into `ui/ReviewMasterDetail.tsx`, one
   * `Set<string>` of item paths per step, populated by that step's own
   * action wrapper handlers (handleStalledArchive etc. below) instead of
   * those handlers filtering the item OUT of its frozen snapshot the way
   * they used to. A deliberate behavior change, confirmed in the
   * requirements chat ("eine Haken reicht, aber auch Option es nochmal zu
   * ändern" - a checkmark is enough, but re-editing should still be
   * possible).
   */
  const [stalledActedOn, setStalledActedOn] = useState<Set<string>>(new Set());
  const [neglectedActedOn, setNeglectedActedOn] = useState<Set<string>>(new Set());
  const [doneActedOn, setDoneActedOn] = useState<Set<string>>(new Set());
  const [onHoldActedOn, setOnHoldActedOn] = useState<Set<string>>(new Set());
  const [unfocusedNextActedOn, setUnfocusedNextActedOn] = useState<Set<string>>(new Set());
  /** Meetings-to-close-out step (docs/dev/technical-design-meeting-tracking.md §5): same frozen-membership + acted-on pattern as the five steps above - a meeting ticked "reviewed" stays listed, checkmarked and re-openable until the step is left. Keyed by `closeOutKey`. */
  const [closeOutSnapshot, setCloseOutSnapshot] = useState<ReviewMeetingEntry[] | null>(null);
  const [closeOutActedOn, setCloseOutActedOn] = useState<Set<string>>(new Set());
  /**
   * Gmail inbox review step (docs/dev/technical-design-review-gmail-inbox.md) -
   * NOT a frozen snapshot of the usual kind: the source of truth is storage/
   * gmailInboxCache.ts's own module-level cache (a real IMAP fetch, not a
   * resnapshot of the already-warm item cache), mirrored into this plain
   * `useState` and kept in sync explicitly after every cache-mutating call
   * below, the same "storage layer owns the data, this screen just mirrors
   * it into state" split `inbox`/`aggregate` already use for their own
   * sources. `null` means "not fetched yet this session" (distinct from `[]`,
   * an empty inbox) - see loadGmailInbox below.
   */
  const [gmailMessages, setGmailMessages] = useState<GmailCacheMessage[] | null>(getCachedGmailInbox());
  const [gmailLoading, setGmailLoading] = useState(false);
  /** Synchronous double-tap guard for loadGmailInbox - `gmailLoading` state only updates on the next render, so two quick taps could otherwise both start a fetch. */
  const gmailLoadingRef = useRef(false);
  /** Why the last manual refresh failed (already categorised - permission / login / no connection / other - by storage/gmailImapNative.ts's describeGmailFailure). Stays on screen until the user taps Refresh again; nothing clears or retries it automatically. */
  const [gmailError, setGmailError] = useState<string | null>(null);
  /** When the shown list was last fetched successfully - mirrors storage/gmailInboxCache.ts's getGmailFetchedAt, drives the "Refresh (last HH:MM)" label. */
  const [gmailFetchedAt, setGmailFetchedAt] = useState<number | null>(getGmailFetchedAt());
  /** uid -> the Todo/Meeting(s) created from that email during this visit - drives both settings.gmailHideHandled's filtering and the detail panel's "link the email/an attachment to what you just created" affordance. Cleared on every step entry, same as every other step's own acted-on bookkeeping. */
  const [gmailCreatedItems, setGmailCreatedItems] = useState<Record<string, GmailCreatedItem[]>>({});
  /** uid -> linkedFile of the .note already written for that email during this visit, so linking the email text onto a second item of the same email reuses the note instead of writing another one (docs/dev/technical-design-gmail-email-note.md 3.7). Reset with gmailCreatedItems on step entry. */
  const [gmailEmailNotes, setGmailEmailNotes] = useState<Record<string, string>>({});
  /** Generic "did something with this email" checkmark for `ui/ReviewMasterDetail.tsx`'s `actedOnKeys` - set by creating an item from the email (an archived email leaves the list immediately since 2026-09-28 - see handleArchiveGmailMessage - so it never shows this checkmark). */
  const [gmailActedOn, setGmailActedOn] = useState<Set<string>>(new Set());
  /** Gmail step's left-list selection, CONTROLLED here (ui/ReviewMasterDetail.tsx's optional selectedKey prop, 2026-09-28) so an archive can move it to the neighbouring email. Reset on every step entry / 🔄 via stepEntryToken, like the shell's own internal reset. */
  const [gmailSelectedKey, setGmailSelectedKey] = useState<string | null>(null);
  /** A background archive that failed (the email is back in the list) - shown under the Refresh button until the next archive or refresh. */
  const [gmailArchiveErrorState, setGmailArchiveErrorState] = useState<string | null>(null);
  // Gmail refresh/archive failures -> central status slot + ⚠ on the Refresh
  // pill (docs/dev/technical-design-status-slot.md §7.5). An archive failure is
  // published GLOBAL through the (App-level, always mounted) status API, so
  // it still shows when the background IMAP call fails after the user has
  // already left Review (D13).
  const statusApi = useStatusApi();
  const confirmNoteCreate = useNoteCreateConfirm('ReviewScreen.noteCreateConfirm');
  const gmailArchiveError = gmailArchiveErrorState;
  const setGmailArchiveError = useCallback(
    (text: string | null) => {
      setGmailArchiveErrorState(text);
      if (text) {
        statusApi.show('gmail.archiveFailed', {
          kind: 'error',
          scope: 'global',
          text,
          onDismiss: () => statusApi.clear('gmail.archiveFailed'),
        });
      } else {
        statusApi.clear('gmail.archiveFailed');
      }
    },
    [statusApi],
  );
  useErrorStatus('ReviewScreen.gmailError', gmailError && !gmailLoading ? `Gmail refresh failed: ${gmailError}` : null, () => setGmailError(null));
  /** Bumped on every page change (showView) and on a manual 🔄 reload - passed as `ui/ReviewMasterDetail.tsx`'s `resetKey` for whichever step is currently mounted, so its own left-list selection resets to "nothing selected" exactly when that step's snapshot re-freezes (module doc comment's "Frozen snapshots" note), never on an unrelated re-render from a sibling action. */
  const [stepEntryToken, setStepEntryToken] = useState(0);
  useEffect(() => {
    setGmailSelectedKey(null);
    setGmailArchiveError(null);
  }, [stepEntryToken]);

  /** Bumps one of the recap counters of the step visit in progress - see the module doc comment. A no-op outside a visit (hub/end page); never goes below 0 (a tick that gets un-ticked again takes its own count back). Attribution to a step is automatic: an action can only happen inside its own step. */
  const bump = (key: keyof ReviewSummaryCounts, delta = 1) => {
    if (!savedVisit) return;
    savedVisit = {...savedVisit, counts: {...savedVisit.counts, [key]: Math.max(0, (savedVisit.counts[key] ?? 0) + delta)}};
  };

  const load = useCallback(async (forceRebuild: boolean) => {
    setLoading(true);
    // Explicit rising-edge refresh (2026-09-11, Tilman reported entering
    // Review as "previous screen stays frozen, no spinner, every time" until
    // the load finishes) - this screen fully unmounts/remounts on every tab
    // switch (App.tsx's `activeTab === 'review' && <ReviewScreen/>`, not
    // display:none), so the very first render (the ActivityIndicator below)
    // is a direct result of the TabBar tap. screenRefresh.ts's own doc
    // comment theorizes a tap-triggered render like that already gets a
    // natural host refresh and only the *finish* of an unattended async load
    // needs an explicit one - empirically false here specifically because
    // `rebuildCache()` below is slow enough to notice, so the spinner state
    // needs its own explicit requestEinkRefresh() rather than relying on
    // that natural refresh. useEinkRefreshOnLoad(loading) below still covers
    // the falling edge (real content replacing the spinner) same as before -
    // this only adds the missing rising-edge half, scoped to this screen
    // rather than changing the shared hook for every caller.
    requestEinkRefresh();
    setError(null);
    if (forceRebuild) {
      // A manual reload can genuinely change what's stalled/neglected/done/
      // on-hold/unfocused-next - drop every step's frozen snapshot so the
      // post-load useEffect re-freezes fresh from the rebuilt aggregate
      // (see the module doc comment), and clear every step's acted-on set
      // and the shared selection-reset token along with it, same as a
      // enterStep re-entry does (see enterStep below).
      setStalledSnapshot(null);
      setNeglectedSnapshot(null);
      setUnfocusedNextSnapshot(null);
      setCloseOutSnapshot(null);
      setDoneSnapshot(null);
      setOnHoldSnapshot(null);
      setStalledActedOn(new Set());
      setNeglectedActedOn(new Set());
      setDoneActedOn(new Set());
      setOnHoldActedOn(new Set());
      setUnfocusedNextActedOn(new Set());
      setCloseOutActedOn(new Set());
      setStepEntryToken(t => t + 1);
    }
    try {
      const loadedSettings = await loadSettings();
      setSettings(loadedSettings);
      let cache = getCachedData();
      if (!cache || forceRebuild) {
        cache = await rebuildCache(loadedSettings);
      }
      setAggregate(buildReviewAggregate(cache.items, new Date(), loadedSettings.noteCreationDefinitions));
      setInboxPath(cache.paths.inboxFolder);
      setPaths(cache.paths);
      setInbox(await loadProjectFile('inbox', cache.paths.inboxFolder));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError('ReviewScreen: load failed', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /** Rebuilds the frozen Review aggregate from the already-warm cache after a mutation (`items` itself is live via useCachedItems above). */
  const refreshFromCache = () => {
    const cache = getCachedData();
    if (cache) {
      setAggregate(buildReviewAggregate(cache.items, new Date(), settings?.noteCreationDefinitions));
    }
  };

  /**
   * (Re-)fetches the Gmail inbox over IMAP and mirrors the result into this
   * screen's own state - the one place this screen actually talks to the
   * network for this step (every other Gmail helper below only reads/mutates
   * the already-fetched storage/gmailInboxCache.ts cache and re-mirrors it,
   * same "storage owns it, this state just mirrors it" split `load` above
   * uses for `inbox`/`aggregate`). Called ONLY by the step's own manual
   * Load/Refresh button (renderGmailInbox) - never on step entry, never from
   * an effect, never as a retry (2026-09-21: an effect that re-fired whenever
   * `gmailMessages` was still null retried every failure immediately, in a
   * loop, and each retry cleared the error text before it could be read).
   * Also NOT by reopening the step or Reload all files (load), since an IMAP round
   * trip is a materially different cost than resnapshotting the already-warm
   * local cache every other step refreshes against. A failure leaves
   * `gmailMessages` as it was and shows `gmailError` until the next tap.
   */
  const loadGmailInbox = useCallback(async () => {
    if (!settings || gmailLoadingRef.current) return;
    gmailLoadingRef.current = true;
    setGmailLoading(true);
    setGmailError(null);
    setGmailArchiveError(null);
    try {
      const messages = await refreshGmailInbox(settings);
      setGmailMessages(messages);
      setGmailFetchedAt(getGmailFetchedAt());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError('ReviewScreen: Gmail inbox load failed', message);
      setGmailError(message);
    } finally {
      gmailLoadingRef.current = false;
      setGmailLoading(false);
      requestEinkRefresh();
    }
  }, [settings]);

  // Every action handler below that mutates data (status/archive/focus/
  // quick-add/promote/due-date) also calls requestEinkRefresh() explicitly
  // after its refreshFromCache()/state update, same fix as showView's own
  // (bugfix_eink_refresh.md's Follow-up 3/4: a plain tap-triggered - or,
  // here, awaited-then-synchronous - state change isn't guaranteed to
  // flush on this device without an explicit call; useEinkRefreshOnLoad's
  // `loading` flag above doesn't cover any of these, since none of them
  // toggle it). Added 2026-09-16 once the master-detail redesign's own row-
  // selection tap (ui/ReviewMasterDetail.tsx's setSelectedKey) turned out to
  // have exactly this gap - see that file's own doc comment for the
  // originally-reported symptom.

  const currentStepId: ReviewStepId | null = view.kind === 'step' ? view.id : null;

  /** Covers initial mount/resume landing directly on one of the converted steps (savedView) - freezes from the just-loaded aggregate the first time it's available and the snapshot is still null. Explicit re-freezes on every subsequent step entry happen in enterStep below instead. */
  useEffect(() => {
    if (!aggregate) return;
    if (currentStepId === 'stalled' && stalledSnapshot === null) setStalledSnapshot(aggregate.stalledProjects);
    if (currentStepId === 'neglected' && neglectedSnapshot === null) setNeglectedSnapshot(aggregate.neglectedAreas);
    if (currentStepId === 'unfocusedNext' && unfocusedNextSnapshot === null) setUnfocusedNextSnapshot(aggregate.unfocusedNextItems);
    if (currentStepId === 'meetingsCloseOut' && closeOutSnapshot === null) setCloseOutSnapshot(aggregate.meetingsToClose);
    if (currentStepId === 'done' && doneSnapshot === null) setDoneSnapshot(aggregate.doneProjects);
    if (currentStepId === 'onHold' && onHoldSnapshot === null) setOnHoldSnapshot(aggregate.onHoldItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregate, currentStepId]);

  // (No auto-fetch effect for the Gmail inbox step on purpose - see
  // loadGmailInbox's doc comment above. The fetch is explicit-tap-only, like
  // the Google Calendar panel, so a failure can never turn into a retry loop.)

  /**
   * Switches the visible page (hub / step / end page) and remembers it for a
   * remount. Every page change goes through here, so every tap that changes
   * what is shown also gets the explicit e-ink refresh (2026-09-11, Tilman:
   * tapping "Next" on step 1 visibly did nothing, then a second tap jumped
   * straight to step 3, skipping 2 - the same root cause as this file's
   * load() rising-edge fix: utils/screenRefresh.ts's "tap-triggered renders
   * get a natural host refresh" theory doesn't reliably hold on this device.
   * The *state* change lands correctly, but the e-ink panel doesn't flush, so
   * the display stays on the old page until some later, unrelated redraw
   * catches it up - which reads as "nothing happened" on tap N and "skipped
   * a page" on tap N+1). The end page is deliberately NOT remembered: a
   * remount after it lands on the hub (see the module doc comment).
   */
  const showView = (next: ReviewView) => {
    savedView = next.kind === 'end' ? {kind: 'hub'} : next;
    setView(next);
    setStepEntryToken(t => t + 1);
    requestEinkRefresh();
  };

  // The open step was just hidden (Gmail switched off in Settings → Advanced
  // while this kept-alive screen stood on it): back to the overview.
  const viewHidden = view.kind === 'step' && !activeSteps.some(def => def.id === view.id);
  useEffect(() => {
    if (viewHidden) showView({kind: 'hub'});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewHidden]);

  /**
   * Enters a step: refreezes fresh every time the user navigates into any of
   * the converted steps - see the module doc comment's "Frozen snapshots"
   * note - clears that step's acted-on set, and starts a fresh recap tally
   * for the visit. The bumped `stepEntryToken` (showView) makes
   * ui/ReviewMasterDetail.tsx start back at "no selection" (requirements
   * chat: "Leer mit Hinweistext").
   */
  const enterStep = (id: ReviewStepId) => {
    if (aggregate) {
      if (id === 'stalled') {
        setStalledSnapshot(aggregate.stalledProjects);
        setStalledActedOn(new Set());
      }
      if (id === 'neglected') {
        setNeglectedSnapshot(aggregate.neglectedAreas);
        setNeglectedActedOn(new Set());
      }
      if (id === 'unfocusedNext') {
        setUnfocusedNextSnapshot(aggregate.unfocusedNextItems);
        setUnfocusedNextActedOn(new Set());
      }
      if (id === 'meetingsCloseOut') {
        setCloseOutSnapshot(aggregate.meetingsToClose
            );
        setCloseOutActedOn(new Set());
      }
      if (id === 'done') {
        setDoneSnapshot(aggregate.doneProjects);
        setDoneActedOn(new Set());
      }
      if (id === 'onHold') {
        setOnHoldSnapshot(aggregate.onHoldItems);
        setOnHoldActedOn(new Set());
      }
    }
    if (id === 'gmailInbox') {
      setGmailCreatedItems({});
      setGmailEmailNotes({});
      setGmailActedOn(new Set());
      // No fetch here - the step's own Load/Refresh button does that (see loadGmailInbox).
    }
    savedVisit = {id, counts: {...ZERO_REVIEW_SUMMARY}};
    showView({kind: 'step', id});
  };

  /** True when a still-frozen stalled/neglected entry now has an actionable open task - reviewAggregate.ts's isActionableOpenTask, the same rule that decided it was stalled/neglected in the first place, so a still-shelved Someday/Maybe task doesn't falsely count. Only an item that picked up such a task DURING the visit can pass, since the snapshot froze it without one. */
  const hasActionableOpenTask = (entry: ReviewProjectEntry) => {
    const current = items.find(i => i.path === entry.item.path);
    return !!current && current.tasks.some(isActionableOpenTask);
  };

  /**
   * Leaving the current step - "Reviewed ›", "Skip ›", "‹ Back" and
   * "Overview" all come through here (docs/dev/technical-design-review-hub.md
   * §4.4). Finalizes the visit's recap tally (projectsActivated/
   * areasActivated are computed now, from the step's frozen snapshot -
   * they used to be computed at "Finish review"), asks domain/
   * reviewSteps.ts's applyStepVisit what to persist (Reviewed: date + counts;
   * anything else: counts only, and only if the tally is non-zero), navigates
   * immediately, and writes in the background. The write is serialized and
   * re-reads the stored settings (storage/settingsStorage.ts's
   * updateReviewSteps), so quick successive taps can't clobber each other or
   * a change made elsewhere; a failure shows on the hub instead of blocking
   * the walk-through.
   */
  const leaveStep = (reviewed: boolean, target: 'next' | 'previous' | 'hub') => {
    if (view.kind !== 'step') return;
    const id = view.id;
    // A second tap arriving before the re-render (double-tap on "Reviewed ›")
    // finds the visit already closed by the first: ignore it, rather than
    // record a second, empty visit over the first one's tally.
    if (savedVisit?.id !== id) return;
    const counts: ReviewSummaryCounts = {...savedVisit.counts};
    if (id === 'stalled') counts.projectsActivated = (stalledSnapshot ?? []).filter(hasActionableOpenTask).length;
    if (id === 'neglected') counts.areasActivated = (neglectedSnapshot ?? []).filter(hasActionableOpenTask).length;
    savedVisit = null;

    const now = new Date();
    if (settings) {
      const optimistic = applyStepVisit(settings.reviewSteps, id, reviewed, counts, now);
      if (optimistic !== settings.reviewSteps) {
        setSettings({...settings, reviewSteps: optimistic});
        updateReviewSteps(steps => applyStepVisit(steps, id, reviewed, counts, now))
          .then(saved => {
            setSaveError(null);
            setSettings(saved);
            onReviewRecorded?.();
          })
          .catch(e => {
            const message = e instanceof Error ? e.message : String(e);
            logError('ReviewScreen: recording step visit failed', id, message);
            setSaveError(message);
            // Show what is really stored rather than the optimistic copy.
            loadSettings().then(setSettings);
          });
      }
    }
    log('ReviewScreen: left step', id, reviewed ? 'reviewed' : 'not reviewed', target);

    const targetId = target === 'next' ? nextReviewStepId(id, activeSteps) : target === 'previous' ? prevReviewStepId(id, activeSteps) : null;
    if (targetId) enterStep(targetId);
    else showView(target === 'next' ? {kind: 'end'} : {kind: 'hub'});
  };

  const openReviewItem = (item: ReviewItemRef) =>
    onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true});

  /**
  /**
   * Shared onAddTask for every ui/QuickAddWidget.tsx on this screen (Week
   * ahead's, and each stalled/neglected card's own fixedDestination one) -
   * see the module doc comment's component-reuse note. Mirrors
   * DailyView.tsx's own handleAddTask exactly.
   */
  const handleAddTask = async (text: string, destination: Destination): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(text), destination, {inbox, inboxPath});
    if (nextInbox) setInbox(nextInbox);
    else refreshFromCache();
    bump('tasksAdded');
    log('ReviewScreen: added task', destinationLabel(destination));
    requestEinkRefresh();
  };

  const handleItemStatusChange = async (itemRef: ReviewItemRef, status: SettableStatus): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    await setItemStatus(cachedItem, status);
    log('ReviewScreen: status changed', itemRef.path, status);
    refreshFromCache();
    if (status === 'active') bump('reactivated');
    else if (status === 'on-hold') bump('onHold');
    else bump('markedDone');
    requestEinkRefresh();
  };

  /**
   * "→ Next" on a Stalled-project/Neglected-area card's shelved Someday/
   * Maybe task (storage/reviewAggregate.ts's shelvedTasks) - the one-tap
   * promotion those tasks are surfaced there for, rather than just being
   * silently excluded from the stalled/neglected check. Same setFlowStateTag
   * + deriveTaskFields + findCachedItem/saveTasks/updateItemTasks
   * write-through every other task mutation on this screen uses (see
   * handleAddTask above).
   */
  const handlePromoteToNext = async (entry: ReviewShelvedTaskEntry): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.tasks[entry.taskIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextText = setFlowStateTag(current.text, 'next');
    const nextTasks = cachedItem.tasks.slice();
    nextTasks[entry.taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText)};
    const nextRaw = await saveTasks(entry.item.kind, entry.item.path, cachedItem.rawContent, nextTasks, cachedItem.taskExtraLines);
    updateItemTasks(entry.item.path, nextRaw, nextTasks, cachedItem.taskExtraLines);
    log('ReviewScreen: promoted shelved task to Next', entry.item.path, entry.taskIndex);
    refreshFromCache();
    requestEinkRefresh();
  };

  /**
   * Archives an Area after an explicit confirmation in the status slot that
   * names the target folder - and, when it merges into an existing folder,
   * the then-empty folder that gets deleted
   * (docs/dev/technical-design-inkhub-submission.md §3.4/§3.8). Resolves true
   * once archived, false when the user cancelled (the card is then left as it was).
   */
  const handleArchiveItem = async (itemRef: ReviewItemRef): Promise<boolean> => {
    // Projects always archive through the close-out checklist (quick archive -
    // docs/dev/technical-design-project-close-out.md §6.1); Areas archive directly.
    if (itemRef.kind === 'project' && onStartCloseOut) {
      onStartCloseOut(itemRef.path, 'quick');
      return false;
    }
    if (!settings) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    const target = archiveTargetsFor(cachedItem, settings);
    const leavesEmpty = await archiveLeavesEmptyFolder(cachedItem, settings);
    const confirmId = 'ReviewScreen.archiveConfirm';
    const confirmed = await new Promise<boolean>(resolve => {
      statusApi.show(confirmId, {
        kind: 'confirm',
        text: `Move "${itemRef.name}" to ${displayPath(target.folder)}?`,
        detail:
          `This moves the folder ${displayPath(itemRef.path)} into ${displayPath(target.folder)}.` +
          (leavesEmpty ? emptyFolderConfirmNote(displayPath(itemRef.path), displayPath(target.folder)) : '') +
          ' gtdpara will not show it here again.',
        actions: [
          {
            label: 'Move to Archive',
            primary: true,
            onPress: () => {
              statusApi.clear(confirmId);
              resolve(true);
            },
          },
        ],
        onCancel: () => {
          statusApi.clear(confirmId);
          resolve(false);
        },
      });
    });
    if (!confirmed) return false;
    const result = await archiveItem(cachedItem, settings, undefined, {deleteEmptySource: leavesEmpty});
    log('ReviewScreen: archived', itemRef.path);
    const doneId = 'ReviewScreen.archiveDone';
    statusApi.show(doneId, {
      kind: result.keptEmptyFolder ? 'info' : 'success',
      text: archiveDoneText(itemRef.name, displayPath(result.path), result.keptEmptyFolder ? displayPath(result.keptEmptyFolder) : null),
      onDismiss: () => statusApi.clear(doneId),
    });
    refreshFromCache();
    bump('archived');
    requestEinkRefresh();
    return true;
  };

  /** Stalled projects step only - like handleItemStatusChange, but also marks the card acted-on (checkmarked, still in the list, still reopenable - see the module doc comment's "Frozen snapshots" note) rather than removing it from the frozen snapshot. */
  const handleStalledStatusChange = async (itemRef: ReviewItemRef, status: SettableStatus): Promise<void> => {
    await handleItemStatusChange(itemRef, status);
    setStalledActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** Stalled projects step only - see handleStalledStatusChange. */
  const handleStalledArchive = async (itemRef: ReviewItemRef): Promise<void> => {
    if (!(await handleArchiveItem(itemRef))) return;
    setStalledActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** Neglected areas step only - see handleStalledStatusChange. */
  const handleNeglectedStatusChange = async (itemRef: ReviewItemRef, status: SettableStatus): Promise<void> => {
    await handleItemStatusChange(itemRef, status);
    setNeglectedActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** Neglected areas step only - see handleStalledStatusChange. */
  const handleNeglectedArchive = async (itemRef: ReviewItemRef): Promise<void> => {
    if (!(await handleArchiveItem(itemRef))) return;
    setNeglectedActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** Done awaiting review step only - see handleStalledStatusChange (same "mark acted-on, don't remove" behavior, newly extended to this step - see doneSnapshot's own doc comment). */
  const handleDoneStatusChange = async (itemRef: ReviewItemRef, status: SettableStatus): Promise<void> => {
    await handleItemStatusChange(itemRef, status);
    setDoneActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** Done awaiting review step only - see handleDoneStatusChange. */
  const handleDoneArchive = async (itemRef: ReviewItemRef): Promise<void> => {
    if (!(await handleArchiveItem(itemRef))) return;
    setDoneActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** On Hold reconsideration step only - see handleDoneStatusChange. */
  const handleOnHoldStatusChange = async (itemRef: ReviewItemRef, status: SettableStatus): Promise<void> => {
    await handleItemStatusChange(itemRef, status);
    setOnHoldActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** On Hold reconsideration step only - see handleDoneStatusChange. */
  const handleOnHoldArchive = async (itemRef: ReviewItemRef): Promise<void> => {
    if (!(await handleArchiveItem(itemRef))) return;
    setOnHoldActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /**
   * Meetings-to-close-out step: ticks (or un-ticks) `#reviewed` on the
   * meeting's CURRENT copy in the cache (not the frozen entry's, which may be
   * a render behind) via domain/meetingTracking.ts's toggleMeetingTracking -
   * the same mutator the Daily row icon uses - then the usual saveMeetings +
   * updateItemMeetings write-through. Ticking marks the row acted-on
   * (checkmarked, stays listed, reopenable); un-ticking clears that again.
   */
  const handleToggleCloseOutReviewed = async (entry: ReviewMeetingEntry): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.meetings[entry.meetingIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${meetingDisplayTitle(entry.meeting)}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const wasReviewed = resolveMeetingTracking(current, settings?.noteCreationDefinitions ?? [])?.done ?? false;
    const nextMeetings = cachedItem.meetings.slice();
    nextMeetings[entry.meetingIndex] = toggleMeetingTracking(current, 'review');
    const nextRaw = await saveMeetings(entry.item.kind, entry.item.path, cachedItem.rawContent, nextMeetings, cachedItem.meetingExtraLines);
    updateItemMeetings(entry.item.path, nextRaw, nextMeetings, cachedItem.meetingExtraLines);
    log('ReviewScreen: meeting review toggled', entry.item.path, entry.meetingIndex, !wasReviewed);
    refreshFromCache();
    bump('meetingsClosedOut', wasReviewed ? -1 : 1);
    setCloseOutActedOn(prev => {
      const next = new Set(prev);
      if (wasReviewed) next.delete(closeOutKey(entry));
      else next.add(closeOutKey(entry));
      return next;
    });
    requestEinkRefresh();
  };

  /**
   * Meetings-to-close-out step: opens the meeting's note - deliberately NOT
   * migrated to `openOrCreateMeetingNote` (Slice 3, docs/dev/technical-design-
   * shared-note-pages.md §6, 2026-09-22): this step never offers a "create"
   * action (the guard right below throws when there's no note yet), unlike
   * every other note-icon handler in this app, which always pairs create
   * with open. Going through the open-or-create entry point here would
   * silently start CREATING a note from a place that never did before - an
   * unrequested behavior change - so this keeps calling
   * `refreshMeetingNoteBlock`/`openPath` directly, exactly as before.
   */
  const handleOpenCloseOutNote = async (entry: ReviewMeetingEntry): Promise<void> => {
    const current = findCachedItem(entry.item.path)?.meetings[entry.meetingIndex];
    if (!current || !current.notePath) {
      throw new Error(`"${meetingDisplayTitle(entry.meeting)}" has no note - Settings → Advanced → Reload all files.`);
    }
    const currentSettings = settings ?? (await loadSettings());
    await refreshMeetingNoteBlock(current, entry.item.path, currentSettings, inbox ? {tasks: inbox.tasks} : null);
    await openPath(await resolveNotePath(entry.item.path, current.notePath));
  };

  /**
   * Gmail inbox review step (docs/dev/technical-design-review-gmail-inbox.md
   * §8) - "add task"/"add meeting" from a message. Always to the Inbox
   * (FIXED_INBOX_DESTINATION, same as Week ahead's own quick-add - an email
   * has no Project/Area of its own to file straight into), via the same
   * shared storage/itemMutations.ts calls handleAddTask/handleAddInboxMeeting
   * already use. Records the created item's own index (gmailCreatedItems) so
   * the detail panel can offer to link the email's text or an attachment
   * onto it afterwards, and marks the message acted-on (checkmark).
   */
  const handleAddGmailTask = async (message: GmailCacheMessage, text: string): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(text), FIXED_INBOX_DESTINATION, {inbox, inboxPath});
    if (nextInbox) {
      setInbox(nextInbox);
      const index = nextInbox.tasks.length - 1;
      setGmailCreatedItems(prev => ({
        ...prev,
        [message.uid]: [...(prev[message.uid] ?? []), {type: 'task', index, label: text}],
      }));
    } else {
      refreshFromCache();
    }
    bump('tasksAdded');
    bump('gmailItemsCreated');
    setGmailActedOn(prev => new Set(prev).add(message.uid));
    log('ReviewScreen: added task from Gmail message', message.uid);
    requestEinkRefresh();
  };

  /** Meeting counterpart of handleAddGmailTask - see that function's own doc comment. Doesn't bump 'tasksAdded' (this is a meeting, not a task), same distinction handleAddInboxMeeting/handleAddTask already draw elsewhere on this screen. */
  const handleAddGmailMeeting = async (message: GmailCacheMessage, fields: MeetingQuickAddFields): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), FIXED_INBOX_DESTINATION, {inbox, inboxPath});
    if (nextInbox) {
      setInbox(nextInbox);
      const index = nextInbox.meetings.length - 1;
      setGmailCreatedItems(prev => ({
        ...prev,
        [message.uid]: [...(prev[message.uid] ?? []), {type: 'meeting', index, label: fields.title}],
      }));
    } else {
      refreshFromCache();
    }
    bump('gmailItemsCreated');
    setGmailActedOn(prev => new Set(prev).add(message.uid));
    log('ReviewScreen: added meeting from Gmail message', message.uid);
    requestEinkRefresh();
  };

  /** Lazily fetches (and caches) one message's full body - see storage/gmailInboxCache.ts's own fetchGmailBody doc comment for why this isn't done for every listed message up front. */
  const handleFetchGmailBody = async (uid: string): Promise<string | 'unsupported'> => {
    if (!settings) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    const body = await fetchGmailBody(settings, uid);
    setGmailMessages(getCachedGmailInbox());
    return body;
  };

  /**
   * Links the email's own text, or one of its attachments, onto a Todo/
   * Meeting already created from it (docs/dev/technical-design-review-gmail-
   * inbox.md §8) - the email text is written as a multi-page .note
   * (storage/gmailEmailNote.ts, docs/dev/technical-design-gmail-email-note.md),
   * an attachment as the file itself (storage/gmailAttachments.ts); either way
   * the result is set as that item's `linkedFile` via storage/
   * itemMutations.ts's mutateEntryTasks/mutateEntryMeetings, the same
   * write-through every other linkedFile assignment on this screen uses.
   * `linkedFile` is single-valued (domain/types.ts), so linking a second file
   * onto the same item simply replaces the first - same behavior as re-arming
   * a link elsewhere in this app. Linking the email text onto a second item
   * of the same email reuses the note written for the first one (if it still
   * exists). `onProgress` receives short status texts for the pill.
   */
  const handleLinkGmailArtifact = async (
    message: GmailCacheMessage,
    item: GmailCreatedItem,
    artifact: {kind: 'body'} | {kind: 'attachment'; attachment: GmailAttachmentInfo},
    onProgress?: (text: string) => void,
  ): Promise<void> => {
    if (!settings || !paths || !inboxPath) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    let linkedFile: string;
    let linkedName: string;
    let linkedKey: string;
    if (artifact.kind === 'body') {
      linkedKey = 'body';
      const existingNote = gmailEmailNotes[message.uid];
      if (existingNote && (await linkedFileStatus(paths, existingNote)) === 'ok') {
        linkedFile = existingNote;
      } else {
        const body = await fetchGmailBody(settings, message.uid);
        setGmailMessages(getCachedGmailInbox());
        if (body === 'unsupported') {
          throw new Error("This email's text couldn't be read - it has no plain-text or HTML content this plugin could parse.");
        }
        const saved = await saveGmailEmailAsNote(
          paths,
          {subject: message.subject, from: message.from, date: message.date},
          body,
          onProgress,
        );
        linkedFile = saved.linkedFile;
        setGmailEmailNotes(prev => ({...prev, [message.uid]: saved.linkedFile}));
      }
      linkedName = linkedFile.slice(linkedFile.lastIndexOf('/') + 1);
    } else {
      linkedKey = artifact.attachment.partId;
      onProgress?.('Saving...');
      const base64 = await fetchGmailAttachmentBytes(
        {email: settings.gmailEmail, appPassword: settings.gmailAppPassword, imapHost: settings.gmailImapHost || 'imap.gmail.com'},
        message.uid,
        artifact.attachment.partId,
      );
      linkedFile = await saveGmailAttachment(paths, message.subject, artifact.attachment.fileName, base64);
      linkedName = linkedFile.slice(linkedFile.lastIndexOf('/') + 1);
    }
    // Index-drift guard: the created item is addressed by its position in the Inbox file, so
    // make sure the item there is still the one this row was created for before writing.
    const driftMessage = `"${item.label}" changed on disk - Settings → Advanced → Reload all files.`;
    if (item.type === 'task') {
      const {nextInbox} = await mutateEntryTasks(
        {item: {kind: 'inbox', path: inboxPath}, taskIndex: item.index, task: {text: item.label}},
        tasks => {
          const next = tasks.slice();
          const current = next[item.index];
          if (!current || current.text.trim() !== item.label.trim()) throw new Error(driftMessage);
          next[item.index] = {...current, linkedFile};
          return next;
        },
        {inbox, inboxPath},
      );
      if (nextInbox) setInbox(nextInbox);
    } else {
      const {nextInbox} = await mutateEntryMeetings(
        {item: {kind: 'inbox', path: inboxPath}, meetingIndex: item.index, meeting: {title: item.label}},
        meetings => {
          const next = meetings.slice();
          const current = next[item.index];
          if (!current || current.title.trim() !== item.label.trim()) throw new Error(driftMessage);
          next[item.index] = {...current, linkedFile};
          return next;
        },
        {inbox, inboxPath},
      );
      if (nextInbox) setInbox(nextInbox);
    }
    setGmailCreatedItems(prev => ({
      ...prev,
      [message.uid]: (prev[message.uid] ?? []).map(entry =>
        entry.type === item.type && entry.index === item.index
          ? {...entry, linked: {kind: artifact.kind, name: linkedName, key: linkedKey}}
          : entry,
      ),
    }));
    log('ReviewScreen: linked Gmail artifact', message.uid, artifact.kind, linkedFile);
    requestEinkRefresh();
  };

  /**
   * Gmail's own "Archive" (remove from Inbox, not deletion - storage/
   * gmailInboxCache.ts's own doc comment). Reworked 2026-09-28 (docs/
   * technical-design-review-monthly-focus.md §4): the panel has already
   * flashed the pill black; here the email leaves the list IMMEDIATELY, the
   * selection moves to the neighbouring email (the one below, else the one
   * above), and the IMAP call runs in the background (queued in the cache
   * module). Only a failure brings the email back - at its old position,
   * with a step-level error line - and takes the recap count back.
   * Synchronous on purpose: the panel doesn't wait for the network.
   */
  const handleArchiveGmailMessage = (message: GmailCacheMessage): void => {
    if (!settings) {
      setGmailArchiveError('Settings not loaded yet - Settings → Advanced → Reload all files.');
      return;
    }
    const index = gmailList.findIndex(m => m.uid === message.uid);
    const neighbour = index < 0 ? null : gmailList[index + 1] ?? gmailList[index - 1] ?? null;
    setGmailSelectedKey(neighbour ? neighbour.uid : null);
    setGmailArchiveError(null);
    const archiving = archiveGmailMessage(settings, message.uid);
    // archiveGmailMessage removed the message from the cache synchronously.
    setGmailMessages(getCachedGmailInbox());
    bump('gmailArchived');
    log('ReviewScreen: archiving Gmail message in background', message.uid);
    requestEinkRefresh();
    archiving
      .then(() => log('ReviewScreen: archived Gmail message', message.uid))
      .catch(e => {
        const reason = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: background Gmail archive failed', message.uid, reason);
        // The cache already put the message back at its old position.
        setGmailMessages(getCachedGmailInbox());
        if (savedVisit?.id === 'gmailInbox') bump('gmailArchived', -1);
        setGmailArchiveError(`Couldn't archive "${message.subject || '(no subject)'}": ${reason} - it's back in the list.`);
        requestEinkRefresh();
      });
  };

  /**
   * Weekly OR monthly focus toggle (generalised 2026-09-28 from the old
   * weekly-only handleToggleItemWeeklyFocus, docs/dev/technical-design-review-
   * monthly-focus.md §2/§3) - shared by the Focus reset step's two blocks
   * and the Unfocused-next-items "+ Add to Weekly/Monthly focus" pills.
   */
  const handleTogglePeriodFocus = async (item: CachedItem, scope: 'weekly' | 'monthly', value: boolean): Promise<void> => {
    if (value) {
      if (!settings) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
      const reason = focusBlockedReason(items, item.kind, scope, settings);
      if (reason) throw new Error(reason);
    }
    await setItemFocus(
      item,
      scope,
      value,
    );
    log('ReviewScreen: period focus toggled', scope, item.path, value);
    refreshFromCache();
    if (value) bump(scope === 'weekly' ? 'weeklyFocusAdded' : 'monthlyFocusAdded');
    requestEinkRefresh();
  };

  /**
   * One #next task's Someday/Maybe/Done/Cancel action from the Unfocused-next-
   * items step - same findCachedItem/saveTasks/updateItemTasks write-through
   * as every other task mutation on this screen. Someday/Maybe reuse
   * setFlowStateTag (same as handlePromoteToNext, opposite direction); Done/
   * Cancel set the task's own boolean flag directly, same soft-delete
   * convention as everywhere else (nothing is ever removed from the file).
   */
  const handleUnfocusedNextTaskAction = async (
    entry: ReviewNextTaskEntry,
    action: 'someday' | 'maybe' | 'done' | 'cancel',
  ): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.tasks[entry.taskIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextTasks = cachedItem.tasks.slice();
    if (action === 'done') {
      nextTasks[entry.taskIndex] = {...current, done: true};
    } else if (action === 'cancel') {
      nextTasks[entry.taskIndex] = {...current, cancelled: true};
    } else {
      const nextText = setFlowStateTag(current.text, action);
      nextTasks[entry.taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText)};
    }
    const nextRaw = await saveTasks(entry.item.kind, entry.item.path, cachedItem.rawContent, nextTasks, cachedItem.taskExtraLines);
    updateItemTasks(entry.item.path, nextRaw, nextTasks, cachedItem.taskExtraLines);
    log('ReviewScreen: unfocused-next task action', action, entry.item.path, entry.taskIndex);
    refreshFromCache();
    requestEinkRefresh();
  };

  /**
   * "+ Set due date" on an Unfocused-next-items task (2026-09-16, Tilman
   * feedback) - a task with no other way back onto Daily's radar can be
   * given one right here instead of leaving it stuck; `setDueTag` (same
   * helper ui/QuickAddWidget.tsx's own due-date field uses) writes/clears
   * the `#due:` tag, same findCachedItem/saveTasks/updateItemTasks write-
   * through as every other task mutation on this screen. `dueDate: null`
   * clears it (the UI's own "✕" clear affordance). Once saved,
   * reviewAggregate.ts's `nextTasksFor` excludes any task with a due date,
   * so this task drops out of the currently-viewed item's live task list on
   * the very next render - the same "note" fallback flattenUnfocusedNext
   * already shows when every #next task on an item gets resolved covers
   * this case too (a due date isn't a resolution, but it's the same "this
   * item has nothing left needing this step's attention right now" state).
   */
  const handleSetTaskDueDate = async (entry: ReviewNextTaskEntry, dueDate: string | null): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.tasks[entry.taskIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextText = setDueTag(current.text, dueDate);
    const nextTasks = cachedItem.tasks.slice();
    nextTasks[entry.taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText)};
    const nextRaw = await saveTasks(entry.item.kind, entry.item.path, cachedItem.rawContent, nextTasks, cachedItem.taskExtraLines);
    updateItemTasks(entry.item.path, nextRaw, nextTasks, cachedItem.taskExtraLines);
    log('ReviewScreen: unfocused-next task due date set', dueDate, entry.item.path, entry.taskIndex);
    refreshFromCache();
    requestEinkRefresh();
  };

  /**
   * "Add to Daily focus" on an Unfocused-next-items card - same
   * focusBlockedReason-then-setItemFocus pattern handleToggleItemWeeklyFocus
   * uses above, just scope: 'daily' and always turning the flag on (this
   * button only ever adds - the Current-focus panel's own ✕, wired to
   * handleRemoveItemFocus below, is where a slot gets freed instead).
   * Explicit resolution, so - like handleStalledArchive et al. above - it
   * also marks the card acted-on (checkmarked, stays visible - see
   * doneSnapshot's own doc comment) rather than dropping it from the frozen
   * snapshot.
   */
  const handleAddToDailyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    if (!settings) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    const reason = focusBlockedReason(items, cachedItem.kind, 'daily', settings);
    if (reason) throw new Error(reason);
    await setItemFocus(
      cachedItem,
      'daily',
      true,
    );
    log('ReviewScreen: added to daily focus', itemRef.path);
    refreshFromCache();
    bump('dailyFocusAdded');
    setUnfocusedNextActedOn(prev => new Set(prev).add(itemRef.path));
    requestEinkRefresh();
  };

  /**
   * "Add to Weekly focus" on an Unfocused-next-items card (2026-09-16,
   * round-2 requirement c) - reuses handleToggleItemWeeklyFocus (the Focus
   * Reset step's own toggle handler) rather than duplicating its
   * focusBlockedReason-then-setItemFocus shape a second time; that handler
   * already does the settings-loaded/blocked-reason check, the actual
   * setItemFocus call, refreshFromCache, and the 'weeklyFocusAdded' bump
   * when `value` is true - this just resolves the frozen `itemRef` to a live
   * `CachedItem` first (findCachedItem, same guard every other action on
   * this screen uses) and marks the card acted-on afterward, same as
   * handleAddToDailyFocus above.
   */
  const handleAddToWeeklyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    await handleTogglePeriodFocus(cachedItem, 'weekly', true);
    setUnfocusedNextActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /** "+ Add to Monthly focus" (2026-09-28, docs/dev/technical-design-review-monthly-focus.md §2) - same shape as handleAddToWeeklyFocus above. */
  const handleAddToMonthlyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    await handleTogglePeriodFocus(cachedItem, 'monthly', true);
    setUnfocusedNextActedOn(prev => new Set(prev).add(itemRef.path));
  };

  /**
   * Removes a Daily or Weekly focus slot from the Unfocused-next-items
   * step's own "Current focus" panel (round-2 requirement c) - shared by
   * both scopes since turning a focus flag *off* is never blocked
   * (focusBlockedReason only ever gates turning one *on* - see
   * handleToggleFocus/toggleFocus's own comments in ui/ItemFocusPanel.tsx),
   * so this needs no settings/blocked-reason check at all, just the same
   * setItemFocus + refreshFromCache write-through every other focus change
   * on this screen uses. Doesn't touch any step's acted-on set - removing a
   * *different* item's focus slot from this panel isn't an action on the
   * currently-selected item itself.
   *
   * Removal gets one more step (2026-09-16, Tilman feedback - widened same
   * day once the "unfocused" criterion itself was widened): reviewAggregate.
   * ts's `unfocusedNextItems` criterion is `!isFocused(item)` (neither daily
   * NOR weekly focus - storage/dailyAggregate.ts now requires either one for
   * a #next task to show on Daily view, see that file's own doc comment), so
   * removing EITHER scope can make `item` newly qualify as an unfocused-next
   * item in its own right, the moment the OTHER scope's flag is also unset -
   * a project/area you're freeing a focus slot from, right here, might
   * itself now have #next work nobody will see anywhere. Originally this
   * only ran for Daily-scope removal (back when the criterion was
   * `!dailyFocus` alone, so only a Daily removal could ever flip it); now it
   * checks whichever flag DIDN'T just change (`item`'s pre-removal value,
   * since only `scope`'s own flag is being cleared) and runs for both
   * scopes. Normally a step's left list is frozen at step-entry (this
   * file's "Frozen snapshots" convention) and wouldn't pick this up until
   * Unfocused-next-items is re-entered, but Tilman asked for it to appear
   * immediately instead - so this appends a fresh entry straight into
   * `unfocusedNextSnapshot` (only while that snapshot is already live, i.e.
   * we're on this step; harmless no-op otherwise, since re-entering the
   * step re-freezes from the aggregate anyway) rather than waiting for the
   * next freeze.
   */
  const handleRemoveItemFocus = async (item: CachedItem, scope: FocusScope): Promise<void> => {
    await setItemFocus(
      item,
      scope,
      false,
    );
    log('ReviewScreen: removed focus', item.path, scope);
    refreshFromCache();
    // Any OTHER focus level still set? (monthly joined 2026-09-28 -
    // `item` holds the pre-removal flags, so clear just `scope`'s own.)
    const otherScopeStillFocused = isFocused({
      dailyFocus: scope === 'daily' ? false : item.dailyFocus,
      weeklyFocus: scope === 'weekly' ? false : item.weeklyFocus,
      monthlyFocus: scope === 'monthly' ? false : item.monthlyFocus,
    });
    if (item.status === 'active' && !otherScopeStillFocused) {
      const itemRef: ReviewItemRef = {kind: item.kind, name: item.name, path: item.path};
      const nextTasks = nextTasksFor(itemRef, item.tasks);
      if (nextTasks.length > 0) {
        setUnfocusedNextSnapshot(prev => {
          if (prev === null) return prev;
          if (prev.some(e => e.item.path === itemRef.path)) return prev;
          return [...prev, {item: itemRef, nextTasks}];
        });
      }
    }
    requestEinkRefresh();
  };

  const handleInboxTaskDone = (taskIndex: number) => {
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const current = inbox.tasks[taskIndex];
        if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
        const nextTasks = inbox.tasks.slice();
        nextTasks[taskIndex] = {...current, done: true};
        const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
        setInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
        bump('inboxCleared');
        log('ReviewScreen: inbox task done', taskIndex);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox task done failed', message);
        setInboxActionError(message);
      }
    })();
  };

  /**
   * The soft-delete ui/TaskRow.tsx's old ✕ used to trigger - now called
   * only from ui/QuickAddWidget.tsx's "Delete" button in edit mode
   * (handleDeleteEditForWidget below), same relocation every other row in
   * this codebase got (technical-design-linked-files.md §1/§7). Returns its
   * promise (unlike before) so the caller can close edit mode only on a
   * successful save rather than unconditionally - same "close only on
   * success" fix screens/ProjectDataPanel.tsx's MeetingsSection.commitEdit
   * and screens/InboxScreen.tsx's commitTaskEdit/commitMeetingEdit already
   * got in this same pass.
   */
  const handleInboxTaskCancel = (taskIndex: number): Promise<void> => {
    setInboxActionError(null);
    return (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const current = inbox.tasks[taskIndex];
        if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
        const nextTasks = inbox.tasks.slice();
        nextTasks[taskIndex] = {...current, cancelled: true};
        const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
        setInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
        cancelEditTarget();
        bump('inboxCleared');
        log('ReviewScreen: inbox task cancelled', taskIndex);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox task cancel failed', message);
        setInboxActionError(message);
      }
    })();
  };

  /** Meeting counterpart of handleInboxTaskCancel above. */
  const handleInboxMeetingCancel = (meetingIndex: number): Promise<void> => {
    setInboxActionError(null);
    return (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const current = inbox.meetings[meetingIndex];
        if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
        const nextMeetings = inbox.meetings.slice();
        nextMeetings[meetingIndex] = {...current, cancelled: true};
        const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
        setInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
        cancelEditTarget();
        bump('inboxCleared');
        log('ReviewScreen: inbox meeting cancelled', meetingIndex);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox meeting cancel failed', message);
        setInboxActionError(message);
      }
    })();
  };

  const handleFileTask = (taskIndex: number, target: InboxFilingTarget) => {
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const result = await fileInboxTask(inbox, inboxPath, taskIndex, target);
        setInbox({...inbox, rawContent: result.inboxRawContent, tasks: result.inboxTasks});
        refreshFromCache();
        bump('inboxCleared');
        log('ReviewScreen: filed inbox task', taskIndex, '->', target.path);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: file task failed', message);
        setInboxActionError(message);
      }
    })();
  };

  const handleFileMeeting = (meetingIndex: number, target: InboxFilingTarget) => {
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const result = await fileInboxMeeting(inbox, inboxPath, meetingIndex, target);
        setInbox({...inbox, rawContent: result.inboxRawContent, meetings: result.inboxMeetings});
        refreshFromCache();
        bump('inboxCleared');
        log('ReviewScreen: filed inbox meeting', meetingIndex, '->', target.path);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: file meeting failed', message);
        setInboxActionError(message);
      }
    })();
  };

  /**
   * ui/QuickAddWidget.tsx's onQuickFile in edit mode (feature_abbrev_quick_
   * file, 2026-09-17, 2026-09-18 bugfix) - same shape as screens/
   * InboxScreen.tsx's own handleQuickFileEdit (see its doc comment for the
   * full "why"): `payload` is the widget's fully-composed, tag-stripped
   * current edit-session text/fields, so this builds the updated task/
   * meeting by spreading the stored inbox item first (done/cancelled/
   * notePath/recurrence/occurrences survive) then overlaying the edited
   * fields - "Save, but file elsewhere", not a plain move of the stale
   * last-saved copy. Appends directly via appendTaskToTarget/
   * appendMeetingToTarget rather than fileInboxTask/fileInboxMeeting (those
   * re-read inbox.tasks[index] themselves - the stale copy this is
   * avoiding), then removes the original from the Inbox via saveTasks/
   * saveMeetings directly, same as this screen's other Inbox mutations
   * above - target-first, source-removal-second. Deliberately doesn't
   * go through handleFileTask/handleFileMeeting above (which exist for the
   * Browse-picker path, handleInboxFilePick, and swallow errors into
   * inboxActionError) - onQuickFile's contract needs a real rejecting
   * Promise so QuickAddWidget's own handleQuickFile can show the failure
   * inline. Closes edit mode (cancelEditTarget) only once the move
   * succeeds.
   */
  const handleQuickFileEdit = async (target: AbbrevFileMatch, payload: QuickFilePayload): Promise<void> => {
    if (!editTarget) return;
    if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
    const index = editTarget.index;
    if (editTarget.type === 'task' && payload.kind === 'task') {
      const stored = inbox.tasks[index];
      if (!stored) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
      const updated: Task = {...stored, text: payload.text, ...deriveTaskFields(payload.text), linkedFile: payload.linkedFile};
      await appendTaskToTarget(target, updated);
      const nextTasks = inbox.tasks.filter((_, i) => i !== index);
      const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
      setInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
    } else if (editTarget.type === 'meeting' && payload.kind === 'meeting') {
      const stored = inbox.meetings[index];
      if (!stored) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
      const updated: Meeting = applyMeetingEdit(stored, payload.fields, payload.linkedFile);
      await appendMeetingToTarget(target, updated);
      const nextMeetings = inbox.meetings.filter((_, i) => i !== index);
      const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
      setInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
    } else {
      return; // mismatched kinds shouldn't happen - editTarget.type gates which tab the widget shows
    }
    refreshFromCache();
    bump('inboxCleared');
    log('ReviewScreen: quick-filed inbox', editTarget.type, index, '->', target.path);
    cancelEditTarget();
  };

  /**
   * Arm/cancel helpers for the Inbox-to-zero step's Files pane
   * (docs/dev/technical-design-filing-unification.md §5.2) - mirror
   * screens/InboxScreen.tsx's own armLinkTarget/armFileTarget/cancelArming.
   *
   * No longer clears editTarget (2026-09-09 bugfix - see
   * screens/InboxScreen.tsx's own armLinkTarget doc comment for the full
   * "why": both are only ever reached from inside an open edit now (Link
   * from the row's own clip, Refile from QuickAddWidget's edit-mode
   * button), so clearing editTarget here just closed the edit the tap came
   * from, wiping the widget's fields back to its empty create-mode draft.
   * cancelEditTarget below now cancels any open arm itself instead, on
   * whatever actually closes the edit (Cancel, or a successful Save/Delete)
   * - a cleaner place for it than every arm-starting call, and it means an
   * arm never outlives the edit it was started from.
   */
  const armInboxLinkTarget = (type: 'task' | 'meeting', index: number) => {
    setInboxZeroArmTarget({type, index, intent: 'link'});
  };
  const armInboxFileTarget = (type: 'task' | 'meeting', index: number) => {
    setInboxZeroArmTarget({type, index, intent: 'file'});
  };
  const cancelInboxArming = () => setInboxZeroArmTarget(null);

  // One-edit-at-a-time guard (design doc §6) - mirrors ProjectDataPanel.tsx/
  // InboxScreen.tsx's own startEditTarget/cancelEditTarget exactly. Also
  // clears any open arm target, same as the two start* functions below used
  // to do individually before this state merge - only one of arming or
  // editing is ever active at a time in this step (pre-existing invariant,
  // unrelated to this pass).
  // Save-then-switch (docs/dev/technical-design-meeting-lists.md §10, 2026-09-29) -
  // replaces the old "Finish edit!" block.
  const {flushEditRef, afterSave} = useEditFlush();
  // Meetings to close out: 1-line/2-line switch like every meeting list (session-only, ui/listLayout.ts).
  const [closeOutLayout, setCloseOutLayout] = useListLayout('reviewCloseOut', 'twoLine');
  const startEditTarget = (target: InboxEditTarget) =>
    afterSave(() => {
      setEditTarget(target);
      setBlockedMessage(null);
      setInboxZeroArmTarget(null);
    });
  /** Also cancels any open arm (2026-09-09) - see armInboxLinkTarget/armInboxFileTarget's own note above. */
  const cancelEditTarget = () => {
    setEditTarget(null);
    setInboxZeroArmTarget(null);
    setBlockedMessage(null);
  };

  const startEditingInboxTask = (taskIndex: number) => {
    startEditTarget({type: 'task', index: taskIndex});
  };
  const startEditingInboxMeeting = (meetingIndex: number) => {
    startEditTarget({type: 'meeting', index: meetingIndex});
  };

  // 'browse' (2026-09-09, replacing the old separate 'projects'/'areas'
  // roots) is the two-level Projects/Areas browser - see
  // screens/InboxScreen.tsx's own rootPathFor for the full note.
  const inboxZeroRootPathFor = (root: string): string | null =>
    root === 'resources' ? paths?.resources ?? null : root === 'browse' ? paths?.base ?? null : null;

  /** `arming` mode's onPick for intent 'link' - same shape as screens/InboxScreen.tsx's handlePickLinkedFile (docs/dev/technical-design-filing-unification.md §5.2). */
  const handleInboxLinkPick = (root: string, relativePath: string) => {
    const rootPath = inboxZeroRootPathFor(root);
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath || !paths || !rootPath || !inboxZeroArmTarget) {
          throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        }
        const absolutePath = `${rootPath.replace(/\/+$/, '')}/${relativePath}`;
        const linkedFile = toLinkedFile(paths, absolutePath);
        if (inboxZeroArmTarget.type === 'task') {
          const current = inbox.tasks[inboxZeroArmTarget.index];
          if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
          const nextTasks = inbox.tasks.slice();
          nextTasks[inboxZeroArmTarget.index] = {...current, linkedFile};
          const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
          setInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
        } else {
          const current = inbox.meetings[inboxZeroArmTarget.index];
          if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
          const nextMeetings = inbox.meetings.slice();
          nextMeetings[inboxZeroArmTarget.index] = {...current, linkedFile};
          const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
          setInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
        }
        log('ReviewScreen: linked inbox item', inboxZeroArmTarget.type, inboxZeroArmTarget.index, '->', relativePath);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: link inbox item failed', message);
        setInboxActionError(message);
      } finally {
        setInboxZeroArmTarget(null);
      }
    })();
  };

  /** `arming` mode's onPick for intent 'file' - resolveFilingPick only ever sees 'projects'/'areas' since Resources isn't offered as a root while file-arming (docs/dev/technical-design-filing-unification.md §5.2, mirroring screens/InboxScreen.tsx's handlePickFile). */
  const handleInboxFilePick = (root: string, relativePath: string) => {
    if (!paths || !inboxZeroArmTarget || inboxZeroArmTarget.intent !== 'file') return;
    const target = resolveFilingPick(paths, root, relativePath);
    if (!target) return;
    if (inboxZeroArmTarget.type === 'task') handleFileTask(inboxZeroArmTarget.index, target);
    else handleFileMeeting(inboxZeroArmTarget.index, target);
    setInboxZeroArmTarget(null);
  };

  /**
   * Inline edit/note-link handlers for Inbox tasks/meetings
   * (docs/dev/technical-design-inbox-tab.md §1, 2026-09-03: Review's Inbox-to-zero
   * cards gain full row parity via the shared ui/TaskRow.tsx/ui/MeetingRow.tsx,
   * same as Daily view and Project/Area's own rows) - same
   * save-shape (saveTasks/saveMeetings against `inbox` state, then setInbox)
   * as handleInboxTaskDone/handleInboxTaskCancel/handleInboxMeetingCancel
   * above, and (2026-09-22, Slice 3 of docs/dev/technical-design-shared-note-
   * pages.md) the same `openOrCreateTodoNote`/`openOrCreateMeetingNote`
   * DailyView.tsx's own Inbox-sourced rows use, with `forceOwnTarget: true`
   * (Inbox.txt lives at `inboxPath` itself, so `inboxPath` stands in for the
   * "item path" those functions normally take, and there's no Project/Area
   * to anchor a shared file to - see `handleInboxTaskNote`'s own doc
   * comment).
   */
  const handleInboxTaskSave = (taskIndex: number, nextText: string, nextLinkedFile: string): Promise<boolean> => {
    setInboxActionError(null);
    return (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const current = inbox.tasks[taskIndex];
        if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
        const nextTasks = inbox.tasks.slice();
        nextTasks[taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText), linkedFile: nextLinkedFile};
        const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
        setInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
        cancelEditTarget();
        log('ReviewScreen: inbox task edited', taskIndex);
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox task edit failed', message);
        setInboxActionError(message);
        return false;
      }
    })();
  };

  /**
   * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md §6/§9,
   * Slice 3, 2026-09-22): replaces the old separate handleInboxCreateTaskNote/
   * handleInboxOpenTaskNote pair with one call into `openOrCreateTodoNote`.
   * `forceOwnTarget: true` - same §9 Inbox exclusion as InboxScreen.tsx's own
   * handlers (Inbox.txt lives at `inboxPath` itself, so there's no Project/
   * Area to anchor a shared file to).
   */
  const handleInboxTaskNote = (taskIndex: number) => {
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const currentSettings = settings ?? (await loadSettings());
        const {task, changed} = await openOrCreateTodoNote(inbox.tasks[taskIndex], inboxPath, currentSettings, {tasks: inbox.tasks}, {
          forceOwnTarget: true,
          confirmCreate: confirmNoteCreate,
        });
        if (changed) {
          const nextTasks = inbox.tasks.slice();
          nextTasks[taskIndex] = task;
          const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
          setInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
        }
        log('ReviewScreen: inbox task note opened/created', taskIndex);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox task note open/create failed', message);
        setInboxActionError(message);
      }
    })();
  };

  const handleInboxMeetingStartEdit = (meetingIndex: number) => {
    startEditingInboxMeeting(meetingIndex);
  };

  /**
   * ui/QuickAddWidget.tsx's meeting-edit mode onSaveEdit - `fields` has
   * already been validated/normalized by its own submit(), so this only
   * needs to write through (same shape as screens/InboxScreen.tsx's
   * commitMeetingEdit).
   */
  const handleInboxMeetingCommitEdit = (meetingIndex: number, fields: MeetingQuickAddFields, nextLinkedFile: string): Promise<boolean> => {
    setInboxActionError(null);
    return (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const current = inbox.meetings[meetingIndex];
        if (!current) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
        const nextMeetings = inbox.meetings.slice();
        nextMeetings[meetingIndex] = applyMeetingEdit(current, fields, nextLinkedFile);
        const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
        setInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
        cancelEditTarget();
        log('ReviewScreen: inbox meeting edited', meetingIndex);
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox meeting edit failed', message);
        setInboxActionError(message);
        return false;
      }
    })();
  };

  /**
   * Inbox-to-zero's own "add a meeting" (docs/dev/technical-design-pagination-
   * edit-reuse.md §5) - a genuinely new capability this step never had
   * (unlike Tasks, which already had handleAddTask). Introduced because the
   * edit-reuse pattern needs an always-rendered fixed-slot form to swap into
   * edit mode - the same QuickAddWidget fixedDestination=inbox shape
   * screens/InboxScreen.tsx already uses.
   *
   * 2026-09-20: now honours `destination` (via storage/itemMutations.ts, the
   * same path handleAddTask uses). It used to ignore it - so a title typed
   * with a Project/Area `#ABBR` tag (button reading "+ Add to <Name>", tag
   * stripped from the saved title) was silently filed to the Inbox instead.
   */
  const handleAddInboxMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, {inbox, inboxPath});
    if (nextInbox) setInbox(nextInbox);
    else refreshFromCache();
    log('ReviewScreen: added meeting', destinationLabel(destination));
  };

  /** Meeting counterpart of handleInboxTaskNote above - see its doc comment, including `forceOwnTarget: true`. */
  const handleInboxMeetingNote = (meetingIndex: number) => {
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        const currentSettings = settings ?? (await loadSettings());
        const {meeting, changed} = await openOrCreateMeetingNote(
          inbox.meetings[meetingIndex],
          inboxPath,
          currentSettings,
          {tasks: inbox.tasks},
          {forceOwnTarget: true, confirmCreate: confirmNoteCreate},
        );
        if (changed) {
          const nextMeetings = inbox.meetings.slice();
          nextMeetings[meetingIndex] = meeting;
          const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
          setInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
        }
        log('ReviewScreen: inbox meeting note opened/created', meetingIndex);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox meeting note open/create failed', message);
        setInboxActionError(message);
      }
    })();
  };

  /** Inbox-to-zero's meeting rows' prep/review checkpoint icon (docs/dev/technical-design-meeting-tracking.md) - same write-through shape as the other Inbox meeting handlers above, then an explicit e-ink flush for the direct tap. */
  const handleInboxToggleMeetingTracking = (meetingIndex: number, kind: MeetingTrackingKind) => {
    setInboxActionError(null);
    (async () => {
      try {
        if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
        if (!inbox.meetings[meetingIndex]) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
        const nextMeetings = toggleMeetingTrackingAt(inbox.meetings, meetingIndex, kind);
        const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
        setInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
        requestEinkRefresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ReviewScreen: inbox meeting tracking toggle failed', message);
        setInboxActionError(message);
      }
    })();
  };

  const inboxMeetingTrackingFor = (meetingIndex: number): MeetingTrackingConfig => ({
    rules: settings?.noteCreationDefinitions ?? [],
    onToggle: kind => handleInboxToggleMeetingTracking(meetingIndex, kind),
  });

  // No usePagination(..., PAGE_SIZE.review) here any more (2026-09-16,
  // docs/dev/technical-design-review-master-detail.md §3/§7) - each of these
  // five lists is now a `ui/ReviewMasterDetail.tsx` left list, which wraps
  // its own `PagedSection` internally (see that component's module doc
  // comment) rather than this screen pre-paginating it. Inbox-to-zero's own
  // two full-width lists further down are ALSO converted now (2026-09-16,
  // follow-up pass) - see REVIEW_INBOX_TASKS_WEIGHT/
  // REVIEW_INBOX_MEETINGS_WEIGHT above and renderInboxZero below -
  // making this screen's own `usePagination`/`<PageControls>` call sites
  // fully gone, which in turn retires `usePagination`/`Paged<T>`/
  // `ui/PageControls.tsx` app-wide (verified zero other importers before
  // this pass).
  const stalledList = stalledSnapshot ?? aggregate?.stalledProjects ?? [];
  const neglectedList = neglectedSnapshot ?? aggregate?.neglectedAreas ?? [];
  const closeOutList = closeOutSnapshot ?? aggregate?.meetingsToClose ?? [];
  const doneList = doneSnapshot ?? aggregate?.doneProjects ?? [];
  const onHoldList = onHoldSnapshot ?? aggregate?.onHoldItems ?? [];
  const unfocusedNextList = unfocusedNextSnapshot ?? aggregate?.unfocusedNextItems ?? [];
  // Computed once per render so every ItemContextBlock/ItemGoalRow instance
  // in the currently-rendered step agrees on "now" - see
  // ui/ItemContextBlock.tsx's own currentWeekKey doc comment.
  const currentWeekKey = isoWeekKey(new Date());

  const inboxOpenTasks = (inbox?.tasks ?? [])
    .map((task, taskIndex) => ({task, taskIndex}))
    .filter(({task}) => !task.cancelled && !task.done);
  // Only meetings dated today or later (2026-09-21): a past meeting sitting
  // in the Inbox can't be prepared for any more, so it neither shows in the
  // Inbox-to-zero list nor counts toward the hub's number for this step
  // (stepCounts below is derived from this same list). It stays in
  // Inbox.txt and in the Inbox tab - only this review step ignores it.
  const inboxOpenMeetings = (inbox?.meetings ?? [])
    .map((meeting, meetingIndex) => ({meeting, meetingIndex}))
    .filter(({meeting}) => !meeting.cancelled && isTodayOrFuture(meeting.date));

  // Gmail inbox step's own left list - `gmailMessages` (this visit's fetch,
  // or `null` before the first one lands) filtered by settings.gmailHideHandled
  // ("has at least one Todo/Meeting created from it this visit" -
  // gmailCreatedItems; a message handled on a PREVIOUS visit has no way to
  // be known as such here, since Gmail itself carries no such marker - see
  // domain/settings.ts's own gmailHideHandled doc comment).
  const gmailList = (gmailMessages ?? []).filter(
    message => !settings?.gmailHideHandled || !(gmailCreatedItems[message.uid]?.length > 0),
  );

  // The hub's per-step numbers (storage/reviewAggregate.ts's
  // buildReviewStepCounts) - live from the same aggregate the steps read, so
  // the hub and a step can't disagree about what is in it. Null until the
  // first load has produced both the aggregate and the settings.
  const stepCounts =
    aggregate && settings
      ? buildReviewStepCounts(
          aggregate,
          inboxOpenTasks.length + inboxOpenMeetings.length,
          items,
          settings,
          gmailMessages?.length ?? 0,
          (() => {
            const week = weekAheadRangeIso();
            return countMeetingsInRange(inbox?.meetings ?? [], week.start, week.end);
          })(),
        )
      : null;
  // Backlog steps with nothing in them, as a stable string so the effect
  // below only re-runs when that SET changes, not on every render.
  const emptyBacklogKey = stepCounts
    ? activeSteps.filter(def => def.kind === 'backlog' && stepCounts[def.id].n === 0)
        .map(def => def.id)
        .join(',')
    : null;

  /**
   * Keeps settings.reviewSteps' `emptyAt` stamps in step with what the hub
   * sees (docs/dev/technical-design-review-hub.md §7 - why this is persisted at
   * all: the tab badge lives in App.tsx, which has no review aggregate to ask
   * "is this step empty?"). Runs only while the hub is showing and data is
   * loaded, and writes only when applyEmptyStamps says something changed (an
   * empty step is re-stamped at most once a day), so it settles after one
   * pass instead of looping on its own write.
   */
  useEffect(() => {
    if (view.kind !== 'hub' || loading || emptyBacklogKey === null || !settings) return;
    const emptyIds = emptyBacklogKey === '' ? [] : (emptyBacklogKey.split(',') as ReviewStepId[]);
    const now = new Date();
    if (applyEmptyStamps(settings.reviewSteps, emptyIds, now, activeSteps) === settings.reviewSteps) return;
    updateReviewSteps(steps => applyEmptyStamps(steps, emptyIds, now, activeSteps))
      .then(saved => {
        setSettings(saved);
        onReviewRecorded?.();
      })
      .catch(e => logError('ReviewScreen: empty-step stamp failed', e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loading, emptyBacklogKey, settings?.reviewSteps]);
  // Derived from editTarget rather than their own state - see the module
  // doc comment's "Inbox to zero's own edit-target state" note. Everything
  // below that reads these two (TaskRow/MeetingRow's isEditing, the widget's
  // onSaveEdit* wiring, handleDeleteEditForWidget) is unchanged from before.
  const editingInboxTaskIndex = editTarget?.type === 'task' ? editTarget.index : null;
  const editingInboxMeetingIndex = editTarget?.type === 'meeting' ? editTarget.index : null;
  const editingInboxTask = editingInboxTaskIndex !== null ? inbox?.tasks[editingInboxTaskIndex] ?? null : null;
  const editingInboxMeeting = editingInboxMeetingIndex !== null ? inbox?.meetings[editingInboxMeetingIndex] ?? null : null;

  // Linked-file treatment (technical-design-linked-files.md §9.1 gave this a
  // read-only clip; docs/dev/technical-design-filing-unification.md §5 makes it
  // fully armable, same as screens/InboxScreen.tsx). linkedFileMissing
  // mirrors screens/ProjectDataPanel.tsx's identical effect - the editing
  // item's own linkedFile (if any) still resolving to a real file, resolved
  // async so QuickAddWidget stays free of I/O. Also feeds the
  // 'locating' branch of inboxZeroLinkTarget below, same as
  // screens/InboxScreen.tsx's editingItem.
  const editingInboxItem: Task | Meeting | null = editingInboxTask ?? editingInboxMeeting ?? null;
  const [inboxLinkedFileMissing, setInboxLinkedFileMissing] = useState(false);
  useEffect(() => {
    if (!editingInboxItem?.linkedFile || !paths) {
      setInboxLinkedFileMissing(false);
      return;
    }
    let cancelled = false;
    linkedFileStatus(paths, editingInboxItem.linkedFile).then(status => {
      if (!cancelled) setInboxLinkedFileMissing(status === 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [editingInboxItem?.linkedFile, paths]);

  const onOpenInboxLinkedFile = (linkedFile: string) => {
    if (!paths) return;
    openPath(resolveLinkedFilePath(paths, linkedFile)).catch(e =>
      logError('ReviewScreen: open linked file failed', e instanceof Error ? e.message : String(e)),
    );
  };

  const armingInboxTaskIndex = inboxZeroArmTarget?.type === 'task' ? inboxZeroArmTarget.index : null;
  const armingInboxMeetingIndex = inboxZeroArmTarget?.type === 'meeting' ? inboxZeroArmTarget.index : null;

  // See the module doc comment's "Linked-file treatment" note above on why
  // `paths.resources` doubles as the "item root" argument here (identical
  // reasoning to screens/InboxScreen.tsx's own locating branch).
  // `root: 'browse'` (2026-09-09, was 'projects') - see
  // screens/InboxScreen.tsx's own linkTarget for the full note.
  const inboxZeroLinkTarget: LinkTarget | null = inboxZeroArmTarget
    ? inboxZeroArmTarget.intent === 'file'
      ? {mode: 'arming', onPick: handleInboxFilePick, onCancel: cancelInboxArming, pickKind: 'folder', label: ARMING_TEXT.refile(inboxZeroArmTarget.type), root: 'browse'}
      : {mode: 'arming', onPick: handleInboxLinkPick, onCancel: cancelInboxArming, label: ARMING_TEXT.link(inboxZeroArmTarget.type)}
    : editingInboxItem?.linkedFile && paths
    ? (() => {
        const location = locateLinkedFile(paths, paths.resources, editingInboxItem.linkedFile);
        if (!location) return null;
        return {
          mode: 'locating' as const,
          root: 'resources',
          folderPath: location.folderPath,
          fileName: location.fileName,
          fileMissing: inboxLinkedFileMissing,
        };
      })()
    : null;

  // Active-only, same entryFilter screens/InboxScreen.tsx uses (docs/
  // technical-design-filing-unification.md §3.1/§5.1) - always applied to
  // Browse's own per-category listings regardless of arm state (Tilman:
  // only the top-level Projects/Areas management tabs, not Browse, show
  // every status).
  const inboxZeroActiveOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
  // Resources is disabled (not removed - see ui/FileBrowserPane.tsx's
  // `disabled` doc comment) while file-arming, same 2026-09-09 rework as
  // screens/InboxScreen.tsx's own fileBrowserRoots.
  const inboxZeroIsFileArming = inboxZeroArmTarget?.intent === 'file';
  const inboxZeroFileBrowserRoots: FileBrowserRoot[] = paths
    ? [
        {key: 'resources', label: 'Resources', rootPath: paths.resources, disabled: inboxZeroIsFileArming},
        {
          key: 'browse',
          label: 'Browse',
          rootPath: paths.base,
          sources: [
            {kind: 'project', path: paths.projects, label: 'Projects'},
            {kind: 'area', path: paths.areas, label: 'Areas'},
          ],
          entryFilter: inboxZeroActiveOnly,
          onNavigateToItem: (kind, name, path) => onOpenItem(kind, {name, path, isFolder: true}),
        },
      ]
    : [];

  /** ui/QuickAddWidget.tsx's onDeleteEdit - single entry point since only one of editingInboxTaskIndex/editingInboxMeetingIndex can be set at a time (this step's own §6 guard). handleInboxTaskCancel/handleInboxMeetingCancel do the actual mutation and close edit mode themselves, on success. */
  const handleDeleteEditForWidget = () => {
    if (editingInboxTaskIndex !== null) handleInboxTaskCancel(editingInboxTaskIndex);
    else if (editingInboxMeetingIndex !== null) handleInboxMeetingCancel(editingInboxMeetingIndex);
  };

  /**
   * Week ahead (docs/dev/technical-design-meeting-lists.md §4.6): the Week screen
   * itself, screens/ReviewWeekAhead.tsx (WeekPlanner + its own planning
   * hook). On leaving it, this screen re-reads what that step may have
   * changed: the aggregate (from the warm cache) and its own Inbox copy, so a
   * later Inbox-to-zero save never writes over a meeting added here.
   */
  const reloadAfterWeekAhead = () => {
    refreshFromCache();
    const cache = getCachedData();
    if (!cache) return;
    loadProjectFile('inbox', cache.paths.inboxFolder)
      .then(setInbox)
      .catch(e => logError('ReviewScreen: inbox reload after week ahead failed', e instanceof Error ? e.message : String(e)));
  };

  const renderWeekAhead = () => (
    <View style={styles.weekAheadRoot}>
      <ReviewWeekAhead
        onOpenItem={onOpenItem}
        onOpenCalendarSettings={onOpenCalendarSettings}
        onLeave={reloadAfterWeekAhead}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    </View>
  );

  /**
   * Meetings to close out (docs/dev/technical-design-meeting-tracking.md §5) -
   * the sixth ReviewMasterDetail step: past meetings whose Tag Rule tracks
   * "review after" and that aren't `#reviewed` yet (storage/reviewAggregate.ts's
   * meetingsToClose, last REVIEW_LOOKBACK_DAYS days). Same frozen-membership/
   * acted-on/write-through conventions as the item-based steps below.
   */
  const renderCloseOutDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No meeting selected"
          text={`These meetings are over, their Tag Rule asks for a review, and you haven't ticked it yet (last ${REVIEW_LOOKBACK_DAYS} days). Note down follow-ups as todos, then mark the meeting reviewed.`}
          hint="Tap a meeting on the left to get started."
          textColor={textColor}
        />
      );
    }
    const entry = closeOutList.find(e => closeOutKey(e) === selectedKey);
    if (!entry) return null;
    const live = reviewCurrentItem(entry.item, items).meetings[entry.meetingIndex] ?? entry.meeting;
    const reviewed = resolveMeetingTracking(live, settings?.noteCreationDefinitions ?? [])?.done ?? false;
    const related = relatedItemsFor(items, inbox ? {tasks: inbox.tasks} : null, live.tags.filter(isContextTag));
    return (
      <MeetingCloseOutDetail
        entry={entry}
        meeting={live}
        reviewed={reviewed}
        related={related}
        onOpenItem={openReviewItem}
        onToggleReviewed={handleToggleCloseOutReviewed}
        onOpenNote={handleOpenCloseOutNote}
        onAddTask={handleAddTask}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderCloseOut = () => (
    <ReviewMasterDetail<ReviewMeetingEntry>
      header="Meetings to close out"
      headerAccessory={<LayoutSwitch layout={closeOutLayout} onChange={setCloseOutLayout} textColor={textColor} />}
      rows={closeOutList}
      rowHeight={() => MEETING_ROW_HEIGHT[closeOutLayout]}
      isSelectable={() => true}
      rowKey={closeOutKey}
      renderRow={(entry, selected, actedOn) => (
        // The standard row as a selector (docs/dev/technical-design-meeting-lists.md
        // §3): date+time column, source, no actions - the tap selects (the
        // master-detail shell owns it); acted-on rows are greyed with a ✓.
        <CloseOutMeetingRow
          entry={entry}
          items={items}
          layout={closeOutLayout}
          state={selected ? 'selected' : actedOn ? 'done' : undefined}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderCloseOutDetail}
      actedOnKeys={closeOutActedOn}
      resetKey={stepEntryToken}
      emptyHint="No meetings waiting for a review - nice."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

  /**
   * Gmail inbox (docs/dev/technical-design-review-gmail-inbox.md) - a
   * ReviewMasterDetail step like Meetings to close out above, but its rows
   * come from storage/gmailInboxCache.ts's own IMAP-backed cache
   * (`gmailList`) rather than the local item cache, and there is no frozen-
   * membership snapshot: an archived message leaves the list immediately
   * (2026-09-28, background archive - handleArchiveGmailMessage), anything
   * else leaves it in place, so `gmailActedOn` is a plain checkmark, not a
   * "still shown despite no longer matching" marker like the five converted
   * steps' own acted-on sets. Selection is controlled here
   * (`gmailSelectedKey`) so an archive can move it to the next email.
   */
  const renderGmailInboxDetail = (selectedKey: string | null): React.ReactNode => {
    if (!settings) return null;
    if (!isGmailConfigured(settings)) {
      return (
        <ReviewEmptyDetail
          title="Gmail isn't set up yet"
          text="Add your Gmail address and an app password in Settings → Gmail to triage your inbox here."
          hint="Settings → Gmail."
          textColor={textColor}
        />
      );
    }
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No email selected"
          text="Turn an email into a todo or meeting, save its text or an attachment alongside it, then archive it - all without leaving this step."
          hint="Tap an email on the left to get started."
          textColor={textColor}
        />
      );
    }
    const message = gmailList.find(m => m.uid === selectedKey);
    if (!message) return null;
    return (
      <GmailDetailPanel
        message={message}
        createdItems={gmailCreatedItems[message.uid] ?? []}
        onFetchBody={handleFetchGmailBody}
        onAddTask={handleAddGmailTask}
        onAddMeeting={handleAddGmailMeeting}
        onLinkArtifact={handleLinkGmailArtifact}
        onArchive={handleArchiveGmailMessage}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderGmailInbox = () => {
    if (settings && !isGmailConfigured(settings)) {
      return (
        <View style={styles.stackedColumn}>
          <ReviewEmptyDetail
            title="Gmail isn't set up yet"
            text="Add your Gmail address and an app password in Settings → Gmail to triage your inbox here."
            hint="Settings → Gmail."
            textColor={textColor}
          />
        </View>
      );
    }
    return (
      <View style={styles.stackedColumn}>
        <View style={styles.gmailToolbar}>
          <MarkWrap mark={(gmailError && !gmailLoading) || gmailArchiveError ? 'warning' : null} textColor={textColor}>
            <Pressable style={[styles.pill, {borderColor}]} disabled={gmailLoading} onPress={loadGmailInbox} hitSlop={8}>
              <GmailRefreshLabel
                loading={gmailLoading}
                fetchedAt={gmailMessages === null ? null : gmailFetchedAt}
                textColor={textColor}
              />
            </Pressable>
          </MarkWrap>
        </View>
        <ReviewMasterDetail<GmailCacheMessage>
          header="Gmail inbox"
          rows={gmailList}
          rowHeight={() => GMAIL_ROW_PX}
          isSelectable={() => true}
          rowKey={message => message.uid}
          renderRow={(message, selected, actedOn) => (
            <GmailEmailRow message={message} selected={selected} actedOn={actedOn} textColor={textColor} borderColor={borderColor} />
          )}
          renderDetail={renderGmailInboxDetail}
          actedOnKeys={gmailActedOn}
          resetKey={stepEntryToken}
          selectedKey={gmailSelectedKey}
          onSelectedKeyChange={setGmailSelectedKey}
          emptyHint={
            gmailLoading
              ? 'Loading…'
              : gmailMessages === null
              ? gmailError
                ? 'Nothing loaded - see the message at the top, then tap Refresh.'
                : 'Not loaded yet - tap "Load Gmail inbox" above to fetch it.'
              : 'Gmail inbox is at zero. 🎉'
          }
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
    );
  };

  const renderInboxZero = () => {
    return (
      <View style={styles.body}>
        <View style={[styles.leftPane, {borderColor}]}>
          <Text style={[styles.paneTitle, {color: textColor}]}>Files</Text>
          <FileBrowserPane
            roots={inboxZeroFileBrowserRoots}
            linkTarget={inboxZeroLinkTarget}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
        <View style={styles.rightPane}>
        <Text style={[common.hint, {color: textColor}]}>
          Clear every capture: file it to a Project/Area, finish it on the spot, or cancel it.
        </Text>

        {/* One shared widget above both lists (2026-09-09, docs/technical-
            design-unified-quickadd.md §3/§8) - it isn't Tasks- or Meetings-
            exclusive, so it sits above both rather than nested in either,
            same placement rule ProjectDataPanel.tsx/InboxScreen.tsx already
            applied in step 2. */}
        <QuickAddWidget
          fixedDestination={FIXED_INBOX_DESTINATION}
          onAddTask={handleAddTask}
          onAddMeeting={handleAddInboxMeeting}
          editingTask={
            editingInboxTask ? {...editingInboxTask, text: displayTaskText(editingInboxTask, 'flat')} : undefined
          }
          editingMeeting={editingInboxMeeting ?? undefined}
          onSaveEditTask={
            editingInboxTaskIndex !== null
              ? (nextText, nextLinkedFile) => handleInboxTaskSave(editingInboxTaskIndex, nextText, nextLinkedFile)
              : undefined
          }
          onSaveEditMeeting={
            editingInboxMeetingIndex !== null
              ? (fields, nextLinkedFile) => handleInboxMeetingCommitEdit(editingInboxMeetingIndex, fields, nextLinkedFile)
              : undefined
          }
          editTargetKey={editTarget ? `${editTarget.type}:${editTarget.index}` : null}
          flushEditRef={flushEditRef}
          onCancelEdit={cancelEditTarget}
          onDeleteEdit={handleDeleteEditForWidget}
          onRefile={editTarget ? () => armInboxFileTarget(editTarget.type, editTarget.index) : undefined}
          onQuickFile={editTarget ? handleQuickFileEdit : undefined}
          linkedFileMissing={inboxLinkedFileMissing}
          blockedMessage={blockedMessage ?? undefined}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />

        <View style={[common.divider, {backgroundColor: borderColor}]} />

        {/* Flex-weight stacking (2026-09-17, docs/dev/technical-design-flex-
            weight-stacking.md §3.4) - stackedColumn (flex:1) splits its
            real available height 8:6 between the Tasks/Meetings
            PagedSections below via plain sibling `flex` weights. */}
        <View style={styles.stackedColumn}>
        <View style={{flex: REVIEW_INBOX_TASKS_WEIGHT}}>
        {/* "Tasks" heading + PageControls merged into one PagedSection
            (2026-09-16, same mechanical swap Batch 2 already made for
            screens/InboxScreen.tsx's own Tasks pane) - the old separate
            `{inboxOpenTasks.length === 0 && <Text>...}` folds into
            `emptyHint`. No header/group rows here (unlike InboxScreen's own
            flow-state-grouped list), so no `isCountableRow` needed - every
            row in `inboxOpenTasks` is a real entry. */}
        <PagedSection
          header="Tasks"
          rows={inboxOpenTasks}
          rowHeight={({task}) => taskRowHeight(task, COLUMN_WIDTH_PX, 'flat')}
          renderRow={({task, taskIndex}) => (
            <TaskRow
              key={`task-${taskIndex}`}
              task={task}
              isEditing={editingInboxTaskIndex === taskIndex}
              isArming={armingInboxTaskIndex === taskIndex}
              onStartEdit={() => startEditingInboxTask(taskIndex)}
              onToggleDone={() => handleInboxTaskDone(taskIndex)}
              onCreateNote={() => handleInboxTaskNote(taskIndex)}
              onOpenNote={() => handleInboxTaskNote(taskIndex)}
              linkedFile={task.linkedFile}
              onOpenLinkedFile={onOpenInboxLinkedFile}
              onArmLink={() => armInboxLinkTarget('task', taskIndex)}
              context="flat"
              height={taskRowHeight(task, COLUMN_WIDTH_PX, 'flat')}
              numberOfLines={taskRowLines(task, COLUMN_WIDTH_PX, 'flat')}
              textColor={textColor}
              borderColor={borderColor}
            />
          )}
          emptyHint="Inbox tasks are at zero. 🎉"
          textColor={textColor}
          borderColor={borderColor}
        />
        </View>

        <View style={[common.divider, {backgroundColor: borderColor}]} />

        <View style={{flex: REVIEW_INBOX_MEETINGS_WEIGHT}}>
        {/* The standard MeetingList (docs/dev/technical-design-meeting-lists.md
            §4.4) - same rows and options as InboxScreen.tsx's Meetings pane:
            1-line by default, date+time column, no source (all Inbox). */}
        <MeetingList
          listId="reviewInbox"
          defaultLayout="oneLine"
          header="Meetings"
          rows={inboxOpenMeetings}
          renderRow={({meeting, meetingIndex}, layout) => (
            <MeetingRow
              key={`meeting-${meetingIndex}`}
              meeting={meeting}
              layout={layout}
              time="dateTime"
              highlight="mark"
              tracking={inboxMeetingTrackingFor(meetingIndex)}
              note={{onOpen: () => handleInboxMeetingNote(meetingIndex), onCreate: () => handleInboxMeetingNote(meetingIndex)}}
              file={{
                linkedFile: meeting.linkedFile,
                onOpen: onOpenInboxLinkedFile,
                onArm: () => armInboxLinkTarget('meeting', meetingIndex),
              }}
              onPress={() => handleInboxMeetingStartEdit(meetingIndex)}
              state={
                editingInboxMeetingIndex === meetingIndex
                  ? 'editing'
                  : armingInboxMeetingIndex === meetingIndex
                  ? 'arming'
                  : undefined
              }
              textColor={textColor}
              borderColor={borderColor}
            />
          )}
          emptyHint="Inbox meetings are at zero. 🎉"
          textColor={textColor}
          borderColor={borderColor}
        />
        </View>
        </View>

        </View>
      </View>
    );
  };

  /**
   * Stalled projects / Neglected areas / Done awaiting review / On Hold
   * reconsideration (2026-09-16, docs/dev/technical-design-review-master-
   * detail.md §3/§5) - all four are now `ui/ReviewMasterDetail.tsx`
   * instances over a flat `ReviewItemRef`/`ReviewProjectEntry` list, sharing
   * `ReviewLeftRow` for their left-list rows. Unfocused next items keeps its
   * own flattened-rows shape (grouped by parent item) - see
   * renderUnfocusedNextItems further down.
   */
  const renderStalledDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No project selected"
          text="These are active projects with no actionable next task — everything open is done, cancelled, or shelved to Someday/Maybe. Add a next task to move it forward, or put it on hold if it isn't a priority right now."
          hint="Tap a project on the left to get started."
          textColor={textColor}
        />
      );
    }
    const entry = stalledList.find(e => e.item.path === selectedKey);
    if (!entry) return null;
    return (
      <ReviewItemDetail
        entry={entry}
        hint="No open tasks."
        statusOptions={['active', 'on-hold', 'done']}
        items={items}
        currentWeekKey={currentWeekKey}
        onOpenItem={openReviewItem}
        onAddTask={handleAddTask}
        onStatusChange={handleStalledStatusChange}
        onArchive={handleStalledArchive}
        onPromoteToNext={handlePromoteToNext}
        onContextChanged={refreshFromCache}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderStalledProjects = () => (
    <ReviewMasterDetail<ReviewProjectEntry>
      header="Stalled projects"
      rows={stalledList}
      rowHeight={entry => itemEntryHeight(reviewCurrentItem(entry.item, items), COLUMN_WIDTH_PX)}
      isSelectable={() => true}
      rowKey={entry => entry.item.path}
      renderRow={(entry, selected, actedOn) => (
        <ReviewLeftRow
          current={reviewCurrentItem(entry.item, items)}
          selected={selected}
          actedOn={actedOn}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderStalledDetail}
      actedOnKeys={stalledActedOn}
      resetKey={stepEntryToken}
      emptyHint="No stalled projects - nice."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

  const renderNeglectedDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No area selected"
          text="These are active areas with no actionable next task — everything open is done, cancelled, or shelved to Someday/Maybe. Add a next task to keep this area moving, or put it on hold if it isn't getting your attention right now."
          hint="Tap an area on the left to get started."
          textColor={textColor}
        />
      );
    }
    const entry = neglectedList.find(e => e.item.path === selectedKey);
    if (!entry) return null;
    return (
      <ReviewItemDetail
        entry={entry}
        hint="No open tasks."
        statusOptions={['active', 'on-hold']}
        items={items}
        currentWeekKey={currentWeekKey}
        onOpenItem={openReviewItem}
        onAddTask={handleAddTask}
        onStatusChange={handleNeglectedStatusChange}
        onArchive={handleNeglectedArchive}
        onPromoteToNext={handlePromoteToNext}
        onContextChanged={refreshFromCache}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderNeglectedAreas = () => (
    <ReviewMasterDetail<ReviewProjectEntry>
      header="Neglected areas"
      rows={neglectedList}
      rowHeight={entry => itemEntryHeight(reviewCurrentItem(entry.item, items), COLUMN_WIDTH_PX)}
      isSelectable={() => true}
      rowKey={entry => entry.item.path}
      renderRow={(entry, selected, actedOn) => (
        <ReviewLeftRow
          current={reviewCurrentItem(entry.item, items)}
          selected={selected}
          actedOn={actedOn}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderNeglectedDetail}
      actedOnKeys={neglectedActedOn}
      resetKey={stepEntryToken}
      emptyHint="No neglected areas - nice."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

  const renderDoneDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No project selected"
          text="These projects are marked Done. Check their tasks and meetings below for anything still open before archiving, or reactivate if there's more to do."
          hint="Tap a project on the left to get started."
          textColor={textColor}
        />
      );
    }
    const itemRef = doneList.find(i => i.path === selectedKey);
    if (!itemRef) return null;
    return (
      <DoneOnHoldDetail
        itemRef={itemRef}
        showMarkDone={false}
        closeOut={onStartCloseOut && itemRef.kind === 'project' ? {onFull: () => onStartCloseOut(itemRef.path, 'full'), onQuick: () => onStartCloseOut(itemRef.path, 'quick')} : undefined}
        items={items}
        currentWeekKey={currentWeekKey}
        onOpenItem={openReviewItem}
        onReactivate={i => handleDoneStatusChange(i, 'active')}
        onMarkDone={i => handleDoneStatusChange(i, 'done')}
        onArchive={handleDoneArchive}
        onContextChanged={refreshFromCache}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderDoneProjects = () => (
    <ReviewMasterDetail<ReviewItemRef>
      header="Done awaiting review"
      rows={doneList}
      rowHeight={ref => itemEntryHeight(reviewCurrentItem(ref, items), COLUMN_WIDTH_PX)}
      isSelectable={() => true}
      rowKey={ref => ref.path}
      renderRow={(ref, selected, actedOn) => (
        <ReviewLeftRow
          current={reviewCurrentItem(ref, items)}
          selected={selected}
          actedOn={actedOn}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderDoneDetail}
      actedOnKeys={doneActedOn}
      resetKey={stepEntryToken}
      emptyHint="Nothing marked Done right now."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

  const renderOnHoldDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No item selected"
          text="These projects and areas are On Hold. Decide whether to reactivate them, mark a project Done, or archive it if it's no longer relevant."
          hint="Tap an item on the left to get started."
          textColor={textColor}
        />
      );
    }
    const itemRef = onHoldList.find(i => i.path === selectedKey);
    if (!itemRef) return null;
    return (
      <DoneOnHoldDetail
        itemRef={itemRef}
        showMarkDone={itemRef.kind === 'project'}
        items={items}
        currentWeekKey={currentWeekKey}
        onOpenItem={openReviewItem}
        onReactivate={i => handleOnHoldStatusChange(i, 'active')}
        onMarkDone={i => handleOnHoldStatusChange(i, 'done')}
        onArchive={handleOnHoldArchive}
        onContextChanged={refreshFromCache}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderOnHold = () => (
    <ReviewMasterDetail<ReviewItemRef>
      header="On Hold reconsideration"
      rows={onHoldList}
      rowHeight={ref => itemEntryHeight(reviewCurrentItem(ref, items), COLUMN_WIDTH_PX)}
      isSelectable={() => true}
      rowKey={ref => ref.path}
      renderRow={(ref, selected, actedOn) => (
        <ReviewLeftRow
          current={reviewCurrentItem(ref, items)}
          selected={selected}
          actedOn={actedOn}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderOnHoldDetail}
      actedOnKeys={onHoldActedOn}
      resetKey={stepEntryToken}
      emptyHint="Nothing On Hold right now."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

  /**
   * Unfocused next items - a grouped left list (project/area name as a
   * non-selectable header row, its own #next tasks as selectable entry
   * rows below it), same flattened-rows convention
   * `screens/ProjectDataPanel.tsx`'s own `TodosSection`/`MeetingsSection`
   * already use for a grouped `PagedSection` (docs/dev/technical-design-review-
   * master-detail.md §5.4) - reused as a pattern here, not as shared code
   * (see that file's §6.3 for why the components themselves aren't reused).
   * Selection is per-*task*, not per-item - see the technical design's own
   * mockup: picking a task shows that task's Someday/Maybe/Done/Cancel
   * actions plus its *parent item's* "+ Add to Daily/Weekly focus".
   */
  const unfocusedNextRows = flattenUnfocusedNext(unfocusedNextList, items);

  const renderUnfocusedNextDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No task selected"
          text="These active projects and areas have an open #next task but aren't in Daily, Weekly or Monthly focus, so it doesn't show on your Daily view. Add the item to a focus, or resolve the task directly."
          hint="Tap a task on the left to get started."
          textColor={textColor}
        />
      );
    }
    const row = unfocusedNextRows.find(r => r.kind === 'entry' && r.key === selectedKey);
    if (!row || row.kind !== 'entry') return null;
    return (
      <UnfocusedNextTaskDetail
        entry={row.entry}
        taskEntry={row.taskEntry}
        items={items}
        settings={settings}
        onOpenItem={openReviewItem}
        onTaskAction={handleUnfocusedNextTaskAction}
        onSetDueDate={handleSetTaskDueDate}
        onAddToDailyFocus={handleAddToDailyFocus}
        onAddToWeeklyFocus={handleAddToWeeklyFocus}
        onAddToMonthlyFocus={handleAddToMonthlyFocus}
        onRemoveFocus={handleRemoveItemFocus}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderUnfocusedNextItems = () => (
    <ReviewMasterDetail<UnfocusedNextRow>
      header="Unfocused next items"
      rows={unfocusedNextRows}
      rowHeight={row => unfocusedNextRowHeight(row)}
      isSelectable={row => row.kind === 'entry'}
      rowKey={row => row.key}
      isCountableRow={row => row.kind === 'entry'}
      renderRow={(row, selected) => (
        <UnfocusedNextRowView
          row={row}
          selected={selected}
          focused={row.kind === 'entry' && isFocused(reviewCurrentItem(row.entry.item, items))}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderUnfocusedNextDetail}
      actedOnKeys={unfocusedNextActedOn}
      resetKey={stepEntryToken}
      emptyHint="Nothing here - every #next item is either due soon or already in Daily focus."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

  /**
   * "Focus reset" (renamed from "Weekly focus reset" 2026-09-28, docs/
   * technical-design-review-monthly-focus.md §3): Monthly block on top,
   * Weekly block below, each two columns (Projects | Areas) of the same
   * PeriodFocusKindSection.
   */
  const renderFocusReset = () => {
    const renderBlock = (scope: 'weekly' | 'monthly') => (
      <View style={scope === 'weekly' ? styles.focusBlockSpacing : undefined}>
        <Text style={[styles.focusBlockHeading, {color: textColor}]}>{scope === 'monthly' ? 'Monthly' : 'Weekly'}</Text>
        <View style={styles.focusColumnsRow}>
          <View style={[common.column, common.columnLeft]}>
            <PeriodFocusKindSection
              scope={scope}
              kind="project"
              label="Projects"
              limit={(scope === 'monthly' ? settings?.monthlyFocusProjectCount : settings?.weeklyFocusProjectCount) ?? 0}
              items={items}
              onOpenItem={openReviewItem}
              onToggle={handleTogglePeriodFocus}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
          <View style={common.column}>
            <PeriodFocusKindSection
              scope={scope}
              kind="area"
              label="Areas"
              limit={(scope === 'monthly' ? settings?.monthlyFocusAreaCount : settings?.weeklyFocusAreaCount) ?? 0}
              items={items}
              onOpenItem={openReviewItem}
              onToggle={handleTogglePeriodFocus}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
        </View>
      </View>
    );
    return (
      <View>
        <Text style={[common.hint, {color: textColor}]}>Choose which Projects and Areas get your attention this month and this week.</Text>
        {renderBlock('monthly')}
        {renderBlock('weekly')}
      </View>
    );
  };

  // Record over every step id (not an array): the compiler now insists a new
  // step in domain/reviewSteps.ts gets a renderer here.
  const STEP_RENDERERS: Record<ReviewStepId, () => React.ReactNode> = {
    weekAhead: renderWeekAhead,
    meetingsCloseOut: renderCloseOut,
    gmailInbox: renderGmailInbox,
    inbox: renderInboxZero,
    stalled: renderStalledProjects,
    done: renderDoneProjects,
    onHold: renderOnHold,
    neglected: renderNeglectedAreas,
    unfocusedNext: renderUnfocusedNextItems,
    weeklyFocus: renderFocusReset,
  };

  const renderStepNav = (id: ReviewStepId): React.JSX.Element => {
    const position = activeSteps.findIndex(def => def.id === id) + 1;
    return (
      <View style={[styles.stepNavRow, {borderColor}]}>
        <View style={styles.stepNavGroup}>
          <Pressable onPress={() => leaveStep(false, 'previous')} hitSlop={8}>
            <Text style={[styles.stepNavText, {color: textColor}]}>‹ Back</Text>
          </Pressable>
          <Pressable style={styles.stepNavGap} onPress={() => leaveStep(false, 'hub')} hitSlop={8}>
            <Text style={[styles.stepNavText, {color: textColor}]}>Overview</Text>
          </Pressable>
        </View>
        <Text style={[styles.stepTitle, {color: textColor}]}>
          Step {position} of {activeSteps.length} — {reviewStepDef(id).title}
        </Text>
        <View style={styles.stepNavGroup}>
          <Pressable onPress={() => leaveStep(false, 'next')} hitSlop={8}>
            <Text style={[styles.stepNavText, {color: textColor}]}>Skip ›</Text>
          </Pressable>
          <Pressable style={[styles.stepNavGap, styles.stepNavPrimary, {borderColor: textColor}]} onPress={() => leaveStep(true, 'next')} hitSlop={8}>
            <Text style={[styles.stepNavText, styles.stepNavPrimaryText, {color: textColor}]}>Reviewed ›</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={common.container}>
      {loading && <ActivityIndicator style={common.spacer} />}

      {!loading && error && (
        <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />
      )}

      {!loading && !error && aggregate && settings && stepCounts && (
        <View style={common.content}>
          {view.kind === 'step' && renderStepNav(view.id)}
          <View style={styles.stepScroll}>
            {view.kind === 'step' && STEP_RENDERERS[view.id]()}
            {view.kind === 'hub' && (
              <ReviewHub
                steps={settings.reviewSteps}
                counts={stepCounts}
                now={new Date()}
                onOpenStep={enterStep}
                stepDefs={activeSteps}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
            {view.kind === 'end' && (
              <ReviewEnd
                steps={settings.reviewSteps}
                counts={stepCounts}
                now={new Date()}
                onOverview={() => showView({kind: 'hub'})}
                stepDefs={activeSteps}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/** Plain, centered empty-state guide shown in the detail column before anything is selected (requirements chat: "Leer mit Hinweistext") - one shared shape, each step supplying its own criteria-based copy (round-2 requirement d). */
function ReviewEmptyDetail({
  title,
  text,
  hint,
  textColor,
}: {
  title: string;
  text: string;
  hint: string;
  textColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.emptyDetail}>
      <Text style={[styles.emptyDetailTitle, {color: textColor}]}>{title}</Text>
      <Text style={[styles.emptyDetailText, {color: textColor}]}>{text}</Text>
      <Text style={[styles.emptyDetailHint, {color: textColor}]}>{hint}</Text>
    </View>
  );
}

/**
 * Stalled-project/neglected-area detail panel (Steps: Stalled projects,
 * Neglected areas) - `ui/ItemContextBlock.tsx` (Area/Scope/Last goal) up
 * top, per round-2 requirement (a), then the rest of what used to be
 * `ReviewItemCard`'s content, relocated unchanged (docs/dev/technical-design-
 * review-master-detail.md §5.2): a quick-add task fixed to this item, its
 * open tasks, up to 2 upcoming meetings, shelved Someday/Maybe tasks with a
 * one-tap "→ Next" promotion, and status/archive pills. `statusOptions` is
 * the 3-way Active/On Hold/Done set for Projects or the 2-way Active/On
 * Hold set for Areas (Areas never reach 'done' - domain/types.ts's
 * ItemStatus doc comment).
 *
 * `items` is the live cache (2026-09-02 feedback: "show newly created tasks
 * in the list") - `reviewCurrentItem` looks the item back up on every
 * render (falling back to a safe default if it's vanished from the cache)
 * and this panel recomputes both its open-tasks list and its shelvedTasks
 * list from there (reviewAggregate.ts's exported isActionableOpenTask/
 * shelvedTasksFor - the same rules the aggregate itself uses), rather than
 * trusting the frozen `entry`'s own copies - what keeps a just-added task,
 * or a just-promoted shelved task, showing up immediately even though the
 * item's membership in the step stays frozen.
 */
function ReviewItemDetail({
  entry,
  hint,
  statusOptions,
  items,
  currentWeekKey,
  onOpenItem,
  onAddTask,
  onStatusChange,
  onArchive,
  onPromoteToNext,
  onContextChanged,
  textColor,
  borderColor,
  placeholderColor,
}: {
  entry: ReviewProjectEntry;
  hint: string;
  statusOptions: SettableStatus[];
  items: CachedItem[];
  currentWeekKey: string;
  onOpenItem: (item: ReviewItemRef) => void;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onStatusChange: (item: ReviewItemRef, status: SettableStatus) => Promise<void>;
  onArchive: (item: ReviewItemRef) => Promise<void>;
  onPromoteToNext: (entry: ReviewShelvedTaskEntry) => Promise<void>;
  onContextChanged: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPending(false));
  };

  const handlePromote = (shelved: ReviewShelvedTaskEntry) => {
    setError(null);
    setPromotingIndex(shelved.taskIndex);
    onPromoteToNext(shelved)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPromotingIndex(null));
  };

  const destination: Destination = {type: 'item', kind: entry.item.kind, name: entry.item.name, path: entry.item.path};
  const current = reviewCurrentItem(entry.item, items);
  const openTasks = current.tasks.filter(isActionableOpenTask);
  const shelvedTasks = shelvedTasksFor(entry.item, current.tasks);

  return (
    <View>
      <Pressable onPress={() => onOpenItem(entry.item)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>{entry.item.name}</Text>
      </Pressable>
      <ItemContextBlock
        item={current}
        currentWeekKey={currentWeekKey}
        onChanged={onContextChanged}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <QuickAddWidget
        fixedDestination={destination}
        taskOnly
        onAddTask={onAddTask}
        onAddMeeting={noopAddMeeting}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      {openTasks.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>{hint}</Text>
      ) : (
        <View style={common.sectionSpacingSmall}>
          {openTasks.map((t, i) => (
            <Text key={`${entry.item.path}#${i}`} style={[styles.rowText, {color: textColor}]}>
              • {t.text}
            </Text>
          ))}
        </View>
      )}
      {entry.upcomingMeetings.length > 0 && (
        <View style={styles.cardMeetings}>
          {/* Read-only standard rows (docs/dev/technical-design-meeting-lists.md
              §4.6): 1-line, date+time, no source - the card is the item. */}
          {entry.upcomingMeetings.map(m => (
            <MeetingRow
              key={`${m.item.path}#${m.meetingIndex}`}
              meeting={m.meeting}
              layout="oneLine"
              time="dateTime"
              textColor={textColor}
              borderColor={borderColor}
            />
          ))}
        </View>
      )}
      {shelvedTasks.length > 0 && (
        <View style={styles.cardShelved}>
          <Text style={[common.subheading, styles.cardShelvedHeading, {color: textColor}]}>
            Someday / Maybe (not counted as open work)
          </Text>
          {shelvedTasks.map(shelved => (
            <View key={shelved.taskIndex} style={styles.shelvedRow}>
              <Text style={[styles.rowText, styles.shelvedText, {color: textColor}]}>{shelved.task.text}</Text>
              <Pressable
                style={[styles.pill, {borderColor}]}
                disabled={promotingIndex !== null}
                onPress={() => handlePromote(shelved)}
                hitSlop={8}>
                <Text style={[styles.pillText, {color: textColor}]}>→ Next</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.pillRow}>
        {statusOptions.map(status => (
          <Pressable
            key={status}
            style={[styles.pill, {borderColor}, status === 'active' && styles.pillActive]}
            disabled={pending}
            onPress={() => runAction(() => onStatusChange(entry.item, status))}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>{statusLabel(status)}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.pill, {borderColor}]}
          disabled={pending}
          onPress={() => runAction(() => onArchive(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>Archive</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Done-project/On-Hold-item detail panel (Steps: Done awaiting review, On
 * Hold reconsideration) - `ItemContextBlock` (round-2 requirement b) +
 * status action pills (unchanged from the old `StatusActionCard`: Archive
 * here is a physical folder move, storage/archive.ts, rather than a plain
 * frontmatter status change, and "→ Done" only makes sense for Projects,
 * `showMarkDone`) + two new sections, both reusing existing shared row
 * primitives rather than `ProjectDataPanel.tsx`'s own `TodosSection`/
 * `MeetingsSection` (see the technical design's §6.3 for why those two
 * aren't reused wholesale):
 * - **All tasks** - `current.tasks` unfiltered (not just open ones, unlike
 *   `ReviewItemDetail` above) via `ui/TaskRow.tsx` directly, `context="flat"`
 *   read-only (no edit/link affordances - this view is look-then-decide,
 *   not an editor).
 * - **All meetings** - `current.meetings` unfiltered via `ui/MeetingRow.tsx`
 *   directly, same read-only treatment.
 *
 * No `reviewAggregate.ts` changes were needed for this (§4.1) - `doneList`/
 * `onHoldList` stay bare `ReviewItemRef[]`; this panel does the same live
 * `reviewCurrentItem` lookup every other detail panel here does and simply
 * doesn't filter the result.
 */
function DoneOnHoldDetail({
  itemRef,
  showMarkDone,
  items,
  currentWeekKey,
  onOpenItem,
  onReactivate,
  onMarkDone,
  onArchive,
  onContextChanged,
  closeOut,
  textColor,
  borderColor,
  placeholderColor,
}: {
  itemRef: ReviewItemRef;
  showMarkDone: boolean;
  /** Done step only (docs/dev/technical-design-project-close-out.md §6.1): replaces Archive with "Close out…" / "Quick archive…" and shows the close-out status. */
  closeOut?: {onFull: () => void; onQuick: () => void};
  items: CachedItem[];
  currentWeekKey: string;
  onOpenItem: (item: ReviewItemRef) => void;
  onReactivate: (item: ReviewItemRef) => Promise<void>;
  onMarkDone: (item: ReviewItemRef) => Promise<void>;
  onArchive: (item: ReviewItemRef) => Promise<void>;
  onContextChanged: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPending(false));
  };

  const current = reviewCurrentItem(itemRef, items);

  return (
    <View>
      <Pressable onPress={() => onOpenItem(itemRef)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>
          {itemRef.name}
          {itemRef.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </Pressable>
      <ItemContextBlock
        item={current}
        currentWeekKey={currentWeekKey}
        onChanged={onContextChanged}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <View style={styles.pillRow}>
        <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => runAction(() => onReactivate(itemRef))} hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>Reactivate</Text>
        </Pressable>
        {showMarkDone && (
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => runAction(() => onMarkDone(itemRef))} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>→ Done</Text>
          </Pressable>
        )}
        {closeOut ? (
          <>
            <Pressable style={[styles.pill, styles.pillActive, {borderColor}]} disabled={pending} onPress={closeOut.onFull} hitSlop={8}>
              <Text style={[styles.pillText, {color: textColor}]}>Close out…</Text>
            </Pressable>
            <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={closeOut.onQuick} hitSlop={8}>
              <Text style={[styles.pillText, {color: textColor}]}>Quick archive…</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => runAction(() => onArchive(itemRef))} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>Archive</Text>
          </Pressable>
        )}
      </View>
      {closeOut && <Text style={[common.hint, {color: textColor}]}>{planStatusLabel(current.rawContent)}</Text>}
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionLabel, {color: textColor}]}>All tasks</Text>
      {current.tasks.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>No tasks on this item.</Text>
      ) : (
        current.tasks.map((task, taskIndex) => (
          <ReadOnlyTaskRow key={`task-${taskIndex}`} task={task} context="flat" textColor={textColor} borderColor={borderColor} />
        ))
      )}
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionLabel, {color: textColor}]}>All meetings</Text>
      {current.meetings.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>No meetings on this item.</Text>
      ) : (
        current.meetings.map((meeting, meetingIndex) => (
          <MeetingRow
            key={`meeting-${meetingIndex}`}
            meeting={meeting}
            layout="oneLine"
            time="dateTime"
            textColor={textColor}
            borderColor={borderColor}
          />
        ))
      )}
    </View>
  );
}

/** Stable identity of a meetings-to-close-out entry - item path + index into that item's full meetings array (same convention as every ReviewMeetingEntry consumer). */
function closeOutKey(entry: ReviewMeetingEntry): string {
  return `${entry.item.path}#${entry.meetingIndex}`;
}

// Cap on the related-todos list in the close-out detail panel - a detail
// column has no scroll on this device, so a long list would push the panel's
// own actions off screen. The remainder is summarised as "+N more".
const CLOSE_OUT_RELATED_LIMIT = 5;

/**
 * Meetings-to-close-out detail panel: what the meeting was, the one action
 * this step exists for (mark reviewed - toggles back if tapped again), the
 * note if there is one, a task-only quick-add fixed to the meeting's own
 * Project/Area for the follow-ups, and the open todos that share the
 * meeting's context tags (storage/meetingNoteAggregate.ts's relatedItemsFor -
 * the same match the meeting's note block lists), so results can be checked
 * against what's already captured.
 */
function MeetingCloseOutDetail({
  entry,
  meeting,
  reviewed,
  related,
  onOpenItem,
  onToggleReviewed,
  onOpenNote,
  onAddTask,
  textColor,
  borderColor,
  placeholderColor,
}: {
  entry: ReviewMeetingEntry;
  meeting: Meeting;
  reviewed: boolean;
  related: MeetingRelevantTodo[];
  onOpenItem: (item: ReviewItemRef) => void;
  onToggleReviewed: (entry: ReviewMeetingEntry) => Promise<void>;
  onOpenNote: (entry: ReviewMeetingEntry) => Promise<void>;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPending(false));
  };

  const destination: Destination = {type: 'item', kind: entry.item.kind, name: entry.item.name, path: entry.item.path};
  const shownRelated = related.slice(0, CLOSE_OUT_RELATED_LIMIT);

  return (
    <View>
      <Text style={[styles.cardTitle, {color: textColor}]}>{meetingDisplayTitle(meeting)}</Text>
      <Pressable onPress={() => onOpenItem(entry.item)} hitSlop={8}>
        <Text style={[common.rowSource, {color: textColor}]}>
          {meeting.date}
          {meeting.time ? `, ${meeting.time}` : ''} — {entry.item.name}
          {entry.item.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </Pressable>
      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, {borderColor}, reviewed && styles.pillActive]}
          disabled={pending}
          onPress={() => runAction(() => onToggleReviewed(entry))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>{reviewed ? '✓ Reviewed (tap to undo)' : 'Mark reviewed'}</Text>
        </Pressable>
        {!!meeting.notePath && (
          <Pressable
            style={[styles.pill, {borderColor}]}
            disabled={pending}
            onPress={() => runAction(() => onOpenNote(entry))}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>Open note</Text>
          </Pressable>
        )}
      </View>
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <QuickAddWidget
        fixedDestination={destination}
        taskOnly
        onAddTask={onAddTask}
        onAddMeeting={noopAddMeeting}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <Text style={[styles.sectionLabel, {color: textColor}]}>Related open todos</Text>
      {shownRelated.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>None share this meeting's tags.</Text>
      ) : (
        <View style={common.sectionSpacingSmall}>
          {shownRelated.map((r, i) => (
            <Text key={`${r.item.path}#${i}`} style={[styles.rowText, {color: textColor}]}>
              • {r.task.text} — {r.item.name}
            </Text>
          ))}
          {related.length > shownRelated.length && (
            <Text style={[common.hint, {color: textColor}]}>+{related.length - shownRelated.length} more</Text>
          )}
        </View>
      )}
    </View>
  );
}

// Fixed height of one Gmail-inbox left row (a subject line + a
// from/attachment-count line).
const GMAIL_ROW_PX = 60;

/** Minimum height of the Gmail detail panel's email-text pane (action bar + ~4 lines) - below this the pane keeps this height instead of shrinking further when the rest of the panel (many attachments / created items) needs the room. */
const GMAIL_BODY_MIN_PX = 150;
/** How long the Archive pill shows inverted (black) before the email leaves the list (2026-09-28) - long enough to register on e-ink, short enough not to feel slow. */
const ARCHIVE_FLASH_MS = 350;

/** "HH:MM" of a fetch time - same short form the Google Calendar panel's "Refresh (last …)" label uses for today. */
function formatGmailFetchedAt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The Gmail step's Load/Refresh button label, mirroring
 * ui/GoogleCalendarPanel.tsx's own: "Load Gmail inbox" before anything has
 * been fetched, "Refreshing… Ns" (live elapsed seconds, so a slow IMAP
 * connect - up to the native 20 s timeout - visibly isn't frozen) while
 * loading, and "🔄 Refresh (last HH:MM)" afterwards.
 */
function GmailRefreshLabel({
  loading,
  fetchedAt,
  textColor,
}: {
  loading: boolean;
  fetchedAt: number | null;
  textColor: string;
}): React.JSX.Element {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!loading) {
      setStartedAt(null);
      return;
    }
    setStartedAt(Date.now());
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);
  const elapsed = startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000);
  const label = loading
    ? `Refreshing… ${elapsed}s`
    : fetchedAt !== null
    ? `🔄 Refresh (last ${formatGmailFetchedAt(fetchedAt)})`
    : 'Load Gmail inbox';
  return <Text style={[styles.pillText, {color: textColor}]}>{label}</Text>;
}

/** One left-list row of the Gmail inbox step: subject over "from · 📎N", checkmarked once a Todo/Meeting has been created from it or it's been archived this visit. */
function GmailEmailRow({
  message,
  selected,
  actedOn,
  textColor,
  borderColor,
}: {
  message: GmailCacheMessage;
  selected: boolean;
  actedOn: boolean;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  // 📎 counts only attachments the device can open (Tilman, 2026-09-21) - signature/inline images don't make a mail "have an attachment".
  const viewableAttachmentCount = message.attachments.filter(a => isAttachmentSupported(a.mimeType)).length;
  return (
    <View
      style={[
        styles.masterRow,
        {height: GMAIL_ROW_PX, minHeight: GMAIL_ROW_PX, borderColor},
        selected && styles.masterRowSelected,
      ]}>
      <Text style={[styles.masterRowText, {color: textColor}, actedOn && styles.masterRowActedOn]} numberOfLines={1}>
        {actedOn ? '✓ ' : ''}
        {message.subject || '(no subject)'}
      </Text>
      <Text style={[common.rowSource, {color: textColor}, actedOn && styles.masterRowActedOn]} numberOfLines={1}>
        {message.from}
        {viewableAttachmentCount > 0 ? ` · 📎 ${viewableAttachmentCount}` : ''}
      </Text>
    </View>
  );
}

/**
 * Gmail inbox detail panel: the message's from/date, a QuickAddWidget to
 * turn it into a Todo or Meeting (always filed to Inbox - an email has no
 * Project/Area of its own), the attachments (one line per attachment inside
 * storage/gmailAttachments.ts's SUPPORTED_ATTACHMENT_MIME_TYPES allow-list;
 * everything else collapses into ONE summary line by file extension, "+4
 * .png, +2 .jpg" - Tilman, 2026-09-21), a "link the email's text" action once at
 * least one item has been created from it, and Archive - and, filling ALL the
 * remaining height at the bottom, the email's body (fetched lazily the first
 * time this uid is selected - see the mount effect below) in ui/
 * GmailBodyPane.tsx: scrollable (the app's one deliberate exception to the
 * no-scroll policy) and selectable, with Copy / -> Todo / -> Meeting acting
 * on the selection (2026-09-21, docs/dev/technical-design-gmail-body-select.md).
 * -> Todo/-> Meeting hand the selected text to the QuickAddWidget above via
 * its `prefill` prop (appended to the draft, tab switched) - the item is
 * still created with that widget's own +Add, like any other.
 */
function GmailDetailPanel({
  message,
  createdItems,
  onFetchBody,
  onAddTask,
  onAddMeeting,
  onLinkArtifact,
  onArchive,
  textColor,
  borderColor,
  placeholderColor,
}: {
  message: GmailCacheMessage;
  createdItems: GmailCreatedItem[];
  onFetchBody: (uid: string) => Promise<string | 'unsupported'>;
  onAddTask: (message: GmailCacheMessage, text: string) => Promise<void>;
  onAddMeeting: (message: GmailCacheMessage, fields: MeetingQuickAddFields) => Promise<void>;
  onLinkArtifact: (
    message: GmailCacheMessage,
    item: GmailCreatedItem,
    artifact: {kind: 'body'} | {kind: 'attachment'; attachment: GmailAttachmentInfo},
    onProgress?: (text: string) => void,
  ) => Promise<void>;
  onArchive: (message: GmailCacheMessage) => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  /** Archive pill shown inverted (black) for ARCHIVE_FLASH_MS right after the tap, before the email leaves the list (2026-09-28). */
  const [archiveFlash, setArchiveFlash] = useState(false);
  const archiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
    },
    [],
  );
  const handleArchivePress = () => {
    if (archiveFlash) return;
    setError(null);
    setArchiveFlash(true);
    requestEinkRefresh();
    archiveTimerRef.current = setTimeout(() => {
      archiveTimerRef.current = null;
      setArchiveFlash(false);
      onArchive(message);
    }, ARCHIVE_FLASH_MS);
  };
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));
  const [bodyText, setBodyText] = useState<string | 'unfetched' | 'unsupported'>(message.bodyText);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  /** Status text of the link in progress ("Creating note... page 2/5") - shown on the running pill. */
  const [linkProgress, setLinkProgress] = useState<string | null>(null);
  // Attachments split (2026-09-21): the ones the device can open get their own
  // line (and a "Save & link" pill); the rest collapse into one "+4 .png, +2
  // .jpg" line - mostly signature/inline images nobody wants listed.
  const viewableAttachments = message.attachments.filter(a => isAttachmentSupported(a.mimeType));
  const unviewableSummary = summarizeAttachmentsByExtension(
    message.attachments.filter(a => !isAttachmentSupported(a.mimeType)).map(a => a.fileName),
  );

  // -> Todo / -> Meeting requests for the QuickAddWidget (its `prefill` prop
  // acts once per nonce). Panel-local on purpose: it resets when the panel
  // unmounts (step left / selection cleared), and a message switch keeps the
  // same nonce so it can never re-apply an old request to the new message.
  const [prefill, setPrefill] = useState<{kind: 'task' | 'meeting'; text: string; nonce: number} | null>(null);
  const prefillNonceRef = useRef(0);
  const sendToWidget = (kind: 'task' | 'meeting', text: string) => {
    prefillNonceRef.current += 1;
    setPrefill({kind, text, nonce: prefillNonceRef.current});
  };

  // Lazily fetches this message's body the first time it's selected - keyed
  // on `message.uid` (not the whole `message` object, which is a fresh
  // reference on every parent re-render) so this doesn't refetch on every
  // unrelated action elsewhere on the step. Guards against a stale write if
  // the user selects a different message before this resolves (same "ignore
  // a stale async result" pattern the rest of this app's own mount effects
  // use for editingInboxItem's linkedFileMissing check, for example).
  useEffect(() => {
    setBodyText(message.bodyText);
    if (message.bodyText !== 'unfetched') return;
    let cancelled = false;
    onFetchBody(message.uid)
      .then(body => {
        if (!cancelled) setBodyText(body);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.uid]);

  // requestEinkRefresh() in every .finally: busy state, progress text, success and
  // errors are all async state changes the panel would otherwise not repaint on
  // e-ink (bugfix_eink_refresh) - the reason a failed/finished link used to look
  // like "nothing happened".
  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    requestEinkRefresh();
    fn()
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setPending(false);
        requestEinkRefresh();
      });
  };

  const runLink = (key: string, fn: (onProgress: (text: string) => void) => Promise<void>) => {
    setError(null);
    setLinkProgress(null);
    setLinkingKey(key);
    requestEinkRefresh();
    fn(text => {
      setLinkProgress(text);
      requestEinkRefresh();
    })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setLinkingKey(null);
        setLinkProgress(null);
        requestEinkRefresh();
      });
  };

  return (
    <View style={styles.gmailDetailRoot}>
      <Text style={[styles.cardTitle, {color: textColor}]}>{message.subject || '(no subject)'}</Text>
      <Text style={[common.rowSource, {color: textColor}]}>{message.from}</Text>

      {message.attachments.length > 0 && (
        <View style={common.sectionSpacingSmall}>
          <Text style={[styles.sectionLabel, {color: textColor}]}>Attachments</Text>
          {viewableAttachments.map(attachment => (
            <View key={attachment.partId} style={styles.shelvedRow}>
              <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
                {attachment.fileName}
              </Text>
            </View>
          ))}
          {unviewableSummary !== '' && (
            <Text style={[common.hint, {color: textColor}]} numberOfLines={1}>
              {unviewableSummary}
            </Text>
          )}
        </View>
      )}

      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <QuickAddWidget
        fixedDestination={FIXED_INBOX_DESTINATION}
        onAddTask={text => onAddTask(message, text)}
        onAddMeeting={fields => onAddMeeting(message, fields)}
        prefill={prefill}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />

      {createdItems.length > 0 && (
        <View style={styles.cardShelved}>
          <Text style={[common.subheading, styles.cardShelvedHeading, {color: textColor}]}>Created from this email</Text>
          {createdItems.map(item => {
            const itemKey = `${item.type}-${item.index}`;
            const bodyKey = `${itemKey}-body`;
            const bodyLinked = item.linked?.key === 'body';
            return (
              <View key={itemKey} style={styles.gmailCreatedItem}>
                <View style={styles.shelvedRow}>
                  <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
                    {item.type === 'meeting' ? '📅 ' : '• '}
                    {item.label}
                  </Text>
                  <View style={styles.pillRow}>
                    <Pressable
                      style={[styles.pill, {borderColor}]}
                      disabled={linkingKey !== null || bodyText === 'unfetched' || bodyLinked}
                      onPress={() => runLink(bodyKey, onProgress => onLinkArtifact(message, item, {kind: 'body'}, onProgress))}
                      hitSlop={8}>
                      <Text style={[styles.pillText, {color: textColor}]}>
                        {linkingKey === bodyKey ? linkProgress ?? 'Creating note...' : bodyLinked ? '✓ Email linked as note' : 'Link email as note'}
                      </Text>
                    </Pressable>
                    {viewableAttachments.map(attachment => {
                      const attachmentKey = `${itemKey}-${attachment.partId}`;
                      const attachmentLinked = item.linked?.key === attachment.partId;
                      return (
                        <Pressable
                          key={attachment.partId}
                          style={[styles.pill, {borderColor}]}
                          disabled={linkingKey !== null || attachmentLinked}
                          onPress={() =>
                            runLink(attachmentKey, onProgress =>
                              onLinkArtifact(message, item, {kind: 'attachment', attachment}, onProgress),
                            )
                          }
                          hitSlop={8}>
                          <Text style={[styles.pillText, {color: textColor}]}>
                            {linkingKey === attachmentKey
                              ? linkProgress ?? 'Saving...'
                              : attachmentLinked
                              ? `✓ "${attachment.fileName}" linked`
                              : `Save & link "${attachment.fileName}"`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {item.linked && (
                  <View style={styles.gmailLinkedLine}>
                    <ClipIcon color={textColor} />
                    <Text style={[common.hint, styles.gmailLinkedName, {color: textColor}]} numberOfLines={1}>
                      {item.linked.name}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, {borderColor}, archiveFlash && styles.pillFlash]}
          disabled={pending || archiveFlash}
          onPress={handleArchivePress}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: archiveFlash ? COLORS.accentText : textColor}]}>Archive</Text>
        </Pressable>
      </View>

      {/* The email text: everything below the controls above, all remaining height, scrolls inside itself. */}
      <View style={styles.gmailBodyArea}>
        {bodyText === 'unfetched' ? (
          <Text style={[common.hint, {color: textColor}]}>Loading…</Text>
        ) : bodyText === 'unsupported' ? (
          <Text style={[common.hint, {color: textColor}]}>This email's text couldn't be read.</Text>
        ) : (
          <GmailBodyPane
            text={bodyText}
            onToTodo={selected => sendToWidget('task', selected)}
            onToMeeting={selected => sendToWidget('meeting', selected)}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
      </View>
    </View>
  );
}

/** One flattened row of the Unfocused-next-items left list - see flattenUnfocusedNext below. */
type UnfocusedNextRow =
  | {kind: 'header'; key: string; entry: ReviewUnfocusedNextEntry}
  | {kind: 'note'; key: string; text: string}
  | {kind: 'entry'; key: string; entry: ReviewUnfocusedNextEntry; taskEntry: ReviewNextTaskEntry};

/**
 * Groups `list` into header+entry rows, one header per item followed by its
 * own live #next tasks (`nextTasksFor` recomputed against the current
 * cache, same "membership frozen, task list live" split every other step's
 * detail lookup uses) - same flattening convention `ProjectDataPanel.tsx`'s
 * `TodosSection`/`MeetingsSection` already use for a grouped `PagedSection`
 * (docs/dev/technical-design-review-master-detail.md §5.4). A "note" row fills
 * in for an item whose #next tasks were all resolved OR given a due date
 * during this review visit (`nextTasksFor` excludes a due-dated task the
 * same way it excludes a resolved one, see reviewAggregate.ts's own doc
 * comment - 2026-09-16, Tilman feedback) - still frozen into the step (see
 * the module doc comment's "Frozen snapshots" note) but with nothing left
 * to act on until it gets a new, not-yet-due #next task.
 */
function flattenUnfocusedNext(list: ReviewUnfocusedNextEntry[], items: CachedItem[]): UnfocusedNextRow[] {
  const rows: UnfocusedNextRow[] = [];
  for (const entry of list) {
    const current = reviewCurrentItem(entry.item, items);
    const liveNextTasks = nextTasksFor(entry.item, current.tasks);
    rows.push({kind: 'header', key: `${entry.item.path}#header`, entry});
    if (liveNextTasks.length === 0) {
      rows.push({kind: 'note', key: `${entry.item.path}#note`, text: 'Nothing left needing attention here (resolved or already scheduled).'});
    } else {
      for (const taskEntry of liveNextTasks) {
        rows.push({kind: 'entry', key: `${entry.item.path}#${taskEntry.taskIndex}`, entry, taskEntry});
      }
    }
  }
  return rows;
}

// Chrome/line-height estimates for the Unfocused-next-items left list's own
// header/note/entry rows - same "one line of FONT.small/medium text" method
// ui/itemEntryRow.ts's own constants use, sized for this step's own plain
// text rows (a project/area group label, or a task's own text) rather than
// reusing those constants directly (different font size for the header).
const UNFOCUSED_HEADER_ROW_PX = 30;
const UNFOCUSED_NOTE_ROW_PX = 28;
const UNFOCUSED_ENTRY_CHROME_PX = 12;
const UNFOCUSED_ENTRY_LINE_HEIGHT_PX = 22;

function unfocusedTaskLines(text: string, columnWidthPx: number): number {
  return Math.min(2, activeLineEstimator.estimateLines(text, Math.max(1, columnWidthPx - 12), FONT.medium));
}

function unfocusedNextRowHeight(row: UnfocusedNextRow): number {
  if (row.kind === 'header') return UNFOCUSED_HEADER_ROW_PX;
  if (row.kind === 'note') return UNFOCUSED_NOTE_ROW_PX;
  return UNFOCUSED_ENTRY_CHROME_PX + unfocusedTaskLines(row.taskEntry.task.text, COLUMN_WIDTH_PX) * UNFOCUSED_ENTRY_LINE_HEIGHT_PX;
}

/**
 * Renders one row of the Unfocused-next-items left list - header/note/entry,
 * per flattenUnfocusedNext above. `selected` only ever applies to an 'entry'
 * row (ReviewMasterDetail's own isSelectable gates header/note rows out of
 * selection). `focused` (2026-09-16, Tilman feedback) is likewise only ever
 * true for an 'entry' row - see its caller, renderUnfocusedNextItems, for
 * how it's computed (the parent item's LIVE Daily-or-Weekly focus state,
 * not a frozen flag) - and marks every task row under a project/area the
 * moment that item is focused from the detail panel, with a "✓ " prefix,
 * same convention ReviewLeftRow's own `actedOn` checkmark uses elsewhere in
 * this file.
 */
function UnfocusedNextRowView({
  row,
  selected,
  focused,
  textColor,
  borderColor,
}: {
  row: UnfocusedNextRow;
  selected: boolean;
  focused: boolean;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  if (row.kind === 'header') {
    return (
      <View key={row.key} style={styles.masterGroupLabel}>
        <Text style={[styles.masterGroupLabelText, {color: textColor}]} numberOfLines={1}>
          {row.entry.item.name}
          {row.entry.item.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </View>
    );
  }
  if (row.kind === 'note') {
    return (
      <View key={row.key} style={styles.masterNoteRow}>
        <Text style={[common.hint, {color: textColor}]}>{row.text}</Text>
      </View>
    );
  }
  const heightPx = unfocusedNextRowHeight(row);
  return (
    <View
      key={row.key}
      style={[
        styles.masterRow,
        styles.masterRowIndented,
        {height: heightPx, minHeight: heightPx, borderColor},
        selected && styles.masterRowSelected,
      ]}>
      <Text
        style={[styles.masterRowText, {color: textColor}, focused && styles.masterRowActedOn]}
        numberOfLines={unfocusedTaskLines(row.taskEntry.task.text, COLUMN_WIDTH_PX)}>
        {focused ? '✓ ' : ''}
        {row.taskEntry.task.text}
      </Text>
    </View>
  );
}

/**
 * Unfocused-next-items detail panel, for the selected task - task text as
 * heading (tap to open its parent item), the parent project/area name as a
 * caption, Someday/Maybe/Done/Cancel/Set-due-date pills for the task
 * (Set-due-date is new, 2026-09-16, Tilman feedback - see onSetDueDate),
 * "+ Add to Daily/Weekly/Monthly focus" pills for the parent item (Monthly
 * added 2026-09-28; grayed out the
 * moment that item is already focused in that scope - also 2026-09-16
 * feedback, live via `isFocused`/`reviewCurrentItem` rather than a frozen
 * flag, so a removal below un-grays it immediately), and a
 * live "Current focus" section restricted to the selected task's OWN kind
 * (2026-09-16 feedback: an Area task's Current-focus only lists focused
 * Areas, a Project task's only lists focused Projects - showing the other
 * kind here was never actionable from an Area/Project task's own detail
 * panel, just noise) so a full Daily/Weekly slot can be freed without
 * leaving Review.
 */
function UnfocusedNextTaskDetail({
  entry,
  taskEntry,
  items,
  settings,
  onOpenItem,
  onTaskAction,
  onSetDueDate,
  onAddToDailyFocus,
  onAddToWeeklyFocus,
  onAddToMonthlyFocus,
  onRemoveFocus,
  textColor,
  borderColor,
  placeholderColor,
}: {
  entry: ReviewUnfocusedNextEntry;
  taskEntry: ReviewNextTaskEntry;
  items: CachedItem[];
  settings: GtdParaSettings | null;
  onOpenItem: (item: ReviewItemRef) => void;
  onTaskAction: (entry: ReviewNextTaskEntry, action: 'someday' | 'maybe' | 'done' | 'cancel') => Promise<void>;
  onSetDueDate: (entry: ReviewNextTaskEntry, dueDate: string | null) => Promise<void>;
  onAddToDailyFocus: (item: ReviewItemRef) => Promise<void>;
  onAddToWeeklyFocus: (item: ReviewItemRef) => Promise<void>;
  onAddToMonthlyFocus: (item: ReviewItemRef) => Promise<void>;
  onRemoveFocus: (item: CachedItem, scope: FocusScope) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueDateDraft, setDueDateDraft] = useState('');

  // Collapses the due-date input back down whenever the selected task
  // changes, so switching tasks never leaves a stale draft open on the
  // wrong one (this component isn't remounted per selection - ReviewMasterDetail
  // just re-renders it with new props).
  useEffect(() => {
    setDueDateOpen(false);
    setDueDateDraft('');
  }, [entry.item.path, taskEntry.taskIndex]);

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPending(false));
  };

  const TASK_ACTIONS = ['someday', 'maybe', 'done', 'cancel'] as const;
  const taskActionLabel = (action: (typeof TASK_ACTIONS)[number]): string =>
    action === 'someday' ? 'Someday' : action === 'maybe' ? 'Maybe' : action === 'done' ? 'Done' : 'Cancel';

  const currentParent = reviewCurrentItem(entry.item, items);
  const dailyFocused = items.filter(i => i.dailyFocus && i.kind === entry.item.kind);
  const weeklyFocused = items.filter(i => i.weeklyFocus && i.kind === entry.item.kind);
  const monthlyFocused = items.filter(i => i.monthlyFocus && i.kind === entry.item.kind);
  const focusRowLabel = (item: CachedItem) => `${item.name}${item.kind === 'area' ? ' (Area)' : ''}`;
  const kindLabel = entry.item.kind === 'area' ? 'areas' : 'projects';
  const dailyLimit = entry.item.kind === 'area' ? settings?.dailyFocusAreaCount : settings?.dailyFocusProjectCount;
  const weeklyLimit = entry.item.kind === 'area' ? settings?.weeklyFocusAreaCount : settings?.weeklyFocusProjectCount;
  const monthlyLimit = entry.item.kind === 'area' ? settings?.monthlyFocusAreaCount : settings?.monthlyFocusProjectCount;

  const submitDueDate = () => {
    const trimmed = dueDateDraft.trim();
    if (!trimmed) return;
    runAction(() => onSetDueDate(taskEntry, trimmed));
  };

  return (
    <View>
      <Pressable onPress={() => onOpenItem(entry.item)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>{taskEntry.task.text}</Text>
      </Pressable>
      <Text style={[styles.detailCaption, {color: textColor}]}>
        {entry.item.name}
        {entry.item.kind === 'area' ? ' (Area)' : ''}
      </Text>
      <View style={styles.pillRow}>
        {TASK_ACTIONS.map(action => (
          <Pressable
            key={action}
            style={[styles.pill, {borderColor}]}
            disabled={pending}
            onPress={() => runAction(() => onTaskAction(taskEntry, action))}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>{taskActionLabel(action)}</Text>
          </Pressable>
        ))}
        {!dueDateOpen && (
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => setDueDateOpen(true)} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>📅 Set due date</Text>
          </Pressable>
        )}
      </View>
      {dueDateOpen && (
        <View style={styles.pillRow}>
          {/* Shared date field with the -1/Today/+1/+7 strip (ui/DateInput.tsx). */}
          <DateInput
            value={dueDateDraft}
            onChangeText={setDueDateDraft}
            onSubmitEditing={submitDueDate}
            placeholder="YYYY-MM-DD"
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
            width={120}
            containerStyle={styles.dueDateWrap}
            inputStyle={styles.dueDateInput}
          />
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending || !dueDateDraft.trim()} onPress={submitDueDate} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>Save</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, {borderColor}]}
            disabled={pending}
            onPress={() => {
              setDueDateOpen(false);
              setDueDateDraft('');
            }}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, {borderColor}, currentParent.dailyFocus && styles.pillDisabled]}
          disabled={pending || currentParent.dailyFocus}
          onPress={() => runAction(() => onAddToDailyFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>
            {currentParent.dailyFocus ? '✓ ' : '+ Add '}
            {entry.item.name} to Daily focus
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, {borderColor}, currentParent.weeklyFocus && styles.pillDisabled]}
          disabled={pending || currentParent.weeklyFocus}
          onPress={() => runAction(() => onAddToWeeklyFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>
            {currentParent.weeklyFocus ? '✓ ' : '+ Add '}
            {entry.item.name} to Weekly focus
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, {borderColor}, currentParent.monthlyFocus && styles.pillDisabled]}
          disabled={pending || currentParent.monthlyFocus}
          onPress={() => runAction(() => onAddToMonthlyFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>
            {currentParent.monthlyFocus ? '✓ ' : '+ Add '}
            {entry.item.name} to Monthly focus
          </Text>
        </Pressable>
      </View>
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionLabel, {color: textColor}]}>
        Current focus <Text style={styles.sectionLabelHint}>(manage without leaving Review)</Text>
      </Text>
      <Text style={[styles.focusSubheading, {color: textColor}]}>
        Daily — {dailyFocused.length} of {dailyLimit ?? 0} {kindLabel}
      </Text>
      {dailyFocused.map(item => (
        <FocusedItemRow
          key={`daily-${item.path}`}
          label={focusRowLabel(item)}
          onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}
          onRemove={() => runAction(() => onRemoveFocus(item, 'daily'))}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
      <Text style={[styles.focusSubheading, {color: textColor}]}>
        Weekly — {weeklyFocused.length} of {weeklyLimit ?? 0} {kindLabel}
      </Text>
      {weeklyFocused.map(item => (
        <FocusedItemRow
          key={`weekly-${item.path}`}
          label={focusRowLabel(item)}
          onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}
          onRemove={() => runAction(() => onRemoveFocus(item, 'weekly'))}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
      <Text style={[styles.focusSubheading, {color: textColor}]}>
        Monthly — {monthlyFocused.length} of {monthlyLimit ?? 0} {kindLabel}
      </Text>
      {monthlyFocused.map(item => (
        <FocusedItemRow
          key={`monthly-${item.path}`}
          label={focusRowLabel(item)}
          onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}
          onRemove={() => runAction(() => onRemoveFocus(item, 'monthly'))}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
    </View>
  );
}
/**
 * Weekly/monthly-focus counterpart of DailyView.tsx's own DailyFocusKindSection -
 * same "focused items, then empty slots, then an expandable candidate list"
 * shape, for `scope` 'weekly' or 'monthly' (storage/focusSlots.ts; the caller
 * passes the matching settings count as `limit`). Generalised 2026-09-28 from
 * the weekly-only WeeklyFocusKindSection (docs/dev/technical-design-review-
 * monthly-focus.md §3). Kept as its own local copy rather than exported/shared
 * from DailyView.tsx - this is a focus-toggle list, not a Task/Meeting
 * *creation* moment, so the component-reuse requirement for this feature (see
 * the module doc comment) doesn't reach it.
 */
function PeriodFocusKindSection({
  scope,
  kind,
  label,
  limit,
  items,
  onOpenItem,
  onToggle,
  textColor,
  borderColor,
}: {
  scope: 'weekly' | 'monthly';
  kind: 'project' | 'area';
  label: string;
  limit: number;
  items: CachedItem[];
  onOpenItem: (item: ReviewItemRef) => void;
  onToggle: (item: CachedItem, scope: 'weekly' | 'monthly', value: boolean) => Promise<void>;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.actionError', actionError, () => setActionError(null));

  const flag = (item: CachedItem): boolean => (scope === 'monthly' ? item.monthlyFocus : item.weeklyFocus);
  const focused = items.filter(item => item.kind === kind && flag(item));
  const candidates = items.filter(item => item.kind === kind && !flag(item) && item.status === 'active');
  const emptySlotCount = Math.max(0, limit - focused.length);
  const kindLabel = kind === 'project' ? 'project' : 'area';

  const handleRemove = (item: CachedItem) => {
    setActionError(null);
    setPending(true);
    onToggle(item, scope, false)
      .catch(e => {
        logError('PeriodFocusKindSection: remove failed', e instanceof Error ? e.message : String(e));
        setActionError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPending(false));
  };

  const handleAdd = (item: CachedItem) => {
    setActionError(null);
    setPending(true);
    onToggle(item, scope, true)
      .then(() => setExpanded(false))
      .catch(e => {
        logError('PeriodFocusKindSection: add failed', e instanceof Error ? e.message : String(e));
        setActionError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPending(false));
  };

  return (
    <View style={styles.focusKindBlock}>
      <Text style={[styles.focusKindLabel, {color: textColor}]}>{label}</Text>
      {focused.map(item => (
        <View key={item.path} style={[styles.row, {borderColor}]}>
          <Pressable
            style={styles.rowTextWrap}
            onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}>
            <Text style={[styles.rowText, {color: textColor}]}>{item.name}</Text>
          </Pressable>
          <Pressable onPress={() => handleRemove(item)} disabled={pending} hitSlop={8}>
            <Text style={[styles.cancelText, {color: textColor}]}>✕</Text>
          </Pressable>
        </View>
      ))}
      {Array.from({length: emptySlotCount}).map((_, i) => (
        <Pressable
          key={`empty-${i}`}
          style={[styles.row, {borderColor}]}
          onPress={() => setExpanded(v => !v)}
          disabled={pending}
          hitSlop={8}>
          <Text style={[styles.rowText, styles.addSlotText, {color: textColor}]}>+ Add {kindLabel}</Text>
        </Pressable>
      ))}
      {expanded && (
        <View style={styles.candidateList}>
          {candidates.length === 0 && (
            <Text style={[common.hint, {color: textColor}]}>No other {label.toLowerCase()} to add.</Text>
          )}
          {candidates.map(item => (
            <Pressable
              key={item.path}
              style={[styles.row, {borderColor}]}
              onPress={() => handleAdd(item)}
              disabled={pending}
              hitSlop={8}>
              <Text style={[styles.rowText, {color: textColor}]}>{item.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // See renderWeekAhead's own comment - [[feature_pagination_fixed_height]].
  weekAheadRoot: {
    flex: 1,
  },
  stepNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 12,
  },
  stepNavText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  // "‹ Back"/"Overview" on the left, "Skip ›"/"Reviewed ›" on the right of
  // the step nav row (docs/dev/technical-design-review-hub.md §4.2).
  stepNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepNavGap: {
    marginLeft: 20,
  },
  stepNavPrimary: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stepNavPrimaryText: {
    fontWeight: '700',
  },
  stepTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  stepScroll: {
    flex: 1,
  },
  // Gmail inbox detail panel (2026-09-21): a column whose last child, the
  // email text, takes all the height the fixed controls above it leave over -
  // see GmailDetailPanel's doc comment and ui/GmailBodyPane.tsx.
  gmailDetailRoot: {
    flex: 1,
  },
  gmailBodyArea: {
    flex: 1,
    minHeight: GMAIL_BODY_MIN_PX,
    marginTop: 8,
  },
  // Inbox-to-zero step's two-pane layout (docs/dev/technical-design-filing-
  // unification.md §5.1) - same names/values as screens/InboxScreen.tsx's
  // own body/leftPane/rightPane/paneTitle.
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    flex: 1,
    borderRightWidth: 1,
    paddingRight: 16,
    marginRight: 16,
  },
  rightPane: {
    flex: 1,
  },
  // Bounded flex:1 column (docs/dev/technical-design-flex-weight-stacking.md
  // §3.4, 2026-09-17) - splits its real available height 8:6 between the
  // Inbox-to-zero step's Tasks/Meetings PagedSections via the weighted
  // `<View style={{flex: REVIEW_INBOX_TASKS_WEIGHT}}>`/`{flex:
  // REVIEW_INBOX_MEETINGS_WEIGHT}}` boxes wrapping them in renderInboxZero,
  // above - same shape and same 8:6 ratio as screens/InboxScreen.tsx's own
  // stackedColumn.
  stackedColumn: {
    flex: 1,
  },
  // Gmail inbox step's own manual-refresh row (renderGmailInbox) - a single
  // pill plus an inline error, above the ReviewMasterDetail shell rather
  // than inside it, since an IMAP fetch is its own explicit action distinct
  // from reloading the files (see loadGmailInbox's own doc
  // comment for why).
  gmailToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  // Full-width failure reason under the Refresh button (renderGmailInbox) -
  // same FONT.small/6px shape as ui/GoogleCalendarPanel.tsx's errorText, but
  // allowed to wrap over a few lines since these messages name the cause and
  // the next step.
  gmailErrorText: {
    fontSize: FONT.small,
    marginBottom: 8,
  },
  paneTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowText: {
    fontSize: FONT.medium,
  },
  cancelText: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 2,
  },
  // ui/ReviewMasterDetail.tsx left-list rows (Stalled/Neglected/Done/On
  // Hold's flat ReviewLeftRow, and Unfocused next items' own flattened
  // rows) - 2026-09-16, docs/dev/technical-design-review-master-detail.md §3.
  masterRow: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  masterRowIndented: {
    paddingLeft: 20,
  },
  masterRowSelected: {
    backgroundColor: '#eeeeee',
    borderLeftWidth: 4,
    borderColor: COLORS.accent,
  },
  masterRowText: {
    fontSize: FONT.medium,
    fontWeight: '500',
  },
  // Muted, not struck through - an acted-on row stays fully legible and
  // re-tappable (requirements chat: "eine Haken reicht, aber auch Option es
  // nochmal zu ändern"), it just visually recedes a touch.
  masterRowActedOn: {
    opacity: 0.55,
  },
  masterGroupLabel: {
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  masterGroupLabelText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  masterNoteRow: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  // The detail column's empty state (no left-list row selected yet) -
  // centered guide copy, one shared shape per step (ReviewEmptyDetail).
  emptyDetail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  emptyDetailTitle: {
    fontSize: FONT.large,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDetailText: {
    fontSize: FONT.medium,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 12,
  },
  emptyDetailHint: {
    fontSize: FONT.small,
    fontStyle: 'italic',
    opacity: 0.6,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: FONT.small,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  sectionLabelHint: {
    fontWeight: '400',
    opacity: 0.6,
  },
  detailCaption: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginBottom: 8,
  },
  focusSubheading: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  cardMeetings: {
    marginBottom: 8,
  },
  cardShelved: {
    marginBottom: 8,
  },
  cardShelvedHeading: {
    marginTop: 0,
  },
  shelvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  shelvedText: {
    flex: 1,
    marginRight: 8,
  },
  /** One "Created from this email" entry: its row plus (once linked) the file line below. */
  gmailCreatedItem: {
    marginBottom: 4,
  },
  gmailLinkedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    marginBottom: 2,
  },
  gmailLinkedName: {
    flex: 1,
    marginLeft: 6,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 6,
  },
  pillActive: {
    borderWidth: 2,
  },
  /** Grayed-out "already focused" state for Unfocused-next-items' own
   * "+ Add to Daily/Weekly focus" pills (2026-09-16, Tilman feedback) - same
   * opacity convention this file's other disabled controls use. */
  pillDisabled: {
    opacity: 0.3,
  },
  pillText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  /** Unfocused-next-items' own compact "Set due date" field (2026-09-16,
   * Tilman feedback) - same YYYY-MM-DD text convention ui/QuickAddWidget.tsx's
   * own due-date field uses, sized to sit inline in a pillRow next to its
   * Save/✕ pills rather than the widget's own full-width layout. */
  /** Wrapper margins for the due-date field (DateInput takes layout via containerStyle) - the same 8/6 gap the pills beside it have. */
  dueDateWrap: {
    marginRight: 8,
    marginBottom: 6,
  },
  /** Pill-shaped corners to match the buttons in its row; border, vertical padding and font size come from DateInput's defaults. */
  dueDateInput: {
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  // Gmail Archive pill's tap flash (2026-09-28): inverted black fill, the
  // app's "active" convention (ui/theme.ts COLORS.accent/accentText).
  pillFlash: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  focusColumnsRow: {
    flexDirection: 'row',
  },
  // Focus reset's "Monthly" / "Weekly" block headings (2026-09-28).
  focusBlockHeading: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
  },
  focusBlockSpacing: {
    marginTop: 8,
  },
  focusKindBlock: {
    marginBottom: 12,
  },
  focusKindLabel: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 4,
  },
  addSlotText: {
    opacity: 0.6,
  },
  candidateList: {
    marginLeft: 12,
  },
});
