/**
 * Quick Add's R1: the Todo / Meeting (/ Note) mini-tabs. A tab never
 * disappears; a locked one greys out - Meeting while `taskOnly`, the other
 * kind while an edit is open, Note while the Files pane has no folder to
 * create in. Note is rendered only where a screen passes `onAddNote`.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT} from '../theme';
import {rowStyles} from './styles';
import {QuickAddType} from './types';
import {QuickAddCore} from './useQuickAddCore';

interface Props {
  core: QuickAddCore;
  taskOnly: boolean;
  /** Whether the Note tab is rendered at all. */
  hasNoteTab: boolean;
  noteFolderPath: string | null;
  textColor: string;
}

export default function TabsRow({core, taskOnly, hasNoteTab, noteFolderPath, textColor}: Props): React.JSX.Element {
  const {displayType, isEditing, editFields} = core;
  const disabled: Record<QuickAddType, boolean> = {
    task: editFields?.kind === 'meeting',
    meeting: taskOnly || editFields?.kind === 'task',
    // Note has no edit mode of its own, so only a missing folder locks it.
    note: !noteFolderPath,
  };
  const select = (type: QuickAddType) => {
    if (isEditing) return; // locked tabs are non-interactive while editing
    if (type === 'meeting' && taskOnly) return;
    if (type === 'note' && !noteFolderPath) return;
    core.setActiveType(type);
  };
  const tab = (type: QuickAddType, label: string) => (
    <Pressable onPress={() => select(type)} hitSlop={8} disabled={isEditing || disabled[type]}>
      <Text
        style={[
          styles.tabText,
          {color: textColor},
          displayType === type && styles.tabTextActive,
          disabled[type] && rowStyles.tabTextDisabled,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.tabs}>
      {tab('task', 'Todo')}
      {tab('meeting', 'Meeting')}
      {hasNoteTab && tab('note', 'Note')}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
  },
  tabText: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginRight: 18,
  },
  tabTextActive: {
    textDecorationLine: 'underline',
  },
});
