/**
 * One task row - checkbox, tap-to-edit, labels after the title
 * (ui/TaskLabels.tsx, domain/taskLabels.ts), note-link (📓/+📓), a linked-file clip, and an optional "File" action.
 * Consolidates the three near-duplicate row implementations this codebase
 * had grown (screens/DailyView.tsx's Open-tasks rows, screens/
 * ProjectDataPanel.tsx's TodosSection rows, screens/ReviewScreen.tsx's
 * Inbox-to-zero cards) into one, per docs/dev/technical-design-inbox-tab.md §1 -
 * the moment a fourth surface (the Inbox tab, screens/InboxScreen.tsx)
 * needed the union of what all three already did (edit + note-link + File),
 * duplicating a fourth time stopped making sense. Same "extract once a
 * second caller needs the same shape" bar this codebase has used for every
 * other shared component (ui/TaskQuickAdd.tsx, ui/TaskLabels.tsx, etc.).
 *
 * Editing (docs/dev/technical-design-pagination-edit-reuse.md §5): this row no
 * longer renders its own edit form (ui/TaskEditCard.tsx is gone). `isEditing`
 * now only highlights the row - the caller renders ui/TaskQuickAdd.tsx in its
 * `editingTask` mode, in its own fixed slot elsewhere on screen, to actually
 * edit the task. This keeps every row a constant height whether or not it's
 * the one being edited (no reflow of the rows below it), and keeps the edit
 * form in one predictable on-screen place regardless of which row it's for.
 *
 * Filing/refiling (docs/dev/technical-design-filing-unification.md §4 introduced
 * a row-level `onArmFile` "File" action here; storage/inboxFiling.ts's own
 * module doc comment, 2026-09-09, retires it) no longer has any row-level
 * affordance at all - it's reached exclusively through QuickAddWidget's
 * "Refile" button in edit mode now, on every screen with a Files pane
 * (Inbox tab, Review's Inbox-to-zero step, and now Current tab too, not just
 * Inbox-sourced rows). This row has nothing to wire for it.
 *
 * The old `✕` (soft-delete) slot is gone entirely (technical-design-linked-
 * files.md §6) - removal now only happens from inside edit mode (ui/
 * TaskQuickAdd.tsx's "Delete" button). What used to be that slot is now a
 * linked-file clip: filled when `task.linkedFile` is set (tap opens it),
 * "+"-prefixed when it's empty and `onArmLink` was passed (tap arms the
 * caller's Files pane), or nothing at all when it's empty and no
 * `onArmLink` was passed (read-only surfaces like Daily).
 *
 * Parent owns all UI state now (via onToggleDone/onArmFile/onCreateNote/
 * onOpenNote/onOpenLinkedFile/onArmLink) - the same split every save
 * callback in this codebase uses. `isEditing`/`isArming` are passed in
 * rather than owned here since only one row across the whole screen can be
 * mid-edit or armed at a time - the caller (which owns one shared
 * `editTarget`/`armTarget`, see the tech design doc §8) decides.
 *
 * Tappable inline tags (technical-design-context-tags.md §7, 2026-09-11):
 * `contextTag`/`onToggleContext` are optional and only passed by Daily's own
 * instances (screens/DailyView.tsx) - their absence elsewhere renders every
 * `#tag` in the row's text as plain, unstyled text, same as before this
 * feature. When passed, `displayTaskText`'s output is split into segments
 * (domain/markdown.ts's `splitTextWithTags`) and each context tag (reserved
 * flow-state/due/#now words excluded via `isContextTag` - see that
 * function's doc comment on why a stray `#someday` surviving display-
 * stripping under Daily's 'flat' context must stay inert) becomes its own
 * nested `<Text onPress>`, filled when it matches the active `contextTag`.
 * `onPress` on a tag segment doesn't propagate to the row's own
 * onStartEdit - React Native resolves a touch to the innermost element
 * carrying its own onPress, same mechanism the `#next`/`#now` label's
 * double-tap (ui/TaskLabels.tsx) relies on.
 *
 * Title and labels are ONE <Text> (docs/dev/technical-design-waiting-for-0.7.md
 * §3.3): what's drawn (title, then labels as nested spans) and the height a
 * caller reserves both come from ui/taskRowLayout.ts's `taskRowLayout`, so a
 * label can't wrap onto a line the row doesn't have.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {isContextTag} from '../domain/flowState';
import {splitTextWithTags} from '../domain/markdown';
import {Task} from '../domain/types';
import {ClipIcon} from './icons';
import {TaskLabelContext} from '../domain/taskLabels';
import TaskLabels from './TaskLabels';
import {TASK_COLUMN_WIDTH_PX, taskRowLayout} from './taskRowLayout';
import {COLORS, FONT} from './theme';
import {perfCount} from '../utils/perf';

/** Kept as an alias so callers' `context` props read as before. */
export type TaskBadgeContext = TaskLabelContext;

/**
 * Row-height prediction (docs/dev/technical-design-pagination-fixed-height.md
 * §2.2) - a caller building a ui/PagedSection.tsx computes `taskRowHeight`
 * per task to sum toward its viewport, then passes the SAME task/
 * columnWidthPx/context here as this row's `height`/`numberOfLines` props, so
 * the reserved height and the text clamp always agree. The line count comes
 * from ui/taskRowLayout.ts and covers the title AND its labels (0.7.0); a row
 * never shows more than 2 lines.
 */
// Chrome/line split: see the 2026-09-16 revert note in git history - the
// original 20/22 (42 px one line, 64 px two lines) are the measured-good values.
export const TASK_ROW_CHROME_PX = 20;
export const TASK_ROW_LINE_HEIGHT_PX = 22;

/** Predicted lines for `task`'s title plus labels at `columnWidthPx` (1-2). */
export function taskRowLines(task: Task, columnWidthPx: number, context: TaskBadgeContext, contextActive = false): number {
  return taskRowLayout(task, columnWidthPx, context, contextActive).lines;
}

/** The row's real rendered height at `columnWidthPx`, for a caller building a ui/PagedSection.tsx. */
export function taskRowHeight(task: Task, columnWidthPx: number, context: TaskBadgeContext, contextActive = false): number {
  return TASK_ROW_CHROME_PX + taskRowLines(task, columnWidthPx, context, contextActive) * TASK_ROW_LINE_HEIGHT_PX;
}

/** Segments `text` into plain runs and tappable tag spans - see the module doc comment. Returns `text` unchanged (no splitting) when `onToggleContext` isn't passed, since only Daily's instances need this at all. */
function renderTaggableText(
  text: string,
  contextTag: string | null | undefined,
  onToggleContext: ((tag: string) => void) | undefined,
): React.ReactNode {
  if (!onToggleContext) return text;
  return splitTextWithTags(text).map((segment, index) => {
    if (segment.kind === 'text') return segment.value;
    if (!isContextTag(segment.value)) return `#${segment.value}`;
    const selected = segment.value === contextTag;
    return (
      <Text
        key={`tag-${index}`}
        onPress={() => onToggleContext(segment.value)}
        style={selected ? styles.tagSelected : styles.tag}>
        {`#${segment.value}`}
      </Text>
    );
  });
}

interface Props {
  task: Task;
  /** Highlights this row (no longer swaps it for an inline form - see the
   * module doc comment). The real edit form lives elsewhere on screen, in
   * ui/TaskQuickAdd.tsx's `editingTask` mode. */
  isEditing: boolean;
  /** Highlights this row while it's the one armed for linking - same visual treatment as isEditing. */
  isArming?: boolean;
  onStartEdit: () => void;
  onToggleDone: () => void;
  onCreateNote: () => void;
  onOpenNote: () => void;
  /** task.linkedFile, always passed - see the module doc comment's clip render rule. */
  linkedFile: string;
  onOpenLinkedFile?: (linkedFile: string) => void;
  /** Only passed by callers that support starting a link from this row (Current tab, Inbox) - its absence (Daily, Review) is what makes the clip read-only there. */
  onArmLink?: () => void;
  /** Double-tapping the `#next`/`#now` label flips #now (ui/TaskLabels.tsx, docs/dev/technical-design-now-focus-mode.md §3). Only passed where that's meaningful (Daily, both normal and focus mode); without it the label doesn't react to touch. */
  onToggleNow?: () => void;
  /** The active Daily context filter tag, if any - a matching tag segment renders filled/selected. Only meaningful together with onToggleContext (see the module doc comment); pass null (not omit) when Daily's context is off but rows should still render tags as tappable-but-unselected. */
  contextTag?: string | null;
  /** Set only by Daily's own instances - present, every context tag in this row's text becomes its own tap target that calls this instead of onStartEdit; absent, tags render as plain text (today's behavior). */
  onToggleContext?: (tag: string) => void;
  context: TaskBadgeContext;
  /** Computed via `taskRowHeight()`/`taskRowLines()` above by a caller
   * building a ui/PagedSection.tsx - overrides this row's default
   * `minHeight`/`numberOfLines={2}` so the rendered row matches exactly
   * what pagination summed. Pass both together (never just one) with the
   * same task/columnWidthPx/context used to compute them; omitted by
   * every caller as of this change (still `usePagination`-based), which
   * keeps today's `minHeight: 64`/`numberOfLines={2}` behavior exactly. */
  height?: number;
  numberOfLines?: number;
  /** Width the caller computed `height` for - the title is shortened to fit the labels at this width. Defaults to the usual two-column width. */
  columnWidthPx?: number;
  textColor: string;
  borderColor: string;
}

export default function TaskRow({
  task,
  isEditing,
  isArming,
  onStartEdit,
  onToggleDone,
  onCreateNote,
  onOpenNote,
  linkedFile,
  onOpenLinkedFile,
  onArmLink,
  onToggleNow,
  contextTag,
  onToggleContext,
  context,
  height,
  numberOfLines,
  columnWidthPx = TASK_COLUMN_WIDTH_PX,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  perfCount('row:task');
  // Whether this row is showing because of an active Daily context filter
  // (technical-design-context-tags.md §6) - derived from contextTag rather
  // than a separate prop, since the two always agree (DailyView always
  // passes contextTag alongside onToggleContext - null while its own
  // context is off, a tag string while active). Decides the `#someday`
  // label and, in step, which flow tag the title loses.
  const contextActive = contextTag != null;
  const layout = taskRowLayout(task, columnWidthPx, context, contextActive);
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.row,
          // Bottom border only, so the editing bar below stays black (2026-09-29).
          {borderBottomColor: borderColor},
          (isEditing || isArming) && styles.rowEditing,
          // Also overrides styles.row's own `minHeight: 64` floor (2026-09-15
          // bugfix) - minHeight and height are independent Yoga constraints,
          // so passing height alone left a 1-line-predicted row (its
          // taskRowHeight() is 42, well under 64) silently pinned back up to
          // 64 by that floor, which PagedSection's own viewport math doesn't
          // know about (it budgets by taskRowHeight()'s real 42, not 64).
          // Tilman's report of a truncated row's checkbox/text sitting
          // "raised" with a same-height-as-normal blank gap under it was this
          // floor forcing a bigger box than the row actually needed, not a
          // rendering defect in the text itself - see numberOfLines' own
          // "rare, accepted" truncation note above, which this floor was
          // quietly doubling the visual size of.
          height != null && {height, minHeight: height},
        ]}>
        <Pressable onPress={onToggleDone} hitSlop={8}>
          <Text style={styles.checkbox}>{task.done ? '☑' : '☐'}</Text>
        </Pressable>
        <View style={styles.rowTextWrap}>
          <Pressable onPress={onStartEdit}>
            <Text
              style={[styles.rowText, {color: textColor}, task.done && styles.rowTextDone]}
              numberOfLines={numberOfLines ?? layout.lines}>
              {renderTaggableText(layout.title, contextTag, onToggleContext)}
              <TaskLabels labels={layout.labels} onToggleNow={onToggleNow} />
            </Text>
          </Pressable>
        </View>
        {task.notePath ? (
          <Pressable onPress={onOpenNote} hitSlop={8}>
            <Text style={[styles.noteAction, {color: textColor}]}>📓</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onCreateNote} hitSlop={8}>
            <Text style={[styles.noteAction, {color: textColor}]}>+📓</Text>
          </Pressable>
        )}
        {linkedFile ? (
          <Pressable onPress={() => onOpenLinkedFile?.(linkedFile)} hitSlop={8} style={styles.clipAction}>
            <ClipIcon color={textColor} />
          </Pressable>
        ) : onArmLink ? (
          <Pressable onPress={onArmLink} hitSlop={8} style={styles.clipAction}>
            <Text style={[styles.clipPlus, {color: textColor}]}>+</Text>
            <ClipIcon color={textColor} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A task shown for reading only: checkbox state, text and badges, nothing
 * tappable (no edit, no tick-off, no note or file icons). Used where a
 * list is an overview rather than a place to work on tasks - the "All
 * tasks" list on Review's Done/On Hold detail page (2026-09-30: it used
 * TaskRow without actions, so the row looked tappable but did nothing).
 */
export function ReadOnlyTaskRow({
  task,
  context,
  textColor,
  borderColor,
}: {
  task: Task;
  context: TaskBadgeContext;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const layout = taskRowLayout(task, TASK_COLUMN_WIDTH_PX, context);
  return (
    <View style={styles.wrap}>
      <View style={[styles.row, {borderBottomColor: borderColor}]}>
        <Text style={styles.checkbox}>{task.done ? '☑' : '☐'}</Text>
        <View style={styles.rowTextWrap}>
          <Text style={[styles.rowText, {color: textColor}, task.done && styles.rowTextDone]} numberOfLines={layout.lines}>
            {layout.title}
            <TaskLabels labels={layout.labels} />
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: {
    flexDirection: 'row',
    // Top-aligned, not centered (2026-09-15 bugfix, Tilman: "I would expect
    // for 2 line entries that everything is top aligned, but the text
    // extends to one more line") - with per-row variable heights (Batch 2),
    // centering a shorter real content block inside a taller reserved box
    // (an over-predicted 2-line reservation whose real content is 1 line, or
    // the stale-minHeight case the `height` prop's own comment above
    // documents) reads as content floating in the middle of the row instead
    // of sitting at its top; top-aligning puts any leftover space at the
    // bottom instead, which ui/textLineEstimator.ts's own doc comment
    // already calls the harmless direction for a misprediction to fail in.
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    paddingVertical: 7,
    // Reserves space for up to 2 lines of text + badges regardless of
    // content length, so every row in a paginated page is the same height
    // (docs/dev/technical-design-pagination-edit-reuse.md §3). Only the floor
    // for callers that don't pass an explicit `height` (Daily, Review, and
    // every other caller still on the old fixed-`minHeight` story) - a
    // Batch 2 caller's explicit `height` prop above overrides this via its
    // own paired `minHeight`, see that prop's doc comment.
    minHeight: 64,
    // Defensive (2026-09-15, same DailyView Batch 5 bugfix as
    // TRAILING_ICON_ALLOWANCE_PX in ui/taskRowLayout.ts): without this, a row whose real
    // content is still somehow taller than its reserved height (a
    // misprediction the width-reservation fix above doesn't fully rule
    // out) renders its overflow at default 'visible', bleeding down into
    // the next sibling row's space instead of clipping in place - the
    // "clips cleanly in place" failure mode ui/textLineEstimator.ts's own
    // doc comment already assumes is what happens, but nothing here
    // actually enforced it. This makes any future misprediction degrade
    // safely (an ellipsis-truncated line) instead of visually overlapping
    // an unrelated row.
    overflow: 'hidden',
  },
  rowEditing: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    paddingLeft: 4,
  },
  checkbox: {
    fontSize: FONT.medium,
    marginRight: 8,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowText: {
    fontSize: FONT.medium,
    // Descender-clipping fix (2026-09-17, [[feature_pagination_fixed_height]])
    // - same fix confirmed on screens/ItemsList.tsx's own row Text: Android's
    // default `includeFontPadding` reserves space above cap-height without a
    // matching reservation below the baseline, so a fixed-height, top-aligned
    // row (this one) clips descenders ("g"/"y") at its own bottom edge.
    includeFontPadding: false,
  },
  rowTextDone: {
    opacity: 0.5,
    textDecorationLine: 'line-through',
  },
  noteAction: {
    fontSize: FONT.small,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  clipAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  clipPlus: {
    fontSize: FONT.small,
    fontWeight: '700',
    marginRight: 1,
  },
  tag: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  tagSelected: {
    color: COLORS.accentText,
    fontWeight: '600',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 3,
  },
});
