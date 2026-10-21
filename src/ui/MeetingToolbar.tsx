/**
 * The meeting-list toolbar (docs/dev/history/technical-design-meeting-reflection.md
 * §2.6, M3-M5): one row of fixed height between a meeting list's header and
 * its rows, acting on the selected meeting - the Prepped/Reviewed tick,
 * Reflect/Reflection and Link file, with the meeting's name on the right.
 * With nothing selected it keeps its place, greyed, saying "Tap a meeting",
 * so the list below never shifts. Which slots show is decided in
 * domain/meetingToolbar.ts; ui/useMeetingToolbar.ts wires the actions.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MeetingTrackingKind} from '../domain/meetingTracking';
import {TOOLBAR_EMPTY_HINT, ToolbarSlot, toolbarSlotText} from '../domain/meetingToolbar';
import {quickAddButtons} from './quickAdd/ActionRow';
import {FONT} from './theme';

/** The row's height in dp: a 40 dp box plus 4 dp below it (design-device-rendering.md §5.3). */
export const MEETING_TOOLBAR_HEIGHT = 44;

interface Props {
  /** The slots to show; when `meetingName` is null they are drawn greyed and do nothing. */
  slots: ToolbarSlot[];
  /** The selected meeting's display title, or null when nothing is selected. */
  meetingName: string | null;
  onCheckpoint: (kind: MeetingTrackingKind) => void;
  onReflection: () => void;
  onLink?: () => void;
  textColor: string;
  borderColor: string;
}

export default function MeetingToolbar({slots, meetingName, onCheckpoint, onReflection, onLink, textColor, borderColor}: Props): React.JSX.Element {
  const empty = meetingName === null;
  const press = (slot: ToolbarSlot) => {
    if (slot.kind === 'checkpoint') onCheckpoint(slot.tracking);
    else if (slot.kind === 'reflection') onReflection();
    else onLink?.();
  };
  return (
    <View style={styles.row}>
      {slots.map(slot => {
        const disabled = empty || (slot.kind === 'reflection' && slot.pending) || (slot.kind === 'link' && !onLink);
        return (
          <Pressable
            key={slot.kind}
            onPress={() => press(slot)}
            disabled={disabled}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{disabled}}
            style={[quickAddButtons.ghostButton, {borderColor}, disabled && styles.disabled]}>
            <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]} numberOfLines={1}>
              {toolbarSlotText(slot)}
            </Text>
          </Pressable>
        );
      })}
      <Text style={[styles.name, {color: textColor}, empty && styles.hint]} numberOfLines={1}>
        {meetingName ?? TOOLBAR_EMPTY_HINT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: MEETING_TOOLBAR_HEIGHT - 4,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  disabled: {opacity: 0.35},
  name: {
    flex: 1,
    fontSize: FONT.small,
    textAlign: 'right',
    marginLeft: 4,
    includeFontPadding: false,
  },
  hint: {opacity: 0.6},
});
