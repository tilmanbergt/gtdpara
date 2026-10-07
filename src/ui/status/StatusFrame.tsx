/**
 * Central status slot - rendering (docs/dev/history/technical-design-status-slot.md §5).
 *
 * `<StatusFrame>` wraps a screen body: a fixed-height slot on top (always
 * reserved, D1), the body below it, and - on a tap on the message text -
 * an overlay with the full text drawn over the top of the body (D12). The
 * overlay lives inside the frame (not as an overflow child of the slot) so
 * Android delivers its taps.
 *
 * One message is visible at a time, most important first; `‹ n/m ›` pages
 * through the rest (D8). No auto-hide timers except the overlay's (D6).
 */
import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {WarningIcon} from '../icons';
import {FONT, useThemeColors} from '../theme';
import {useStatusList} from './StatusProvider';
import {STATUS_EXPAND_MS, STATUS_SLOT_HEIGHT, StatusMessage} from './types';

/** Texts longer than this are offered the tap-to-expand overlay even without an explicit `detail`. */
const EXPAND_THRESHOLD_CHARS = 90;

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};

export default function StatusFrame({children}: {children: React.ReactNode}): React.JSX.Element {
  const {textColor, isDarkMode} = useThemeColors();
  const background = isDarkMode ? '#000000' : '#ffffff';
  const list = useStatusList();

  // Back to the most important message whenever the set of messages changes (D8).
  const [index, setIndex] = useState(0);
  const idsKey = list.map(e => e.id).join('|');
  useEffect(() => setIndex(0), [idsKey]);
  const safeIndex = Math.min(index, Math.max(0, list.length - 1));
  const entry = list.length > 0 ? list[safeIndex] : null;

  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [entry?.id, entry?.seq]);
  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => setExpanded(false), STATUS_EXPAND_MS);
    return () => clearTimeout(timer);
  }, [expanded]);

  // The host doesn't reliably flush an async content change on e-ink
  // (utils/screenRefresh.ts) - request one whenever what the slot shows changes.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (!entry) return;
    }
    requestEinkRefresh();
  }, [entry?.id, entry?.seq, expanded, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const msg = entry?.msg ?? null;
  const expandable = !!msg && (!!msg.detail || msg.text.length > EXPAND_THRESHOLD_CHARS);

  return (
    <View style={styles.frame}>
      <StatusSlotRow
        msg={msg}
        index={safeIndex}
        count={list.length}
        onPrev={() => setIndex(Math.max(0, safeIndex - 1))}
        onNext={() => setIndex(Math.min(list.length - 1, safeIndex + 1))}
        onTextPress={expandable ? () => setExpanded(e => !e) : undefined}
        textColor={textColor}
        background={background}
      />
      <View style={styles.body}>{children}</View>
      {expanded && msg && (
        <Pressable
          onPress={() => setExpanded(false)}
          style={[styles.overlay, {backgroundColor: background, borderColor: textColor}]}>
          <Text style={[styles.overlayText, {color: textColor}]}>{msg.detail ?? msg.text}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface RowProps {
  msg: StatusMessage | null;
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onTextPress?: () => void;
  textColor: string;
  background: string;
}

function StatusSlotRow({msg, index, count, onPrev, onNext, onTextPress, textColor, background}: RowProps): React.JSX.Element {
  if (!msg) {
    // Empty slot stays blank (D15) - but keeps its height (D1).
    return <View style={styles.slot} />;
  }

  const inverted = msg.kind === 'modal' || msg.kind === 'confirm';
  const fg = inverted ? background : textColor;
  const bg = inverted ? textColor : background;

  return (
    <View
      style={[
        styles.slot,
        {backgroundColor: bg},
        msg.kind === 'error' && [styles.bordered, styles.borderedStrong, {borderColor: textColor}],
        msg.kind === 'warning' && [styles.bordered, {borderColor: textColor}],
      ]}>
      {(msg.kind === 'error' || msg.kind === 'warning') && (
        <View style={styles.icon}>
          <WarningIcon size={16} color={fg} />
        </View>
      )}
      {msg.kind === 'success' && <Text style={[styles.iconText, {color: fg}]}>✓</Text>}
      <Pressable style={styles.textWrap} onPress={onTextPress} disabled={!onTextPress}>
        <Text
          numberOfLines={1}
          style={[styles.text, {color: fg}, (msg.kind === 'error' || inverted) && styles.textStrong]}>
          {msg.text}
        </Text>
      </Pressable>
      {msg.actions?.map(action => (
        <SlotButton key={action.label} label={action.label} primary={action.primary} onPress={action.onPress} fg={fg} bg={bg} />
      ))}
      {msg.kind === 'modal' && msg.onCancel && <SlotButton label="Cancel" onPress={msg.onCancel} fg={fg} bg={bg} />}
      {msg.kind === 'confirm' && msg.onCancel && <CloseMark onPress={msg.onCancel} color={fg} />}
      {msg.kind !== 'confirm' && msg.onDismiss && <CloseMark onPress={msg.onDismiss} color={fg} />}
      {count > 1 && (
        <View style={styles.pager}>
          <Pressable onPress={onPrev} disabled={index === 0} hitSlop={HIT_SLOP}>
            <Text style={[styles.arrow, {color: fg}, index === 0 && styles.disabled]}>‹</Text>
          </Pressable>
          <Text style={[styles.pagerText, {color: fg}]}>
            {index + 1}/{count}
          </Text>
          <Pressable onPress={onNext} disabled={index === count - 1} hitSlop={HIT_SLOP}>
            <Text style={[styles.arrow, {color: fg}, index === count - 1 && styles.disabled]}>›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SlotButton({label, onPress, primary, fg, bg}: {label: string; onPress: () => void; primary?: boolean; fg: string; bg: string}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      style={[styles.button, {borderColor: fg}, primary && {backgroundColor: fg}]}>
      <Text style={[styles.buttonText, {color: primary ? bg : fg}]}>{label}</Text>
    </Pressable>
  );
}

function CloseMark({onPress, color}: {onPress: () => void; color: string}) {
  return (
    <Pressable onPress={onPress} hitSlop={HIT_SLOP} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
      <Text style={[styles.closeText, {color}]}>✕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  slot: {
    height: STATUS_SLOT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bordered: {
    borderWidth: 1,
    borderRadius: 6,
    marginHorizontal: 8,
    paddingHorizontal: 8,
  },
  borderedStrong: {
    borderWidth: 2,
  },
  icon: {
    marginRight: 8,
  },
  iconText: {
    fontSize: FONT.small,
    fontWeight: '700',
    marginRight: 8,
  },
  textWrap: {
    flex: 1,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  text: {
    fontSize: FONT.small,
  },
  textStrong: {
    fontWeight: '700',
  },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  buttonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  close: {
    marginLeft: 10,
    paddingHorizontal: 4,
  },
  closeText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  arrow: {
    fontSize: FONT.large,
    paddingHorizontal: 6,
  },
  pagerText: {
    fontSize: FONT.small,
  },
  disabled: {
    opacity: 0.3,
  },
  overlay: {
    position: 'absolute',
    top: STATUS_SLOT_HEIGHT,
    left: 8,
    right: 8,
    borderWidth: 2,
    borderRadius: 6,
    padding: 12,
  },
  overlayText: {
    fontSize: FONT.small,
  },
});
