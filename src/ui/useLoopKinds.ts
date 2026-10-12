/** The loop kinds of the current Tag Rules (storage/loopKinds.ts), re-rendering when they change. */
import {useSyncExternalStore} from 'react';
import {getLoopKinds, LoopKindsState, subscribeLoopKinds} from '../storage/loopKinds';

export function useLoopKinds(): LoopKindsState {
  return useSyncExternalStore(subscribeLoopKinds, getLoopKinds);
}
