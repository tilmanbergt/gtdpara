/**
 * The Week screen's body (docs/dev/history/technical-design-meeting-lists.md §2.9) -
 * everything below the "‹ Week 40 · 2026 ›" header, extracted from
 * screens/WeekView.tsx so the Review's "week ahead" step can show exactly the
 * same screen (design §4.6).
 *
 * - Left: Meetings | Google mini-tabs; "Meetings" is ui/WeekGrid.tsx (chips,
 *   4 x 2 per weekday, 2 x 2 per weekend day).
 * - Right: Quick Add on top, then EITHER the shared day panel
 *   (ui/DayMeetingsPanel.tsx, after tapping a chip or a day header) OR the
 *   weekly focus panel / goal history - the same pattern as the Month view.
 *   No "Focus" label above Quick Add, so Week and Month line up.
 *
 * All state and actions come from screens/usePlanningScreen.ts, which the
 * host screen owns (it also owns loading/refresh) and passes in.
 */
import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Destination} from '../domain/destination';
import {todayIso} from '../domain/meetingTime';
import {canEditPeriod, periodOf, shiftPeriod} from '../domain/period';
import {meetingsOnDay} from '../storage/monthlyAggregate';
import {buildWeeklyAggregate, WeeklyMeetingEntry} from '../storage/weeklyAggregate';
import {FolderEntry} from '../supernote/fileSystem';
import DayMeetingsPanel from '../ui/DayMeetingsPanel';
import GoogleCalendarPanel from '../ui/GoogleCalendarPanel';
import {useFeatures, visibleTabs} from '../ui/featureStore';
import MeetingRow from '../ui/MeetingRow';
import MiniTabs, {MiniTabDef} from '../ui/MiniTabs';
import PeriodFocusPanel from '../ui/PeriodFocusPanel';
import PeriodGoalsHistoryPanel from '../ui/PeriodGoalsHistoryPanel';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import {useStableCallback} from '../ui/useStableCallback';
import {AbbrevFileMatch} from '../domain/abbrev';
import {CachedItem} from '../storage/dataCache';
import WeekGrid from '../ui/WeekGrid';
import {common} from '../ui/commonStyles';
import {FONT} from '../ui/theme';
import {dayEntryKey, meetingKey, useLinkedFileMissing, usePlanningScreen} from './usePlanningScreen';
import {usePerfRender} from '../utils/perf';

const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};

type LeftTab = 'meetings' | 'google';
const LEFT_TABS: MiniTabDef<LeftTab>[] = [
  {key: 'meetings', label: 'Meetings'},
  {key: 'google', label: 'Google'},
];
type DayTab = 'meetings' | 'google';

interface Props {
  planning: ReturnType<typeof usePlanningScreen>;
  /** 0 = the current week, ±n = shifted (the host's ‹ › header owns it). */
  weekOffset: number;
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  onOpenInbox?: () => void;
  onOpenCalendarSettings?: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
  /** Shown at the right end of the left Meetings | Google tab row - the Review's week-ahead step puts its ‹ Week 40 › navigation here, since it has no room for a separate header line above the fixed-height grid. */
  leftTabsTrailing?: React.ReactNode;
}

export default function WeekPlanner({
  planning,
  weekOffset,
  onOpenItem,
  onOpenInbox,
  onOpenCalendarSettings,
  textColor,
  borderColor,
  placeholderColor,
  leftTabsTrailing,
}: Props): React.JSX.Element {
  usePerfRender('WeekPlanner');
  const {items, settings, inboxPath, paths, inbox, editingKey, selectedDate} = planning;
  const [leftTabState, setLeftTab] = useState<LeftTab>('meetings');
  // Google tabs only while the experimental Google Calendar integration is on
  // (docs/dev/history/technical-design-about-debug-experimental.md §3.2).
  const features = useFeatures();
  const left = visibleTabs(LEFT_TABS, leftTabState, 'google', features.googleCalendar);
  const leftTab = left.activeKey;
  const [dayTab, setDayTab] = useState<DayTab>('meetings');

  const shiftedNow = shiftPeriod('weekly', new Date(), weekOffset);
  const period = periodOf('weekly', shiftedNow);
  const {start: weekStart, end: weekEnd, key: weekKey} = period;
  const isCurrentWeek = weekOffset === 0;
  const canEditFocus = canEditPeriod('weekly', weekOffset);

  // Memoized on their real inputs (docs/dev/history/technical-design-render-perf-ab.md
  // §3 B4); `todayDate` keeps "today"-dependent parts fresh over midnight.
  const todayDate = todayIso();
  const aggregate = useMemo(
    () =>
      buildWeeklyAggregate(
        items,
        inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null,
        inboxPath ?? '',
        weekStart,
        weekEnd,
        weekKey,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, inbox, inboxPath, weekStart, weekEnd, weekKey, todayDate],
  );
  const dayRows = useMemo(
    () =>
      selectedDate
        ? meetingsOnDay(items, inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null, inboxPath ?? '', selectedDate)
        : [],
    [items, inbox, inboxPath, selectedDate],
  );

  // The meeting in Quick Add's edit mode: from the day panel, else from the
  // grid (a multi-day meeting may start before this week - found via the day).
  const editingMeetingEntry: WeeklyMeetingEntry | null =
    editingKey != null
      ? dayRows.find(e => meetingKey(e) === editingKey) ?? aggregate.meetings.find(e => meetingKey(e) === editingKey) ?? null
      : null;
  const linkedFileMissing = useLinkedFileMissing(editingMeetingEntry?.meeting.linkedFile, paths);

  const openSource = (item: WeeklyMeetingEntry['item']) => {
    if (item.kind === 'inbox') {
      onOpenInbox?.();
      return;
    }
    onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true});
  };

  const dayTabs: MiniTabDef<DayTab>[] = [
    {key: 'meetings', label: `Meetings (${dayRows.length})`},
    {key: 'google', label: 'Google'},
  ];

  // Stable props for the React.memo'd QuickAddWidget/PeriodFocusPanel
  // (docs/dev/history/technical-design-render-perf-ab.md §3 B2) - all only called from
  // their event handlers; presence conditions stay at the call sites.
  const stableIsMeetingDateVisible = useStableCallback((date: string) => date >= weekStart && date <= weekEnd);
  const stableSaveEditMeeting = useStableCallback((fields: MeetingQuickAddFields, nextLinkedFile: string) =>
    editingMeetingEntry ? planning.commitMeetingEdit(editingMeetingEntry, fields, nextLinkedFile) : Promise.resolve(false),
  );
  const stableDeleteEdit = useStableCallback(() => {
    if (editingMeetingEntry) planning.handleCancelMeeting(editingMeetingEntry);
  });
  const stableQuickFileEdit = useStableCallback((target: AbbrevFileMatch, payload: QuickFilePayload) =>
    editingMeetingEntry ? planning.handleQuickFileEdit(editingMeetingEntry, target, payload) : Promise.resolve(),
  );
  const stableToggleFocus = useStableCallback((item: CachedItem, value: boolean) => planning.toggleFocus(item, 'weekly', value));
  const stableSaveGoal = useStableCallback((item: CachedItem, key: string, text: string) =>
    planning.saveGoal(item, 'weekly', key, text),
  );

  return (
    <View style={styles.middleRow}>
      <View style={[common.column, common.columnLeft]}>
        <MiniTabs
          tabs={left.tabs}
          activeKey={leftTab}
          onChange={setLeftTab}
          textColor={textColor}
          borderColor={borderColor}
          trailing={leftTabsTrailing}
        />
        <View style={styles.fill}>
          {leftTab === 'meetings' ? (
            <>
              <WeekGrid
                weekStart={weekStart}
                meetings={aggregate.meetings}
                selectedDate={selectedDate}
                editingKey={editingKey}
                keyOf={meetingKey}
                onPressChip={planning.openMeetingFromGrid}
                onPressDay={planning.selectDay}
                textColor={textColor}
                borderColor={borderColor}
              />
            </>
          ) : (
            <GoogleCalendarPanel
              dateRange={{start: weekStart, end: weekEnd}}
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
        <View style={styles.fill}>
          <QuickAddWidget
            layoutKey="week"
            fixedDestination={FIXED_INBOX_DESTINATION}
            onAddTask={planning.handleAddTask}
            onAddMeeting={planning.handleAddMeeting}
            initialDate={selectedDate ?? (isCurrentWeek ? todayIso() : weekStart)}
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
                  {...planning.dayRowProps(entry, layout, {onOpenSource: openSource, textColor, borderColor})}
                />
              )}
              googlePanel={
                features.googleCalendar ? (
                <GoogleCalendarPanel
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
                scope="weekly"
                items={items}
                projectsPath={paths.projects}
                areasPath={paths.areas}
                projectLimit={settings?.weeklyFocusProjectCount ?? 0}
                areaLimit={settings?.weeklyFocusAreaCount ?? 0}
                focusCards={aggregate.focusCards}
                periodKey={weekKey}
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
                Weekly focus is only editable for the current week (and next week on Fri–Sun).
              </Text>
              <PeriodGoalsHistoryPanel
                scope="weekly"
                entries={aggregate.historicalGoals}
                periodLabel={`week ${weekKey}`}
                onOpenItem={onOpenItem}
                textColor={textColor}
                borderColor={borderColor}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  middleRow: {
    flexDirection: 'row',
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  hint: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginTop: 8,
  },
});
