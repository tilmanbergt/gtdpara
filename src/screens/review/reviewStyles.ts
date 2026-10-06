/** Styles shared by the Review shell and its steps. */
import {StyleSheet} from 'react-native';
import {COLORS, FONT} from '../../ui/theme';

/** Minimum height of the Gmail detail panel's email-text pane (action bar + ~4 lines): below this the pane keeps its height instead of shrinking when the rest of the panel needs the room. */
const GMAIL_BODY_MIN_PX = 150;

export const styles = StyleSheet.create({
  // See renderWeekAhead's own comment - [[feature_pagination_fixed_height]].
  weekAheadRoot: {
    flex: 1,
  },
  stepNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 12,
  },
  stepNavText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  // "‹ Back"/"Overview" on the left, "Skip ›"/"Reviewed ›" on the right of
  // the step nav row (docs/dev/technical-design-review-hub.md §4.2).
  stepNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepNavGap: {
    marginLeft: 20,
  },
  stepNavPrimary: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stepNavPrimaryText: {
    fontWeight: '700',
  },
  stepTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  stepScroll: {
    flex: 1,
  },
  // Gmail inbox detail panel: a column whose last child, the
  // email text, takes all the height the fixed controls above it leave over -
  // see GmailDetailPanel's doc comment and ui/GmailBodyPane.tsx.
  gmailDetailRoot: {
    flex: 1,
  },
  gmailBodyArea: {
    flex: 1,
    minHeight: GMAIL_BODY_MIN_PX,
    marginTop: 8,
  },
  // Inbox-to-zero step's two-pane layout (docs/dev/technical-design-filing-
  // unification.md §5.1) - same names/values as screens/InboxScreen.tsx's
  // own body/leftPane/rightPane/paneTitle.
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    flex: 1,
    borderRightWidth: 1,
    paddingRight: 16,
    marginRight: 16,
  },
  rightPane: {
    flex: 1,
  },
  // Bounded flex:1 column (docs/dev/technical-design-flex-weight-stacking.md
  // §3.4) - splits its real available height 8:6 between the
  // Inbox-to-zero step's Tasks/Meetings PagedSections via the weighted
  // `<View style={{flex: REVIEW_INBOX_TASKS_WEIGHT}}>`/`{flex:
  // REVIEW_INBOX_MEETINGS_WEIGHT}}` boxes wrapping them in renderInboxZero,
  // above - same shape and same 8:6 ratio as screens/InboxScreen.tsx's own
  // stackedColumn.
  stackedColumn: {
    flex: 1,
  },
  // Gmail inbox step's own manual-refresh row (renderGmailInbox) - a single
  // pill plus an inline error, above the ReviewMasterDetail shell rather
  // than inside it, since an IMAP fetch is its own explicit action distinct
  // from reloading the files (see loadGmailInbox's own doc
  // comment for why).
  gmailToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  paneTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  rowText: {
    fontSize: FONT.medium,
  },
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 2,
  },
  // ui/ReviewMasterDetail.tsx left-list rows (Stalled/Neglected/Done/On
  // Hold's flat ReviewLeftRow, and Unfocused next items' own flattened
  // rows) - docs/dev/technical-design-review-master-detail.md §3.
  masterRow: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  masterRowIndented: {
    paddingLeft: 20,
  },
  masterRowSelected: {
    backgroundColor: '#eeeeee',
    borderLeftWidth: 4,
    borderColor: COLORS.accent,
  },
  masterRowText: {
    fontSize: FONT.medium,
    fontWeight: '500',
  },
  // Muted, not struck through - an acted-on row stays fully legible and
  // re-tappable (the decision can be changed), it just visually recedes a touch.
  masterRowActedOn: {
    opacity: 0.55,
  },
  masterGroupLabel: {
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  masterGroupLabelText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  masterNoteRow: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  // The detail column's empty state (no left-list row selected yet) -
  // centered guide copy, one shared shape per step (ReviewEmptyDetail).
  emptyDetail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  emptyDetailTitle: {
    fontSize: FONT.large,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDetailText: {
    fontSize: FONT.medium,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 12,
  },
  emptyDetailHint: {
    fontSize: FONT.small,
    fontStyle: 'italic',
    opacity: 0.6,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: FONT.small,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  sectionLabelHint: {
    fontWeight: '400',
    opacity: 0.6,
  },
  detailCaption: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginBottom: 8,
  },
  focusSubheading: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  cardMeetings: {
    marginBottom: 8,
  },
  cardShelved: {
    marginBottom: 8,
  },
  cardShelvedHeading: {
    marginTop: 0,
  },
  shelvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  shelvedText: {
    flex: 1,
    marginRight: 8,
  },
  /** One "Created from this email" entry: its row plus (once linked) the file line below. */
  gmailCreatedItem: {
    marginBottom: 4,
  },
  gmailLinkedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    marginBottom: 2,
  },
  gmailLinkedName: {
    flex: 1,
    marginLeft: 6,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 6,
  },
  pillActive: {
    borderWidth: 2,
  },
  /** Grayed-out "already focused" state for Unfocused-next-items' own
   * "+ Add to Daily/Weekly focus" pills - same opacity convention this
   * file's other disabled controls use. */
  pillDisabled: {
    opacity: 0.3,
  },
  pillText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  /** Unfocused-next-items' own compact "Set due date" field - same
   * YYYY-MM-DD text convention ui/QuickAddWidget.tsx's own due-date field
   * uses, sized to sit inline in a pillRow next to its Save/✕ pills rather
   * than the widget's own full-width layout. */
  /** Wrapper margins for the due-date field (DateInput takes layout via containerStyle) - the same 8/6 gap the pills beside it have. */
  dueDateWrap: {
    marginRight: 8,
    marginBottom: 6,
  },
  /** Pill-shaped corners to match the buttons in its row; border, vertical padding and font size come from DateInput's defaults. */
  dueDateInput: {
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  // Gmail Archive pill's tap flash: inverted black fill, the
  // app's "active" convention (ui/theme.ts COLORS.accent/accentText).
  pillFlash: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
});
