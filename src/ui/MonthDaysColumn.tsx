/**
 * The Month view's left column (docs/dev/technical-design-monthly-view.md §5.8):
 * one fixed row per calendar day, every row an equal `flex:1` share of the
 * bounded box it's given (flex-weight stacking, docs/dev/technical-design-flex-
 * weight-stacking.md) - on the A5X that's ~50px per row for 31 days, so no
 * paging is needed. Each row: "Th 01", the day's highlights joined with
 * " // " as far as they fit on one line, then "+N" for the rest, and - on
 * Mondays - a thicker top rule plus the ISO week number. Weekends are
 * shaded; the selected day is inverted. Tapping a row selects that day (the
 * screen then shows its day panel).
 *
 * How many labels fit is predicted with ui/textLineEstimator.ts against the
 * row's measured width (same estimator every multi-line row in the app
 * uses), so a crowded day degrades to "+N" instead of being clipped
 * mid-word.
 */
import React, {useState} from 'react';
import {LayoutChangeEvent, Pressable, StyleSheet, Text, View} from 'react-native';
import {withSpanArrows} from '../domain/meetingSpan';
import {MonthDay, MonthDayEntry} from '../storage/monthlyAggregate';
import {activeLineEstimator} from './textLineEstimator';
import {FONT} from './theme';

const WEEKDAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const SEPARATOR = '  //  ';
/** Day label (64) + week-number column (40) + "+N" chip allowance (44) + paddings/gaps. */
const ROW_CHROME_PX = 64 + 40 + 44 + 40;

interface Props {
  days: MonthDay[];
  selectedDate: string | null;
  todayDate: string;
  onSelectDay: (date: string) => void;
  textColor: string;
  borderColor: string;
}

/** A highlight's label with its multi-day arrows - domain/meetingSpan.ts's withSpanArrows, the same arrows Daily/Week rows use. */
function displayLabel(h: MonthDayEntry): string {
  return withSpanArrows(h.label, h.part);
}

/** How many of `labels` fit on one line at `widthPx` (at least 1 when there are any, so a row never shows only "+N"). */
function fitCount(labels: string[], widthPx: number): number {
  if (labels.length === 0 || widthPx <= 0) return labels.length;
  let n = 0;
  for (let i = 1; i <= labels.length; i++) {
    const text = labels.slice(0, i).join(SEPARATOR);
    if (activeLineEstimator.estimateLines(text, widthPx, FONT.medium) > 1) break;
    n = i;
  }
  return Math.max(1, n);
}

function inverse(color: string): string {
  const c = color.toLowerCase();
  return c === '#000' || c === '#000000' || c === 'black' ? '#ffffff' : '#000000';
}

export default function MonthDaysColumn({days, selectedDate, todayDate, onSelectDay, textColor, borderColor}: Props): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const labelWidth = Math.max(0, width - ROW_CHROME_PX);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {days.map(day => {
        const selected = day.date === selectedDate;
        const isToday = day.date === todayDate;
        const weekend = day.weekday >= 5;
        const fg = selected ? inverse(textColor) : textColor;
        const labels = day.highlights.map(displayLabel);
        const shown = fitCount(labels, labelWidth);
        const more = labels.length - shown;
        const dayNum = day.date.slice(8);
        return (
          <Pressable
            key={day.date}
            onPress={() => onSelectDay(day.date)}
            style={[
              styles.row,
              {borderColor},
              weekend && styles.weekend,
              day.weekday === 0 && [styles.weekStart, {borderTopColor: textColor}],
              selected && {backgroundColor: textColor},
            ]}>
            <Text style={[styles.dayLabel, {color: fg}, weekend && !selected && styles.weekendLabel]}>
              {WEEKDAY_SHORT[day.weekday]} {dayNum}
              {isToday ? ' •' : ''}
            </Text>
            <Text style={[styles.highlights, {color: fg}]} numberOfLines={1}>
              {labels.slice(0, shown).join(SEPARATOR)}
            </Text>
            {more > 0 && (
              <View style={[styles.moreChip, {borderColor: fg}]}>
                <Text style={[styles.moreText, {color: fg}]}>+{more}</Text>
              </View>
            )}
            <Text style={[styles.weekNo, {color: fg}]}>{day.isoWeek != null ? `W${day.isoWeek}` : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  weekend: {
    backgroundColor: '#efefea',
  },
  weekStart: {
    borderTopWidth: 3,
  },
  dayLabel: {
    width: 64,
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  weekendLabel: {
    opacity: 0.7,
  },
  highlights: {
    flex: 1,
    fontSize: FONT.medium,
  },
  moreChip: {
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  moreText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  weekNo: {
    width: 40,
    textAlign: 'right',
    fontSize: 13,
    opacity: 0.6,
  },
});
