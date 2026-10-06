/**
 * The shared day panel (docs/dev/technical-design-meeting-lists.md §2.6) - one
 * day's meetings as the standard MeetingList, with a Google mini-tab, used by
 * Daily (tabs Today | Tomorrow | Google), and by Week and Month (tabs
 * Meetings (n) | Google plus a Close button). Replaces ui/MonthDayPanel.tsx.
 *
 * Layout is the list's own (ui/listLayout.ts id `dayPanel`, default 2-line),
 * shared by every screen that shows this panel. The screen builds each row
 * (`renderRow`) so its action wiring stays with its state; the planning
 * screens use screens/usePlanningScreen.ts's `dayRowProps`.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatDayHeader} from '../domain/dateFormat';
import {todayIso} from '../domain/meetingTime';
import MeetingList from './MeetingList';
import {MeetingRowLayout} from './MeetingRow';
import MiniTabs, {MiniTabDef} from './MiniTabs';
import {FONT} from './theme';
import {visibleTabs} from './featureStore';

/** Tab key 'google' shows `googlePanel`; any other key shows the meeting list. */
export const GOOGLE_TAB = 'google';

interface Props<T, K extends string> {
  date: string;
  entries: T[];
  tabs: MiniTabDef<K>[];
  activeTab: K;
  onTabChange: (key: K) => void;
  /** Week/Month: a "Close" button in the tab strip (back to the focus panel). Daily omits it. */
  onClose?: () => void;
  /**
   * The Google tab's content (a date-limited ui/GoogleCalendarPanel), built by the screen.
   * null = the experimental Google Calendar integration is off: the Google tab is
   * not shown, and a remembered 'google' tab falls back to the first tab.
   */
  googlePanel: React.ReactNode | null;
  renderRow: (entry: T, layout: MeetingRowLayout) => React.ReactNode;
  emptyHint?: string;
  /** Extra reset signal for the list (Daily: the active context filter) - combined with `date`. */
  listResetKey?: string;
  textColor: string;
  borderColor: string;
}

export default function DayMeetingsPanel<T, K extends string>({
  date,
  entries,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  googlePanel,
  renderRow,
  emptyHint,
  listResetKey,
  textColor,
  borderColor,
}: Props<T, K>): React.JSX.Element {
  const count = entries.length;
  const shown = visibleTabs(tabs, activeTab, GOOGLE_TAB as K, googlePanel !== null);
  return (
    <View style={styles.root}>
      <MiniTabs
        tabs={shown.tabs}
        activeKey={shown.activeKey}
        onChange={onTabChange}
        trailing={
          onClose ? (
            <Pressable onPress={onClose} hitSlop={8} style={[styles.close, {borderColor: textColor}]}>
              <Text style={[styles.closeText, {color: textColor}]}>Close ✕</Text>
            </Pressable>
          ) : undefined
        }
        textColor={textColor}
        borderColor={borderColor}
      />
      <View style={styles.fill}>
        {shown.activeKey === GOOGLE_TAB ? (
          googlePanel
        ) : (
          <MeetingList
            listId="dayPanel"
            defaultLayout="twoLine"
            header={`${formatDayHeader(date, todayIso())} · ${count} meeting${count === 1 ? '' : 's'}`}
            rows={entries}
            renderRow={renderRow}
            resetKey={`${date}|${listResetKey ?? ''}`}
            emptyHint={emptyHint ?? 'No meetings on this day.'}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  fill: {flex: 1},
  close: {
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  closeText: {
    fontSize: FONT.small,
    fontWeight: '700',
  },
});
