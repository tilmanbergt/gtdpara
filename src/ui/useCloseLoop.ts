/**
 * "Close loop" (docs/dev/history/technical-design-loops.md §4.9), from the
 * loop overview and the Review's "Open loops" step: while the loop has an
 * open todo or a meeting ahead, the status slot says what is open and offers
 * "Show" (the loop overview); otherwise it asks Done or Dropped, then
 * storage/loops.ts's `setLoopStatus` writes it. Closing the screen, or hiding
 * its tab, drops the question.
 */
import {useCallback, useEffect, useRef} from 'react';
import {closeBlockedText, closeBlockers} from '../domain/loops';
import {LoopStatus} from '../domain/loopsSection';
import {findCachedItem} from '../storage/dataCache';
import {setLoopStatus} from '../storage/loops';
import {openOverview} from './overviewStore';
import {useOnScreenHide} from './screenActivity';
import {useStatusApi} from './status/StatusProvider';
import {useActionError} from './useActionError';

let nextInstance = 0;

/** `close(ownerPath, tag, onClosed?)`; `onClosed` runs after the line was written. */
export function useCloseLoop(name: string): (ownerPath: string, tag: string, onClosed?: (status: LoopStatus) => void) => void {
  const id = useRef(`${name}.closeLoop.${++nextInstance}`).current;
  const statusApi = useStatusApi();
  const {run} = useActionError(`${name}.closeLoopError`, `${name}: closing a loop failed`);
  const clear = useCallback(() => statusApi.clear(id), [statusApi, id]);
  useEffect(() => clear, [clear]);
  useOnScreenHide(clear);

  return useCallback(
    (ownerPath: string, tag: string, onClosed?: (status: LoopStatus) => void) => {
      const item = findCachedItem(ownerPath);
      if (!item) return;
      const blockers = closeBlockers(item, tag, Date.now());
      const open = blockers.openTodos.length + blockers.upcomingMeetings.length;
      if (open > 0) {
        statusApi.show(id, {
          kind: 'warning',
          text: closeBlockedText(blockers.openTodos.length, blockers.upcomingMeetings.length),
          actions: [
            {
              label: 'Show',
              onPress: () => {
                clear();
                openOverview({tag, ownerPath});
              },
            },
          ],
          onDismiss: clear,
        });
        return;
      }
      const apply = (status: LoopStatus) => {
        clear();
        run(async () => {
          await setLoopStatus(ownerPath, tag, status);
          onClosed?.(status);
        });
      };
      statusApi.show(id, {
        kind: 'confirm',
        text: `Close loop ${tag}?`,
        detail: 'Done: it reached its end. Dropped: it stops here. Its note and todos stay where they are.',
        actions: [
          {label: 'Done', primary: true, onPress: () => apply('done')},
          {label: 'Dropped', onPress: () => apply('dropped')},
        ],
        onCancel: clear,
      });
    },
    [statusApi, id, clear, run],
  );
}
