/**
 * The Week overview (docs/dev/history/technical-design-meeting-lists.md §2.7): seven day blocks, each a two-column grid of
 * ui/MeetingChip.tsx, filled down the left column first so reading order is
 * time order. Fixed capacity per page: weekdays 4 rows
 * x 2 = 8, weekend 2 x 2 = 4 - no measuring, no flex weights; an overfull day
 * pages on its own ("+N ‹ ›" in its header). Blocks are content-sized
 * (30 + 4 x 34 dp), which fits the ~1113 dp Week column (calibrated on
 * a device screenshot).
 *
 * Tapping a chip opens that day's panel and edits the meeting; tapping a day
 * header opens the panel only (screens/usePlanningScreen.ts's
 * openMeetingFromGrid / selectDay). An empty day shows an empty grid.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {entryDate} from '../domain/meetingSpan';
import {isoDateOffset, todayIso} from '../domain/meetingTime';
import {WeeklyMeetingEntry} from '../storage/weeklyAggregate';
import MeetingChip, {MEETING_CHIP_HEIGHT} from './MeetingChip';
import {FONT} from './theme';
import {formatDate} from '../domain/dateFormat';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAY_ROWS = 4;
const WEEKEND_ROWS = 2;
export const WEEK_DAY_HEADER_HEIGHT = 30;

function dayDate(weekStart: string, dayIndex: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return isoDateOffset(dayIndex, new Date(y, m - 1, d));
}

interface Props {
  /** Monday of the displayed week, YYYY-MM-DD. */
  weekStart: string;
  /** The week's entries (storage/weeklyAggregate.ts) - a multi-day meeting appears once per covered day. */
  meetings: WeeklyMeetingEntry[];
  selectedDate: string | null;
  editingKey: string | null;
  keyOf: (entry: WeeklyMeetingEntry) => string;
  onPressChip: (entry: WeeklyMeetingEntry) => void;
  onPressDay: (date: string) => void;
  textColor: string;
  borderColor: string;
}

export default function WeekGrid(props: Props): React.JSX.Element {
  const today = todayIso();
  return (
    <View style={styles.root}>
      {DAY_LABELS.map((label, dayIndex) => {
        const date = dayDate(props.weekStart, dayIndex);
        return (
          <WeekDayBlock
            key={date}
            label={`${label} ${formatDate(date, today)}${date === today ? ' · Today' : ''}`}
            date={date}
            rows={dayIndex >= 5 ? WEEKEND_ROWS : WEEKDAY_ROWS}
            weekend={dayIndex >= 5}
            entries={props.meetings.filter(e => entryDate(e) === date)}
            {...props}
          />
        );
      })}
    </View>
  );
}

function WeekDayBlock({
  label,
  date,
  rows,
  weekend,
  entries,
  selectedDate,
  editingKey,
  keyOf,
  onPressChip,
  onPressDay,
  textColor,
  borderColor,
}: Props & {label: string; date: string; rows: number; weekend: boolean; entries: WeeklyMeetingEntry[]}): React.JSX.Element {
  const capacity = rows * 2;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(entries.length / capacity));
  // A different day (week navigation) or fewer entries than before: clamp.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);
  const shown = entries.slice(page * capacity, (page + 1) * capacity);
  const columns = [shown.slice(0, rows), shown.slice(rows)];
  const selected = selectedDate === date;
  const fg = selected ? '#ffffff' : textColor;
  const hidden = entries.length - shown.length;

  return (
    <View style={[styles.block, weekend && styles.weekend]}>
      <Pressable
        onPress={() => onPressDay(date)}
        style={[styles.header, {borderBottomColor: textColor}, selected && {backgroundColor: textColor}]}>
        <Text style={[styles.headerText, {color: fg}]} numberOfLines={1}>
          {label}
          <Text style={styles.count}>{`  · ${entries.length}`}</Text>
        </Text>
        {pageCount > 1 && (
          <View style={styles.arrows}>
            <Text style={[styles.hidden, {color: fg}]}>+{hidden}</Text>
            <Pressable onPress={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} hitSlop={8} style={styles.arrowButton}>
              <Text style={[styles.arrow, {color: fg}, page === 0 && styles.arrowOff]}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              hitSlop={8}
              style={styles.arrowButton}>
              <Text style={[styles.arrow, {color: fg}, page >= pageCount - 1 && styles.arrowOff]}>›</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
      <View style={[styles.grid, {height: rows * MEETING_CHIP_HEIGHT}]}>
        {columns.map((column, c) => (
          <View key={c} style={[styles.column, c === 0 && styles.columnLeft]}>
            {column.map(entry => (
              <MeetingChip
                key={`${keyOf(entry)}@${entry.span?.date ?? ''}`}
                meeting={entry.meeting}
                span={entry.span}
                editing={editingKey === keyOf(entry)}
                onPress={() => onPressChip(entry)}
                textColor={textColor}
                borderColor={borderColor}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  block: {marginBottom: 6},
  weekend: {backgroundColor: '#efefea'},
  header: {
    height: WEEK_DAY_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    paddingHorizontal: 4,
  },
  headerText: {
    flex: 1,
    fontSize: FONT.small,
    fontWeight: '700',
    includeFontPadding: false,
  },
  count: {fontWeight: '400', opacity: 0.65},
  arrows: {flexDirection: 'row', alignItems: 'center'},
  hidden: {fontSize: FONT.small, opacity: 0.65, marginRight: 4},
  arrowButton: {paddingHorizontal: 8},
  arrow: {fontSize: FONT.medium, fontWeight: '700', includeFontPadding: false},
  arrowOff: {opacity: 0.25},
  grid: {flexDirection: 'row'},
  column: {flex: 1},
  columnLeft: {marginRight: 10},
});
