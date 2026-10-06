/**
 * Month view (docs/dev/technical-design-monthly-view.md) - the next planning
 * horizon after the Week view, built from the same parts:
 *
 * - Header: ‹ "October 2026" ›, plus how many highlights the month has.
 *   `monthOffset` is plain, unpersisted state - every reopen starts on the
 *   current month (same posture as WeekView's weekOffset).
 * - Left column: Month | Google mini-tabs. "Month" is ui/MonthDaysColumn.tsx -
 *   one row per day showing that day's HAND-PICKED highlights only (meetings
 *   tagged `#monthly`, set via the "M" toggle), short form if the title has
 *   one, multi-day meetings on every day they cover. "Google" is the
 *   month's Google calendar for copying -
 *   anything copied from a Google tab on this screen becomes a highlight
 *   (`#monthly`) automatically.
 * - Right column: Quick Add on top (always - needed to edit a meeting's
 *   time/length and to add one to the selected day),
 *   then EITHER the day panel (ui/DayMeetingsPanel.tsx, shared with Week and
 *   Daily - after tapping a day: all of that day's meetings as the standard
 *   2-line rows, pick highlights with the M toggle) OR the
 *   monthly focus panel (ui/PeriodFocusPanel.tsx, scope "monthly" - the same
 *   component and UX as the Week view's) on months whose focus can be edited
 *   (domain/period.ts's canEditPeriod: this month, and next month during the
 *   last 7 days), else the read-only goal history (ui/PeriodGoalsHistoryPanel).
 *
 * All loading and every meeting/focus/goal action come from
 * screens/usePlanningScreen.ts (shared with WeekView) - this file is layout.
 * Quick Add here creates into the Inbox, like Week and Daily; with a day
 * selected, a new meeting defaults to that day with M already on.
 */
import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {Destination} from '../domain/destination';
import {todayIso} from '../domain/meetingTime';
import {canEditPeriod, monthTitle, periodOf, shiftPeriod} from '../domain/period';
import {buildMonthlyAggregate, meetingsOnDay} from '../storage/monthlyAggregate';
import {WeeklyMeetingEntry} from '../storage/weeklyAggregate';
import {FolderEntry} from '../supernote/fileSystem';
import GoogleCalendarPanel from '../ui/GoogleCalendarPanel';
import MiniTabs, {MiniTabDef} from '../ui/MiniTabs';
import DayMeetingsPanel from '../ui/DayMeetingsPanel';
import MeetingRow from '../ui/MeetingRow';
import {MiniTabDef as DayTabDef} from '../ui/MiniTabs';
import MonthDaysColumn from '../ui/MonthDaysColumn';
import PeriodFocusPanel from '../ui/PeriodFocusPanel';
import PeriodGoalsHistoryPanel from '../ui/PeriodGoalsHistoryPanel';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import {useStableCallback} from '../ui/useStableCallback';
import {AbbrevFileMatch} from '../domain/abbrev';
import {CachedItem} from '../storage/dataCache';
import {common} from '../ui/commonStyles';
import LoadErrorNotice from '../ui/LoadErrorNotice';
import {FONT} from '../ui/theme';
import {useFeatures, visibleTabs} from '../ui/featureStore';
import {dayEntryKey, meetingKey, useLinkedFileMissing, usePlanningScreen} from './usePlanningScreen';
import {usePerfRender} from '../utils/perf';

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  /** Switches to Settings' Calendar sub-tab - the Google mini-tab's empty state. */
  onOpenCalendarSettings?: () => void;
}

const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};

type LeftTab = 'month' | 'google';
type DayTab = 'meetings' | 'google';
const LEFT_TABS: MiniTabDef<LeftTab>[] = [
  {key: 'month', label: 'Month'},
  {key: 'google', label: 'Google'},
];

export default function MonthView({
  onOpenItem,
  onOpenCalendarSettings,
}: Props): React.JSX.Element {
  usePerfRender('MonthView');
  const textColor = '#000000';
  const borderColor = '#dddddd';
  const placeholderColor = '#999999';

  const planning = usePlanningScreen({logTag: 'MonthView'});
  const {items, settings, inboxPath, paths, inbox, loading, error, load, editingKey} = planning;

  const [monthOffset, setMonthOffset] = useState(0);
  const [leftTabState, setLeftTab] = useState<LeftTab>('month');
  // Google tabs only while the experimental Google Calendar integration is on
  // (docs/dev/technical-design-about-debug-experimental.md §3.2).
  const features = useFeatures();
  const left = visibleTabs(LEFT_TABS, leftTabState, 'google', features.googleCalendar);
  const leftTab = left.activeKey;
  const [dayTab, setDayTab] = useState<DayTab>('meetings');
  const {selectedDate} = planning;

  const shiftedNow = shiftPeriod('monthly', new Date(), monthOffset);
  const period = periodOf('monthly', shiftedNow);
  const isCurrentMonth = monthOffset === 0;
  const todayDate = todayIso();
  const canEditFocus = canEditPeriod('monthly', monthOffset);

  const changeMonth = (delta: number) => planning.closeDayPanel(() => setMonthOffset(o => o + delta));

  // Memoized on their real inputs (docs/dev/technical-design-render-perf-ab.md
  // §3 B4): `period` is a new object every render, so its key/start/end are
  // the deps; `todayDate` keeps "today"-dependent parts fresh over midnight.
  const aggregate = useMemo(
    () =>
      buildMonthlyAggregate(items, inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null, inboxPath ?? '', period),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, inbox, inboxPath, period.key, period.start, period.end, todayDate],
  );
  const dayRows = useMemo(
    () =>
      selectedDate
        ? meetingsOnDay(items, inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null, inboxPath ?? '', selectedDate)
        : [],
    [items, inbox, inboxPath, selectedDate],
  );

  // The meeting being edited in Quick Add is always one from the day panel.
  const editingMeetingEntry: WeeklyMeetingEntry | null =
    editingKey != null ? dayRows.find(e => meetingKey(e) === editingKey) ?? null : null;
  const linkedFileMissing = useLinkedFileMissing(editingMeetingEntry?.meeting.linkedFile, paths);

  const dayTabs: DayTabDef<DayTab>[] = [
    {key: 'meetings', label: `Meetings (${dayRows.length})`},
    {key: 'google', label: 'Google'},
  ];

  const newMeetingDate = selectedDate ?? (isCurrentMonth ? todayDate : period.start);

  // Stable props for the React.memo'd QuickAddWidget/PeriodFocusPanel
  // (docs/dev/technical-design-render-perf-ab.md §3 B2) - all only called from
  // their event handlers; presence conditions stay at the call sites.
  const stableIsMeetingDateVisible = useStableCallback((date: string) => date >= period.start && date <= period.end);
  const stableSaveEditMeeting = useStableCallback((fields: MeetingQuickAddFields, nextLinkedFile: string) =>
    editingMeetingEntry ? planning.commitMeetingEdit(editingMeetingEntry, fields, nextLinkedFile) : Promise.resolve(false),
  );
  const stableDeleteEdit = useStableCallback(() => {
    if (editingMeetingEntry) planning.handleCancelMeeting(editingMeetingEntry);
  });
  const stableQuickFileEdit = useStableCallback((target: AbbrevFileMatch, payload: QuickFilePayload) =>
    editingMeetingEntry ? planning.handleQuickFileEdit(editingMeetingEntry, target, payload) : Promise.resolve(),
  );
  const stableToggleFocus = useStableCallback((item: CachedItem, value: boolean) => planning.toggleFocus(item, 'monthly', value));
  const stableSaveGoal = useStableCallback((item: CachedItem, key: string, text: string) =>
    planning.saveGoal(item, 'monthly', key, text),
  );

  return (
    <View style={common.container}>
      {loading && <ActivityIndicator style={common.spacer} />}

      {!loading && error && <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />}

      {!loading && !error && (
        <View style={common.content}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => changeMonth(-1)} hitSlop={8} style={styles.navButton}>
              <Text style={[styles.navButtonText, {color: textColor}]}>‹</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, {color: textColor}]}>
                {monthTitle(shiftedNow)}
                {isCurrentMonth ? ' (current)' : ''}
                {`  ·  ${aggregate.highlightCount} highlight${aggregate.highlightCount === 1 ? '' : 's'}`}
              </Text>
            </View>
            <Pressable onPress={() => changeMonth(1)} hitSlop={8} style={styles.navButton}>
              <Text style={[styles.navButtonText, {color: textColor}]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.middleRow}>
            <View style={[common.column, common.columnLeft]}>
              <MiniTabs tabs={left.tabs} activeKey={leftTab} onChange={setLeftTab} textColor={textColor} borderColor={borderColor} />
              <View style={styles.columnScroll}>
                {leftTab === 'month' ? (
                  <MonthDaysColumn
                    days={aggregate.days}
                    selectedDate={selectedDate}
                    todayDate={todayDate}
                    onSelectDay={planning.selectDay}
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                ) : (
                  <GoogleCalendarPanel
                    copyAsHighlight
                    dateRange={{start: period.start, end: period.end}}
                    defaultDestination={FIXED_INBOX_DESTINATION}
                    items={items}
                    icsUrl={settings?.googleCalendarIcsUrl ?? ''}
                    inboxPath={inboxPath ?? ''}
                    onOpenSettings={() => onOpenCalendarSettings?.()}
                    textColor={textColor}
                    borderColor={borderColor}
                    placeholderColor={placeholderColor}
                  />
                )}
              </View>
            </View>

            <View style={common.column}>
              <View style={styles.columnScroll}>
                <QuickAddWidget
                  layoutKey="month"
                  fixedDestination={FIXED_INBOX_DESTINATION}
                  onAddTask={planning.handleAddTask}
                  onAddMeeting={planning.handleAddMeeting}
                  initialDate={newMeetingDate}
                  // A meeting added from the day panel is meant for the month.
                  initialMonthly={selectedDate != null}
                  isMeetingDateVisible={stableIsMeetingDateVisible}
                  editingMeeting={editingMeetingEntry?.meeting}
                  onSaveEditMeeting={editingMeetingEntry ? stableSaveEditMeeting : undefined}
                  editTargetKey={editingKey}
                  flushEditRef={planning.flushEditRef}
                  onCancelEdit={planning.cancelEditTarget}
                  onDeleteEdit={stableDeleteEdit}
                  onQuickFile={editingMeetingEntry ? stableQuickFileEdit : undefined}
                  editingItemPath={
                    editingMeetingEntry && editingMeetingEntry.item.kind !== 'inbox' ? editingMeetingEntry.item.path : null
                  }
                  linkedFileMissing={linkedFileMissing}
                  textColor={textColor}
                  borderColor={borderColor}
                  placeholderColor={placeholderColor}
                />
                <View style={[common.divider, {backgroundColor: borderColor}]} />

                {selectedDate ? (
                  <DayMeetingsPanel
                    date={selectedDate}
                    entries={dayRows}
                    tabs={dayTabs}
                    activeTab={dayTab}
                    onTabChange={setDayTab}
                    onClose={() => planning.closeDayPanel()}
                    renderRow={(entry, layout) => (
                      <MeetingRow
                        key={dayEntryKey(entry)}
                        {...planning.dayRowProps(entry, layout, {
                          onOpenSource: item =>
                            item.kind !== 'inbox' && onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true}),
                          textColor,
                          borderColor,
                        })}
                      />
                    )}
                    emptyHint="No meetings on this day. Add one above - it starts with M on."
                    googlePanel={
                      features.googleCalendar ? (
                      <GoogleCalendarPanel
                        copyAsHighlight
                        dateRange={{start: selectedDate, end: selectedDate}}
                        defaultDestination={FIXED_INBOX_DESTINATION}
                        items={items}
                        icsUrl={settings?.googleCalendarIcsUrl ?? ''}
                        inboxPath={inboxPath ?? ''}
                        onOpenSettings={() => onOpenCalendarSettings?.()}
                        textColor={textColor}
                        borderColor={borderColor}
                        placeholderColor={placeholderColor}
                      />
                      ) : null
                    }
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                ) : canEditFocus ? (
                  paths && (
                    <PeriodFocusPanel
                      scope="monthly"
                      items={items}
                      projectsPath={paths.projects}
                      areasPath={paths.areas}
                      projectLimit={settings?.monthlyFocusProjectCount ?? 0}
                      areaLimit={settings?.monthlyFocusAreaCount ?? 0}
                      focusCards={aggregate.focusCards}
                      periodKey={period.key}
                      onOpenItem={onOpenItem}
                      onToggle={stableToggleFocus}
                      onSaveGoal={stableSaveGoal}
                      textColor={textColor}
                      borderColor={borderColor}
                      placeholderColor={placeholderColor}
                    />
                  )
                ) : (
                  <>
                    <Text style={[styles.hint, {color: textColor}]}>
                      Monthly focus is only editable for the current month (and next month during the last 7 days).
                    </Text>
                    <PeriodGoalsHistoryPanel
                      scope="monthly"
                      entries={aggregate.historicalGoals}
                      periodLabel={monthTitle(shiftedNow)}
                      onOpenItem={onOpenItem}
                      textColor={textColor}
                      borderColor={borderColor}
                    />
                  </>
                )}
              </View>
            </View>
          </View>
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
  middleRow: {
    flexDirection: 'row',
    flex: 1,
  },
  columnScroll: {
    flex: 1,
  },
  hint: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginTop: 8,
  },
});
