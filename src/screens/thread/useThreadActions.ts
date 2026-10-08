/**
 * Every action the thread overview offers on its rows and in its Quick Add
 * (docs/dev/history/technical-design-tending-threads.md §3.5.3): add, edit,
 * delete (cancel) and quick-file todos and meetings, tick todos done, the
 * prep/review icon, notes and linked files. The same write paths Daily uses:
 * storage/itemMutations.ts (`mutateEntryTasks`/`mutateEntryMeetings` on the
 * entry's full-array index), domain/taskEdit.ts, storage/entryMove.ts for
 * quick-file, ui/useEditTarget.ts for the one edit target.
 */
import {useEffect, useState} from 'react';
import {Keyboard} from 'react-native';
import {AbbrevFileMatch} from '../../domain/abbrev';
import {Destination, destinationLabel} from '../../domain/destination';
import {MeetingTrackingKind, toggleMeetingTrackingAt} from '../../domain/meetingTracking';
import {todayIso} from '../../domain/meetingTime';
import {GtdParaSettings} from '../../domain/settings';
import {withTaskCancelled, withTaskDone} from '../../domain/taskEdit';
import {Meeting, Task} from '../../domain/types';
import {getCachedData, setCachedInbox} from '../../storage/dataCache';
import {itemTarget, moveMeeting, moveTask} from '../../storage/entryMove';
import {
  addMeetingToDestination,
  addTaskToDestination,
  applyMeetingEdit,
  applyTaskEdit,
  buildMeeting,
  buildTask,
  mutateEntryMeetings,
  mutateEntryTasks,
} from '../../storage/itemMutations';
import {openLinkedFile} from '../../storage/linkedFiles';
import {openOrCreateMeetingNote, openOrCreateTodoNote} from '../../storage/meetingNoteContent';
import {loadSettings} from '../../storage/settingsStorage';
import {ThreadMeetingEntry, ThreadTaskEntry} from '../../storage/threadAggregate';
import {MeetingTrackingConfig} from '../../ui/MeetingRow';
import {MeetingQuickAddFields, QuickFilePayload} from '../../ui/QuickAddWidget';
import {useActionError} from '../../ui/useActionError';
import {useCachedInbox} from '../../ui/useCachedInbox';
import {useEditTarget} from '../../ui/useEditTarget';
import {useEntryMoveUi} from '../../ui/useEntryMoveUi';
import {useNoteCreateConfirm} from '../../ui/useNoteCreateConfirm';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';

const LOG = 'ThreadOverview';

/** The row open in Quick Add's edit mode: `<item path>#<index>`. */
export interface ThreadEditKey {
  type: 'task' | 'meeting';
  key: string;
}

export const taskEntryKey = (e: ThreadTaskEntry) => `${e.item.path}#${e.taskIndex}`;
export const meetingEntryKey = (e: ThreadMeetingEntry) => `${e.item.path}#${e.meetingIndex}`;

export function useThreadActions() {
  const inbox = useCachedInbox();
  const paths = getCachedData()?.paths ?? null;
  const inboxPath = paths?.inboxFolder ?? null;
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch(e => logError(`${LOG}: loading settings failed`, errorMessage(e)));
  }, []);
  const confirmNoteCreate = useNoteCreateConfirm(`${LOG}.noteCreateConfirm`);
  const moveUi = useEntryMoveUi(LOG);
  const edit = useEditTarget<ThreadEditKey>();
  const widgetAction = useActionError(`${LOG}.widgetError`, `${LOG}: widget action failed`);
  const rowAction = useActionError(`${LOG}.rowError`, `${LOG}: row action failed`);
  const ctx = {inbox, inboxPath};

  const saveTasks = async (entry: ThreadTaskEntry, mutate: (tasks: Task[]) => Task[]) => {
    const {nextInbox} = await mutateEntryTasks(entry, mutate, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
  };
  const saveMeetings = async (entry: ThreadMeetingEntry, mutate: (meetings: Meeting[]) => Meeting[]) => {
    const {nextInbox} = await mutateEntryMeetings(entry, mutate, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
  };
  const currentSettings = async () => settings ?? (await loadSettings());

  const addTask = async (line: string, destination: Destination): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(line), destination, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
    log(`${LOG}: added task`, destinationLabel(destination));
  };
  const addMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
    log(`${LOG}: added meeting`, destinationLabel(destination));
  };

  const toggleDone = (entry: ThreadTaskEntry) =>
    rowAction.run(async () => {
      await saveTasks(entry, tasks => {
        tasks[entry.taskIndex] = withTaskDone(tasks[entry.taskIndex], !tasks[entry.taskIndex].done, todayIso());
        return tasks;
      });
      requestEinkRefresh();
    });

  const commitTaskEdit = (entry: ThreadTaskEntry, line: string, linkedFile: string): Promise<boolean> => {
    const text = line.trim();
    if (!text) return Promise.resolve(false);
    return widgetAction.runSave(async () => {
      await saveTasks(entry, tasks => {
        tasks[entry.taskIndex] = applyTaskEdit(tasks[entry.taskIndex], text, linkedFile);
        return tasks;
      });
      edit.cancel();
    });
  };
  const commitMeetingEdit = (entry: ThreadMeetingEntry, fields: MeetingQuickAddFields, linkedFile: string): Promise<boolean> =>
    widgetAction.runSave(async () => {
      await saveMeetings(entry, meetings => {
        meetings[entry.meetingIndex] = applyMeetingEdit(meetings[entry.meetingIndex], fields, linkedFile);
        return meetings;
      });
      edit.cancel();
    });

  /** Quick Add's Delete in edit mode: cancels (soft-deletes) the edited row. */
  const cancelEntry = (entry: {task: ThreadTaskEntry} | {meeting: ThreadMeetingEntry}) => {
    Keyboard.dismiss();
    widgetAction.run(async () => {
      if ('task' in entry) {
        const e = entry.task;
        await saveTasks(e, tasks => {
          tasks[e.taskIndex] = withTaskCancelled(tasks[e.taskIndex], true);
          return tasks;
        });
      } else {
        const e = entry.meeting;
        await saveMeetings(e, meetings => {
          meetings[e.meetingIndex] = {...meetings[e.meetingIndex], cancelled: true};
          return meetings;
        });
      }
      edit.cancel();
    });
  };

  /** Quick Add's "File: <Name>" in edit mode: save, but move to the abbreviation's item. Throws so the widget shows the error. */
  const quickFile = async (
    entry: {task: ThreadTaskEntry} | {meeting: ThreadMeetingEntry},
    target: AbbrevFileMatch,
    payload: QuickFilePayload,
  ): Promise<void> => {
    let moved: Task | Meeting | null = null;
    if ('task' in entry && payload.kind === 'task') {
      const e = entry.task;
      moved = await moveTask(e.item, e.taskIndex, applyTaskEdit(e.task, payload.text, payload.linkedFile), itemTarget(target), moveUi);
    } else if ('meeting' in entry && payload.kind === 'meeting') {
      const e = entry.meeting;
      moved = await moveMeeting(e.item, e.meetingIndex, applyMeetingEdit(e.meeting, payload.fields, payload.linkedFile), itemTarget(target), moveUi);
    }
    if (moved) edit.cancel();
  };

  const taskNote = (entry: ThreadTaskEntry) =>
    rowAction.run(async () => {
      const {task, changed} = await openOrCreateTodoNote(entry.task, entry.item.path, await currentSettings(), null, {
        confirmCreate: confirmNoteCreate,
      });
      if (changed) {
        await saveTasks(entry, tasks => {
          tasks[entry.taskIndex] = task;
          return tasks;
        });
      }
    });
  const meetingNote = (entry: ThreadMeetingEntry) =>
    rowAction.run(async () => {
      const {meeting, changed} = await openOrCreateMeetingNote(
        entry.meeting,
        entry.item.path,
        await currentSettings(),
        inbox ? {tasks: inbox.tasks} : null,
        {confirmCreate: confirmNoteCreate},
      );
      if (changed) {
        await saveMeetings(entry, meetings => {
          meetings[entry.meetingIndex] = meeting;
          return meetings;
        });
      }
    });

  const tracking = (entry: ThreadMeetingEntry): MeetingTrackingConfig => ({
    rules: settings?.tagRules ?? [],
    onToggle: (kind: MeetingTrackingKind) =>
      rowAction.run(async () => {
        await saveMeetings(entry, meetings => toggleMeetingTrackingAt(meetings, entry.meetingIndex, kind));
        requestEinkRefresh();
      }),
  });

  const openFile = (linkedFile: string) => {
    if (!paths) return;
    openLinkedFile(paths, linkedFile).catch(e => logError(`${LOG}: open linked file failed`, errorMessage(e)));
  };

  return {
    inbox,
    inboxPath,
    edit,
    addTask,
    addMeeting,
    toggleDone,
    commitTaskEdit,
    commitMeetingEdit,
    cancelEntry,
    quickFile,
    taskNote,
    meetingNote,
    tracking,
    openFile,
  };
}

export type ThreadActions = ReturnType<typeof useThreadActions>;
