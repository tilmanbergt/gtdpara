/**
 * Wires the todo card (docs/dev/history/technical-design-item-card.md K9, §6)
 * for one screen: given the selected todo and the screen's own handlers, it
 * builds the card's model and turns each button into a write through the
 * screen's `updateTask` - which changes the todo's current stored copy. Done
 * and Now go through the screen's own row handlers where it has them, so
 * what follows a tick (the Engage prompt, focus mode) stays the same as on
 * the row. Returns what QuickAddWidget's `todoCard` prop takes.
 */
import {todoCardModel, TodoCardModel} from '../../domain/itemCard';
import {setFlowStateTag, setNowTag} from '../../domain/flowState';
import {todayIso} from '../../domain/meetingTime';
import {displayTaskText} from '../../domain/taskLabels';
import {withTaskCancelled, withTaskDone, withTaskText} from '../../domain/taskEdit';
import {FlowState, Task} from '../../domain/types';
import {log} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {openOverview} from '../overviewStore';
import {useActionError} from '../useActionError';
import {useStatusConfirm} from '../useStatusConfirm';

export interface TodoSelection {
  task: Task;
  /** The Project's or Area's folder - the Inbox folder for an Inbox todo. */
  itemPath: string;
  /** The Project's or Area's name, or "Inbox". */
  ownerName: string;
  inbox?: boolean;
}

export interface TodoCardOptions {
  /** A stable per-screen name for logs and the status slot. */
  name: string;
  selection: TodoSelection | null;
  /** Changes the selected todo's current stored copy and saves it. */
  updateTask: (change: (task: Task) => Task) => Promise<void>;
  /** The row's own done handler; absent: the card ticks through `updateTask`. */
  onToggleDone?: () => void;
  /** The row's own Now handler; absent: the card switches `#now` through `updateTask`. */
  onToggleNow?: () => void;
  /** Opens the todo's note, creating it first when there is none. */
  onNote: () => void;
  onOpenFile?: (linkedFile: string) => void;
  /** Where the screen has a Files pane: arms it to link a file. Absent: no +clip. */
  onArmLink?: () => void;
  /** Where the screen has a Files pane: arms it to refile. Absent: the area chip has no arrow. */
  onArmRefile?: () => void;
  /** Opens the owning Project or Area. Absent: the chip is a plain label. */
  onOpenOwner?: () => void;
  onEdit: () => void;
  onClose: () => void;
}

export interface TodoCardData {
  task: Task;
  model: TodoCardModel;
  onEdit: () => void;
  onClose: () => void;
  onToggleDone: () => void;
  onFlow: (next: FlowState) => void;
  onToggleNow: () => void;
  onNote: () => void;
  onOpenFile?: () => void;
  onUnlink: () => void;
  onLink?: () => void;
  onOpenOwner?: () => void;
  onRefile?: () => void;
  onDelete: () => void;
  onOpenOrigin?: () => void;
}

export function useTodoCard(options: TodoCardOptions): TodoCardData | null {
  const {name, selection, updateTask} = options;
  const confirm = useStatusConfirm(`${name}.deleteTodo`);
  const action = useActionError(`${name}.todoCard`, `${name}: todo card action failed`);
  if (!selection) return null;

  const {task} = selection;
  const model = todoCardModel({
    task,
    today: todayIso(),
    ownerName: selection.ownerName,
    canLink: !!options.onArmLink,
    canRefile: !!options.onArmRefile,
  });

  /** Runs one card write; the e-ink screen refreshes afterwards. */
  const write = (label: string, change: (t: Task) => Task) => {
    action
      .run(async () => {
        await updateTask(change);
        log(`${name}: todo card ${label}`);
      })
      .finally(requestEinkRefresh);
  };

  const onDelete = () => {
    action.run(async () => {
      const ok = await confirm({
        text: `Delete "${displayTaskText(task, 'flat')}"?`,
        detail: 'It stays in the file, marked as cancelled.',
        actionLabel: 'Delete',
      });
      if (!ok) return;
      await updateTask(t => withTaskCancelled(t, true));
      log(`${name}: todo card deleted the todo`);
      options.onClose();
      requestEinkRefresh();
    });
  };

  const linkedFile = task.linkedFile;
  const threadTag = model.origin?.threadTag ?? null;
  return {
    task,
    model,
    onEdit: options.onEdit,
    onClose: options.onClose,
    onToggleDone: options.onToggleDone ?? (() => write('ticked done', t => withTaskDone(t, !t.done, todayIso()))),
    // Tapping the chip that is on clears it, as on the row's chips.
    onFlow: next =>
      write(`set flow ${next ?? 'none'}`, t =>
        withTaskText(t, setFlowStateTag(t.text, next === t.flowState ? null : next, next === 'waiting-for' ? t.waitingOn ?? undefined : undefined)),
      ),
    onToggleNow: options.onToggleNow ?? (() => write('switched now', t => withTaskText(t, setNowTag(t.text, !t.now)))),
    onNote: options.onNote,
    onOpenFile: linkedFile && options.onOpenFile ? () => options.onOpenFile?.(linkedFile) : undefined,
    onUnlink: () => write('unlinked the file', t => ({...t, linkedFile: ''})),
    onLink: options.onArmLink,
    onOpenOwner: options.onOpenOwner,
    onRefile: options.onArmRefile,
    onDelete,
    onOpenOrigin: threadTag ? () => openOverview({tag: threadTag, ownerPath: selection.inbox ? null : selection.itemPath}) : undefined,
  };
}
