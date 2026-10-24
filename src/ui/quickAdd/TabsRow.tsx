/**
 * Quick Add's R1: the Todo / Meeting (/ Note) mini-tabs on the left, the
 * main button cluster (`actions`) on the right. A tab never
 * disappears; a locked one greys out - Meeting while `taskOnly`, the other
 * kind while an edit is open, Note while the Files pane has no folder to
 * create in. Note is rendered only where a screen passes `onAddNote`,
 * Agreement only where it passes `onAddAgreement` (a screen that knows the
 * owner, docs/dev/history/technical-design-meetings-0.21.md §5).
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
  /** Whether the Agreement tab is rendered at all. */
  hasAgreementTab?: boolean;
  noteFolderPath: string | null;
  /** The main button cluster at the right end (ui/quickAdd/ActionRow.tsx). */
  actions?: React.ReactNode;
  textColor: string;
}

export default function TabsRow({core, taskOnly, hasNoteTab, hasAgreementTab = false, noteFolderPath, actions, textColor}: Props): React.JSX.Element {
  const {displayType, isEditing, editFields} = core;
  const other = (kind: QuickAddType) => !!editFields && editFields.kind !== kind;
  const disabled: Record<QuickAddType, boolean> = {
    task: other('task'),
    meeting: taskOnly || other('meeting'),
    // Note has no edit mode of its own, so only a missing folder locks it.
    note: !noteFolderPath,
    agreement: other('agreement'),
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
    <View style={styles.row}>
      <View style={styles.tabs}>
        {tab('task', 'Todo')}
        {tab('meeting', 'Meeting')}
        {hasAgreementTab && tab('agreement', 'Agreement')}
        {hasNoteTab && tab('note', 'Note')}
      </View>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
