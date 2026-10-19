/**
 * The candidate prompt after a Done (R5, docs/dev/history/technical-design-engage.md
 * §3.8): when a todo ticked done on Daily, the Current tab or a thread/loop
 * overview was its owner's last `#next` and a plan is left, the status slot
 * says "<owner> has no next action. Pick one:" with up to three plan todos
 * and "Later". A pick gives that todo `#next` (the same flow change as the
 * Engage panel's pick, through storage/itemMutations.ts). Screen-scoped:
 * cleared when the screen unmounts or its tab hides, like every screen
 * message. Asked only right after a Done, about the owner of what was just
 * finished - never on its own.
 */
import {useCallback, useEffect, useRef} from 'react';
import {engageFlowText, nextPromptOf} from '../domain/engageOptions';
import {EngageTodoRef, ownerTitle} from '../domain/engageOwner';
import {ENGAGE_NOTICE, noNextPromptText, promptTodoLabel} from '../domain/engageText';
import {withTaskText} from '../domain/taskEdit';
import {Task} from '../domain/types';
import {getCachedData, getCachedInbox} from '../storage/dataCache';
import {engageInboxOf, engageSourceOf} from '../storage/engageAggregate';
import {mutateEntryTasks} from '../storage/itemMutations';
import {loadSettings} from '../storage/settingsStorage';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import {useOnScreenHide} from './screenActivity';
import {useStatusApi} from './status/StatusProvider';
import {TASK_COLUMN_WIDTH_PX, taskRowLayout} from './taskRowLayout';
import {useActionError} from './useActionError';

let nextInstance = 0;

export interface EngagePrompt {
  /** Call after a todo of `itemPath` was ticked done (with the task as it was, for its tags). */
  afterDone: (itemPath: string, doneTask: Pick<Task, 'tags' | 'fields'>) => void;
}

export function useEngagePrompt(name: string): EngagePrompt {
  const id = useRef(`${name}.engagePrompt.${++nextInstance}`).current;
  const statusApi = useStatusApi();
  const {run} = useActionError(`${name}.engagePromptError`, `${name}: engage prompt pick failed`);
  const clear = useCallback(() => statusApi.clear(id), [statusApi, id]);
  useEffect(() => clear, [clear]);
  useOnScreenHide(clear);

  const pick = useCallback(
    (ref: EngageTodoRef) => {
      clear();
      log('EngagePrompt: pick');
      run(async () => {
        // Plan todos of an owner live in a Project or Area, never in the Inbox.
        await mutateEntryTasks(
          ref,
          tasks => {
            const task = tasks[ref.taskIndex];
            tasks[ref.taskIndex] = withTaskText(task, engageFlowText(task.text, 'next'));
            return tasks;
          },
          {inbox: null, inboxPath: null},
        );
        requestEinkRefresh();
      });
    },
    [clear, run],
  );

  const afterDone = useCallback(
    (itemPath: string, doneTask: Pick<Task, 'tags' | 'fields'>) => {
      (async () => {
        const cache = getCachedData();
        if (!cache) return;
        const settings = await loadSettings();
        const source = engageSourceOf(cache.items, engageInboxOf(cache.paths.inboxFolder, getCachedInbox()), settings.noteSetups);
        const prompt = nextPromptOf(itemPath, doneTask, source, Date.now());
        if (!prompt) return;
        log('EngagePrompt: shown', 'owner=' + prompt.owner.kind, 'candidates=' + prompt.candidates.length);
        statusApi.show(id, {
          kind: 'info',
          text: noNextPromptText(ownerTitle(prompt.owner, source).name),
          actions: [
            ...prompt.candidates.map(ref => ({
              label: promptTodoLabel(taskRowLayout(ref.task, TASK_COLUMN_WIDTH_PX, 'flat').title),
              onPress: () => pick(ref),
            })),
            {label: ENGAGE_NOTICE.promptLater, onPress: clear},
          ],
          onDismiss: clear,
        });
      })().catch(e => logError('EngagePrompt: failed', errorMessage(e)));
    },
    [statusApi, id, pick, clear],
  );

  return {afterDone};
}
