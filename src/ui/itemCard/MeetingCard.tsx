/**
 * The meeting card (docs/dev/history/technical-design-item-card.md K8): in
 * Quick Add's place after one tap on a meeting, the same four rows at the
 * same heights (ui/quickAdd/QuickAddFrame.tsx), so nothing below moves.
 *   R1 "Meeting · <phase>", the thread link, ✕, Edit
 *   R2 title (with its tags) and when
 *   R3 P/R, M, note, Reflect (once over), the linked file or +clip
 *   R4 the area chip (name opens it, arrow refiles), New from this, Cancel meeting
 * Every button acts at once; what shows is decided in domain/itemCard.ts.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ClipIcon, NotebookIcon} from '../icons';
import {quickAddButtons} from '../quickAdd/ActionRow';
import {QUICK_ADD_ROWS} from '../quickAdd/QuickAddFrame';
import {COLORS, FONT} from '../theme';
import {CancelMeetingIcon, NewFromThisIcon, ReflectIcon, RefileIcon} from './icons';
import {MeetingCardData} from './useMeetingCard';

interface Props {
  card: MeetingCardData;
  /** Fills the Meeting create draft from this meeting and closes the card (QuickAddWidget). */
  onNewFromThis: () => void;
  textColor: string;
  borderColor: string;
}

function inverse(color: string): string {
  const c = color.toLowerCase();
  return c === '#000' || c === '#000000' || c === 'black' ? '#ffffff' : '#000000';
}

/** A 32 dp square button: outlined, or filled when `on`. */
function SquareButton(props: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  textColor: string;
  borderColor: string;
  children: (color: string) => React.ReactNode;
}) {
  const {label, on = false, disabled = false, onPress, textColor, borderColor} = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled, selected: on}}
      style={[styles.square, {borderColor: on ? textColor : borderColor}, on && {backgroundColor: textColor}, disabled && styles.disabled]}>
      {props.children(on ? inverse(textColor) : textColor)}
    </Pressable>
  );
}

/** A letter (P, R, M) as a square button's content. */
function letter(text: string) {
  return function LetterIcon(color: string) {
    return <Text style={[styles.letter, {color}]}>{text}</Text>;
  };
}

export default function MeetingCard({card, onNewFromThis, textColor, borderColor}: Props): React.JSX.Element {
  const {model, busy} = card;
  const colors = {textColor, borderColor};
  return (
    <View>
      <View style={[styles.row, styles.row1]}>
        <Text style={[styles.heading, {color: textColor}]} numberOfLines={1}>
          {model.heading}
        </Text>
        {model.thread ? (
          <Pressable onPress={card.onOpenThread} hitSlop={6} style={styles.thread}>
            <Text style={[styles.threadText, {color: textColor}]} numberOfLines={1}>
              {model.thread.label}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.spacer} />
        <Pressable onPress={card.onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={[quickAddButtons.textButton, {color: textColor}]}>✕</Text>
        </Pressable>
        <Pressable style={quickAddButtons.primaryButton} onPress={card.onEdit} hitSlop={8}>
          <Text style={quickAddButtons.primaryButtonText}>Edit</Text>
        </Pressable>
      </View>

      <View style={[styles.row, styles.row2]}>
        <Text style={[styles.title, {color: textColor}, model.phase === 'cancelled' && styles.cancelled]} numberOfLines={1}>
          {model.title}
        </Text>
        <Text style={[styles.when, {color: textColor}]} numberOfLines={1}>
          {model.when}
        </Text>
      </View>

      <View style={[styles.row, styles.row3]}>
        {model.checkpoint ? (
          <SquareButton
            label={model.checkpoint.kind === 'prep' ? 'Prepped' : 'Reviewed'}
            on={model.checkpoint.done}
            onPress={card.onCheckpoint}
            {...colors}>
            {letter(model.checkpoint.label)}
          </SquareButton>
        ) : null}
        <SquareButton label="Month highlight" on={model.monthly} onPress={card.onMonthly} {...colors}>
          {letter('M')}
        </SquareButton>
        <SquareButton label={model.note === 'open' ? 'Open note' : 'Create note'} onPress={card.onNote} {...colors}>
          {color => <NotebookIcon size={20} color={color} plus={model.note === 'create'} />}
        </SquareButton>
        {model.reflection ? (
          <SquareButton
            label={model.reflection === 'exists' ? 'Reflection' : 'Reflect'}
            on={model.reflection === 'exists'}
            disabled={model.reflection === 'unknown' || busy}
            onPress={card.onReflect}
            {...colors}>
            {color => <ReflectIcon color={color} />}
          </SquareButton>
        ) : null}
        {model.file?.kind === 'linked' ? (
          <View style={[styles.fileChip, {borderColor}]}>
            <Pressable onPress={card.onOpenFile} disabled={!card.onOpenFile} hitSlop={4} style={styles.fileOpen} accessibilityLabel="Open linked file">
              <ClipIcon color={textColor} />
              <Text style={[styles.fileName, {color: textColor}]} numberOfLines={1}>
                {model.file.name}
              </Text>
            </Pressable>
            <Pressable onPress={card.onUnlink} hitSlop={6} accessibilityRole="button" accessibilityLabel="Unlink">
              <Text style={[styles.unlink, {color: textColor}]}>✕</Text>
            </Pressable>
          </View>
        ) : model.file?.kind === 'link' ? (
          <SquareButton label="Link file" onPress={card.onLink} {...colors}>
            {color => (
              <View style={styles.plusClip}>
                <Text style={[styles.plus, {color}]}>+</Text>
                <ClipIcon color={color} />
              </View>
            )}
          </SquareButton>
        ) : null}
      </View>

      <View style={[styles.row, styles.row4]}>
        <View style={[styles.areaChip, {borderColor}]}>
          <Pressable onPress={card.onOpenOwner} disabled={!card.onOpenOwner} hitSlop={4} accessibilityLabel={`Open ${model.owner.name}`}>
            <Text style={[styles.areaName, {color: textColor}]} numberOfLines={1}>
              {card.onOpenOwner ? `${model.owner.name} ›` : model.owner.name}
            </Text>
          </Pressable>
          {model.owner.canRefile ? (
            <Pressable onPress={card.onRefile} hitSlop={6} style={styles.refile} accessibilityRole="button" accessibilityLabel="Refile">
              <RefileIcon size={18} color={textColor} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.spacer} />
        <SquareButton label="New from this" onPress={onNewFromThis} {...colors}>
          {color => <NewFromThisIcon color={color} />}
        </SquareButton>
        {model.canCancel ? (
          <SquareButton label="Cancel meeting" onPress={card.onCancelMeeting} {...colors}>
            {color => <CancelMeetingIcon color={color} />}
          </SquareButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center'},
  row1: {height: QUICK_ADD_ROWS.tabs, marginBottom: QUICK_ADD_ROWS.gap},
  row2: {height: QUICK_ADD_ROWS.input, marginBottom: QUICK_ADD_ROWS.gap},
  row3: {height: QUICK_ADD_ROWS.meta, marginBottom: QUICK_ADD_ROWS.gap, gap: 6},
  row4: {height: QUICK_ADD_ROWS.extra, gap: 6},
  spacer: {flex: 1},
  heading: {fontSize: FONT.small, fontWeight: '700', flexShrink: 0},
  thread: {marginLeft: 12, flexShrink: 1},
  threadText: {fontSize: FONT.small, textDecorationLine: 'underline'},
  title: {flex: 1, fontSize: FONT.medium, fontWeight: '600'},
  cancelled: {textDecorationLine: 'line-through'},
  when: {fontSize: FONT.small, marginLeft: 8},
  square: {width: 32, height: 32, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center'},
  disabled: {opacity: 0.35},
  letter: {fontSize: FONT.small, fontWeight: '700'},
  plusClip: {flexDirection: 'row', alignItems: 'center'},
  plus: {fontSize: FONT.small, fontWeight: '700'},
  fileChip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 4, height: 32, paddingLeft: 6, flexShrink: 1},
  fileOpen: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  fileName: {fontSize: FONT.small, marginLeft: 4, flexShrink: 1},
  unlink: {fontSize: FONT.small, fontWeight: '700', paddingHorizontal: 8},
  areaChip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 4, height: 32, paddingHorizontal: 8, flexShrink: 1},
  areaName: {fontSize: FONT.small, fontWeight: '600'},
  refile: {marginLeft: 8, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: COLORS.borderLight, height: 22, justifyContent: 'center'},
});
