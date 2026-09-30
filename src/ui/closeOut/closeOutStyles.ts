/**
 * Styles and fixed row heights shared by the close-out wizard's steps
 * (ui/closeOut/*Step.tsx). Row heights are fixed on purpose - the paged lists
 * budget by them (docs/dev/design-device-rendering.md §3/§4) - so every row
 * style below sets `height` to exactly its ROW_H value.
 */
import {StyleSheet} from 'react-native';
import {FONT, RADII, SPACING} from '../theme';

export const ROW_H = {
  group: 40,
  entry: 60,
  finding: 58,
  item: 52,
  outcome: 68,
};

export const co = StyleSheet.create({
  box: {
    borderWidth: 2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  boxLight: {
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
  },
  kvKey: {
    width: 110,
    fontSize: FONT.medium,
    opacity: 0.6,
  },
  kvValue: {
    flex: 1,
    fontSize: FONT.medium,
  },
  path: {
    fontSize: FONT.small,
    fontFamily: 'monospace',
  },
  strong: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  body: {
    fontSize: FONT.medium,
  },
  small: {
    fontSize: FONT.small,
  },
  muted: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  groupRow: {
    height: ROW_H.group,
    justifyContent: 'flex-end',
    borderBottomWidth: 2,
    paddingBottom: 4,
  },
  entryRow: {
    height: ROW_H.entry,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  itemRow: {
    height: ROW_H.item,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 40,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT.medium,
    fontWeight: '700',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  error: {
    fontSize: FONT.small,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
});
