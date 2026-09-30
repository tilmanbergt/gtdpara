/**
 * Fixed layout for a multi-step flow (docs/dev/technical-design-project-close-
 * out.md §8.1): breadcrumb row, title, StepIndicator, a bounded flex content
 * area, and a footer row. Steps render into `children` and never measure the
 * screen themselves - the content area is `flex: 1`, so a PagedSection
 * inside it can self-measure (ui/PagedSection.tsx).
 *
 * Calls requestEinkRefresh whenever `stepKey` changes: a purely local state
 * change isn't guaranteed to repaint on this device
 * (bugfix_eink_refresh.md), and a step change redraws nearly everything.
 */
import React, {useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {COLORS, FONT, SPACING} from '../theme';

interface Props {
  breadcrumb: string;
  onBreadcrumb: () => void;
  /** Small right-aligned note on the breadcrumb row (e.g. "Saved - continue any time"). */
  note?: string;
  title: string;
  stepBar: React.ReactNode;
  /** Changes whenever the visible step changes - triggers the e-ink refresh. */
  stepKey: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  textColor: string;
  borderColor: string;
}

export default function WizardFrame({breadcrumb, onBreadcrumb, note, title, stepBar, stepKey, children, footer, textColor, borderColor}: Props): React.JSX.Element {
  useEffect(() => {
    requestEinkRefresh();
  }, [stepKey]);

  return (
    <View style={styles.root}>
      <View style={styles.crumbRow}>
        <Pressable onPress={onBreadcrumb} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={[styles.crumb, {color: textColor}]}>‹ {breadcrumb}</Text>
        </Pressable>
        {note ? <Text style={[styles.note, {color: textColor}]}>{note}</Text> : null}
      </View>
      <Text style={[styles.title, {color: textColor}]} numberOfLines={1}>
        {title}
      </Text>
      {stepBar}
      <View style={styles.content}>{children}</View>
      <View style={[styles.footer, {borderTopColor: borderColor}]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.base,
  },
  crumbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  crumb: {
    fontSize: FONT.medium,
    textDecorationLine: 'underline',
  },
  note: {
    fontSize: FONT.small,
    opacity: 0.6,
  },
  title: {
    fontSize: FONT.large,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  content: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 2,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
});
