/**
 * One task row - checkbox, tap-to-edit, labels after the title
 * (ui/TaskLabels.tsx, domain/taskLabels.ts), note-link (📓/+📓), a linked-file clip, and an optional "File" action.
 * The single task row shared by Daily's Open-tasks, ProjectDataPanel's Todos,
 * Review's Inbox-to-zero and the Inbox tab (docs/dev/history/technical-design-inbox-tab.md §1).
 *
 * Editing (docs/dev/history/technical-design-pagination-edit-reuse.md §5): this row
 * renders no edit form of its own. `isEditing` only highlights the row - the
 * caller renders ui/TaskQuickAdd.tsx in its `editingTask` mode, in its own
 * fixed slot elsewhere on screen, to actually edit the task. This keeps every
 * row a constant height whether or not it's the one being edited (no reflow
 * of the rows below it), and keeps the edit form in one predictable on-screen
 * place regardless of which row it's for.
 *
 * Filing/refiling has no row-level affordance: it's reached through
 * QuickAddWidget's "Refile" button in edit mode, on every screen with a Files
 * pane (storage/inboxFiling.ts's module doc comment). This row has nothing to
 * wire for it.
 *
 * There is no row-level delete (technical-design-linked-files.md §6) - removal
 * happens from inside edit mode (ui/TaskQuickAdd.tsx's "Delete" button). The
 * trailing slot is a linked-file clip: filled when `task.linkedFile` is set
 * (tap opens it), "+"-prefixed when it's empty and `onArmLink` was passed
 * (tap arms the caller's Files pane), or nothing at all when it's empty and
 * no `onArmLink` was passed (read-only surfaces like Daily).
 *
 * Parent owns all UI state (via onToggleDone/onArmFile/onCreateNote/
 * onOpenNote/onOpenLinkedFile/onArmLink) - the same split every save
 * callback in this codebase uses. `isEditing`/`isArming` are passed in
 * rather than owned here since only one row across the whole screen can be
 * mid-edit or armed at a time - the caller (which owns one shared
 * `editTarget`/`armTarget`, see the tech design doc §8) decides.
 *
 * Tappable inline tags (technical-design-context-tags.md §7): the title's
 * `#tags` go through ui/TaggableText.tsx; `contextTag`/`onToggleContext` are
 * passed only by Daily's own instances (screens/DailyView.tsx).
 *
 * Title and labels are ONE <Text> (docs/dev/history/technical-design-waiting-for-0.7.md
 * §3.3): what's drawn (title, then labels as nested spans) and the height a
 * caller reserves both come from ui/taskRowLayout.ts's `taskRowLayout`, so a
 * label can't wrap onto a line the row doesn't have.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Task} from '../domain/types';
import {ClipIcon} from './icons';
import {TaskLabelContext} from '../domain/taskLabels';
import TaskLabels from './TaskLabels';
import {TASK_COLUMN_WIDTH_PX, taskRowLayout} from './taskRowLayout';
import {renderTaggableText} from './TaggableText';
import {FONT} from './theme';
import {perfCount} from '../utils/perf';

/** Kept as an alias so callers' `context` props read as before. */
export type TaskBadgeContext = TaskLabelContext;

/**
 * Row-height prediction (docs/dev/history/technical-design-pagination-fixed-height.md
 * §2.2) - a caller building a ui/PagedSection.tsx computes `taskRowHeight`
 * per task to sum toward its viewport, then passes the SAME task/
 * columnWidthPx/context here as this row's `height`/`numberOfLines` props, so
 * the reserved height and the text clamp always agree. The line count comes
 * from ui/taskRowLayout.ts and covers the title AND its labels; a row
 * never shows more than 2 lines.
 */
// Chrome/line split: 20/22 (42 px one line, 64 px two lines) are the
// device-measured values.
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

interface Props {
  task: Task;
  /** Highlights this row (see the module doc comment). The real edit form
   * lives elsewhere on screen, in ui/TaskQuickAdd.tsx's `editingTask` mode. */
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
  /** Double-tapping the `#next`/`#now` label flips #now (ui/TaskLabels.tsx, docs/dev/history/technical-design-now-focus-mode.md §3). Only passed where that's meaningful (Daily, both normal and focus mode); without it the label doesn't react to touch. */
  onToggleNow?: () => void;
  /** The active Daily context filter tag, if any - a matching tag segment renders filled/selected. Only meaningful together with onToggleContext (see the module doc comment); pass null (not omit) when Daily's context is off but rows should still render tags as tappable-but-unselected. */
  contextTag?: string | null;
  /** Set only by Daily's own instances - present, every context tag in this row's text becomes its own tap target that calls this instead of onStartEdit; absent, tags render as plain text. */
  onToggleContext?: (tag: string) => void;
  context: TaskBadgeContext;
  /** Computed via `taskRowHeight()`/`taskRowLines()` above by a caller
   * building a ui/PagedSection.tsx - overrides this row's default
   * `minHeight`/`numberOfLines={2}` so the rendered row matches exactly
   * what pagination summed. Pass both together (never just one) with the
   * same task/columnWidthPx/context they were computed for; when omitted the
   * row uses `minHeight: 64`/`numberOfLines={2}`. */
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
          // Bottom border only, so the editing bar below stays black.
          {borderBottomColor: borderColor},
          (isEditing || isArming) && styles.rowEditing,
          // Also overrides styles.row's own `minHeight: 64` floor -
          // minHeight and height are independent Yoga constraints, so
          // height alone would leave a 1-line row (taskRowHeight() 42)
          // pinned up to 64, which PagedSection's viewport math (it budgets
          // by taskRowHeight()) doesn't know about - the row would sit
          // "raised" with a blank gap under it.
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
              {renderTaggableText(layout.title, {contextTag, onToggleContext})}
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
 * tasks" list on Review's Done/On Hold detail page (a TaskRow without
 * actions would look tappable but do nothing).
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
    // Top-aligned, not centered - with per-row variable heights, centering
    // a shorter real content block inside a taller reserved box (an
    // over-predicted 2-line reservation whose real content is 1 line)
    // reads as content floating in the middle of the row; top-aligning
    // puts any leftover space at the bottom, which ui/textLineEstimator.ts's
    // own doc comment calls the harmless direction for a misprediction.
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    paddingVertical: 7,
    // Reserves space for up to 2 lines of text + badges regardless of
    // content length, so every row in a paginated page is the same height
    // (docs/dev/history/technical-design-pagination-edit-reuse.md §3). Only the floor
    // for callers that don't pass an explicit `height` - an explicit
    // `height` prop overrides this via its own paired `minHeight`, see
    // that prop's doc comment.
    minHeight: 64,
    // Defensive (see also TRAILING_ICON_ALLOWANCE_PX in
    // ui/taskRowLayout.ts): a row whose real content is still taller than
    // its reserved height (a misprediction) would otherwise render its
    // overflow at default 'visible', bleeding into the next row's space.
    // Clipping makes a misprediction degrade safely (an ellipsis-truncated
    // line) instead of overlapping an unrelated row.
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
    // Android's default `includeFontPadding` reserves space above cap-height
    // without a matching reservation below the baseline, so a fixed-height,
    // top-aligned row (this one) would clip descenders ("g"/"y") at its own
    // bottom edge ([[feature_pagination_fixed_height]]; same on
    // screens/ItemsList.tsx's row Text).
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
});
