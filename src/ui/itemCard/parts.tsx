/**
 * The pieces both item cards are built from (ui/itemCard/MeetingCard.tsx,
 * TodoCard.tsx): the rows at the Quick Add box's heights, R1 with ✕ and
 * Edit, the 32 dp square button (filled when on), the linked-file chip or
 * +clip, and the area chip with its refile arrow.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ClipIcon} from '../icons';
import {quickAddButtons} from '../quickAdd/ActionRow';
import {QUICK_ADD_ROWS} from '../quickAdd/QuickAddFrame';
import {COLORS, FONT} from '../theme';
import {RefileIcon} from './icons';

export interface CardColors {
  textColor: string;
  borderColor: string;
}

function inverse(color: string): string {
  const c = color.toLowerCase();
  return c === '#000' || c === '#000000' || c === 'black' ? '#ffffff' : '#000000';
}

/** A 32 dp square button: outlined, or filled when `on`; its content gets the colour to draw in. */
export function SquareButton(
  props: {
    label: string;
    on?: boolean;
    disabled?: boolean;
    onPress?: () => void;
    children: (color: string) => React.ReactNode;
  } & CardColors,
) {
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

/** A letter or short word (P, R, M, Now) as a square button's content. */
export function letter(text: string) {
  return function LetterIcon(color: string) {
    return <Text style={[styles.letter, {color}]}>{text}</Text>;
  };
}

/** R1: the heading, an optional link next to it, then ✕ and Edit at the right. */
export function CardRow1(
  props: {heading: string; link?: {label: string; onPress?: () => void} | null; onClose: () => void; onEdit: () => void} & CardColors,
) {
  const {heading, link, onClose, onEdit, textColor} = props;
  return (
    <View style={[styles.row, styles.row1]}>
      <Text style={[styles.heading, {color: textColor}]} numberOfLines={1}>
        {heading}
      </Text>
      {link ? (
        <Pressable onPress={link.onPress} disabled={!link.onPress} hitSlop={6} style={styles.link}>
          <Text style={[styles.linkText, {color: textColor}, !!link.onPress && styles.underline]} numberOfLines={1}>
            {link.label}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.spacer} />
      <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
        <Text style={[quickAddButtons.textButton, {color: textColor}]}>✕</Text>
      </Pressable>
      <Pressable style={quickAddButtons.primaryButton} onPress={onEdit} hitSlop={8}>
        <Text style={quickAddButtons.primaryButtonText}>Edit</Text>
      </Pressable>
    </View>
  );
}

/** The linked file (name opens it, ✕ unlinks), or +clip to link one; nothing when `file` is null. */
export function FileSlot(
  props: {
    file: {kind: 'linked'; name: string} | {kind: 'link'} | null;
    onOpen?: () => void;
    onUnlink: () => void;
    onLink?: () => void;
  } & CardColors,
) {
  const {file, onOpen, onUnlink, onLink, textColor, borderColor} = props;
  if (file?.kind === 'linked') {
    return (
      <View style={[styles.fileChip, {borderColor}]}>
        <Pressable onPress={onOpen} disabled={!onOpen} hitSlop={4} style={styles.fileOpen} accessibilityLabel="Open linked file">
          <ClipIcon color={textColor} />
          <Text style={[styles.fileName, {color: textColor}]} numberOfLines={1}>
            {file.name}
          </Text>
        </Pressable>
        <Pressable onPress={onUnlink} hitSlop={6} accessibilityRole="button" accessibilityLabel="Unlink">
          <Text style={[styles.unlink, {color: textColor}]}>✕</Text>
        </Pressable>
      </View>
    );
  }
  if (file?.kind === 'link') {
    return (
      <SquareButton label="Link file" onPress={onLink} textColor={textColor} borderColor={borderColor}>
        {color => (
          <View style={styles.plusClip}>
            <Text style={[styles.plus, {color}]}>+</Text>
            <ClipIcon color={color} />
          </View>
        )}
      </SquareButton>
    );
  }
  return null;
}

/** Where the item lives: the name opens it (when the screen can), the arrow beside it refiles. */
export function AreaChip(props: {name: string; canRefile: boolean; onOpen?: () => void; onRefile?: () => void} & CardColors) {
  const {name, canRefile, onOpen, onRefile, textColor, borderColor} = props;
  return (
    <View style={[styles.areaChip, {borderColor}]}>
      <Pressable onPress={onOpen} disabled={!onOpen} hitSlop={4} accessibilityLabel={`Open ${name}`}>
        <Text style={[styles.areaName, {color: textColor}]} numberOfLines={1}>
          {onOpen ? `${name} ›` : name}
        </Text>
      </Pressable>
      {canRefile ? (
        <Pressable onPress={onRefile} hitSlop={6} style={styles.refile} accessibilityRole="button" accessibilityLabel="Refile">
          <RefileIcon size={18} color={textColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center'},
  row2: {height: QUICK_ADD_ROWS.input, marginBottom: QUICK_ADD_ROWS.gap},
  row3: {height: QUICK_ADD_ROWS.meta, marginBottom: QUICK_ADD_ROWS.gap, gap: 6},
  row4: {height: QUICK_ADD_ROWS.extra, gap: 6},
  spacer: {flex: 1},
  title: {flexShrink: 1, fontSize: FONT.medium, fontWeight: '600'},
  struck: {textDecorationLine: 'line-through'},
  small: {fontSize: FONT.small, marginLeft: 8},
});

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center'},
  row1: {height: QUICK_ADD_ROWS.tabs, marginBottom: QUICK_ADD_ROWS.gap},
  spacer: {flex: 1},
  heading: {fontSize: FONT.small, fontWeight: '700', flexShrink: 0},
  link: {marginLeft: 12, flexShrink: 1},
  linkText: {fontSize: FONT.small},
  underline: {textDecorationLine: 'underline'},
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
