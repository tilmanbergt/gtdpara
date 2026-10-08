/**
 * The Todos list of the Current page's right pane (screens/ProjectDataPanel.tsx):
 * grouped by flow state, flattened into one PagedSection, with its own row
 * actions (done toggle, note) and the "Hide done tasks" switch. Add, edit and
 * delete live in ProjectDataPanel's single Quick Add above both lists.
 */
import React, {useEffect, useState} from 'react';
import {Keyboard, Pressable, Text, View} from 'react-native';
import {Task} from '../../domain/types';
import {groupTasksByFlowState} from '../../domain/flowState';
import {withTaskDone} from '../../domain/taskEdit';
import {todayIso} from '../../domain/meetingTime';
import {openOrCreateTodoNote} from '../../storage/meetingNoteContent';
import {loadSettings, saveSettings} from '../../storage/settingsStorage';
import {useNoteCreateConfirm} from '../../ui/useNoteCreateConfirm';
import PagedSection from '../../ui/PagedSection';
import TaskRow, {taskRowHeight, taskRowLines} from '../../ui/TaskRow';
import {useErrorStatus} from '../../ui/status/StatusProvider';
import {log, logError} from '../../utils/log';
import {errorMessage} from '../../utils/errorMessage';
import {COLUMN_WIDTH_PX, PaneColors, sectionStyles as styles, SUBHEADING_ROW_PX} from './panelLayout';

/** One flattened Todos row - a flow-state group's header, or a task -
 * see the "Flattened into one paginated sequence" comment inside
 * TodosSection below. */
type TodoFlatRow =
  | {kind: 'header'; rowKey: string; label: string}
  | {kind: 'entry'; rowKey: string; task: Task; index: number};

export default function TodosSection({
  itemPath,
  tasks,
  onSave,
  editingIndex,
  armingIndex,
  onStartEdit,
  onArmLink,
  onOpenLinkedFile,
  textColor,
  borderColor,
}: Pick<PaneColors, 'textColor' | 'borderColor'> & {
  itemPath: string;
  tasks: Task[];
  onSave: (next: Task[]) => Promise<void>;
  /** Lifted up into ProjectDataPanel (technical-design-linked-files.md §8) - see that component's EditTarget doc comment. Add/edit/delete itself lives in the single QuickAddWidget above both sections (docs/dev/history/technical-design-unified-quickadd.md §8) - this section only needs `editingIndex` to keep highlighting the row currently being edited. */
  editingIndex: number | null;
  armingIndex: number | null;
  onStartEdit: (index: number) => void;
  onArmLink: (index: number) => void;
  onOpenLinkedFile: (linkedFile: string) => void;
}): React.JSX.Element {
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('ProjectDataPanel.actionError', actionError, () => setActionError(null));
  const confirmNoteCreate = useNoteCreateConfirm('ProjectDataPanel.todoNoteCreateConfirm');

  // "Hide done tasks" - remembered across visits via
  // GtdParaSettings.hideDoneProjectTasks (domain/settings.ts), loaded once
  // on mount; done tasks are shown by default (false). Loaded/saved directly
  // here via loadSettings/saveSettings rather than threaded down as a prop
  // through ItemDetail - same self-contained "load your own settings"
  // pattern this file's own toggleFocus already uses.
  const [hideDone, setHideDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSettings().then(s => {
      if (!cancelled) setHideDone(s.hideDoneProjectTasks);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleHideDone = () => {
    const next = !hideDone;
    setHideDone(next);
    loadSettings()
      .then(s => saveSettings({...s, hideDoneProjectTasks: next}))
      .catch(e => logError('TodosSection: save hideDoneProjectTasks failed', errorMessage(e)));
  };

  const doneCount = tasks.filter(t => !t.cancelled && t.done).length;

  // Grouped by flow-state (technical-design-tags.md §4) - Next, Waiting
  // For, Someday, Maybe, then Other (no flow tag), empty groups omitted.
  // Not-cancelled only.
  //
  // groupTasksByFlowState is called against the *full*, unfiltered `tasks`
  // array (not a hideDone-prefiltered copy) so each entry's `index` stays a
  // valid position into `tasks` - every row action below (commitEdit,
  // handleToggleDone, handleCancel, ...) does `tasks.slice(); next[index] =
  // ...` against that same full array. Pre-filtering before grouping would
  // renumber entries relative to the *shorter* filtered array instead, so
  // e.g. editing the first visible task while an earlier task happens to be
  // done-and-hidden would silently edit that unrelated hidden task instead
  // (index 0 of the filtered list isn't index 0 of `tasks` once something
  // ahead of it was removed). Hiding done tasks is applied *after*
  // grouping instead, by filtering each group's already-indexed `entries`
  // in place - that keeps every surviving entry's `index` correct and still
  // drops a group left with nothing but done tasks.
  const groupsByFlowState = groupTasksByFlowState(tasks);
  const groups = hideDone
    ? groupsByFlowState
        .map(group => ({...group, entries: group.entries.filter(({task}) => !task.done)}))
        .filter(group => group.entries.length > 0)
    : groupsByFlowState;

  // Flattened into one paginated sequence (docs/dev/technical-design-pagination-
  // edit-reuse.md §2/§4) - each group's label becomes a header row counted
  // as content within that sequence, rather than paging per-group.
  const flatRows: TodoFlatRow[] = groups.flatMap(group => [
    {kind: 'header', rowKey: `header-${group.key}`, label: group.label} as TodoFlatRow,
    ...group.entries.map(
      ({task, index}): TodoFlatRow => ({kind: 'entry', rowKey: `task-${index}`, task, index}),
    ),
  ]);
  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
      log('TodosSection: action done');
    } catch (e) {
      logError('TodosSection: action failed', errorMessage(e));
      setActionError(errorMessage(e));
    }
  };

  const handleToggleDone = (index: number) => {
    Keyboard.dismiss();
    runAction(async () => {
      const next = tasks.slice();
      next[index] = withTaskDone(next[index], !next[index].done, todayIso());
      await onSave(next);
    });
  };

  /**
   * Shared Note Pages (docs/dev/history/technical-design-shared-note-pages.md §6): one
   * call into `openOrCreateTodoNote` - it decides create-vs-open (and
   * own-vs-shared-target) internally and ends by opening the resolved page
   * itself, so this handler only has to persist the (possibly unchanged) `tasks` array through this section's
   * own `onSave` prop when `notePath` changed.
   */
  const handleNote = (index: number) => {
    Keyboard.dismiss();
    runAction(async () => {
      const settings = await loadSettings();
      const {task, changed} = await openOrCreateTodoNote(tasks[index], itemPath, settings, null, {confirmCreate: confirmNoteCreate});
      if (changed) {
        const next = tasks.slice();
        next[index] = task;
        await onSave(next);
      }
    });
  };

  return (
    <View style={styles.section}>
      {doneCount > 0 && (
        <Pressable onPress={toggleHideDone} hitSlop={8} style={styles.hideDoneRow}>
          <Text style={[styles.hideDoneText, {color: textColor}]}>
            {hideDone ? `Show ${doneCount} done task${doneCount === 1 ? '' : 's'}` : 'Hide done tasks'}
          </Text>
        </Pressable>
      )}
      {/* "Todos" heading and pagination in one PagedSection
          (docs/dev/history/technical-design-pagination-fixed-height.md §3.4). An
          empty list shows `emptyHint` and still reserves the box's full
          height - these boxes are fixed and always there. */}
      <PagedSection
        header="Todos"
        rows={flatRows}
        rowHeight={row => (row.kind === 'header' ? SUBHEADING_ROW_PX : taskRowHeight(row.task, COLUMN_WIDTH_PX, 'grouped'))}
        isCountableRow={row => row.kind === 'entry'}
        renderRow={row =>
          row.kind === 'header' ? (
            <Text key={row.rowKey} style={[styles.subheading, {color: textColor}]}>
              {row.label}
            </Text>
          ) : (
            <TaskRow
              key={row.rowKey}
              task={row.task}
              isEditing={editingIndex === row.index}
              isArming={armingIndex === row.index}
              onStartEdit={() => onStartEdit(row.index)}
              onToggleDone={() => handleToggleDone(row.index)}
              onCreateNote={() => handleNote(row.index)}
              onOpenNote={() => handleNote(row.index)}
              linkedFile={row.task.linkedFile}
              onOpenLinkedFile={onOpenLinkedFile}
              onArmLink={() => onArmLink(row.index)}
              ownerPath={itemPath}
              context="grouped"
              height={taskRowHeight(row.task, COLUMN_WIDTH_PX, 'grouped')}
              numberOfLines={taskRowLines(row.task, COLUMN_WIDTH_PX, 'grouped')}
              textColor={textColor}
              borderColor={borderColor}
            />
          )
        }
        emptyHint="No todos yet."
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}
