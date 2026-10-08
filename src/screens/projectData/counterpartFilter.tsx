/**
 * The Current page's counterpart filter (docs/dev/history/technical-design-tending-threads.md
 * §3.9.4): set by tapping a counterpart on the Threads tab, view state only.
 * Todos show only those that belong to the counterpart in one of the three
 * ways of §1.2.1 (agreed in one of its meetings, `#owe/<leaf>`, `#wf/<leaf>`,
 * a thread tag of it or the plain leaf) and Meetings only those carrying a
 * thread of it or the leaf - storage/threadAggregate.ts's counterpartMatcher,
 * the predicate the overview classifies with. Lists filter after computing
 * every row's index against the full array (the index-safety rule).
 */
import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Meeting, Task} from '../../domain/types';
import {getCachedData} from '../../storage/dataCache';
import {counterpartMatcher} from '../../storage/threadAggregate';
import {useCachedInbox} from '../../ui/useCachedInbox';
import {useCachedItems} from '../../ui/useCachedItems';
import {FONT, SPACING} from '../../ui/theme';

export interface CounterpartFilter {
  leaf: string;
  /** A nested tag naming the counterpart (domain/counterparts.ts's counterpartTag). */
  tag: string;
}

export interface CounterpartPredicates {
  task: (task: Task) => boolean;
  meeting: (meeting: Meeting) => boolean;
}

/** The filter's predicates inside the scope of `path`, or null when no filter is set. */
export function useCounterpartPredicates(filter: CounterpartFilter | null | undefined, path: string): CounterpartPredicates | null {
  const items = useCachedItems();
  const inboxState = useCachedInbox();
  const inboxPath = getCachedData()?.paths.inboxFolder ?? null;
  return useMemo(() => {
    if (!filter) return null;
    const inbox = inboxState && inboxPath ? {path: inboxPath, tasks: inboxState.tasks, meetings: inboxState.meetings} : null;
    return counterpartMatcher(items, inbox, filter.tag, path);
  }, [filter, path, items, inboxState, inboxPath]);
}

/** The "<leaf> ✕" pill above Quick Add while the filter is set; ✕ clears it. */
export function CounterpartFilterPill({
  leaf,
  onClear,
  textColor,
  borderColor,
}: {
  leaf: string;
  onClear: () => void;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text onPress={onClear} suppressHighlighting style={[styles.pill, {color: textColor, borderColor}]}>
        {leaf} ✕
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', marginBottom: SPACING.sm},
  pill: {fontSize: FONT.small, fontWeight: '600', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3},
});
