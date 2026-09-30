/**
 * One status line: a mark, a label, an optional trailing caption, and an
 * optional block underneath for sub-items/actions (docs/dev/technical-design-
 * project-close-out.md §8.1). Marks are grayscale by shape (ui/theme.ts):
 *
 *   ok      ✓ in an outlined square
 *   blocker ✕ white on a filled black square
 *   warning ! in an outlined square
 *   notice  i in an outlined circle
 *
 * Fixed minimum height per docs/dev/design-device-rendering.md §3.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT, SPACING} from './theme';

export type MarkKind = 'ok' | 'blocker' | 'warning' | 'notice';

const GLYPH: Record<MarkKind, string> = {ok: '✓', blocker: '✕', warning: '!', notice: 'i'};

interface Props {
  kind: MarkKind;
  label: string;
  caption?: string;
  /** Emphasize the label (anything that needs attention). Defaults to true for blocker/warning. */
  strong?: boolean;
  children?: React.ReactNode;
  textColor: string;
  borderColor: string;
}

export default function StatusMarkRow({kind, label, caption, strong, children, textColor, borderColor}: Props): React.JSX.Element {
  const bold = strong ?? (kind === 'blocker' || kind === 'warning');
  return (
    <View style={[styles.wrap, {borderBottomColor: borderColor}]}>
      <View style={styles.row}>
        <View style={[styles.mark, {borderColor: textColor}, kind === 'blocker' && styles.markFilled, kind === 'notice' && styles.markRound]}>
          <Text style={[styles.glyph, {color: kind === 'blocker' ? COLORS.accentText : textColor}]}>{GLYPH[kind]}</Text>
        </View>
        <Text style={[styles.label, {color: textColor}, bold && styles.labelBold]} numberOfLines={2}>
          {label}
        </Text>
        {caption ? (
          <Text style={[styles.caption, {color: textColor}]} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.children}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  mark: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  markFilled: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  markRound: {
    borderRadius: 14,
  },
  glyph: {
    fontSize: FONT.medium,
    fontWeight: '700',
    includeFontPadding: false,
  },
  label: {
    flex: 1,
    fontSize: FONT.medium,
  },
  labelBold: {
    fontWeight: '700',
  },
  caption: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginLeft: SPACING.md,
    maxWidth: '45%',
    textAlign: 'right',
  },
  children: {
    paddingLeft: 40,
    paddingTop: 4,
  },
});
