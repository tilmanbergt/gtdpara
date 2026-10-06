/**
 * The Review's "Week ahead" step (docs/dev/technical-design-meeting-lists.md §4.6,
 * Tilman 2026-09-29: "keep the review's week preview as close to the week
 * view, perhaps even replicating it exactly ... technically simple, reuse as
 * much as possible"). It is the Week screen's body, screens/WeekPlanner.tsx,
 * with its own screens/usePlanningScreen.ts instance. The "‹ Week 40 ›"
 * navigation sits at the right end of the grid's Meetings | Google tab row:
 * the Review's step navigation already takes ~50 dp that the Week tab does
 * not have, and the grid is fixed-height, so there is no room for a separate
 * header line.
 *
 * - It opens on next week from Friday to Sunday (the usual review days),
 *   otherwise on the current week, the same rule domain/period.ts's
 *   canEditPeriod uses to allow editing next week's focus.
 * - The Review screen's own refresh icon stays with the Review, so this step
 *   does not register one.
 * - Leaving the step calls `onLeave`: the Review then rebuilds its own
 *   aggregate and reloads its Inbox copy, because meetings and todos added or
 *   edited here went through the planning hook, not through the Review's
 *   state.
 */
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {shiftPeriod} from '../../../domain/period';
import {isoWeekOf, weekAheadOffset} from '../../../domain/weekDate';
import {FolderEntry} from '../../../supernote/fileSystem';
import LoadErrorNotice from '../../../ui/LoadErrorNotice';
import {common} from '../../../ui/commonStyles';
import {FONT} from '../../../ui/theme';
import WeekPlanner from '../../WeekPlanner';
import {usePlanningScreen} from '../../usePlanningScreen';

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  onOpenCalendarSettings?: () => void;
  /** Called once when the step unmounts (left, or the tab changed). */
  onLeave?: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export default function ReviewWeekAhead({
  onOpenItem,
  onOpenCalendarSettings,
  onLeave,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  const planning = usePlanningScreen({logTag: 'ReviewWeekAhead'});
  const {loading, error, load} = planning;
  const [weekOffset, setWeekOffset] = useState(() => weekAheadOffset());
  const {week} = isoWeekOf(shiftPeriod('weekly', new Date(), weekOffset));
  const changeWeek = (delta: number) => planning.closeDayPanel(() => setWeekOffset(o => o + delta));

  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  useEffect(() => () => onLeaveRef.current?.(), []);

  if (loading) return <ActivityIndicator style={common.spacer} />;
  if (error) return <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />;

  const weekNav = (
    <View style={styles.nav}>
      <Pressable onPress={() => changeWeek(-1)} hitSlop={8} style={styles.navButton}>
        <Text style={[styles.navButtonText, {color: textColor}]}>‹</Text>
      </Pressable>
      <Text style={[styles.navTitle, {color: textColor}]}>
        Week {week}
        {weekOffset === 0 ? ' (current)' : weekOffset === 1 ? ' (next)' : ''}
      </Text>
      <Pressable onPress={() => changeWeek(1)} hitSlop={8} style={styles.navButton}>
        <Text style={[styles.navButtonText, {color: textColor}]}>›</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <WeekPlanner
        planning={planning}
        weekOffset={weekOffset}
        onOpenItem={onOpenItem}
        onOpenCalendarSettings={onOpenCalendarSettings}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
        leftTabsTrailing={weekNav}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  navButton: {
    paddingHorizontal: 12,
  },
  navButtonText: {
    fontSize: FONT.large,
    fontWeight: '700',
  },
});
