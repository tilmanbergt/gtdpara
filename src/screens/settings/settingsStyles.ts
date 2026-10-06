/** Styles shared by the Settings screen and its tabs. */
import {StyleSheet} from 'react-native';
import {NOTE_PAGE_HEIGHT_PX, NOTE_PAGE_WIDTH_PX} from '../../domain/tagRules';
import {COLORS, FONT, RADII, SPACING} from '../../ui/theme';

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
  // The bounded flex:1 box every tab's content renders inside (2026-09-18,
  // docs/dev/technical-design-note-templates.md §6) - what makes
  // ui/PagedSection.tsx's self-measuring mode work for the Templates tab's
  // list. Folders/Focus/Calendar/Meeting Note don't fill it and don't
  // yet get their own scroll if they ever do (Tilman: "other pages are not
  // really full anyway, so we can take care of them later").
  tabBody: {
    flex: 1,
  },
  // Wraps just the "+ New..." row + PagedSection so the row keeps its
  // natural height and the list gets the flex:1 remainder to self-measure
  // against, rather than the whole tabBody being handed to PagedSection
  // directly (which would leave no room for the row above it).
  templatesListBody: {
    flex: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backText: {
    fontSize: FONT.medium,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  closeText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: FONT.medium,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 4,
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
  saveButtonDisabled: {
    opacity: 0.5,
  },
  savedText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: FONT.small,
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
  fieldSpacer: {
    marginTop: SPACING.md,
  },
  // Tighter than `fieldSpacer` above - the 'edit' form's own top section
  // (Name/Context/Tags/Default+Enabled) only, per Tilman's 2026-09-18
  // rearrangement request: "Make sure these all take minimum space, there
  // is today still space below name input and tags input". Kept separate
  // from `fieldSpacer` rather than just retuning that shared constant,
  // since `fieldSpacer` is still used for the Background label on the
  // right column below, where the more generous spacing reads fine.
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
  // `flexDirection: 'row'` container (2026-09-19 bugfix, Tilman: "does not
  // even show ... the name input and tags input fields"). ClipboardTextInput
  // (ui/ClipboardTextInput.tsx)'s own root `wrap` style is `flex: 1` -
  // exactly the "fill available width, natural single-line height" behavior
  // its other call sites all rely on (ItemsList.tsx's `createRow`,
  // QuickAddWidget's own text fields), every one of them a `flexDirection:
  // 'row'` parent. Placed directly in a plain column `View` (this section's
  // previous shape), that same `flex: 1` instead competes for *vertical*
  // space along the column's main axis - collapsing to ~0 height, since
  // this section's own wrapping View sizes itself to its content rather
  // than handing out leftover height (module doc comment: "deliberately
  // NOT flex"). A one-child row sidesteps this the same way every working
  // usage already does, without touching the shared component.
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
  defRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  defRowMain: {
    flex: 1,
  },
  defRowName: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  defRowMeta: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 2,
  },
  defRowDelete: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  defRowDeleteText: {
    fontSize: FONT.small,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // `alignItems: 'flex-start'` (2026-09-18 bugfix - Tilman, looking at the
  // real device: "on the left there is lots of space between name and
  // context of the template. that can go.") - without it, RN's default
  // `alignItems: 'stretch'` on a row stretches BOTH columns to match
  // whichever is taller (here, the right column's preview+piece list, much
  // taller than the left column's fields), which in turn gives
  // `ui/ClipboardTextInput.tsx`'s own `flex: 1` wrap a genuine leftover
  // height to grow into inside the now-stretched left column - so the Name
  // field silently grew taller than one line, reading as "empty space"
  // above the Context label. `flex-start` lets each column size to its own
  // content instead, which is what a form column next to a taller preview
  // column should do anyway. As of the 'edit' page's later rearrangement
  // (see `templatesEditRow` below), only the 'edit-piece' page still uses
  // this style directly.
  twoColumn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // The 'edit' form's own row (2026-09-18 rearrangement) - deliberately its
  // own style rather than reusing `twoColumn` above, and the opposite
  // alignItems choice: this row wants BOTH columns stretched to match its
  // own full height (RN's default `alignItems: 'stretch'`, so nothing is
  // set here to override it), because the left column's `pieceListBody`
  // and the right column's `columnSpacer` (both below) are `flex: 1`
  // sections that need a real bounded height to grow into/self-measure
  // against - the exact opposite need `twoColumn`'s own `flex-start` fix
  // was written for. `flex: 1` so this row itself fills `styles.tabBody`
  // (the bounded flex column every tab's content already sits inside),
  // same precondition `styles.templatesListBody` already relies on for the
  // definitions list's own self-measuring PagedSection above.
  templatesEditRow: {
    flexDirection: 'row',
    flex: 1,
  },
  // The Templates edit form's two-column "card" look (2026-09-18 - Tilman:
  // "fully align it rather with the UI used on daily view etc.") - same
  // borderWidth/padding as `ui/QuickAddWidget.tsx`'s own card rows,
  // `RADII.md` matching its `borderRadius: 6` almost exactly.
  formColumnCard: {
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: 10,
  },
  // Wraps the piece list + "+ Add piece" row in the left column's bottom
  // section (2026-09-18 rearrangement) - same `flex: 1` self-measuring-
  // boundary role `styles.templatesListBody` already plays for the
  // definitions list above: this section's own natural-height siblings
  // (the top fields View above it) stay untouched by `templatesEditRow`'s
  // stretch, and this box alone claims whatever's left, which is what lets
  // the `PagedSection` inside it self-measure a real number instead of 0.
  pieceListBody: {
    flex: 1,
    marginTop: SPACING.md,
  },
  // Right column's push-to-bottom spacer (module doc comment: "at the
  // bottom the background template name and options to change it") - the
  // same `flex: 1` idiom as `pieceListBody` above, just with nothing
  // rendered inside it; it exists purely to consume this column's leftover
  // height (available because `templatesEditRow` stretches this column to
  // the row's full height) so Background/Save/Cancel land at the bottom
  // instead of directly under NudgePad.
  columnSpacer: {
    flex: 1,
  },
  // The Background field's compact "current choice + Change…" row - same
  // bordered-row look as `pieceRow`/`defRow` below, opens the
  // 'edit-template' page rather than listing backgrounds inline (module
  // doc comment).
  templateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  templateFieldRowText: {
    fontSize: FONT.medium,
    flex: 1,
    marginRight: 8,
  },
  templateFieldChange: {
    fontSize: FONT.small,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // "Choose background" page (2026-09-18). `flex: 1` on both this and
  // `templateBrowseColumns` below - unlike `twoColumn`'s `flex-start` fix
  // above, this row's left column genuinely wants "whatever space is
  // there" (Tilman) for its self-measuring `PagedSection` (same bounded-
  // flex-column precondition `styles.templatesListBody` already satisfies
  // for the definitions list), so this one keeps RN's default
  // `alignItems: 'stretch'` rather than opting out of it.
  templateBrowsePage: {
    flex: 1,
  },
  templateBrowseColumns: {
    flex: 1,
    flexDirection: 'row',
  },
  // Plain file-row look, not a bordered/card row - matches
  // `ui/FileBrowserPane.tsx`'s own `entryRow` (paddingVertical only, no
  // border), the "exactly as other file panels" instruction.
  templateBrowseListRow: {
    paddingVertical: 5,
  },
  templateBrowseListRowText: {
    fontSize: FONT.medium,
  },
  templateBrowseListRowTextSelected: {
    fontWeight: '700',
  },
  // Page-aspect-ratio box, real MyStyle PNG rendered inside it as of
  // 2026-09-18 (docs/dev/technical-design-note-templates.md §7 Phase 5 item
  // #1) - no filename caption on it either way (module doc comment).
  // `overflow: 'hidden'` so the <Image> (which fills the box exactly,
  // width/height 100%) respects this box's own rounded corners instead of
  // squaring them off.
  templateBrowsePreviewBox: {
    width: '100%',
    aspectRatio: NOTE_PAGE_WIDTH_PX / NOTE_PAGE_HEIGHT_PX,
    borderWidth: 1,
    borderRadius: RADII.sm,
    overflow: 'hidden',
  },
  templateBrowsePreviewImage: {
    width: '100%',
    height: '100%',
  },
  templatePreviewErrorText: {
    fontSize: FONT.small,
    opacity: 0.7,
    padding: SPACING.sm,
    textAlign: 'center',
  },
  templateApplyButton: {
    marginTop: SPACING.md,
  },
  toggleRow: {
    marginTop: SPACING.md,
  },
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
  formButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  // "Save with slightly wider button" (2026-09-18, Tilman, moving Save/
  // Cancel to the right column) - `saveButton` itself has no explicit
  // width (hugs its own text/padding inside `formButtonRow`), so this just
  // adds a floor wide enough to read as visibly bigger than Cancel next to
  // it without needing to touch the shared `saveButton` style every other
  // Save/Apply/Add/Run button in this file also uses.
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
  pieceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  pieceRowSelected: {
    borderWidth: 2,
  },
  pieceRowText: {
    fontSize: FONT.small,
    flex: 1,
    marginRight: 8,
  },
  pieceRowRemove: {
    fontSize: FONT.medium,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  // ---- "Add piece" page (§6.1, 2026-09-20) ------------------------------
  // `flex: 1` wrapper so the PagedSection above the pinned "+ New text" row
  // self-measures against a real bounded height - same role `pieceListBody`
  // plays on the 'edit' form (minus its top margin, which this card doesn't
  // want directly under its own padding).
  addPieceListBody: {
    flex: 1,
  },
  // One list row: bordered, fixed 44px tall + 6px top margin = ADD_PIECE_ROW_HEIGHT.
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingLeft: 8,
    paddingRight: 6,
  },
  addRowSelected: {
    borderWidth: 2,
  },
  addRowMain: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 6,
  },
  addRowName: {
    fontSize: FONT.medium,
  },
  addRowPreview: {
    fontSize: FONT.small,
    opacity: 0.6,
  },
  // Small "+ Add" / "Remove" button on the row's right - outlined for "+ Add",
  // filled (grayscale accent) for "Remove" so a placed piece reads at a glance.
  addRowButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    minWidth: 78,
    alignItems: 'center',
  },
  addRowButtonPlaced: {
    backgroundColor: COLORS.accent,
  },
  addRowButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  addRowButtonTextPlaced: {
    color: COLORS.accentText,
  },
  addDefRowTextActive: {
    textDecorationLine: 'none',
  },
  addPanelTitle: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  addPanelStatus: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginBottom: SPACING.xs,
  },
  addPanelText: {
    fontSize: FONT.medium,
  },
  addPanelExample: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginTop: 2,
  },
  addPanelHint: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: SPACING.sm,
  },
  // One-line result of the last add/remove/save under both columns.
  addNotice: {
    fontSize: FONT.small,
    marginTop: SPACING.sm,
  },
});
