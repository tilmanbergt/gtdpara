/** Styles shared by the Settings screen and its tabs. */
import {StyleSheet} from 'react-native';
import {COLORS, FONT, SPACING} from '../../ui/theme';

export const styles = StyleSheet.create({
  background: {
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  spacer: {
    marginTop: 40,
  },
  content: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  // The bounded flex:1 box every tab's content renders inside
  // (docs/dev/history/technical-design-note-templates.md §6) - what makes
  // ui/PagedSection.tsx's self-measuring mode work for the Templates tab's
  // list. Folders/Focus/Calendar/Meeting Note don't fill it and get no
  // scroll of their own.
  tabBody: {
    flex: 1,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FONT.medium,
  },
  countInput: {
    width: 80,
  },
  pathPreview: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 4,
  },
  pasteButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  pasteButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.accentText,
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  resetButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  resetText: {
    fontSize: FONT.small,
    textDecorationLine: 'underline',
    opacity: 0.7,
  },
  // Tighter than `fieldSpacer` above - the 'edit' form's own top section
  // (Name/Context/Tags/Default+Enabled) only, so those fields take minimum
  // space. Kept separate from `fieldSpacer`, which is still used for the
  // Background label on the right column below, where the more generous
  // spacing reads fine.
  compactFieldSpacer: {
    marginTop: SPACING.xs,
  },
  placeholderChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.xs,
  },
  placeholderChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 4,
  },
  placeholderChipText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  sharedFilePreview: {
    fontSize: FONT.small,
    marginTop: SPACING.xs,
  },
  // Wraps each standalone ClipboardTextInput (Name/Tags above) in a
  // `flexDirection: 'row'` container. ClipboardTextInput
  // (ui/ClipboardTextInput.tsx)'s own root `wrap` style is `flex: 1` -
  // the "fill available width, natural single-line height" behavior its
  // other call sites rely on (ItemsList.tsx's `createRow`, QuickAddWidget's
  // own text fields), every one of them a `flexDirection: 'row'` parent.
  // Placed directly in a plain column `View`, that same `flex: 1` instead
  // competes for *vertical* space along the column's main axis - collapsing
  // to ~0 height, since this section's own wrapping View sizes itself to its
  // content (module doc comment: "deliberately NOT flex"). A one-child row
  // avoids this without touching the shared component.
  clipboardFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addDefRow: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  addDefRowText: {
    fontSize: FONT.medium,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Plain file-row look, not a bordered/card row - matches
  // `ui/FileBrowserPane.tsx`'s own `entryRow` (paddingVertical only, no
  // border), so it looks exactly like other file panels.

  toggleOption: {
    paddingVertical: 4,
  },
  toggleRowInline: {
    flexDirection: 'row',
  },
  toggleOptionInline: {
    marginRight: SPACING.lg,
  },
  toggleText: {
    fontSize: FONT.medium,
  },
  // Slightly wider Save button in the right column - `saveButton` itself
  // has no explicit width (hugs its own text/padding inside
  // `formButtonRow`), so this just adds a floor wide enough to read as
  // visibly bigger than Cancel next to it without touching the shared
  // `saveButton` style every other Save/Apply/Add/Run button in this file
  // also uses.
  saveButtonWide: {
    minWidth: 120,
  },
  cancelButton: {
    marginLeft: SPACING.base,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  cancelButtonText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
});
