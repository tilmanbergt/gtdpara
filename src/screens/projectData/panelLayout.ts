/**
 * Layout constants and styles shared by screens/ProjectDataPanel.tsx and its
 * two list sections (TodosSection.tsx, MeetingsSection.tsx).
 */
import {StyleSheet} from 'react-native';
import {FONT} from '../../ui/theme';

// Right column width this whole screen renders in (screens/ItemDetail.tsx's
// `leftPane`/`rightPane`, both plain `flex:1` inside a 16px-gutter two-
// column split) - docs/dev/design-device-rendering.md §5.1's own "two-column
// split" convention: usable content width 1372px, minus the 16px gutter,
// split evenly ≈ 678px each. Needed by TaskRow's/MeetingRow's row-height
// estimators, which predict how many lines a title wraps to at a given
// width - not separately verified on-device, same as those estimators' own
// calibration.
export const COLUMN_WIDTH_PX = 678;

// Flow-state/Upcoming-Past group-header rows within each flattened
// sequence (TodosSection's `subheading`, MeetingsSection's same style) -
// docs/dev/design-device-rendering.md §5.5's existing "section
// headings/labels" budget entry for this exact style (marginTop 8/10 +
// text line ~18 + marginBottom 4), reused rather than re-derived.
export const SUBHEADING_ROW_PX = 30;

export interface PaneColors {
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export const sectionStyles = StyleSheet.create({
  // flex:1 (docs/dev/history/technical-design-flex-weight-stacking.md §3.3) -
  // each section is the sole occupant of its own weighted box in
  // ProjectDataPanel, so its own PagedSection (and, for MeetingsSection, its
  // Google mini-tab) can self-measure into whatever real height that box
  // resolves to instead of being told a fixed pixel viewport.
  section: {
    flex: 1,
    marginBottom: 8,
  },
  subheading: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 10,
    marginBottom: 4,
  },
  hideDoneRow: {
    marginTop: 10,
    marginBottom: 4,
  },
  hideDoneText: {
    fontSize: FONT.small,
    opacity: 0.6,
    textDecorationLine: 'underline',
  },
});
