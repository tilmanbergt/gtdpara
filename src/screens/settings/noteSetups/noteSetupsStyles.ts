/**
 * Styles of Settings → Note setups' own rows and panels
 * (docs/dev/history/technical-design-note-setups.md §6); the shared form
 * pieces (labels, inputs, buttons, cards) come from ../settingsStyles.
 * Heights are budgeted against docs/dev/design-device-rendering.md §5.
 */
import {StyleSheet} from 'react-native';
import {FONT, RADII, SPACING} from '../../../ui/theme';

/** A setup row in the list: two one-line texts in a bordered card, its bottom margin included (the pager counts this height). */
export const SETUP_ROW_HEIGHT = 74;
export const SETUP_ROW_MARGIN = 8;
/** A page row on the setup page: the thumbnail's height plus padding and border, its margin included. */
export const PAGE_ROW_HEIGHT = 92;
/** The page thumbnail's width (its height follows the page's proportions). */
export const PAGE_THUMB_WIDTH = 54;
/** A one-line row in the layout page's panels (pieces, Add, backgrounds), its margin included. */
export const PANEL_ROW_HEIGHT = 44;
/** A report line of the migration notice. */
export const NOTICE_ROW_HEIGHT = 46;

export const setupStyles = StyleSheet.create({
  // A page: heading row on top, the rest fills the tab body.
  page: {flex: 1},
  headerRow: {flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm},
  headerBack: {fontSize: FONT.medium, marginRight: SPACING.md},
  headerTitle: {flex: 1, fontSize: FONT.medium, fontWeight: '700'},
  headerAction: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline', marginRight: SPACING.md},
  headerButtons: {flexDirection: 'row', alignItems: 'center'},
  headerSave: {marginTop: 0, paddingVertical: 8, paddingHorizontal: SPACING.md},
  // List.
  noticeCard: {borderWidth: 2, borderRadius: RADII.md, padding: SPACING.sm, marginBottom: SPACING.sm, height: 260},
  noticeTitle: {fontSize: FONT.medium, fontWeight: '700', marginBottom: SPACING.xs},
  noticeLine: {fontSize: FONT.small, height: NOTICE_ROW_HEIGHT},
  noticeOk: {alignSelf: 'flex-end', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, borderWidth: 1, borderRadius: RADII.md},
  noticeOkText: {fontSize: FONT.small, fontWeight: '700'},
  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    height: SETUP_ROW_HEIGHT - SETUP_ROW_MARGIN,
    marginBottom: SETUP_ROW_MARGIN,
  },
  defaultRow: {borderWidth: 2},
  setupRowMain: {flex: 1},
  setupRowTop: {flexDirection: 'row', justifyContent: 'space-between'},
  setupRowName: {fontSize: FONT.medium, fontWeight: '600', flex: 1},
  setupRowKind: {fontSize: FONT.small, fontWeight: '600', marginLeft: SPACING.sm},
  setupRowMeta: {fontSize: FONT.small, opacity: 0.6, marginTop: 2},
  rowDelete: {paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs},
  rowDeleteText: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline'},
  listBody: {flex: 1},
  // Setup page: fields in rows of label + control.
  fieldRow: {flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm},
  fieldLabel: {width: 110, fontSize: FONT.small, fontWeight: '600'},
  fieldControl: {flex: 1},
  fieldHint: {fontSize: FONT.small, opacity: 0.6, marginLeft: 110},
  tagRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flex: 1},
  tagChip: {flexDirection: 'row', borderWidth: 1, borderRadius: RADII.pillMd, paddingHorizontal: 10, paddingVertical: 4, marginRight: SPACING.sm, marginBottom: SPACING.xs},
  tagChipText: {fontSize: FONT.small},
  tagChipRemove: {fontSize: FONT.small, fontWeight: '700', marginLeft: 6},
  linkText: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline', marginBottom: SPACING.xs},
  pagesBody: {flex: 1, marginTop: SPACING.sm},
  // Page rows.
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: 6,
    height: PAGE_ROW_HEIGHT - SETUP_ROW_MARGIN,
    marginBottom: SETUP_ROW_MARGIN,
  },
  pageThumb: {width: PAGE_THUMB_WIDTH, marginRight: SPACING.md},
  pageRowMain: {flex: 1},
  pageRowName: {fontSize: FONT.medium, fontWeight: '600'},
  pageRowMeta: {fontSize: FONT.small, opacity: 0.6, marginTop: 2},
  pageRowButton: {borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 6, marginLeft: SPACING.sm},
  pageRowButtonText: {fontSize: FONT.small, fontWeight: '700'},
  // Layout page: preview left, panels right.
  layoutColumns: {flex: 1, flexDirection: 'row'},
  panelBody: {flex: 1},
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 8,
    height: PANEL_ROW_HEIGHT - 6,
    marginBottom: 6,
  },
  panelRowSelected: {borderWidth: 2},
  panelRowText: {flex: 1, fontSize: FONT.small},
  panelRowTextOn: {fontWeight: '700'},
  panelRowAction: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline', paddingHorizontal: 6},
  composer: {borderWidth: 1, borderRadius: RADII.md, padding: SPACING.sm, marginBottom: SPACING.sm},
});
