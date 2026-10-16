/**
 * Which screen the Engage panel shows (docs/dev/history/technical-design-engage.md
 * §3.3). One reducer decides every transition; no screen decides its own
 * successor. Nothing here suggests another owner on its own: the owner
 * changes only through `ownerChosen` (D14). Pure.
 */
import {EngageOwner, EngageTodoKey, sameTodo} from './engageOwner';
import {EngageOptions, FocusRing} from './engageOptions';
import {Task} from './types';

export type EngageScreen =
  /** S2/S4/S5/S6: the owner's `#next`, or its plan when no `#next` is left. */
  | {kind: 'options'}
  /** S8: nothing left in the owner. */
  | {kind: 'ownerEmpty'}
  /** S9 / S11. */
  | {kind: 'selectFocus'; ring: FocusRing}
  /** S10: nothing left in today's focus. */
  | {kind: 'focusDone'}
  /** S7: Quick Add opened. */
  | {kind: 'quickAdd'};

/** What Undo writes back: the todo as it was, at the index it was changed at. */
export interface UndoRecord {
  itemPath: string;
  taskIndex: number;
  /** The task before the change. */
  before: Task;
  /** The task's text after the change, checked before Undo writes. */
  afterText: string;
}

export interface EngageAck {
  kind: 'done' | 'someday' | 'unnext';
  /** The todo's title for the ack line. */
  text: string;
  /** The todo acted on. */
  key: EngageTodoKey;
  /** Whether it was the current todo (Undo makes it current again). */
  wasCurrent: boolean;
  undo: UndoRecord;
}

export interface EngageState {
  owner: EngageOwner | null;
  current: EngageTodoKey | null;
  screen: EngageScreen;
  ack: EngageAck | null;
  /** From the last `dataChanged`: the owner has nothing left. */
  ownerEmpty: boolean;
  /** From the last `dataChanged`: today's focus if any, else this week's. */
  ring: FocusRing;
}

export type EngageEvent =
  | {type: 'open'; owner: EngageOwner | null; current: EngageTodoKey | null; ring: FocusRing}
  | {type: 'picked'; key: EngageTodoKey}
  | {type: 'acted'; ack: EngageAck}
  | {type: 'undone'}
  | {type: 'selectFocus'}
  | {type: 'selectNewFocus'}
  | {type: 'back'}
  | {type: 'ownerChosen'; owner: EngageOwner}
  | {type: 'expandQuickAdd'}
  | {type: 'collapseQuickAdd'}
  | {type: 'dataChanged'; options: EngageOptions | null; ring: FocusRing; dailyLeft: number};

export const INITIAL_ENGAGE_STATE: EngageState = {
  owner: null,
  current: null,
  screen: {kind: 'selectFocus', ring: 'daily'},
  ack: null,
  ownerEmpty: false,
  ring: 'daily',
};

/** The owner's own screen: its options, or S8 when it is empty. */
function ownerScreen(state: EngageState): EngageScreen {
  return state.ownerEmpty ? {kind: 'ownerEmpty'} : {kind: 'options'};
}

export function engageFlow(state: EngageState, event: EngageEvent): EngageState {
  switch (event.type) {
    case 'open':
      return {
        owner: event.owner,
        current: event.current,
        screen: event.owner ? {kind: 'options'} : {kind: 'selectFocus', ring: event.ring},
        ack: null,
        ownerEmpty: false,
        ring: event.ring,
      };
    case 'picked':
      return {...state, current: event.key, ack: null};
    case 'acted':
      return {...state, ack: event.ack, current: sameTodo(state.current, event.ack.key) ? null : state.current};
    case 'undone':
      if (!state.ack) return state;
      return {...state, current: state.ack.wasCurrent ? state.ack.key : state.current, ack: null};
    case 'selectFocus':
      return {...state, screen: {kind: 'selectFocus', ring: state.ring}};
    case 'selectNewFocus':
      return {...state, screen: {kind: 'selectFocus', ring: 'weekly'}};
    case 'back':
      return state.owner ? {...state, screen: ownerScreen(state)} : state;
    case 'ownerChosen':
      return {...state, owner: event.owner, current: null, ack: null, ownerEmpty: false, screen: {kind: 'options'}};
    case 'expandQuickAdd':
      return state.owner ? {...state, screen: {kind: 'quickAdd'}} : state;
    case 'collapseQuickAdd':
      return state.screen.kind === 'quickAdd' ? {...state, screen: ownerScreen(state)} : state;
    case 'dataChanged':
      return onDataChanged(state, event);
  }
}

/** The only place the owner-empty and all-done transitions live. */
function onDataChanged(state: EngageState, event: Extract<EngageEvent, {type: 'dataChanged'}>): EngageState {
  const ownerEmpty = event.options?.ownerEmpty ?? false;
  const next = {...state, ownerEmpty, ring: event.ring};
  const focusDone = event.ring === 'daily' && event.dailyLeft === 0;
  switch (state.screen.kind) {
    case 'options':
      if (!ownerEmpty) return next;
      return {...next, screen: focusDone ? {kind: 'focusDone'} : {kind: 'ownerEmpty'}};
    case 'ownerEmpty':
      if (!ownerEmpty) return {...next, screen: {kind: 'options'}};
      return focusDone ? {...next, screen: {kind: 'focusDone'}} : next;
    case 'selectFocus':
      return state.screen.ring === 'daily' && focusDone ? {...next, screen: {kind: 'focusDone'}} : next;
    case 'focusDone':
    case 'quickAdd':
      return next;
  }
}
