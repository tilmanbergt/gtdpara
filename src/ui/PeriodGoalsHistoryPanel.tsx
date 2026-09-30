/**
 * Read-only goal history for a past/future period whose focus can't be
 * edited (docs/dev/technical-design-monthly-view.md §5.5) - ui/
 * WeeklyGoalsHistoryPanel.tsx generalized by `scope`. Goal-driven, not
 * focus-driven: lists exactly the items that had a goal recorded for the
 * displayed period (storage/periodGoals.ts's findGoalsForPeriod), regardless
 * of their current focus flags; nothing is editable here.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PeriodScope} from '../domain/period';
import {GoalHistoryEntry} from '../storage/periodGoals';
import {FolderEntry} from '../supernote/fileSystem';
import {FONT} from './theme';

interface Props {
  scope: PeriodScope;
  entries: GoalHistoryEntry[];
  /** Shown in the empty state, e.g. "week 2026-W41" / "October 2026". */
  periodLabel: string;
  /** Jump to a Project/Area's Current tab (App.tsx's `openItem`). Entries are always project/area - Inbox has no goals. */
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  textColor: string;
  borderColor: string;
}

export default function PeriodGoalsHistoryPanel({scope, entries, periodLabel, onOpenItem, textColor, borderColor}: Props): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <Text style={[styles.empty, {color: textColor}]}>
        No {scope === 'weekly' ? 'weekly' : 'monthly'} goals were recorded for {periodLabel}.
      </Text>
    );
  }

  return (
    <View>
      {entries.map(entry => (
        <Pressable
          key={entry.item.path}
          style={[styles.row, {borderColor}]}
          onPress={() => onOpenItem(entry.item.kind as 'project' | 'area', {name: entry.item.name, path: entry.item.path, isFolder: true})}
          hitSlop={4}>
          <Text style={[styles.name, {color: textColor}]} numberOfLines={1}>
            {entry.item.name}
          </Text>
          <Text style={[styles.goal, {color: textColor}]} numberOfLines={2}>
            🎯 {entry.goal}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  name: {
    fontSize: FONT.medium,
  },
  goal: {
    fontSize: FONT.small,
    marginTop: 2,
  },
  empty: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginTop: 8,
  },
});
