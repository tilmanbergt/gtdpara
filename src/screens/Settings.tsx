/**
 * Settings screen: the base storage root, plus the individual folder name
 * for each of Projects/Areas/Resources/Archive layered on top of it, and
 * the daily/weekly focus slot counts (storage/focusSlots.ts) - how many
 * Projects/Areas can be focused at once.
 *
 * No heading of its own since the 2026-09-03 Daily-cleanup pass (technical-
 * design-daily-compact-ui.md §1) - every tab's per-screen heading was
 * removed there. Advanced → "Reload all files" re-reads every file for all
 * tabs, this one included (handleReloadAllFiles below).
 *
 * Folders/Focus/Calendar sub-tabs (docs/dev/technical-design-google-calendar.md
 * §9-10, 2026-09-03): sections that used to all sit in one scrolling
 * ScrollView now sit behind a shared <MiniTabs> (ui/MiniTabs.tsx) so each is
 * reachable with no scrolling - Folders is the original FIELDS block, Focus
 * the original FOCUS_COUNT_FIELDS block, both unchanged. NOTE (2026-09-18,
 * docs/dev/technical-design-note-templates.md §6): the screen's own outer
 * scroll was removed in the same pass that gave the Templates tab a real
 * self-measuring `PagedSection` (Tilman: "let's first get settings straight
 * to be [a] bound flex column... I want self-measuring pagination here") -
 * these tabs no longer scroll at all if their content overflows.
 * Deliberately left as-is for now (Tilman: "other pages are not really full
 * anyway, so we can take care of them later") rather than given their own
 * individual ScrollViews pre-emptively.
 * Calendar is the `googleCalendarIcsUrl` field plus a "Paste from clipboard"
 * button, `@react-native-clipboard/clipboard` - this app's first
 * third-party native module besides supernote/GtdParaFileModule.kt, so it
 * needs a native rebuild after `npm install`, not just a JS reload). Save
 * stays one shared action across every tab rather than a separate save
 * state per tab - simplest, and `clearCachedData()` on save stays scoped to
 * the folder fields as before (a URL/template/block-position change
 * doesn't affect dataCache.ts). `initialTab` lets another screen's "Open
 * Calendar Settings" link (ui/GoogleCalendarPanel.tsx's empty state,
 * threaded through App.tsx's openSettingsCalendar handler) land straight on
 * the Calendar tab - read once via useState's initializer since a tab
 * switch away from Settings fully unmounts it (same assumption
 * ReviewScreen's module doc comment documents for its own resume behavior),
 * so there's no stale-prop case to handle on re-render.
 *
 * "Meeting Note" tab (docs/dev/technical-design-meeting-notes.md §1.1/§1.2,
 * Phase 3) - REMOVED 2026-09-18, same day, Phase 3 of docs/technical-
 * design-note-templates.md (Tilman: "remove the not needed meeting template
 * settings"). It used to hold `GtdParaSettings.meetingNoteTemplate` (a
 * single global MyStyle background, picked via `ui/TemplatePicker.tsx`) and,
 * before that, the meeting-note auto-block's `topX`/`topY`/`maxWidth`
 * fields (removed earlier that same day once positioning went per-piece).
 * Once every context (Meeting included) resolves its background per-
 * definition via `storage/noteLinks.ts`'s `resolveNoteBackgroundTemplate`,
 * that one remaining global field had nothing left to do -
 * `meetingNoteTemplate` was removed from `GtdParaSettings` entirely (see
 * that file's own revision history) rather than left as dead config.
 * `ui/TemplatePicker.tsx` itself is now fully orphaned - nothing else in
 * this codebase renders it - and is flagged for manual deletion (this
 * session has no delete capability on the linked device); see this file's
 * own git history for what its removed JSX block looked like if it's ever
 * needed for reference.
 *
 * Shown as the "Tag Rules" tab (docs/dev/technical-design-meeting-tracking.md):
 * a definition is now "what happens to items with these tags in this
 * context" - its note template plus, for meetings, whether prep and review
 * are tracked. The tab key, `templatesView` state, and the
 * `noteCreationDefinitions` settings key keep their old names on purpose -
 * a UI relabel only, so no stored data or call site changed with it.
 *
 * "Templates" tab (docs/dev/technical-design-note-templates.md, Phase 1,
 * 2026-09-18; wired into Meeting-note creation in Phase 2, into Todo-note
 * creation in Phase 3, same day): a list + create/edit UI for
 * `values.noteCreationDefinitions` - same shared-draft-state/single-Save-
 * button pattern as every other tab here, so a definition change is just
 * another edit to `values` until Save is pressed (this tab's own Save/
 * Delete are the one exception - see this file's "self-persist" note
 * further below). `myStylePngs` (the MyStyle `.png` listing, fetched once
 * below) backs this tab's own Background field/browse page - it used to
 * also back the now-removed Meeting Note tab's `ui/TemplatePicker.tsx`
 * field, sharing one fetch between the two; now there's only the one
 * consumer, but the listing stays fetched here rather than moved, since
 * nothing about how/when it's needed changed.
 *
 * The definitions list uses `ui/PagedSection.tsx`/`usePagedByHeight` (Tilman,
 * 2026-09-18: "this is important, rather other settings pages will also
 * move to paged view in the future, please stick with paged Section here")
 * - the first use of it inside Settings.tsx, in self-measuring mode (no
 * `viewportHeight` passed - Tilman's immediate follow-up: "I want
 * self-measuring pagination here"). That mode needs a bounded flex-column
 * ancestor chain (PagedSection's own doc comment), which is why this
 * screen's own outer container changed from a `ScrollView` to a plain
 * `flex: 1` `View` in the same pass (see the module doc comment above) -
 * `styles.tabBody` is the bounded `flex: 1` box every tab's content now
 * renders inside, with `styles.templatesListBody` a further `flex: 1`
 * wrapper around just the "+ New..." row + `PagedSection` so the row's
 * natural height and the list's self-measured remainder both come out
 * right. `TEMPLATE_DEF_ROW_HEIGHT` is still needed (self-measuring only
 * removes the *viewport* height input, not the *row* height one) - a
 * hand-picked starting guess, same "retune from a real screenshot"
 * convention every other row-height constant in this app already follows.
 * Delete is immediate, no arm/confirm second tap - matches
 * `ui/QuickAddWidget.tsx`'s own Delete button, which this tab's card
 * styling (`styles.formColumnCard`, `styles.defRow`) was brought in line
 * with in the same pass (Tilman: "fully align it rather with the UI used
 * on daily view etc... this new area should be up to standard").
 *
 * Edit form is three pages, not one crowded two-column screen (2026-09-18
 * revision, back to the shape of the original click-through UI draft -
 * "Note Template Manager", Tilman's artifact gallery - after a round that
 * had briefly inlined both the background list and the add-piece chooser
 * directly into the two-column form: Tilman, "I like the initial design
 * better, where pieces [are] selected on a 2nd page and template as well
 * on a second page with preview... this works better on eink"). `templatesView`
 * has four values, not two: `'list'`, `'edit'` (the two-column form),
 * `'edit-template'` and `'edit-piece'` - both full pages, both revised again
 * same-day after Tilman looked at this on the real device (below).
 *
 * `'edit'`'s own two-column split was rearranged again same-day, a second
 * time (Tilman, after using it on-device some more: "space is quite tight
 * on the right side... Left column top: name, context tags, default/enabled
 * ... Then on the left the pieces list. On the right column the preview
 * with positioning, the positioning controller and at the bottom the
 * background template name and options to change it... the pieces need to
 * better visible and should go into a paginated pane"). So: left column -
 * Name/Context/Tags(+hint)/Default+Enabled at the top, tightly spaced
 * (`styles.compactFieldSpacer`, not the more generous `styles.fieldSpacer`
 * every other label in this file still uses), then the piece list, now a
 * real self-measuring `PagedSection` (same "paginated pane, in case they
 * become more" treatment the definitions list already got above) rather
 * than the fixed `viewportHeight` capped-at-`PIECE_LIST_MAX_VISIBLE_ROWS`
 * box it used to be. Right column - `NoteTemplatePreview` + `NudgePad` at
 * the top, then a `flex: 1` spacer, then the compact "Background: <name>
 * Change…" row and the Save ("Create" when adding)/Cancel buttons pinned to
 * the bottom (Save now `styles.saveButtonWide` - "Save with slightly wider
 * button"). Both elements moved from the left column to the right; nothing
 * else about them changed - "except the explanation [i.e. the tightened top
 * section] all elements remain and nothing new added. just rearranged."
 * This is its own `styles.templatesEditRow` now, not the shared
 * `styles.twoColumn` 'edit-piece' below still uses - the self-measuring
 * piece list needs this row's cross-axis to *stretch* both columns to the
 * row's full height (so each column is itself a bounded flex column the
 * piece list/bottom-spacer can measure/grow against), the opposite of
 * `twoColumn`'s own `alignItems: 'flex-start'` fix (see that style's own
 * comment) - changing `twoColumn` itself would have undone that fix for
 * 'edit-piece', which still wants each column sized to its own content.
 *
 * `'edit-template'` ("Choose background", 2026-09-18 revision): **not**
 * `ui/TemplatePicker.tsx` (that component was, at the time, unchanged and
 * still used as-is for the now-removed Meeting Note tab's own compact
 * inline field - see this file's own "Meeting Note" tab paragraph above for
 * that removal; the component itself is orphaned dead code now) - Tilman
 * asked for this dedicated page to instead mirror this app's plain
 * file-panel look and behavior directly: "let the template pagination work
 * exactly as
 * other file panels we have already in the plugin (areas, projects)...
 * tapping on a file[ ]shows the preview on the right side, and the big
 * apply button uses that for the definition... no need to limit them in
 * height, just let it take whatever space is there." So this page inlines
 * its own two-column browse UI: left, a self-measuring `PagedSection` of
 * `['', ...myStylePngs]` styled like `ui/FileBrowserPane.tsx`'s own plain
 * entry rows (padding only, no border, 🖼/✓ prefix, no fixed row cap -
 * `styles.templateBrowseColumns` keeps RN's default `alignItems: 'stretch'`
 * specifically so the list gets the column's *whole* height, unlike
 * `twoColumn` below); right, a page-aspect-ratio preview box rendering the
 * actual selected MyStyle `.png` via a plain RN `<Image source={{uri:
 * 'file://'+path}}}>` (2026-09-18, docs/dev/technical-design-note-templates.md
 * §7 Phase 5 item #1 - this codebase's first-ever `<Image>` use; falls back
 * to a small "Could not load <file>" line inside the same box on decode
 * failure, tracked per-filename in `templatePreviewFailedFor` rather than
 * assumed to always work, since the plugin's own file-permission model and
 * this hardware's image decoder were both unverified for this path before
 * now) - still no filename caption on it, since the left list already
 * shows/highlights the pick: "no need to repeat name of template on top,
 * as it shows to the left") plus a big "Apply" button. `handleChooseTemplate`
 * commits the pick immediately on tap (staying on the page, so browsing
 * multiple times before leaving is free) - "Apply" (`handleBackToEditForm`)
 * is really just "done browsing," not a second, different commit step.
 *
 * `'edit-piece'` ("Add piece", 2026-09-18 revision): also two columns now,
 * not one stacked page - Tilman, on the device: "again go with two
 * columns: left predefined elements, right side custom static text...
 * here currently add button overlapps text input box." That overlap
 * traced to `ui/ClipboardTextInput.tsx`'s own `wrap` style (`flex: 1`)
 * growing to fill unexpected leftover height once it sat alone in an
 * unbounded single-column page; putting it in its own `formColumnCard`
 * column, right next to the predefined-piece-type list, inside
 * `styles.twoColumn` (see that style's own comment on why it's
 * `alignItems: 'flex-start'` - as of the 'edit' page's own later
 * rearrangement above, this is the only page still using `twoColumn`
 * directly) fixes the overlap and gives the requested layout in one move -
 * this codebase's own proven "how two-column forms here stay well-behaved"
 * pattern, not a bespoke fix. Picking a predefined type, or this column's
 * own "Add", both add the piece and return to `'edit'`.
 *
 * Neither sub-page is a scroll region - the piece-type list is short and
 * fixed (at most four rows: Title, Date, Time, Related items, whichever
 * are compatible with the definition's context) and the background list
 * self-measures - so the "no scrolling, anywhere" rule (docs/dev/design-
 * device-rendering.md §1) still holds.
 *
 * Tags field strips the space after a typed "# " the same way
 * `ui/QuickAddWidget.tsx` does for every tag-bearing field there
 * (`domain/markdown.ts`'s `stripSpaceAfterHash`, wrapped around this
 * field's `onChangeText` the same way `QuickAddWidget`'s own `setTaskText`/
 * `setNoteTitleRaw`/`setTaskWaitingOn` wrap theirs) - Tilman, 2026-09-18:
 * "tag entry: remove spaces after # as is done in the quickadd widget."
 * `handleEditDefinition` also now re-serializes `def.tags` back into the
 * free-text field with a leading `#` on each tag (`#coaching #daily`, not
 * the old `def.tags.join(', ')`) - the comma form was a latent bug, not
 * just a style mismatch: re-saving an existing definition with its tags
 * field untouched would silently glue a trailing comma onto the first tag
 * (`handleSaveDefinitionDraft`'s parse splits on whitespace only, never
 * strips a comma), corrupting it. The `#`-prefixed, space-separated form
 * matches both what the list view already displays (`def.tags.map(t =>
 * '#'+t).join(' ')`) and what the save parse expects back.
 *
 * `'edit-piece'` REWORKED 2026-09-20 (docs/dev/technical-design-note-templates.md
 * §6.1; Tilman's decisions + HTML prototype): the page is now a general piece
 * editor, not a "static text composer + type list". Left: the predefined
 * pieces for the rule's context, then THIS rule's own static texts
 * (`draftDef.texts`), then a pinned "+ New text" - each row with a small
 * "+ Add", which becomes "Remove" once placed (every piece/text is placed at
 * most once per rule; removing a text only takes it off the page). Tapping a
 * row only selects it: the right panel explains a predefined piece with an
 * example, or edits a text (name + text; Create/Save/Delete) and stays empty
 * until something is selected. The page stays open after "+ Add"/"Remove"
 * (several pieces in one visit) and returns with "‹ Back to rule". Texts are
 * part of the rule draft, so they are saved/discarded with the rule's own
 * Create/Save/Cancel; saving a text updates its placed piece in place, so its
 * position never needs redoing. `staticTextDraft` and `handleAddPiece` are
 * gone; the predefined-piece rows moved off `styles.twoColumn` to the same
 * stretched `templateBrowseColumns` the 'edit-template' page uses, since the
 * left list is now a self-measuring PagedSection.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {stripSpaceAfterHash} from '../domain/markdown';
import {formatDayHeader} from '../domain/dateFormat';
import {todayIso} from '../domain/meetingTime';
import {trackingSummary} from '../domain/meetingTracking';
import {
  addPieceToDefinition,
  addTextItem,
  createEmptyDefinition,
  definitionTexts,
  effectiveNoteTarget,
  findPlacedPieceIndex,
  hasUntouchedDefaultPieces,
  isPiecePlaced,
  linkPieceText,
  migrateLegacyTextPieces,
  NoteContext,
  NoteCreationDefinition,
  NOTE_PAGE_HEIGHT_PX,
  NOTE_PAGE_WIDTH_PX,
  NotePiece,
  NoteTarget,
  NoteTextItem,
  nudgePieceAt,
  PIECE_CONTEXTS,
  pieceMaxWidthPx,
  PieceType,
  removePieceFromDefinition,
  removePlacedPiece,
  removeTextItem,
  resolvedSharedFileFolder,
  resolvedSharedFileName,
  setPieceFontSize,
  setPieceMaxWidth,
  setPieceStep,
  SharedNoteFolder,
  updateTextItem,
  withDefaultPieces,
} from '../domain/noteTemplate';
import {DEFAULT_SETTINGS, GtdParaSettings, resolvePaths} from '../domain/settings';
import {renderSharedFileName, SHARED_FILE_NAME_PLACEHOLDERS} from '../domain/sharedNotePages';
import {MEETINGS_SUBFOLDER, sanitizeFileNameComponent, TODOS_SUBFOLDER} from '../storage/noteLinks';
import {clearCachedData, rebuildCache} from '../storage/dataCache';
import {clearCachedGmailInbox} from '../storage/gmailInboxCache';
import {runIntegrityCheck} from '../storage/integrityCheck';
import {applyFileNameFixes} from '../storage/fileNameFix';
import {FileFix, fileNameFixConfirmText, fileNameFixDoneText} from '../domain/fileNameFix';
import {renameInboxFolderForSave} from '../storage/inboxMigration';
import {loadSettings, patchSettings, saveSettings} from '../storage/settingsStorage';
import {perfEnable} from '../utils/perf';
import {dropKeptTabs, setKeepTabsAlive} from '../ui/keepAliveStore';
import {setFeatures, useFeatures} from '../ui/featureStore';
import {featuresOf} from '../domain/features';
import {log, logError} from '../utils/log';
import {setFileLogging} from '../utils/logSink';
import AboutTab from './settings/AboutTab';
import AdvancedTab from './settings/AdvancedTab';
import {listFolderEntries, MYSTYLE_FOLDER} from '../supernote/fileSystem';
import {common} from '../ui/commonStyles';
import ClipboardTextInput, {ClipboardTextInputHandle} from '../ui/ClipboardTextInput';
import MiniTabs, {MiniTabDef} from '../ui/MiniTabs';
import NoteTemplatePreview, {PIECE_TYPE_LABELS, pieceSummaryLabel} from '../ui/NoteTemplatePreview';
import NudgePad from '../ui/NudgePad';
import PagedSection from '../ui/PagedSection';
import {COLORS, FONT, RADII, SPACING, useThemeColors} from '../ui/theme';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import {useErrorStatus, useStatus} from '../ui/status/StatusProvider';
import {useStatusConfirm} from '../ui/useStatusConfirm';
import {errorMessage} from '../utils/errorMessage';

type PathKey = 'projects' | 'areas' | 'inboxFolder' | 'resources' | 'archive';

export type SettingsTab = 'folders' | 'focus' | 'calendar' | 'gmail' | 'templates' | 'advanced' | 'about';
const SETTINGS_TABS: MiniTabDef<SettingsTab>[] = [
  {key: 'folders', label: 'Folders'},
  {key: 'focus', label: 'Focus'},
  {key: 'calendar', label: 'Calendar'},
  {key: 'gmail', label: 'Gmail'},
  {key: 'templates', label: 'Tag Rules'},
  {key: 'advanced', label: 'Advanced'},
  {key: 'about', label: 'About'},
];

/** The four note contexts a definition can target - same set domain/noteTemplate.ts's PIECE_CONTEXTS is keyed against. */
const CONTEXT_TABS: MiniTabDef<NoteContext>[] = [
  {key: 'project', label: 'Project'},
  {key: 'area', label: 'Area'},
  {key: 'todo', label: 'Todo'},
  {key: 'meeting', label: 'Meeting'},
];

/** Todo/Meeting-only (docs/dev/technical-design-shared-note-pages.md §6): whether this rule's notes each get their own file ('own', today's behavior) or land as pages inside one shared file per Project/Area ('shared'). */
const NOTE_TARGET_TABS: MiniTabDef<NoteTarget>[] = [
  {key: 'own', label: 'Own file'},
  {key: 'shared', label: 'Shared file'},
];

/** Only meaningful when the rule's note target is 'shared' - where the shared file itself lives, same two choices §6 gives every shared-target rule. */
const SHARED_FOLDER_TABS: MiniTabDef<SharedNoteFolder>[] = [
  {key: 'subfolder', label: 'Subfolder'},
  {key: 'root', label: 'Item root'},
];

/** Fixed row height for the Templates tab's PagedSection list (two lines: name + context/tags) - hand-picked, not screenshot-measured, same convention as every other row-height constant in this app. The viewport itself is self-measured (no separate viewport-height constant needed) - see this file's module doc comment. */
const TEMPLATE_DEF_ROW_HEIGHT = 64;

interface TemplateDefRow {
  def: NoteCreationDefinition;
  index: number;
}

interface PieceRow {
  piece: NotePiece;
  index: number;
}

// ---- "Add piece" page (2026-09-20, docs/dev/technical-design-note-templates.md §6.1) ----

/** Row height for the Add-piece page's left list: a bordered row (44) + its top margin (6) - same "budget the margin into the fixed row height" convention PIECE_ROW_HEIGHT above uses. Big enough for a name + one preview line, and a comfortable e-ink tap target. */
const ADD_PIECE_ROW_HEIGHT = 50;

/** One row of the Add-piece page's left list: a predefined piece type, or one of THIS rule's own texts. ("+ New text" is not a row - it's pinned under the paged list so it can never land on a later page.) */
type AddPieceRow = {kind: 'type'; type: PieceType} | {kind: 'text'; item: NoteTextItem};

/** What the Add-piece page's right panel is showing/editing; null = nothing selected, panel stays empty. */
type AddPieceSelection = {kind: 'type'; type: PieceType} | {kind: 'text'; id: string} | {kind: 'new'} | null;

/** The predefined (non-text) piece types, in list order. Which ones show is still filtered per context by PIECE_CONTEXTS. */
const PREDEFINED_PIECE_TYPES: PieceType[] = ['title', 'date', 'time', 'related', 'link'];

/**
 * Explanation + example for a predefined piece's right-hand panel. The
 * examples mirror what domain/noteTemplate.ts's `renderPieceText` really
 * produces (the date example even runs the real `formatDayHeader`), so this
 * can't drift into promising a format the note won't have. Options (e.g. a
 * date format) would slot in below the example later - they would belong to
 * the one placement of the piece, since each piece is placed once.
 */
function predefinedPieceInfo(type: PieceType, context: NoteContext): {description: string; example: string} {
  switch (type) {
    case 'title':
      return {
        description: 'Inserts the note’s own title.',
        example:
          context === 'meeting'
            ? 'Weekly sync'
            : context === 'todo'
            ? 'Call supplier about invoice'
            : context === 'project'
            ? 'Website relaunch'
            : 'Health',
      };
    case 'date':
      return {description: 'Inserts the meeting’s date.', example: formatDayHeader('2026-09-21')};
    case 'time':
      return {
        description: 'Inserts the meeting’s time. Left out for a meeting without a time.',
        example: '14:00',
      };
    case 'related':
      return {
        description:
          'Lists the open tasks that share a tag with the note (always the note’s own tags). Left out when none match.',
        example: 'Relevant Todos:\n- Prepare slides #jf\n- Send minutes #jf',
      };
    case 'link':
      return {
        description:
          'Tappable link to the file attached to this ' +
          (context === 'meeting' ? 'meeting' : 'todo') +
          ' (paperclip). Left out when nothing is attached or the file no longer exists.',
        example: linkPieceText('Kickoff deck.pdf'),
      };
    default:
      return {description: '', example: ''};
  }
}

/** The Add-piece page's left list: the predefined pieces that apply to the rule's context, then the rule's own texts. */
function buildAddPieceRows(def: NoteCreationDefinition): AddPieceRow[] {
  const types: AddPieceRow[] = PREDEFINED_PIECE_TYPES.filter(t => PIECE_CONTEXTS[t].includes(def.context)).map(
    type => ({kind: 'type', type}),
  );
  const texts: AddPieceRow[] = definitionTexts(def).map(item => ({kind: 'text', item}));
  return [...types, ...texts];
}

/**
 * One ☑/☐ line - the Tag Rules edit form's Default / Enabled / Prepare /
 * Review toggles all render through this instead of each repeating the same
 * Pressable + glyph + label markup. `inline` lays it out as one of several
 * side-by-side options on a row rather than a full-width stacked line.
 */
function CheckToggle({
  label,
  checked,
  onPress,
  textColor,
  inline,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  textColor: string;
  inline?: boolean;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.toggleOption, inline && styles.toggleOptionInline]}>
      <Text style={[styles.toggleText, {color: textColor}]}>
        {checked ? '☑' : '☐'} {label}
      </Text>
    </Pressable>
  );
}

// Piece-list row height - self-measuring now (styles.pieceListBody), not a
// fixed viewportHeight, so this is only the *row* height PagedSection still
// needs (see PagedSection's own doc comment on why self-measuring only
// removes the viewport height input, not this one). Used to also pair with
// a PIECE_LIST_MAX_VISIBLE_ROWS row-count cap before the 2026-09-18
// rearrangement made this list self-measuring like the definitions list
// above.
const PIECE_ROW_HEIGHT = 40;

// The "Choose background" page's file-row height (2026-09-18 - Tilman: "let
// the template pagination work exactly as other file panels we have
// already... (areas, projects)") - same chrome+line-height derivation
// `ui/FileBrowserPane.tsx`'s own `FILE_ENTRY_CHROME_PX`/
// `FILE_ENTRY_LINE_HEIGHT_PX` use for a single-line entry (paddingVertical
// 5+5, FONT.medium's 22px line-height figure), just without that
// component's doubled row+text padding - these rows are plain single-line
// filenames (`numberOfLines={1}`), never the 2-line folder/file names
// FileBrowserPane budgets for.
const TEMPLATE_BROWSE_ROW_HEIGHT = 32;

/** The string-valued settings fields this section edits - deliberately narrower than `keyof GtdParaSettings` now that the type also has the four numeric focus-count fields (edited separately below, see FOCUS_COUNT_FIELDS), so `values[field.key]` stays a plain string for the TextInput `value` prop. */
type StringSettingKey = 'baseRoot' | 'projectsFolder' | 'areasFolder' | 'inboxFolder' | 'resourcesFolder' | 'archiveFolder' | 'gmailEmail' | 'gmailAppPassword' | 'gmailImapHost';

const FIELDS: Array<{
  key: StringSettingKey;
  label: string;
  placeholder: string;
  pathKey?: PathKey;
}> = [
  {key: 'baseRoot', label: 'Base root', placeholder: DEFAULT_SETTINGS.baseRoot},
  {
    key: 'projectsFolder',
    label: 'Projects folder',
    placeholder: DEFAULT_SETTINGS.projectsFolder,
    pathKey: 'projects',
  },
  {
    key: 'areasFolder',
    label: 'Areas folder',
    placeholder: DEFAULT_SETTINGS.areasFolder,
    pathKey: 'areas',
  },
  {
    // The Inbox's own folder inside Areas (docs/dev/technical-design-inbox-as-area.md §3.5).
    key: 'inboxFolder',
    label: 'Inbox folder',
    placeholder: DEFAULT_SETTINGS.inboxFolder,
    pathKey: 'inboxFolder',
  },
  {
    key: 'resourcesFolder',
    label: 'Resources folder',
    placeholder: DEFAULT_SETTINGS.resourcesFolder,
    pathKey: 'resources',
  },
  {
    key: 'archiveFolder',
    label: 'Archive folder',
    placeholder: DEFAULT_SETTINGS.archiveFolder,
    pathKey: 'archive',
  },
];

type FocusCountKey =
  | 'dailyFocusProjectCount'
  | 'dailyFocusAreaCount'
  | 'weeklyFocusProjectCount'
  | 'weeklyFocusAreaCount'
  | 'monthlyFocusProjectCount'
  | 'monthlyFocusAreaCount';

const FOCUS_COUNT_FIELDS: Array<{key: FocusCountKey; label: string}> = [
  {key: 'dailyFocusProjectCount', label: 'Daily focus — Projects'},
  {key: 'dailyFocusAreaCount', label: 'Daily focus — Areas'},
  {key: 'weeklyFocusProjectCount', label: 'Weekly focus — Projects'},
  {key: 'weeklyFocusAreaCount', label: 'Weekly focus — Areas'},
  {key: 'monthlyFocusProjectCount', label: 'Monthly focus — Projects'},
  {key: 'monthlyFocusAreaCount', label: 'Monthly focus — Areas'},
];

/**
 * Edited as free text (so e.g. clearing the field to retype doesn't fight
 * the input); parsed back to a non-negative integer on save, falling back
 * to `fallback` for anything blank/invalid - same "never resolve to
 * something broken" spirit as the folder-name fields' trim()||default.
 * Renamed from `parseFocusCount` (2026-09-18, docs/dev/technical-design-
 * meeting-notes.md Phase 3) once the (now-retired, see the module doc
 * comment's Phase 2 note) meeting-note block position fields started
 * sharing this same parse/fallback shape - the logic was never actually
 * focus-specific, just named after its first caller. Still used by
 * FOCUS_COUNT_FIELDS alone today.
 */
function parseNonNegativeInt(text: string, fallback: number): number {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function focusCountsToText(settings: GtdParaSettings): Record<FocusCountKey, string> {
  return {
    dailyFocusProjectCount: String(settings.dailyFocusProjectCount),
    dailyFocusAreaCount: String(settings.dailyFocusAreaCount),
    weeklyFocusProjectCount: String(settings.weeklyFocusProjectCount),
    weeklyFocusAreaCount: String(settings.weeklyFocusAreaCount),
    monthlyFocusProjectCount: String(settings.monthlyFocusProjectCount),
    monthlyFocusAreaCount: String(settings.monthlyFocusAreaCount),
  };
}

interface Props {
  /** Which sub-tab to land on when this screen mounts - see the module doc comment's note on why this is read once via useState's initializer rather than watched with an effect. */
  initialTab?: SettingsTab;
  /** Switches the active profile (App.tsx resets and remounts the app) - docs/dev/technical-design-profiles-demo-space.md. */
  onSwitchProfile?: (id: string) => Promise<void>;
}

export default function Settings({initialTab, onSwitchProfile}: Props): React.JSX.Element {
  const {isDarkMode, textColor, placeholderColor} = useThemeColors();
  // Settings uses its own, slightly different border shade than the rest
  // of the app ('#444444'/'#cccccc' vs the usual '#333333'/'#dddddd') -
  // kept as-is rather than folded into the shared pair, since unifying it
  // would be a visual change, not a dedup.
  const borderColor = isDarkMode ? '#444444' : '#cccccc';

  const [activeTabState, setActiveTab] = useState<SettingsTab>(initialTab ?? 'folders');
  // Calendar/Gmail tabs only while their experimental switch is on
  // (docs/dev/technical-design-about-debug-experimental.md §3.2); a
  // remembered tab that was just hidden falls back to Folders.
  const features = useFeatures();
  const settingsTabs = SETTINGS_TABS.filter(
    t => (t.key !== 'calendar' || features.googleCalendar) && (t.key !== 'gmail' || features.gmail),
  );
  const activeTab: SettingsTab = settingsTabs.some(t => t.key === activeTabState) ? activeTabState : 'folders';
  const [values, setValues] = useState<GtdParaSettings>(DEFAULT_SETTINGS);
  const [focusCountText, setFocusCountText] = useState<Record<FocusCountKey, string>>(
    focusCountsToText(DEFAULT_SETTINGS),
  );
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  // Save/clipboard results -> central status slot (docs/dev/technical-design-status-slot.md §7.4/§7.6).
  useErrorStatus('Settings.saveError', saveError, () => setSaveError(null));
  useErrorStatus('Settings.clipboardError', clipboardError, () => setClipboardError(null));
  // Extra sentence for the saved message, e.g. after the Inbox folder was renamed (§3.5 of technical-design-inbox-as-area.md).
  const [savedNote, setSavedNote] = useState('');
  useStatus('Settings.saved', saved ? {kind: 'success', text: `Settings saved.${savedNote}`, onDismiss: () => setSaved(false)} : null);
  // Folders tab's "Run Integrity Check" button (docs/dev/technical-design-integrity-check.md).
  const [integrityCheckRunning, setIntegrityCheckRunning] = useState(false);
  // "Reload all files" (Advanced tab) - running flag and its result line in the status slot.
  const [reloading, setReloading] = useState(false);
  const [reloadResult, setReloadResult] = useState<{kind: 'success' | 'error'; text: string} | null>(null);
  useStatus('Settings.reload', reloadResult ? {...reloadResult, onDismiss: () => setReloadResult(null)} : null);
  // MyStyle's .png listing for the "Meeting Note" tab's template picker
  // (§1.2) - null while still loading, [] once loaded with nothing found.
  // Loaded once on mount regardless of which tab is active (same "load your
  // own data eagerly" posture as `values`/`focusCountText` below) rather
  // than lazily on first visit to the tab - simpler, and MYSTYLE_FOLDER is a
  // small, fixed OS folder, not something worth deferring.
  const [myStylePngs, setMyStylePngs] = useState<string[] | null>(null);
  const [myStyleError, setMyStyleError] = useState<string | null>(null);
  // "Templates" tab - four pages, not two (see the module doc comment's
  // "Edit form is three pages" note): 'list', the two-column 'edit' form,
  // and the two full-page pickers it delegates to, 'edit-template' and
  // 'edit-piece'. The definition being edited is held as its own draft
  // (`draftDef`), separate from `values.noteCreationDefinitions`, so
  // Cancel can discard in-progress edits without touching the
  // saved-in-`values` list; `editingDefIndex` is null while creating a new
  // definition (not yet in the list) and the index being edited otherwise.
  // `draftTagsText` is edited as free text (same "don't fight the input"
  // reasoning as the number fields above) and parsed to
  // `NoteCreationDefinition.tags` only on save.
  const [templatesView, setTemplatesView] = useState<'list' | 'edit' | 'edit-template' | 'edit-piece'>('list');
  const [editingDefIndex, setEditingDefIndex] = useState<number | null>(null);
  const [draftDef, setDraftDef] = useState<NoteCreationDefinition | null>(null);
  /** The "Shared file name" field - its placeholder chips insert at its cursor (docs/dev/technical-design-split-by-tag.md §3.6). */
  const sharedFileNameInputRef = useRef<ClipboardTextInputHandle>(null);
  const [draftTagsText, setDraftTagsText] = useState('');
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null);
  // "Add piece" page (§6.1): what the right panel shows, the name/text draft
  // of the text being edited or created there, a one-line notice under the
  // columns ("Added ...", "Saved ..."), and the id of a placed text whose
  // Delete is awaiting a confirming second tap. All reset on entering the page.
  const [addSelection, setAddSelection] = useState<AddPieceSelection>(null);
  const [textDraftName, setTextDraftName] = useState('');
  const [textDraftBody, setTextDraftBody] = useState('');
  const [addNotice, setAddNotice] = useState<string | null>(null);
  useStatus('Settings.addNotice', addNotice ? {kind: 'success', text: addNotice, onDismiss: () => setAddNotice(null)} : null);
  const [confirmDeleteTextId, setConfirmDeleteTextId] = useState<string | null>(null);
  // "Choose background" page's real-image preview (2026-09-18, docs/
  // technical-design-note-templates.md §7 Phase 5 item #1 - first-ever
  // <Image> use anywhere in this codebase, see that doc's investigation
  // note). Tracks the filename an <Image> load last FAILED for, not a
  // plain boolean - comparing it against draftDef.template on render means
  // switching to a different background (or back to a previously-good one)
  // re-attempts a load rather than staying stuck on a stale failure, with
  // no separate reset effect needed.
  const [templatePreviewFailedFor, setTemplatePreviewFailedFor] = useState<string | null>(null);
  // Surfaces a failed persistDefinitions() write (create/save/delete on this
  // tab now persist immediately - see persistDefinitions's own doc comment)
  // inline within the Templates tab itself, since the global saveError text
  // it would otherwise have shared sits in the global footer, which this
  // tab no longer renders (see the footer's own `activeTab !== 'templates'`
  // guard below).
  const [templatesSaveError, setTemplatesSaveError] = useState<string | null>(null);
  // Integrity Check result (was a native dialog) -> central status slot (D10).
  const [integrityResult, setIntegrityResult] = useState<{kind: 'success' | 'warning' | 'error'; text: string} | null>(null);
  // Note files with names unsafe for Obsidian the last check found (technical-design-files-0.6.md §3.5).
  const [fileNameFixes, setFileNameFixes] = useState<FileFix[]>([]);
  const confirmFileNameFix = useStatusConfirm('Settings.fileNameFix');
  const handleFixFileNames = async () => {
    const fixes = fileNameFixes;
    if (fixes.length === 0 || !(await confirmFileNameFix(fileNameFixConfirmText(fixes)))) return;
    setIntegrityResult(null);
    setFileNameFixes([]);
    setIntegrityCheckRunning(true);
    try {
      const result = await applyFileNameFixes(fixes);
      setIntegrityResult({
        kind: result.failed.length > 0 ? 'warning' : 'success',
        text: fileNameFixDoneText(result.renamed, result.linksUpdated, result.failed.length),
      });
    } catch (e) {
      setIntegrityResult({kind: 'error', text: `Fix file names failed: ${errorMessage(e)}`});
    } finally {
      setIntegrityCheckRunning(false);
    }
  };
  useStatus(
    'Settings.integrity',
    integrityResult
      ? {
          ...integrityResult,
          actions:
            fileNameFixes.length > 0
              ? [{label: `Fix file names (${fileNameFixes.length})`, primary: true, onPress: () => {
                    handleFixFileNames();
                  }}]
              : undefined,
          onDismiss: () => setIntegrityResult(null),
        }
      : null,
  );
  useErrorStatus('Settings.templatesSaveError', templatesSaveError, () => setTemplatesSaveError(null));
  /** The MyStyle .png listing alone - also what "Reload all files" refreshes here, so unsaved edits in the form fields stay (0.6.0 Q2). */
  const loadMyStylePngs = useCallback(
    (isCancelled: () => boolean = () => false): Promise<void> =>
      listFolderEntries(MYSTYLE_FOLDER)
        .then(entries => {
          if (isCancelled()) return;
          const pngs = entries.filter(entry => !entry.isFolder && /\.png$/i.test(entry.name)).map(entry => entry.name);
          setMyStylePngs(pngs);
        })
        .catch(e => {
          if (!isCancelled()) setMyStyleError(errorMessage(e));
        }),
    [],
  );

  /**
   * Loads settings + the MyStyle .png listing together - the two mount-only
   * loads this screen always had. `loading` now gates on both loads finishing (via
   * Promise.all) rather than only the settings one - the PNG listing used to
   * resolve independently with no loading-state involvement at all, but
   * folding it in means `useEinkRefreshOnLoad(loading)` below fires once
   * both are actually done, not before the MyStyle listing has settled.
   * Each call tracks its own local `cancelled` flag (not a shared/module-
   * level one) so an in-flight load from a stale mount or an earlier reload
   * can never clobber state after a newer call - or an unmount - has
   * already landed; returning the flag-setter as a cleanup function keeps
   * that available to the mount effect below without a second copy of this
   * logic.
   */
  const loadAll = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setMyStyleError(null);
    const settingsDone = loadSettings().then(loaded => {
      if (cancelled) return;
      setValues(loaded);
      setFocusCountText(focusCountsToText(loaded));
    });
    const pngsDone = loadMyStylePngs(() => cancelled);
    Promise.all([settingsDone, pngsDone]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadMyStylePngs]);

  useEffect(() => {
    return loadAll();
  }, [loadAll]);



  useEinkRefreshOnLoad(loading);

  const update = (key: StringSettingKey, text: string) => {
    setSaved(false);
    setValues(prev => ({...prev, [key]: text}));
  };

  const updateFocusCount = (key: FocusCountKey, text: string) => {
    setSaved(false);
    setFocusCountText(prev => ({...prev, [key]: text}));
  };

  const updateIcsUrl = (text: string) => {
    setSaved(false);
    setValues(prev => ({...prev, googleCalendarIcsUrl: text}));
  };

  // ---- Templates tab ----------------------------------------------------

  const handleAddDefinition = () => {
    // New rules start with the context's default pieces, stacked (docs/
    // technical-design-linked-file-piece.md §4.1).
    setDraftDef(withDefaultPieces(createEmptyDefinition(String(values.nextNoteDefinitionId), 'meeting')));
    setEditingDefIndex(null);
    setDraftTagsText('');
    setSelectedPieceIndex(null);
    setTemplatesView('edit');
  };

  const handleEditDefinition = (index: number) => {
    // Rules saved before rule-owned texts existed: each of their inline text
    // pieces becomes a named text of this rule (no-op otherwise - see
    // migrateLegacyTextPieces). Only lands in `values` if the rule is saved.
    const def = migrateLegacyTextPieces(values.noteCreationDefinitions[index]);
    setDraftDef(def);
    setEditingDefIndex(index);
    // '#'-prefixed, space-separated - matches both the list view's own
    // `#tag` rendering and what handleSaveDefinitionDraft's parse expects
    // back (see the module doc comment - the old `.join(', ')` here was a
    // latent bug, not just a style mismatch).
    setDraftTagsText(def.tags.map(t => `#${t}`).join(' '));
    setSelectedPieceIndex(null);
    setTemplatesView('edit');
  };

  /** Wraps `setDraftTagsText` the same way `ui/QuickAddWidget.tsx`'s own tag-bearing field setters wrap theirs (Tilman, 2026-09-18: "remove spaces after # as is done in the quickadd widget"), so typing "# " never leaves a stray space between the hash and the tag text. */
  const setDraftTagsTextStripped = (text: string) => {
    setDraftTagsText(stripSpaceAfterHash(text));
  };

  const handleCancelDefinitionEdit = () => {
    setDraftDef(null);
    setEditingDefIndex(null);
    setSelectedPieceIndex(null);
    setTemplatesView('list');
  };

  /** Returns from either full-page picker ('edit-template'/'edit-piece') back to the two-column 'edit' form - both pickers commit their change immediately on selection (see the module doc comment), so "back" here is never a discard. */
  const handleBackToEditForm = () => {
    setTemplatesView('edit');
  };

  const handleOpenTemplatePicker = () => {
    setTemplatesView('edit-template');
  };

  /** Sets the draft's background - stays on the 'edit-template' page (2026-09-18 revision: Tilman wanted a browse-then-"Apply" flow, not the earlier tap-and-return-immediately behavior - "tapping on a file shows the preview on the right side, and the big apply button uses that for the definition"). `handleBackToEditForm` doubles as the Apply action - there's nothing left to commit once a row's been tapped, so "Apply" is really just "done browsing." */
  const handleChooseTemplate = (fileName: string) => {
    updateDraftDef({template: fileName});
  };

  const handleOpenAddPiece = () => {
    setAddSelection(null);
    setTextDraftName('');
    setTextDraftBody('');
    setAddNotice(null);
    setConfirmDeleteTextId(null);
    setTemplatesView('edit-piece');
  };

  /**
   * Writes a new `noteCreationDefinitions` list straight to disk - used by
   * both handleSaveDefinitionDraft and handleDeleteDefinition below now that
   * the Templates tab's own Save/Cancel/Delete persist immediately rather
   * than waiting for this screen's global Save button (2026-09-18, Tilman:
   * "we have our own save/cancel buttons and use should not need to tap
   * two. So restrict these to the other settings pages" - see the global
   * footer's own `activeTab !== 'templates'` guard below for the other half
   * of this change). Deliberately re-`loadSettings()`s from disk and merges
   * just the definitions/id fields into THAT, rather than persisting the
   * in-memory `values` object this screen already has - `values` is shared
   * across every tab's draft edits, so a Folders/Focus/Calendar/Meeting Note
   * field the user has mid-typed-but-not-yet-tapped-global-Save-for could
   * otherwise get silently written to disk as a side effect of an unrelated
   * Templates definition save. This keeps the two persistence paths fully
   * isolated: Templates definitions save themselves immediately, everything
   * else still only saves on this screen's own global Save tap.
   */
  const persistDefinitions = async (
    noteCreationDefinitions: NoteCreationDefinition[],
    nextNoteDefinitionId?: number,
  ): Promise<void> => {
    const onDisk = await loadSettings();
    await saveSettings({
      ...onDisk,
      noteCreationDefinitions,
      ...(nextNoteDefinitionId !== undefined ? {nextNoteDefinitionId} : {}),
    });
  };

  /** Parses the free-text tags field (space-separated, not comma - Tilman, 2026-09-18) back into `NoteCreationDefinition.tags` and writes the draft into `values`, then persists immediately (see persistDefinitions above) - Templates definitions no longer wait for this screen's global Save button. These tags are OR'd by domain/noteTemplate.ts's resolveNoteTemplate - a note matches this definition if it carries ANY one of them, not all at once. Lowercased here (2026-09-18, Tilman: "tags should be normalized to small in the config") so the config's own stored tags are always lowercase regardless of how the user typed them - resolveNoteTemplate additionally matches case-insensitively on top of this, so a note's own mixed-case tags still match either way. */
  const handleSaveDefinitionDraft = async () => {
    if (!draftDef) return;
    const tags = draftTagsText
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/^#/, ''))
      .filter(Boolean);
    const finalDef: NoteCreationDefinition = {...draftDef, name: draftDef.name.trim() || 'Untitled', tags};
    const list = [...values.noteCreationDefinitions];
    let nextNoteDefinitionId = values.nextNoteDefinitionId;
    if (editingDefIndex === null) {
      list.push(finalDef);
      nextNoteDefinitionId = values.nextNoteDefinitionId + 1;
      setValues(prev => ({...prev, noteCreationDefinitions: list, nextNoteDefinitionId}));
    } else {
      list[editingDefIndex] = finalDef;
      setValues(prev => ({...prev, noteCreationDefinitions: list}));
    }
    setDraftDef(null);
    setEditingDefIndex(null);
    setSelectedPieceIndex(null);
    setTemplatesView('list');
    setTemplatesSaveError(null);
    try {
      await persistDefinitions(list, editingDefIndex === null ? nextNoteDefinitionId : undefined);
    } catch (e) {
      setTemplatesSaveError(errorMessage(e));
    }
  };

  /** Immediate, no arm/confirm second tap - matches `ui/QuickAddWidget.tsx`'s own Delete button (see the module doc comment); nothing else in the Templates tab uses a confirm step either. Persists immediately too, same as handleSaveDefinitionDraft above - there's no separate Save step for a delete from the list view to wait for. */
  const handleDeleteDefinition = async (index: number) => {
    const list = values.noteCreationDefinitions.filter((_, i) => i !== index);
    setValues(prev => ({
      ...prev,
      noteCreationDefinitions: list,
    }));
    setTemplatesSaveError(null);
    try {
      await persistDefinitions(list);
    } catch (e) {
      setTemplatesSaveError(errorMessage(e));
    }
  };

  const updateDraftDef = (patch: Partial<NoteCreationDefinition>) => {
    setDraftDef(prev => (prev ? {...prev, ...patch} : prev));
  };

  // ---- "Add piece" page handlers (§6.1) -----------------------------------
  // Everything here edits `draftDef` only - texts are part of the rule, so
  // they are saved (or discarded) with the rule's own Create/Save/Cancel, not
  // persisted on their own. The page STAYS OPEN after "+ Add"/"Remove" so
  // several pieces can be placed in one visit (Tilman, 2026-09-20).

  const handleSelectPieceType = (type: PieceType) => {
    setAddSelection({kind: 'type', type});
    setAddNotice(null);
    setConfirmDeleteTextId(null);
  };

  const handleSelectText = (item: NoteTextItem) => {
    setAddSelection({kind: 'text', id: item.id});
    setTextDraftName(item.name);
    setTextDraftBody(item.text);
    setAddNotice(null);
    setConfirmDeleteTextId(null);
  };

  const handleSelectNewText = () => {
    setAddSelection({kind: 'new'});
    setTextDraftName('');
    setTextDraftBody('');
    setAddNotice(null);
    setConfirmDeleteTextId(null);
  };

  /** "+ Add" / "Remove" on a row: each piece (a predefined type, or one text) is placed at most once per rule. Adding seeds it below the last piece and selects it, so the NudgePad on the 'edit' form is already pointing at it on return; removing a text piece leaves the text itself in the list. */
  const handleTogglePlacement = (type: PieceType, textId?: string) => {
    if (!draftDef) return;
    const label = type === 'text' ? textLabel(textId) : PIECE_TYPE_LABELS[type];
    setConfirmDeleteTextId(null);
    if (isPiecePlaced(draftDef, type, textId)) {
      const idx = findPlacedPieceIndex(draftDef, type, textId);
      setDraftDef(removePlacedPiece(draftDef, type, textId));
      setSelectedPieceIndex(prev => (prev === idx ? null : prev !== null && prev > idx ? prev - 1 : prev));
      setAddNotice(
        type === 'text' ? `Removed “${label}” from the rule - the text stays in the list.` : `Removed ${label} from the rule.`,
      );
    } else {
      const body = type === 'text' ? definitionTexts(draftDef).find(t => t.id === textId)?.text ?? '' : undefined;
      const updated = addPieceToDefinition(draftDef, type, body, type === 'text' ? textId : undefined);
      setDraftDef(updated);
      setSelectedPieceIndex(updated.pieces.length - 1);
      setAddNotice(`Added ${type === 'text' ? `“${label}”` : label} to the rule.`);
    }
  };

  /** Row label for a text id in the current draft ('Text' if it can't be found - shouldn't happen). */
  const textLabel = (textId?: string): string =>
    (draftDef && definitionTexts(draftDef).find(t => t.id === textId)?.name) || 'Text';

  /** Create (new) or Save (existing). Saving an existing text also updates its placed piece in place - position and font stay (updateTextItem). */
  const handleSaveText = () => {
    if (!draftDef || !addSelection) return;
    const name = textDraftName.trim() || 'Untitled';
    setConfirmDeleteTextId(null);
    if (addSelection.kind === 'new') {
      const {definition, id} = addTextItem(draftDef, name, textDraftBody);
      setDraftDef(definition);
      setTextDraftName(name);
      setAddSelection({kind: 'text', id});
      setAddNotice('Text created - use + Add to place it.');
    } else if (addSelection.kind === 'text') {
      const placed = isPiecePlaced(draftDef, 'text', addSelection.id);
      setDraftDef(updateTextItem(draftDef, addSelection.id, name, textDraftBody));
      setTextDraftName(name);
      setAddNotice(placed ? 'Saved - the placed piece is updated, its position is kept.' : 'Saved.');
    }
  };

  /** Deletes the selected text from the rule. A text that is placed takes its piece with it, so that needs confirming (nothing else on this tab confirms - this is the one delete that also removes something from the page): a confirm in the central status slot, or a second tap on Delete (docs/dev/technical-design-status-slot.md D10). */
  const handleDeleteText = () => {
    if (!draftDef || addSelection?.kind !== 'text') return;
    const id = addSelection.id;
    if (isPiecePlaced(draftDef, 'text', id) && confirmDeleteTextId !== id) {
      setConfirmDeleteTextId(id);
      setAddNotice(null);
      return;
    }
    deleteTextNow(id);
  };

  const deleteTextNow = (id: string) => {
    if (!draftDef) return;
    setDraftDef(removeTextItem(draftDef, id));
    setSelectedPieceIndex(null);
    setAddSelection(null);
    setConfirmDeleteTextId(null);
    setAddNotice('Text deleted.');
  };
  useStatus(
    'Settings.deleteTextConfirm',
    confirmDeleteTextId
      ? {
          kind: 'confirm',
          text: 'This text is placed in the rule - deleting it removes it from the rule too.',
          actions: [{label: 'Delete', primary: true, onPress: () => deleteTextNow(confirmDeleteTextId)}],
          onCancel: () => setConfirmDeleteTextId(null),
        }
      : null,
  );

  const handleRemovePiece = (index: number) => {
    if (!draftDef) return;
    setDraftDef(removePieceFromDefinition(draftDef, index));
    setSelectedPieceIndex(prev => (prev === index ? null : prev !== null && prev > index ? prev - 1 : prev));
  };

  const handleNudgeSelectedPiece = (dx: number, dy: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    setDraftDef(nudgePieceAt(draftDef, selectedPieceIndex, dx, dy));
  };

  const handleFontDeltaSelectedPiece = (delta: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    const current = draftDef.pieces[selectedPieceIndex].fontSize;
    setDraftDef(setPieceFontSize(draftDef, selectedPieceIndex, current + delta));
  };

  const handleStepChangeSelectedPiece = (step: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    setDraftDef(setPieceStep(draftDef, selectedPieceIndex, step));
  };

  const handleMaxWidthDeltaSelectedPiece = (delta: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    const current = pieceMaxWidthPx(draftDef.pieces[selectedPieceIndex]);
    setDraftDef(setPieceMaxWidth(draftDef, selectedPieceIndex, current + delta));
  };

  const handlePasteIcsUrl = async () => {
    setClipboardError(null);
    try {
      const text = await Clipboard.getString();
      updateIcsUrl(text.trim());
    } catch (e) {
      setClipboardError(errorMessage(e));
    }
  };

  // Mirrors handlePasteIcsUrl - a Gmail app password is a 16-char generated
  // string (docs/dev/technical-design-review-gmail-inbox.md §2: this plugin
  // uses an app password, never the user's real Google password, since
  // there's no OAuth consent screen available inside a plugin webview) that
  // nobody types by hand from Google's "App passwords" page; paste is the
  // only realistic entry path.
  const handlePasteGmailAppPassword = async () => {
    setClipboardError(null);
    try {
      const text = await Clipboard.getString();
      update('gmailAppPassword', text.trim());
    } catch (e) {
      setClipboardError(errorMessage(e));
    }
  };

  const toggleGmailHideHandled = () => {
    setSaved(false);
    setValues(prev => ({...prev, gmailHideHandled: !prev.gmailHideHandled}));
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      // Spread `values` first (2026-09-18 bugfix, found incidentally while
      // adding the meeting-note fields below: this literal used to list
      // only the Folders/Focus/Calendar fields by name, silently omitting
      // every field added to GtdParaSettings since - hideDoneProjectTasks/
      // hideDoneInboxTasks/lastReviewCompletedAt/lastReviewSummary/
      // focusModeActive - which meant tapping Save here reset all five of
      // those back to their DEFAULT_SETTINGS value every time, even though
      // nothing on this screen edits them. Spreading `values` first, then
      // overriding only the fields this screen actually edits/parses, fixes
      // that. Blank fields fall back to the default rather than resolving
      // to a broken/empty path segment.
      // Written elsewhere while this screen may be open (the What's-new
      // notice in App.tsx) - keep what is stored, not this screen's copy.
      const storedNow = await loadSettings();
      const cleaned: GtdParaSettings = {
        ...values,
        lastSeenVersion: storedNow.lastSeenVersion,
        baseRoot: values.baseRoot.trim() || DEFAULT_SETTINGS.baseRoot,
        projectsFolder: values.projectsFolder.trim() || DEFAULT_SETTINGS.projectsFolder,
        areasFolder: values.areasFolder.trim() || DEFAULT_SETTINGS.areasFolder,
        resourcesFolder: values.resourcesFolder.trim() || DEFAULT_SETTINGS.resourcesFolder,
        archiveFolder: values.archiveFolder.trim() || DEFAULT_SETTINGS.archiveFolder,
        inboxFolder: values.inboxFolder.trim() || DEFAULT_SETTINGS.inboxFolder,
        // No fallback-to-default here (unlike the folder fields above) - an
        // empty string is itself a valid, meaningful value ("no calendar
        // linked yet"), not a broken path segment to guard against.
        googleCalendarIcsUrl: values.googleCalendarIcsUrl.trim(),
        // Same no-fallback reasoning as googleCalendarIcsUrl above - an
        // empty gmailEmail/gmailAppPassword just means "Gmail inbox review
        // isn't configured yet" (storage/gmailInboxCache.ts's
        // isGmailConfigured), not a broken value to replace with a default.
        gmailEmail: values.gmailEmail.trim(),
        gmailAppPassword: values.gmailAppPassword.trim(),
        gmailImapHost: values.gmailImapHost.trim() || DEFAULT_SETTINGS.gmailImapHost,
        dailyFocusProjectCount: parseNonNegativeInt(
          focusCountText.dailyFocusProjectCount,
          DEFAULT_SETTINGS.dailyFocusProjectCount,
        ),
        dailyFocusAreaCount: parseNonNegativeInt(
          focusCountText.dailyFocusAreaCount,
          DEFAULT_SETTINGS.dailyFocusAreaCount,
        ),
        weeklyFocusProjectCount: parseNonNegativeInt(
          focusCountText.weeklyFocusProjectCount,
          DEFAULT_SETTINGS.weeklyFocusProjectCount,
        ),
        weeklyFocusAreaCount: parseNonNegativeInt(
          focusCountText.weeklyFocusAreaCount,
          DEFAULT_SETTINGS.weeklyFocusAreaCount,
        ),
        monthlyFocusProjectCount: parseNonNegativeInt(
          focusCountText.monthlyFocusProjectCount,
          DEFAULT_SETTINGS.monthlyFocusProjectCount,
        ),
        monthlyFocusAreaCount: parseNonNegativeInt(
          focusCountText.monthlyFocusAreaCount,
          DEFAULT_SETTINGS.monthlyFocusAreaCount,
        ),
      };
      // A new Inbox folder name moves the folder first; a problem throws and nothing is saved.
      const inboxRename = await renameInboxFolderForSave(storedNow, cleaned);
      setSavedNote(
        inboxRename === 'moved'
          ? ' Inbox folder renamed.'
          : inboxRename === 'notMoved'
            ? ' The Inbox folder was not moved, because Base root or Areas changed too.'
            : '',
      );
      await saveSettings(cleaned);
      // The cache was built against whatever paths were in effect before -
      // a changed root would otherwise keep showing stale Projects/Areas
      // (or the wrong folder's data) until someone thought to rebuild it.
      // Note: lowering a focus count here never un-focuses anything already
      // over the new limit (storage/focusSlots.ts) - the cache clear is
      // only about the folder-path fields, focus flags live in each item's
      // own file and are unaffected by a settings save.
      clearCachedData();
      // Unconditional, same as clearCachedData() above - a credentials
      // change, an IMAP host change, or even just clearing the fields
      // should never leave stale/mismatched inbox rows (or rows fetched
      // under the old account) sitting in storage/gmailInboxCache.ts's
      // module-level cache until the next explicit refresh happens to
      // notice.
      clearCachedGmailInbox();
      setValues(cleaned);
      // Reflect back whatever actually got saved (a blank/invalid count
      // fell back to its default) rather than leaving stale/invalid text
      // sitting in the field - same normalize-after-save the folder-name
      // fields already get via setValues(cleaned).
      setFocusCountText(focusCountsToText(cleaned));
      setSaved(true);
    } catch (e) {
      // Without this, a failed AsyncStorage write used to fail completely
      // silently - the button would look like it did nothing at all.
      setSaveError(errorMessage(e));
    }
  };

  const handleResetDefaults = () => {
    setValues(DEFAULT_SETTINGS);
    setFocusCountText(focusCountsToText(DEFAULT_SETTINGS));
    setSaved(false);
    setSaveError(null);
    // Reset also discards any note-creation definition mid-edit, same as it
    // already discards unsaved edits in every other tab's draft text.
    handleCancelDefinitionEdit();
  };

  // Performance tracing switch (docs/dev/technical-design-perf-tracing.md §6).
  // Takes effect and persists immediately - it's a diagnostic switch, not
  // part of the folders draft - but also updates the draft `values` so a
  // later "Save" of the folders tab doesn't write the old value back.
  const handleTogglePerfTracing = async () => {
    const next = !values.perfTracing;
    setValues(v => ({...v, perfTracing: next}));
    perfEnable(next);
    try {
      const stored = await loadSettings();
      await saveSettings({...stored, perfTracing: next});
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  // "Keep tabs in memory" (docs/dev/technical-design-keep-tabs-alive.md §3.1) -
  // same immediate-save pattern as the tracing switch above. Takes effect at
  // once: App.tsx subscribes to ui/keepAliveStore.ts.
  const handleToggleKeepTabsAlive = async () => {
    const next = !values.keepTabsAlive;
    setValues(v => ({...v, keepTabsAlive: next}));
    setKeepTabsAlive(next);
    try {
      const stored = await loadSettings();
      await saveSettings({...stored, keepTabsAlive: next});
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  // Experimental switches and Debug logging (Settings → Advanced / About,
  // docs/dev/technical-design-about-debug-experimental.md): take effect at
  // once (feature store / log sink), persist immediately via patchSettings,
  // and update the draft `values` so a later Save can't write them back.
  const handleToggleExperimental = async (key: 'experimentalGoogleCalendar' | 'experimentalGmail') => {
    const next = {...values, [key]: !values[key]};
    setValues(v => ({...v, [key]: next[key]}));
    setFeatures(featuresOf(next));
    try {
      await patchSettings({[key]: next[key]});
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  const handleToggleDebugLogging = async () => {
    const next = !values.debugLogging;
    setValues(v => ({...v, debugLogging: next}));
    setFileLogging(next);
    try {
      await patchSettings({debugLogging: next});
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  // Runs against the current (possibly unsaved) draft `values`, matching
  // this tab's existing folder-path previews just below (field.pathKey),
  // rather than requiring a save first - scanning is read-only, so there's
  // no reason to force that.
  /**
   * Settings → Advanced → "Reload all files" (docs/dev/technical-design-cleanup-0.5.md
   * S8, replacing the tab bar's 🔄): re-reads every Project/Area from its
   * file (the cache), drops the kept tabs so each loads again - Inbox
   * included - on its next visit, and re-lists the MyStyle backgrounds. The
   * form fields are left alone, so unsaved edits stay. Uses the saved
   * settings, not unsaved edits on the Folders tab.
   */
  const handleReloadAllFiles = async () => {
    setReloadResult(null);
    setReloading(true);
    try {
      log('Settings: reload all files - start');
      const stored = await loadSettings();
      const cache = await rebuildCache(stored);
      dropKeptTabs();
      // Only the MyStyle listing - the form fields keep any unsaved edits.
      setMyStyleError(null);
      loadMyStylePngs();
      log('Settings: reload all files - done', cache.items.length);
      setReloadResult({kind: 'success', text: `Reloaded ${cache.items.length} projects and areas from the files.`});
    } catch (e) {
      const message = errorMessage(e);
      logError('Settings: reload all files failed', message);
      setReloadResult({kind: 'error', text: `Reload failed: ${message}`});
    } finally {
      setReloading(false);
    }
  };

  const handleRunIntegrityCheck = async () => {
    setIntegrityResult(null);
    setFileNameFixes([]);
    setIntegrityCheckRunning(true);
    try {
      const summary = await runIntegrityCheck(values);
      setFileNameFixes(summary.fileNameFixes);
      setIntegrityResult(
        summary.findings.length === 0
          ? {kind: 'success', text: `Integrity Check: no issues found (${summary.itemsScanned} items scanned) - report saved as ${summary.reportFileName} in EXPORT/gtdpara/debug.`}
          : {
              kind: 'warning',
              text: `Integrity Check: ${summary.findings.length} issue(s) in ${summary.itemsScanned} items - see ${summary.reportFileName} in EXPORT/gtdpara/debug.`,
            },
      );
    } catch (e) {
      setIntegrityResult({kind: 'error', text: `Integrity Check failed: ${errorMessage(e)}`});
    } finally {
      setIntegrityCheckRunning(false);
    }
  };

  const paths = resolvePaths(values);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.spacer} />
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.background]}>
      <View style={styles.content}>
        <MiniTabs
          tabs={settingsTabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          textColor={textColor}
          borderColor={borderColor}
        />

        <View style={styles.tabBody}>
      {activeTab === 'advanced' && (
        <AdvancedTab
          activeProfileId={values.activeProfileId}
          onSwitchProfile={onSwitchProfile}
          experimentalGoogleCalendar={values.experimentalGoogleCalendar}
          experimentalGmail={values.experimentalGmail}
          perfTracing={values.perfTracing}
          keepTabsAlive={values.keepTabsAlive}
          integrityCheckRunning={integrityCheckRunning}
          reloading={reloading}
          onReloadAllFiles={handleReloadAllFiles}
          onToggleGoogleCalendar={() => handleToggleExperimental('experimentalGoogleCalendar')}
          onToggleGmail={() => handleToggleExperimental('experimentalGmail')}
          onTogglePerfTracing={handleTogglePerfTracing}
          onToggleKeepTabsAlive={handleToggleKeepTabsAlive}
          onRunIntegrityCheck={handleRunIntegrityCheck}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      {activeTab === 'about' && (
        <AboutTab
          debugLogging={values.debugLogging}
          onToggleDebugLogging={handleToggleDebugLogging}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      {activeTab === 'folders' && (
        <>
          {FIELDS.map(field => (
            <View key={field.key} style={styles.field}>
              <Text style={[styles.label, {color: textColor}]}>{field.label}</Text>
              <TextInput
                style={[styles.input, {color: textColor, borderColor}]}
                value={values[field.key]}
                onChangeText={text => update(field.key, text)}
                placeholder={field.placeholder}
                placeholderTextColor={placeholderColor}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {field.pathKey && (
                <Text style={[styles.pathPreview, {color: textColor}]}>
                  → {paths[field.pathKey]}
                </Text>
              )}
            </View>
          ))}
        </>
      )}

      {activeTab === 'focus' &&
        FOCUS_COUNT_FIELDS.map(field => (
          <View key={field.key} style={styles.field}>
            <Text style={[styles.label, {color: textColor}]}>{field.label}</Text>
            <TextInput
              style={[styles.input, styles.countInput, {color: textColor, borderColor}]}
              value={focusCountText[field.key]}
              onChangeText={text => updateFocusCount(field.key, text)}
              placeholder={String(DEFAULT_SETTINGS[field.key])}
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
            />
          </View>
        ))}

      {activeTab === 'calendar' && (
        <View style={styles.field}>
          <Text style={[styles.label, {color: textColor}]}>Google Calendar ICS link</Text>
          <TextInput
            style={[styles.input, {color: textColor, borderColor}]}
            value={values.googleCalendarIcsUrl}
            onChangeText={updateIcsUrl}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={handlePasteIcsUrl} hitSlop={8} style={styles.pasteButton}>
            <Text style={styles.pasteButtonText}>Paste from clipboard</Text>
          </Pressable>
          <Text style={[styles.pathPreview, {color: textColor}]}>
            The first sync will ask for network access - fetches only today through +30 days.
          </Text>
        </View>
      )}

      {activeTab === 'gmail' && (
        <View style={styles.field}>
          <Text style={[styles.label, {color: textColor}]}>Gmail address</Text>
          <TextInput
            style={[styles.input, {color: textColor, borderColor}]}
            value={values.gmailEmail}
            onChangeText={text => update('gmailEmail', text)}
            placeholder="you@gmail.com"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={[styles.label, {color: textColor}]}>App password</Text>
          <TextInput
            style={[styles.input, {color: textColor, borderColor}]}
            value={values.gmailAppPassword}
            onChangeText={text => update('gmailAppPassword', text)}
            placeholder="16-character app password"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable onPress={handlePasteGmailAppPassword} hitSlop={8} style={styles.pasteButton}>
            <Text style={styles.pasteButtonText}>Paste from clipboard</Text>
          </Pressable>
          <Text style={[styles.pathPreview, {color: textColor}]}>
            Not your Google password - generate a dedicated app password at myaccount.google.com/apppasswords
            (requires 2-Step Verification to be on).
          </Text>

          <Text style={[styles.label, {color: textColor}]}>IMAP host (advanced)</Text>
          <TextInput
            style={[styles.input, {color: textColor, borderColor}]}
            value={values.gmailImapHost}
            onChangeText={text => update('gmailImapHost', text)}
            placeholder={DEFAULT_SETTINGS.gmailImapHost}
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.pathPreview, {color: textColor}]}>
            Leave this as-is unless you know you need something else.
          </Text>

          <CheckToggle
            label="Hide emails already turned into a Task/Meeting"
            checked={values.gmailHideHandled}
            onPress={toggleGmailHideHandled}
            textColor={textColor}
          />

        </View>
      )}

      {activeTab === 'templates' && templatesView === 'list' && (
        <View style={styles.templatesListBody}>
          <Pressable onPress={handleAddDefinition} hitSlop={8} style={styles.addDefRow}>
            <Text style={[styles.addDefRowText, {color: textColor}]}>+ New tag rule</Text>
          </Pressable>
          <PagedSection<TemplateDefRow>
            header="Tag rules"
            rows={values.noteCreationDefinitions.map((def, index) => ({def, index}))}
            rowHeight={() => TEMPLATE_DEF_ROW_HEIGHT}
            resetKey={values.noteCreationDefinitions.length}
            emptyHint="None yet — notes keep getting a blank background and no auto-inserted content, same as today."
            renderRow={({def, index}) => (
              <View key={def.id} style={[styles.defRow, {borderColor}]}>
                <Pressable onPress={() => handleEditDefinition(index)} hitSlop={4} style={styles.defRowMain}>
                  <Text style={[styles.defRowName, {color: textColor}]}>
                    {def.name || 'Untitled'}
                    {!def.enabled ? '  (off)' : ''}
                  </Text>
                  <Text style={[styles.defRowMeta, {color: textColor}]}>
                    {CONTEXT_TABS.find(c => c.key === def.context)?.label ?? def.context}
                    {' · '}
                    {def.tags.length > 0
                      ? def.tags.map(t => `#${t}`).join(' ')
                      : def.isDefault
                      ? 'Default'
                      : 'unreachable (no tag, not default)'}
                    {trackingSummary(def) ? ` · tracks ${trackingSummary(def)}` : ''}
                  </Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteDefinition(index)} hitSlop={8} style={styles.defRowDelete}>
                  <Text style={styles.defRowDeleteText}>Delete</Text>
                </Pressable>
              </View>
            )}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      )}

      {/* Replaces the global footer's saveError text for this tab, which no
          longer renders it here (see the footer's own `activeTab !==
          'templates'` guard below) - shown regardless of which Templates
          sub-page is active since a stale error from a moment ago (e.g. a
          failed delete back on 'list') should stay visible until the next
          successful persist clears it. */}

      {activeTab === 'templates' && templatesView === 'edit' && draftDef && (
        <View style={styles.templatesEditRow}>
          <View style={[common.column, common.columnLeft, styles.formColumnCard, {borderColor}]}>
            {/* Top fields - deliberately NOT flex (module doc comment's
                "tightly spaced" note): a plain View so this section always
                sizes to exactly its own content, however much leftover
                height styles.templatesEditRow's stretch gives this column -
                only styles.pieceListBody below (flex: 1) claims that. */}
            <View>
              <Text style={[styles.label, {color: textColor}]}>Name</Text>
              <View style={styles.clipboardFieldRow}>
                <ClipboardTextInput
                  value={draftDef.name}
                  onChangeText={text => updateDraftDef({name: text})}
                  placeholder="e.g. Coaching"
                  placeholderColor={placeholderColor}
                  textColor={textColor}
                  borderColor={borderColor}
                />
              </View>

              <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Context</Text>
              <MiniTabs
                tabs={CONTEXT_TABS}
                activeKey={draftDef.context}
                onChange={context => {
                  // Dropping pieces that don't apply to the new context
                  // avoids silently carrying e.g. a Date/Time piece into a
                  // Project definition, where it would never render (§4 -
                  // renderPieceText has no meeting-only source for it there).
                  // A NEW rule whose pieces are still the untouched default
                  // stack is re-seeded with the new context's defaults
                  // instead (docs/dev/technical-design-linked-file-piece.md
                  // §4.1); once the user edited pieces, they're kept.
                  const pieces =
                    editingDefIndex === null && hasUntouchedDefaultPieces(draftDef)
                      ? withDefaultPieces({...draftDef, context, pieces: []}).pieces
                      : draftDef.pieces.filter(p => PIECE_CONTEXTS[p.type].includes(context));
                  // Prep/review tracking is meeting-only (domain/meetingTracking.ts) -
                  // dropped along with the pieces that no longer apply.
                  // Note target (docs/dev/technical-design-shared-note-pages.md §6)
                  // only applies to Todo/Meeting rules - reset back to 'own'
                  // (and its shared-file fields cleared) leaving Project/Area
                  // so a hidden 'shared' choice can't resurface confusingly
                  // if the rule is later switched back.
                  const targetsNote = context === 'meeting' || context === 'todo';
                  updateDraftDef({
                    context,
                    pieces,
                    ...(context === 'meeting' ? {} : {trackPrep: false, trackReview: false}),
                    ...(targetsNote ? {} : {noteTarget: 'own', sharedFileName: undefined, sharedFileFolder: undefined}),
                  });
                  setSelectedPieceIndex(null);
                }}
                textColor={textColor}
                borderColor={borderColor}
              />

              <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Tags (space-separated)</Text>
              <View style={styles.clipboardFieldRow}>
                <ClipboardTextInput
                  value={draftTagsText}
                  onChangeText={setDraftTagsTextStripped}
                  placeholder="e.g. #coaching #daily"
                  placeholderColor={placeholderColor}
                  textColor={textColor}
                  borderColor={borderColor}
                />
              </View>

              <View style={[styles.toggleRow, styles.compactFieldSpacer]}>
                <CheckToggle
                  label="Default for this context"
                  checked={draftDef.isDefault}
                  onPress={() => updateDraftDef({isDefault: !draftDef.isDefault})}
                  textColor={textColor}
                />
                <CheckToggle
                  label="Enabled"
                  checked={draftDef.enabled}
                  onPress={() => updateDraftDef({enabled: !draftDef.enabled})}
                  textColor={textColor}
                />
                {/* Meeting rules only (docs/dev/technical-design-meeting-tracking.md) -
                    one side-by-side row to keep the left column's piece list as
                    tall as possible. Both default off, so a rule tracks nothing
                    until switched on here. */}
                {draftDef.context === 'meeting' && (
                  <View style={styles.toggleRowInline}>
                    <CheckToggle
                      inline
                      label="Prepare before"
                      checked={!!draftDef.trackPrep}
                      onPress={() => updateDraftDef({trackPrep: !draftDef.trackPrep})}
                      textColor={textColor}
                    />
                    <CheckToggle
                      inline
                      label="Review after"
                      checked={!!draftDef.trackReview}
                      onPress={() => updateDraftDef({trackReview: !draftDef.trackReview})}
                      textColor={textColor}
                    />
                  </View>
                )}
              </View>

              {/* Todo/Meeting-only (docs/dev/technical-design-shared-note-pages.md
                  §6) - whether this rule's notes land in their own file
                  (today's behavior) or as pages inside one shared file per
                  Project/Area. Absent for Project/Area rules, which have no
                  shared-file concept of their own to point at. */}
              {(draftDef.context === 'meeting' || draftDef.context === 'todo') && (
                <>
                  <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Note target</Text>
                  <MiniTabs
                    tabs={NOTE_TARGET_TABS}
                    activeKey={effectiveNoteTarget(draftDef)}
                    onChange={noteTarget => updateDraftDef({noteTarget})}
                    textColor={textColor}
                    borderColor={borderColor}
                  />

                  {effectiveNoteTarget(draftDef) === 'shared' && (
                    <>
                      <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Shared file name</Text>
                      <View style={styles.clipboardFieldRow}>
                        <ClipboardTextInput
                          value={draftDef.sharedFileName ?? ''}
                          onChangeText={text => updateDraftDef({sharedFileName: text})}
                          placeholder={draftDef.name || 'e.g. Daily'}
                          placeholderColor={placeholderColor}
                          textColor={textColor}
                          borderColor={borderColor}
                          handleRef={sharedFileNameInputRef}
                        />
                      </View>
                      {/* Placeholder chips + example (docs/dev/technical-design-split-by-tag.md §3.6). */}
                      <View style={styles.placeholderChipRow}>
                        {SHARED_FILE_NAME_PLACEHOLDERS.map(placeholder => (
                          <Pressable
                            key={placeholder}
                            style={[styles.placeholderChip, {borderColor}]}
                            onPress={() => sharedFileNameInputRef.current?.insertAtCursor(placeholder)}
                            hitSlop={4}>
                            <Text style={[styles.placeholderChipText, {color: textColor}]}>{placeholder}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[styles.sharedFilePreview, {color: textColor}]} numberOfLines={1}>
                        {`e.g. ${sharedFilePreview(draftDef)}`}
                      </Text>

                      <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Shared file location</Text>
                      <MiniTabs
                        tabs={SHARED_FOLDER_TABS}
                        activeKey={resolvedSharedFileFolder(draftDef)}
                        onChange={sharedFileFolder => updateDraftDef({sharedFileFolder})}
                        textColor={textColor}
                        borderColor={borderColor}
                      />
                    </>
                  )}
                </>
              )}
            </View>

            {/* Pieces - moved here from the right column, and from a fixed
                PIECE_LIST_MAX_VISIBLE_ROWS-capped box to a real self-
                measuring PagedSection (2026-09-18, Tilman: "the pieces need
                to better visible and should go into a paginated pane, in
                case they become more" - same self-measuring treatment the
                definitions list above already got). `styles.pieceListBody`
                (flex: 1) is what makes it self-measure correctly - see that
                style's own comment. */}
            <View style={styles.pieceListBody}>
              <PagedSection<PieceRow>
                header="Pieces"
                rows={draftDef.pieces.map((piece, index) => ({piece, index}))}
                rowHeight={() => PIECE_ROW_HEIGHT}
                resetKey={draftDef.pieces.length}
                emptyHint="No pieces yet - add one below."
                renderRow={({piece, index}) => (
                  <Pressable
                    key={index}
                    onPress={() => setSelectedPieceIndex(index)}
                    style={[styles.pieceRow, {borderColor}, index === selectedPieceIndex && styles.pieceRowSelected]}>
                    <Text style={[styles.pieceRowText, {color: textColor}]} numberOfLines={1}>
                      {pieceSummaryLabel(piece)}
                      {'  ('}
                      {piece.x}, {piece.y}
                      {')'}
                    </Text>
                    <Pressable onPress={() => handleRemovePiece(index)} hitSlop={8}>
                      <Text style={styles.pieceRowRemove}>×</Text>
                    </Pressable>
                  </Pressable>
                )}
                textColor={textColor}
                borderColor={borderColor}
              />

              {/* Adding a piece is its own page now too ('edit-piece',
                  below) - see the module doc comment. */}
              <Pressable onPress={handleOpenAddPiece} hitSlop={8} style={styles.addDefRow}>
                <Text style={[styles.addDefRowText, {color: textColor}]}>+ Add piece</Text>
              </Pressable>
            </View>
          </View>

          <View style={[common.column, styles.formColumnCard, {borderColor}]}>
            <NoteTemplatePreview
              pieces={draftDef.pieces}
              selectedIndex={selectedPieceIndex}
              onSelectPiece={setSelectedPieceIndex}
              background={draftDef.template}
              textColor={textColor}
              borderColor={borderColor}
            />

            <NudgePad
              piece={
                selectedPieceIndex !== null
                  ? {
                      ...draftDef.pieces[selectedPieceIndex],
                      maxWidthPx: pieceMaxWidthPx(draftDef.pieces[selectedPieceIndex]),
                    }
                  : null
              }
              onNudge={handleNudgeSelectedPiece}
              onStepChange={handleStepChangeSelectedPiece}
              onFontDelta={handleFontDeltaSelectedPiece}
              onMaxWidthDelta={handleMaxWidthDeltaSelectedPiece}
              textColor={textColor}
              borderColor={borderColor}
            />

            {/* Pushes Background + Save/Cancel to the bottom of this column
                (module doc comment: "at the bottom the background template
                name and options to change it") - this column is stretched
                to the row's full height by styles.templatesEditRow, same as
                the left column, so there's real leftover space here for
                this spacer to claim. */}
            <View style={styles.columnSpacer} />

            {/* Compact "current choice + Change…" row, not the picker
                itself - choosing a background is its own page now
                ('edit-template', below), same "pieces [and] template...
                on a second page" shape as the original UI draft's
                overlay (module doc comment). Moved here from the left
                column, 2026-09-18. */}
            <Text style={[styles.label, {color: textColor}]}>Background</Text>
            <Pressable onPress={handleOpenTemplatePicker} hitSlop={4} style={[styles.templateFieldRow, {borderColor}]}>
              <Text style={[styles.templateFieldRowText, {color: textColor}]} numberOfLines={1}>
                {draftDef.template === '' ? 'None (blank note)' : draftDef.template}
              </Text>
              <Text style={[styles.templateFieldChange, {color: textColor}]}>Change…</Text>
            </Pressable>

            {/* Moved here from the left column, 2026-09-18 - Save is
                slightly wider than Cancel (styles.saveButtonWide) per
                Tilman's request. */}
            <View style={styles.formButtonRow}>
              <Pressable style={[styles.saveButton, styles.saveButtonWide]} onPress={handleSaveDefinitionDraft}>
                <Text style={styles.saveButtonText}>{editingDefIndex === null ? 'Create' : 'Save'}</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={handleCancelDefinitionEdit} hitSlop={8}>
                <Text style={[styles.cancelButtonText, {color: textColor}]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* "Choose background" - full page, not an inline list in the
          crowded two-column form (module doc comment). 2026-09-18 revision
          (Tilman, on the real device): reuses this app's plain file-panel
          row look (`ui/FileBrowserPane.tsx`'s own entry rows - 📄/here 🖼
          + filename, no border, no ●/○ dot) and its self-measuring
          pagination ("let the template pagination work exactly as other
          file panels we have already in the plugin... no need to limit
          them in height, just let it take whatever space is there") rather
          than `ui/TemplatePicker.tsx`'s own compact, height-capped list -
          that component stays exactly as it was for the Meeting Note tab's
          plain inline field, which wants a small picker, not a full
          browse page. Left: the paginated file list, tapping a row selects
          it (stays on this page, no auto-return). Right: a plain preview
          box - no filename caption on it (the left list already shows/
          highlights the current pick - "no need to repeat name of
          template on top") - and a big "Apply" button that's really just
          "done browsing" (the tap already committed the choice). */}
      {activeTab === 'templates' && templatesView === 'edit-template' && draftDef && (
        <View style={styles.templateBrowsePage}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={handleBackToEditForm} hitSlop={8}>
              <Text style={[styles.backText, {color: textColor}]}>‹ Cancel</Text>
            </Pressable>
            <Text style={[styles.sectionHeading, {color: textColor}]}>Choose background</Text>
          </View>

          <View style={styles.templateBrowseColumns}>
            <View style={[common.column, common.columnLeft, styles.formColumnCard, {borderColor}]}>
              {myStyleError && (
                <Text style={common.error}>⚠ Could not list MyStyle: {myStyleError}</Text>
              )}
              {myStylePngs === null && !myStyleError ? (
                <Text style={[common.hint, {color: textColor}]}>Loading…</Text>
              ) : (
                <PagedSection<string>
                  header="MyStyle backgrounds"
                  rows={['', ...(myStylePngs ?? [])]}
                  rowHeight={() => TEMPLATE_BROWSE_ROW_HEIGHT}
                  emptyHint={`No .png files found in ${MYSTYLE_FOLDER}.`}
                  renderRow={fileName => {
                    const isNone = fileName === '';
                    const selected = draftDef.template === fileName;
                    return (
                      <Pressable
                        key={fileName || '(none)'}
                        onPress={() => handleChooseTemplate(fileName)}
                        hitSlop={4}
                        style={styles.templateBrowseListRow}>
                        <Text
                          style={[
                            styles.templateBrowseListRowText,
                            {color: textColor},
                            selected && styles.templateBrowseListRowTextSelected,
                          ]}
                          numberOfLines={1}>
                          {selected ? '✓ ' : isNone ? '' : '🖼 '}
                          {isNone ? 'None (blank note)' : fileName}
                        </Text>
                      </Pressable>
                    );
                  }}
                  textColor={textColor}
                  borderColor={borderColor}
                />
              )}
            </View>

            <View style={[common.column, styles.formColumnCard, {borderColor}]}>
              {/* Real MyStyle background, not a blank box (2026-09-18) -
                  `templateBrowsePreviewBox` already sizes itself to the
                  column's full width at the real page aspect ratio
                  (NOTE_PAGE_WIDTH_PX/HEIGHT_PX), so the image just fills it
                  exactly; `resizeMode="cover"` rather than "stretch" so a
                  MyStyle PNG that isn't pixel-exact to that ratio doesn't
                  visibly distort. Keyed by filename so switching the
                  selection mounts a fresh <Image> instead of reusing one
                  still showing the previous background while the new file
                  decodes. "None" (fileName === '') renders no <Image> at
                  all - an empty bordered box, same as before this change. */}
              <View style={[styles.templateBrowsePreviewBox, {borderColor}]}>
                {draftDef.template !== '' && templatePreviewFailedFor !== draftDef.template && (
                  <Image
                    key={draftDef.template}
                    source={{uri: `file://${MYSTYLE_FOLDER}/${draftDef.template}`}}
                    style={styles.templateBrowsePreviewImage}
                    resizeMode="cover"
                    onError={() => setTemplatePreviewFailedFor(draftDef.template)}
                  />
                )}
                {draftDef.template !== '' && templatePreviewFailedFor === draftDef.template && (
                  <Text style={[styles.templatePreviewErrorText, {color: textColor}]} numberOfLines={2}>
                    ⚠ Could not load {draftDef.template}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={handleBackToEditForm}
                hitSlop={8}
                style={[styles.saveButton, styles.templateApplyButton]}>
                <Text style={styles.saveButtonText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* "Add piece" - full page (docs/dev/technical-design-note-templates.md
          §6.1, 2026-09-20 rework - see the module doc comment). Left: one
          paged list of the predefined pieces that apply to this rule's
          context, then THIS rule's own static texts, then a pinned "+ New
          text". Each row has a small button on the right: "+ Add" places
          the piece, or "Remove" once it is placed (every piece can be placed
          once; removing a text only takes it off the page, the text stays in
          the list). Tapping the row itself never adds anything - it selects
          it: the right panel then explains a predefined piece (with an
          example), or edits a text (name + text, Create/Save/Delete). Right
          panel stays empty until something is selected. The page stays open
          after every add/remove so several pieces can be placed in one
          visit; "Back to rule" returns to the 'edit' form. Both columns
          stretch to the page's full height (templateBrowseColumns, same as
          the 'edit-template' page) - the left list self-measures against it. */}
      {activeTab === 'templates' && templatesView === 'edit-piece' && draftDef && (
        <View style={styles.templateBrowsePage}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={handleBackToEditForm} hitSlop={8}>
              <Text style={[styles.backText, {color: textColor}]}>‹ Back to rule</Text>
            </Pressable>
            <Text style={[styles.sectionHeading, {color: textColor}]}>Add piece</Text>
          </View>

          <View style={styles.templateBrowseColumns}>
            <View style={[common.column, common.columnLeft, styles.formColumnCard, {borderColor}]}>
              <View style={styles.addPieceListBody}>
                <PagedSection<AddPieceRow>
                  header="Pieces"
                  rows={buildAddPieceRows(draftDef)}
                  rowHeight={() => ADD_PIECE_ROW_HEIGHT}
                  resetKey={buildAddPieceRows(draftDef).length}
                  renderRow={row => {
                    const type: PieceType = row.kind === 'type' ? row.type : 'text';
                    const textId = row.kind === 'text' ? row.item.id : undefined;
                    const placed = isPiecePlaced(draftDef, type, textId);
                    const selected =
                      addSelection?.kind === 'type'
                        ? row.kind === 'type' && row.type === addSelection.type
                        : addSelection?.kind === 'text'
                        ? row.kind === 'text' && row.item.id === addSelection.id
                        : false;
                    return (
                      <View
                        key={row.kind === 'type' ? `type-${row.type}` : `text-${row.item.id}`}
                        style={[styles.addRow, {borderColor}, selected && styles.addRowSelected]}>
                        <Pressable
                          onPress={() => (row.kind === 'type' ? handleSelectPieceType(row.type) : handleSelectText(row.item))}
                          hitSlop={4}
                          style={styles.addRowMain}>
                          <Text style={[styles.addRowName, {color: textColor}]} numberOfLines={1}>
                            {placed ? '✓ ' : ''}
                            {row.kind === 'type' ? PIECE_TYPE_LABELS[row.type] : row.item.name}
                          </Text>
                          {row.kind === 'text' && (
                            <Text style={[styles.addRowPreview, {color: textColor}]} numberOfLines={1}>
                              {row.item.text.split('\n')[0]}
                            </Text>
                          )}
                        </Pressable>
                        <Pressable
                          onPress={() => handleTogglePlacement(type, textId)}
                          hitSlop={6}
                          style={[styles.addRowButton, {borderColor}, placed && styles.addRowButtonPlaced]}>
                          <Text style={[styles.addRowButtonText, placed && styles.addRowButtonTextPlaced]}>
                            {placed ? 'Remove' : '+ Add'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  }}
                  textColor={textColor}
                  borderColor={borderColor}
                />
                {/* Pinned under the paged list (not a row in it) so it can
                    never end up on a later page. */}
                <Pressable onPress={handleSelectNewText} hitSlop={8} style={styles.addDefRow}>
                  <Text
                    style={[
                      styles.addDefRowText,
                      {color: textColor},
                      addSelection?.kind === 'new' && styles.addDefRowTextActive,
                    ]}>
                    + New text
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[common.column, styles.formColumnCard, {borderColor}]}>
              {addSelection?.kind === 'type' && (
                <>
                  <Text style={[styles.addPanelTitle, {color: textColor}]}>{PIECE_TYPE_LABELS[addSelection.type]}</Text>
                  <Text style={[styles.addPanelStatus, {color: textColor}]}>
                    {isPiecePlaced(draftDef, addSelection.type) ? 'Placed in this rule' : 'Not placed'}
                  </Text>
                  <Text style={[styles.addPanelText, {color: textColor}]}>
                    {predefinedPieceInfo(addSelection.type, draftDef.context).description}
                  </Text>
                  <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Example</Text>
                  <View style={[styles.addPanelExample, {borderColor}]}>
                    <Text style={[styles.addPanelText, {color: textColor}]}>
                      {predefinedPieceInfo(addSelection.type, draftDef.context).example}
                    </Text>
                  </View>
                </>
              )}

              {(addSelection?.kind === 'text' || addSelection?.kind === 'new') && (
                <>
                  <Text style={[styles.addPanelTitle, {color: textColor}]}>
                    {addSelection.kind === 'new' ? 'New text' : 'Edit text'}
                  </Text>
                  {addSelection.kind === 'text' && (
                    <Text style={[styles.addPanelStatus, {color: textColor}]}>
                      {isPiecePlaced(draftDef, 'text', addSelection.id) ? 'Placed in this rule' : 'Not placed'}
                    </Text>
                  )}
                  <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Name (shown in the list)</Text>
                  <View style={styles.clipboardFieldRow}>
                    <ClipboardTextInput
                      value={textDraftName}
                      onChangeText={setTextDraftName}
                      placeholder="e.g. Attendees"
                      placeholderColor={placeholderColor}
                      textColor={textColor}
                      borderColor={borderColor}
                    />
                  </View>
                  <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Text</Text>
                  <View style={styles.clipboardFieldRow}>
                    <ClipboardTextInput
                      value={textDraftBody}
                      onChangeText={setTextDraftBody}
                      placeholder="e.g. Attendees checklist…"
                      placeholderColor={placeholderColor}
                      textColor={textColor}
                      borderColor={borderColor}
                      multiline
                    />
                  </View>
                  <View style={styles.formButtonRow}>
                    <Pressable style={[styles.saveButton, styles.saveButtonWide]} onPress={handleSaveText}>
                      <Text style={styles.saveButtonText}>{addSelection.kind === 'new' ? 'Create' : 'Save'}</Text>
                    </Pressable>
                    {addSelection.kind === 'text' && (
                      <Pressable style={styles.cancelButton} onPress={handleDeleteText} hitSlop={8}>
                        <Text style={[styles.cancelButtonText, {color: textColor}]}>
                          {confirmDeleteTextId === addSelection.id ? 'Confirm delete' : 'Delete'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {addSelection.kind === 'text' && (
                    <Text style={[styles.addPanelHint, {color: textColor}]}>
                      Saving updates the placed piece; its position and size stay. “Remove” in the list only takes it
                      off the page.
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>

        </View>
      )}

        </View>

        {/* Restricted to the non-Templates tabs (2026-09-18, Tilman: "there
            is still a huge save button at the bottom and reset to defaults.
            These can go on the templates subpage... we have our own
            save/cancel buttons and use should not need to tap two. So
            restrict these to the other settings pages") - the Templates tab
            has its own Save/Cancel (in the 'edit' form) and persists
            create/edit/delete immediately (persistDefinitions above), so
            this global pair would be a redundant, no-op second tap there.
            Folders/Focus/Calendar/Meeting Note are untouched - they
            still only persist on this Save tap, same as always. */}
        {activeTab !== 'templates' && activeTab !== 'advanced' && activeTab !== 'about' && (
          <>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>

            <Pressable onPress={handleResetDefaults} style={styles.resetButton}>
              <Text style={[styles.resetText, {color: textColor}]}>
                Reset to defaults
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * The example line under "Shared file name": what the rule's template
 * produces for an item tagged `#<tag>/client` today, in the chosen location
 * (docs/dev/technical-design-split-by-tag.md §3.6) - same rendering and
 * sanitizing as storage/meetingNoteContent.ts's real file name.
 */
function sharedFilePreview(definition: NoteCreationDefinition): string {
  const name = sanitizeFileNameComponent(
    renderSharedFileName({
      template: resolvedSharedFileName(definition),
      ruleName: definition.name.trim() || 'Untitled',
      subtag: 'client',
      date: todayIso(),
    }),
  );
  if (resolvedSharedFileFolder(definition) === 'root') return `${name}.note`;
  const subfolder = definition.context === 'meeting' ? MEETINGS_SUBFOLDER : TODOS_SUBFOLDER;
  return `${subfolder}/${name}.note`;
}

const styles = StyleSheet.create({
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
