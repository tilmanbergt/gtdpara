/**
 * Week view (docs/dev/technical-design-weekly-view.md) - the weekly counterpart
 * of screens/DailyView.tsx: a two-column layout for the currently-displayed
 * Monday..Sunday week - Meetings (grouped by weekday, ui/
 * WeeklyMeetingsColumn.tsx) on the left, a combined Todo/Meeting capture
 * widget plus the weekly Focus/Projects/Areas panel (ui/WeeklyFocusPanel.tsx)
 * on the right.
 *
 * Week navigation (§8): `weekOffset` is plain, unpersisted `useState(0)` -
 * every reopen of this tab starts back on the current week, same "sessions
 * held lightly" posture screens/DailyView.tsx's own focus-mode-only state
 * already uses (see that file's module doc comment). `‹`/`›` step it by ±1;
 * domain/weekDate.ts's `shiftWeeks`/`weekRangeIso`/`isoWeekOf` do the actual
 * calendar arithmetic. The header shows the ISO week number + year (chat:
 * "the week number in the year should be shown somewhere").
 *
 * Reads straight from storage/dataCache.ts's in-memory cache, same as every
 * other cross-project screen (falls back to rebuildCache if nothing's
 * cached yet).
 *
 * Meetings (left column): storage/weeklyAggregate.ts's `buildWeeklyAggregate`
 * over the displayed week's `[weekStart, weekEnd]` range (recomputed on every
 * render from `items`/`inbox` - a pure, synchronous transform, same as
 * screens/DailyView.tsx's own `displayAggregate`). A Meetings/Google
 * MiniTabs switch, same shape as Daily/Project/Inbox/Review's own Calendar
 * columns - "Google" uses ui/GoogleCalendarPanel.tsx's new `dateRange` prop
 * (docs/dev/technical-design-weekly-view.md §5) to show the same week window
 * instead of a from-today `maxDays` count. Editing a meeting row opens it in
 * the same QuickAddWidget instance the capture widget uses (its
 * `editingMeeting` mode) - there is no separate inline edit form, same
 * pattern DailyView's Calendar column uses.
 *
 * Focus (right column, §6): visible on the current week (`weekOffset ===
 * 0`), and - 2026-09-13 revision, chat: "allow already show[ing] the focus
 * areas and projects also for the following week, if it is friday to
 * sunday" - also on the *next* week (`weekOffset === 1`) whenever the real
 * today is Friday/Saturday/Sunday, so next week's priorities can be set
 * while still late in the current one (`canEditFocus`, keyed off the real
 * `new Date()`, not the displayed/shifted week). Any other past/future week
 * hides the panel entirely (not merely disables it) and shows a short
 * explanatory line in its place instead. `weeklyFocus` is still just a
 * plain per-item flag (storage/focusSlots.ts), not stored per ISO week, so
 * toggling it while previewing next week behaves identically to toggling it
 * on the current week - no new storage behavior, only which weeks show the
 * panel changed. `handleToggleItemWeeklyFocus` mirrors DailyView's own
 * `handleToggleItemFocus` exactly, just against `storage/focusSlots.ts`'s
 * `'weekly'` scope - that backend was already scope-parameterized, so this
 * needed no new storage code, only this screen-local wrapper.
 *
 * Capture widget (top of the right column): the same shared
 * ui/QuickAddWidget.tsx every other screen uses, combined Todo/Meeting mode
 * (chat decision - not meeting-only), always `fixedDestination: {type:
 * 'inbox'}` (this screen was never a filing surface either, same as Daily -
 * docs/dev/technical-design-filing-unification.md §6). `initialDate` defaults a
 * new meeting to today when browsing the current week, or to the displayed
 * week's Monday otherwise (chat: resolved via QuickAddWidget's existing
 * `initialDate` prop, no new capability needed) - editing an existing
 * meeting ignores `initialDate` entirely, same as everywhere else this
 * widget is used.
 *
 * Out of scope for this pass (docs/dev/technical-design-weekly-view.md §10,
 * §11.1): no task list column here (only the Focus panel's Next/Someday
 * counts) - unlike Daily, Week never shows individual open tasks; and
 * screens/ReviewScreen.tsx's own older inline-expand weekly-focus picker
 * (`WeeklyFocusKindSection`) is deliberately left untouched here, not
 * migrated to the arm-and-pick pattern this screen's own ui/
 * WeeklyFocusPanel.tsx uses - tracked separately as technical debt rather
 * than silently living with two different pickers.
 *
 * BUGFIX (2026-09-18, docs/dev/technical-design-note-templates.md Phase 3):
 * `handleCreateMeetingNote`/`handleOpenMeetingNote` never called
 * `refreshMeetingNoteBlock` - a pre-existing gap from before the note-
 * templates feature existed, caught while touching every other note-
 * creation call site for Todo notes. A meeting note created or opened from
 * this screen used to land/stay blank instead of getting its piece content
 * populated, unlike the exact same actions everywhere else in the app
 * (ProjectDataPanel.tsx/InboxScreen.tsx/ReviewScreen.tsx). Fixed by
 * mirroring those screens' own handlers exactly.
 *
 * Weekly goals (V2, docs/dev/technical-design-weekly-goals.md): `weekKey`
 * (domain/weekDate.ts's `isoWeekKey`, of the *displayed* week - not
 * necessarily today) drives both halves. On a `canEditFocus` week, ui/
 * WeeklyFocusPanel.tsx gets `weekKey` plus `handleSaveWeeklyGoal` and renders
 * each focused card's goal as a tap-to-edit row. On any other week it's
 * replaced (not disabled) by ui/WeeklyGoalsHistoryPanel.tsx, fed
 * `aggregate.historicalGoals` - goal-driven, not focus-driven, per the chat
 * decision captured in that file's own doc comment. `handleSaveWeeklyGoal`
 * mirrors this screen's other save-then-write-through handlers
 * (saveEntryMeetings et al.): reads `item`'s current rawContent/goals fresh
 * from the cache (never trusts a possibly-stale closed-over `item`), applies
 * domain/markdown.ts's `setGoalForWeek`, writes via storage/projectFile.ts's
 * `saveWeeklyGoals`, then write-throughs via storage/dataCache.ts's
 * `updateItemWeeklyGoals` and refreshes from the cache - same shape as every
 * other mutation in this file.
 *
 * Shared with the Month view (2026-09-23, docs/dev/technical-design-monthly-
 * view.md §5.10): every load/meeting/focus/goal action now lives in
 * screens/usePlanningScreen.ts, the focus panel is ui/PeriodFocusPanel.tsx
 * (scope "weekly"), the history panel ui/PeriodGoalsHistoryPanel.tsx, and the
 * "can this week be edited" rule domain/period.ts's canEditPeriod - this file
 * is layout only. Weekly focus cards now also show the item's goal for the
 * month the week belongs to, plus D/W/M badges.
 *
 * Meeting-list unification (2026-09-29, docs/dev/technical-design-meeting-lists.md
 * §2.9/§4.2): everything below the week header now lives in
 * screens/WeekPlanner.tsx (the chip grid ui/WeekGrid.tsx replaces
 * ui/WeeklyMeetingsColumn.tsx; tapping a chip or day header opens the shared
 * day panel ui/DayMeetingsPanel.tsx on the right, like the Month view), so the
 * Review's week-ahead step can show the very same screen. This file is the
 * header + week navigation only.
 */
import React, {useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {shiftPeriod} from '../domain/period';
import {isoWeekOf} from '../domain/weekDate';
import {FolderEntry} from '../supernote/fileSystem';
import {RefreshHandle} from '../ui/TabBar';
import {common} from '../ui/commonStyles';
import LoadErrorNotice from '../ui/LoadErrorNotice';
import {FONT} from '../ui/theme';
import WeekPlanner from './WeekPlanner';
import {usePlanningScreen} from './usePlanningScreen';
import {usePerfRender} from '../utils/perf';

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  /** Switches to the Inbox tab - an Inbox-sourced meeting's source tap jumps here (there's no Project/Area to open). */
  onOpenInbox?: () => void;
  /** Registers this screen's reload action with App.tsx/TabBar's shared 🔄 icon - see ui/TabBar.tsx's module doc comment. */
  onRegisterRefresh?: (handle: RefreshHandle | null) => void;
  onRefreshingChange?: (refreshing: boolean) => void;
  /** Switches to Settings' Calendar sub-tab - the Google mini-tab's empty state. */
  onOpenCalendarSettings?: () => void;
}

export default function WeekView({
  onOpenItem,
  onOpenInbox,
  onRegisterRefresh,
  onRefreshingChange,
  onOpenCalendarSettings,
}: Props): React.JSX.Element {
  usePerfRender('WeekView');
  const textColor = '#000000';
  const borderColor = '#dddddd';
  const placeholderColor = '#999999';

  const planning = usePlanningScreen({logTag: 'WeekView', onRegisterRefresh, onRefreshingChange});
  const {loading, error, load} = planning;

  // Plain, unpersisted - every fresh mount starts on the current week.
  const [weekOffset, setWeekOffset] = useState(0);
  const {year, week} = isoWeekOf(shiftPeriod('weekly', new Date(), weekOffset));
  const changeWeek = (delta: number) => planning.closeDayPanel(() => setWeekOffset(o => o + delta));

  return (
    <View style={common.container}>
      {loading && <ActivityIndicator style={common.spacer} />}

      {!loading && error && <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />}

      {!loading && !error && (
        <View style={common.content}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => changeWeek(-1)} hitSlop={8} style={styles.navButton}>
              <Text style={[styles.navButtonText, {color: textColor}]}>‹</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, {color: textColor}]}>
                Week {week} · {year}
                {weekOffset === 0 ? ' (current)' : ''}
              </Text>
            </View>
            <Pressable onPress={() => changeWeek(1)} hitSlop={8} style={styles.navButton}>
              <Text style={[styles.navButtonText, {color: textColor}]}>›</Text>
            </Pressable>
          </View>
          <WeekPlanner
            planning={planning}
            weekOffset={weekOffset}
            onOpenItem={onOpenItem}
            onOpenInbox={onOpenInbox}
            onOpenCalendarSettings={onOpenCalendarSettings}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  navButtonText: {
    fontSize: FONT.large,
    fontWeight: '700',
  },
});
