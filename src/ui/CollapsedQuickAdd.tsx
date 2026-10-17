/**
 * Quick Add folded into one dashed line until it is wanted
 * (docs/dev/history/technical-design-engage.md §3.7, D12): tapping the line
 * expands the real `QuickAddWidget` with a fixed destination; Cancel folds it
 * again, and so does a successful add. When `ownerTag` is set, every new todo
 * and meeting gets that tag the way the loop overview adds its loop's tag
 * (domain/loopEdit.ts - a thread tag follows the same "the tag or one nested
 * below it" rule). No Quick Add logic lives here.
 *
 * Expanded or not is the caller's state, so a screen that decides its own
 * layout from it (the Engage panel's flow) stays the one place that decides.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Destination} from '../domain/destination';
import {titleWithLoopTag, withLoopTag} from '../domain/loopEdit';
import PillButton from './PillButton';
import QuickAddWidget, {MeetingQuickAddFields} from './QuickAddWidget';
import {FONT, RADII, SPACING} from './theme';

interface Props {
  label: string;
  cancelLabel: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  destination: Destination;
  ownerTag?: string | null;
  layoutKey: string;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export default function CollapsedQuickAdd({
  label,
  cancelLabel,
  expanded,
  onExpand,
  onCollapse,
  destination,
  ownerTag,
  layoutKey,
  onAddTask,
  onAddMeeting,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  if (!expanded) {
    return (
      <Pressable onPress={onExpand} style={[styles.collapsed, {borderColor: textColor}]}>
        <Text style={[styles.collapsedText, {color: textColor}]}>{label}</Text>
      </Pressable>
    );
  }
  const addTask = async (text: string, dest: Destination) => {
    await onAddTask(ownerTag ? withLoopTag(text, ownerTag) : text, dest);
    onCollapse();
  };
  const addMeeting = async (fields: MeetingQuickAddFields, dest: Destination) => {
    await onAddMeeting(ownerTag ? {...fields, title: titleWithLoopTag(fields.title, ownerTag)} : fields, dest);
    onCollapse();
  };
  return (
    <View style={styles.expanded}>
      <QuickAddWidget
        layoutKey={layoutKey}
        fixedDestination={destination}
        onAddTask={addTask}
        onAddMeeting={addMeeting}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <View style={styles.cancelRow}>
        <PillButton label={cancelLabel} onPress={onCollapse} textColor={textColor} borderColor={borderColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  collapsedText: {
    fontSize: FONT.medium,
  },
  expanded: {
    marginTop: SPACING.md,
  },
  cancelRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.sm,
  },
});
