/**
 * Every action the thread and loop overviews offer on their rows and in their
 * Quick Add (docs/dev/history/technical-design-tending-threads.md §3.5.3,
 * docs/dev/history/technical-design-engage.md §3.6): add, edit,
 * delete (cancel) and quick-file todos and meetings, tick todos done, the
 * prep/review icon, notes and linked files; for the Engage panel also the
 * flow of a todo (`setTaskFlow`), Done with an undo record and Undo. The same
 * write paths Daily uses:
 * storage/itemMutations.ts (`mutateEntryTasks`/`mutateEntryMeetings` on the
 * entry's full-array index), domain/taskEdit.ts, storage/entryMove.ts for
 * quick-file, ui/useEditTarget.ts for the one edit target.
 */
import {useEffect, useState} from 'react';
import {Keyboard} from 'react-native';
import {AbbrevFileMatch} from '../domain/abbrev';
import {Destination, destinationLabel} from '../domain/destination';
import {EngageFlowChoice, engageFlowText} from '../domain/engageOptions';
import {UndoRecord} from '../domain/engageFlow';
import {ENGAGE_NOTICE} from '../domain/engageText';
import {todayIso} from '../domain/meetingTime';
import {GtdParaSettings} from '../domain/settings';
import {withTaskCancelled, withTaskDone, withTaskText} from '../domain/taskEdit';
import {Meeting, Task} from '../domain/types';
import {getCachedData, setCachedInbox} from '../storage/dataCache';
import {itemTarget, moveMeeting, moveTask} from '../storage/entryMove';
import {
  addMeetingToDestination,
  addTaskToDestination,
  applyMeetingEdit,
  currentEntryMeeting,
  MeetingEntryRef,
  applyTaskEdit,
  buildMeeting,
  buildTask,
  mutateEntryMeetings,
  mutateEntryTasks,
} from '../storage/itemMutations';
import {openLinkedFile} from '../storage/linkedFiles';
import {openOrCreateMeetingNote, openOrCreateTodoNote} from '../storage/meetingNoteContent';
import {loadSettings} from '../storage/settingsStorage';
import {ThreadMeetingEntry, ThreadTaskEntry} from '../storage/threadAggregate';
import {MeetingTrackingConfig, trackingSetups} from './MeetingRow';
import {MeetingQuickAddFields, QuickFilePayload} from './QuickAddWidget';
import {useActionError} from './useActionError';
import {useCachedInbox} from './useCachedInbox';
import {useEditTarget} from './useEditTarget';
import {useEngagePrompt} from './useEngagePrompt';
import {useEntryMoveUi} from './useEntryMoveUi';
import {useNoteCreateConfirm} from './useNoteCreateConfirm';
import {MeetingCardOptions} from './itemCard/useMeetingCard';
import {TodoCardOptions} from './itemCard/useTodoCard';
import {openOrCreateReflectionPage} from '../storage/reflectionPage';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';


/** The row open in Quick Add's edit mode: `<item path>#<index>`. */
export interface EntryEditKey {
  type: 'task' | 'meeting';
  key: string;
}

export const taskEntryKey = (e: ThreadTaskEntry) => `${e.item.path}#${e.taskIndex}`;
export const meetingEntryKey = (e: ThreadMeetingEntry) => `${e.item.path}#${e.meetingIndex}`;

/** `name`: the log prefix and status-slot id prefix of the screen using it. */
export function useEntryActions(name = 'ThreadOverview') {
  const LOG = name;
  const inbox = useCachedInbox();
  const paths = getCachedData()?.paths ?? null;
  const inboxPath = paths?.inboxFolder ?? null;
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch(e => logError(`${LOG}: loading settings failed`, errorMessage(e)));
  }, [LOG]);
  const confirmNoteCreate = useNoteCreateConfirm(`${LOG}.noteCreateConfirm`);
  const moveUi = useEntryMoveUi(LOG);
  const edit = useEditTarget<EntryEditKey>();
  const widgetAction = useActionError(`${LOG}.widgetError`, `${LOG}: widget action failed`);
  const rowAction = useActionError(`${LOG}.rowError`, `${LOG}: row action failed`);
  const engagePrompt = useEngagePrompt(LOG);
  const ctx = {inbox, inboxPath};

  const saveTasks = async (entry: ThreadTaskEntry, mutate: (tasks: Task[]) => Task[]) => {
    const {nextInbox} = await mutateEntryTasks(entry, mutate, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
  };
  const saveMeetings = async (entry: MeetingEntryRef, mutate: (meetings: Meeting[]) => Meeting[]) => {
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
      if (!entry.task.done) engagePrompt.afterDone(entry.item.path, entry.task);
      requestEinkRefresh();
    });

  /** Changes one task through the write path and returns what Undo needs, or null when the write failed. */
  const changeTask = async (entry: ThreadTaskEntry, change: (task: Task) => Task): Promise<UndoRecord | null> => {
    let undo: UndoRecord | null = null;
    await rowAction.run(async () => {
      await saveTasks(entry, tasks => {
        const before = tasks[entry.taskIndex];
        const after = change(before);
        tasks[entry.taskIndex] = after;
        undo = {itemPath: entry.item.path, taskIndex: entry.taskIndex, before, afterText: after.text};
        return tasks;
      });
      requestEinkRefresh();
    });
    return undo;
  };

  /** Engage's pick, Remove #next and Someday (docs/dev/history/technical-design-engage.md §3.6). */
  const setTaskFlow = (entry: ThreadTaskEntry, flow: EngageFlowChoice) =>
    changeTask(entry, task => withTaskText(task, engageFlowText(task.text, flow)));

  /** Engage's Done: ticks the task done and keeps what Undo needs. */
  const completeTask = (entry: ThreadTaskEntry) => changeTask(entry, task => withTaskDone(task, true, todayIso()));

  /**
   * Writes the task as it was before `record`'s change back at the same
   * index - only while that index still holds the changed text; otherwise the
   * status slot says so and nothing is written. Resolves true when undone.
   */
  const undoTask = (record: UndoRecord): Promise<boolean> =>
    rowAction.runSave(async () => {
      const item = getCachedData()?.items.find(i => i.path === record.itemPath);
      const current = item?.tasks[record.taskIndex];
      if (!item || !current || current.text !== record.afterText) throw new Error(ENGAGE_NOTICE.undoStale);
      const entry: ThreadTaskEntry = {item: {kind: item.kind, name: item.name, path: item.path, abbrev: item.abbrev}, taskIndex: record.taskIndex, task: current};
      await saveTasks(entry, tasks => {
        tasks[record.taskIndex] = record.before;
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
      edit.saved(); // back to the todo's card
    });
  };
  const commitMeetingEdit = (entry: ThreadMeetingEntry, fields: MeetingQuickAddFields, linkedFile: string): Promise<boolean> =>
    widgetAction.runSave(async () => {
      await saveMeetings(entry, meetings => {
        meetings[entry.meetingIndex] = applyMeetingEdit(meetings[entry.meetingIndex], fields, linkedFile);
        return meetings;
      });
      edit.saved(); // back to the meeting's card
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
      moved = await moveMeeting(e.item, e.meetingIndex, applyMeetingEdit(currentEntryMeeting(e, ctx), payload.fields, payload.linkedFile), itemTarget(target), moveUi);
    }
    if (moved) edit.cancel();
  };

  /** Opens (or creates, after the confirm) the todo's note; resolves true only when a note was opened (not cancelled, no error). */
  const taskNote = async (entry: ThreadTaskEntry): Promise<boolean> => {
    let opened = false;
    const ok = await rowAction.runSave(async () => {
      const {task, changed, cancelled} = await openOrCreateTodoNote(entry.task, entry.item.path, await currentSettings(), null, {
        confirmCreate: confirmNoteCreate,
      });
      if (changed) {
        await saveTasks(entry, tasks => {
          tasks[entry.taskIndex] = task;
          return tasks;
        });
      }
      opened = !cancelled;
    });
    return ok && opened;
  };
  /** Opens a linked file (at its page); resolves true when it opened, else the status slot shows why. */
  const openTaskFile = (linkedFile: string): Promise<boolean> =>
    rowAction.runSave(async () => {
      if (!paths) throw new Error('The files are not loaded yet.');
      await openLinkedFile(paths, linkedFile);
    });
  /** Opens (or creates, after the confirm) the meeting's note; resolves true only when a note was opened. */
  const meetingNote = async (entry: ThreadMeetingEntry): Promise<boolean> => {
    let opened = false;
    const ok = await rowAction.runSave(async () => {
      const {meeting, changed, cancelled} = await openOrCreateMeetingNote(
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
      opened = !cancelled;
    });
    return ok && opened;
  };

  /**
   * Opens (or creates, after the confirm) the meeting's Reflection page
   * (docs/dev/history/technical-design-meeting-reflection.md §2.8); resolves true only when it opened.
   */
  const reflection = async (entry: MeetingEntryRef & {meeting: Meeting}): Promise<boolean> => {
    let opened = false;
    const ok = await rowAction.runSave(async () => {
      const result = await openOrCreateReflectionPage(entry.meeting, entry.item.path, await currentSettings(), inbox ? {tasks: inbox.tasks} : null, {
        confirmCreate: confirmNoteCreate,
        forceOwnTarget: entry.item.kind === 'inbox',
      });
      if (result.changed) await saveMeetings(entry, meetings => meetings.map((m, i) => (i === entry.meetingIndex ? result.meeting : m)));
      opened = !result.cancelled;
    });
    return ok && opened;
  };

  const tracking = (): MeetingTrackingConfig => ({setups: trackingSetups(settings)});

  /** The selected todo's card (ui/itemCard/useTodoCard.ts); done goes through the row's own toggleDone. */
  const todoCardOptions = (entry: ThreadTaskEntry | null): TodoCardOptions => ({
    name: LOG,
    selection: entry && {task: entry.task, itemPath: entry.item.path, ownerName: entry.item.name, inbox: entry.item.kind === 'inbox'},
    updateTask: async change => {
      if (entry) await saveTasks(entry, tasks => tasks.map((t, i) => (i === entry.taskIndex ? change(t) : t)));
    },
    onToggleDone: () => {
      if (entry) toggleDone(entry);
    },
    onNote: () => {
      if (entry) taskNote(entry);
    },
    onOpenFile: linkedFile => openFile(linkedFile),
    onEdit: edit.edit,
    onClose: edit.cancel,
  });

  /** The selected meeting's card (ui/itemCard/useMeetingCard.ts); no Files pane here: no +clip, refile only by abbreviation tag. */
  const cardOptions = (entry: ThreadMeetingEntry | null): MeetingCardOptions => ({
    name: LOG,
    selection: entry && {meeting: entry.meeting, itemPath: entry.item.path, ownerName: entry.item.name, inbox: entry.item.kind === 'inbox'},
    settings,
    inbox: inbox ? {tasks: inbox.tasks} : null,
    updateMeeting: async change => {
      if (entry) await saveMeetings(entry, meetings => meetings.map((m, i) => (i === entry.meetingIndex ? change(m) : m)));
    },
    onNote: () => {
      if (entry) meetingNote(entry);
    },
    onOpenFile: linkedFile => openFile(linkedFile),
    onEdit: edit.edit,
    onClose: edit.cancel,
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
    setTaskFlow,
    completeTask,
    undoTask,
    commitTaskEdit,
    commitMeetingEdit,
    cancelEntry,
    quickFile,
    taskNote,
    meetingNote,
    tracking,
    reflection,
    cardOptions,
    todoCardOptions,
    openFile,
    openTaskFile,
  };
}

export type EntryActions = ReturnType<typeof useEntryActions>;
