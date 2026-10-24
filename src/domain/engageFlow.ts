/**
 * Which screen the Engage panel shows (docs/dev/history/technical-design-engage.md
 * §3.3). One reducer decides every transition; no screen decides its own
 * successor. Nothing here suggests another owner on its own: the owner
 * changes only through `ownerChosen` (D14). Pure.
 */
import {EngageOwner, EngageTodoKey, MeetingRef, OwnedTodo, sameOwner, sameTodo} from './engageOwner';
import {EngageOptions, FocusRing} from './engageOptions';
import {Task} from './types';

/** How the panel was opened: the sidebar button (from the open note) or "Engage ›" on an owner page. */
export type EngageRequest = {via: 'button'} | {via: 'ownerPage'; owner: EngageOwner};

export type EngageScreen =
  /** S2/S4/S5/S6: the Now box and the Next · Plan tabs (Addendum "Next and Plan tabs"). */
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

/**
 * The options screen's tabs (docs/dev/history/technical-design-meetings-0.21.md
 * R9): From (a thread's "From Thread", a loop's "From Loop", a
 * Project/Area's "From meetings"), Next, Plan, Waiting, Agreements. From,
 * Waiting and Agreements show only while they have rows.
 */
export type EngageTab = 'from' | 'next' | 'plan' | 'waiting' | 'agreements';

/** The tabs that give way to Next/Plan once they list nothing (R14). */
const VANISHING_TABS: readonly EngageTab[] = ['from', 'waiting', 'agreements'];

/**
 * Leaving the panel to a place in gtdpara (docs/dev/history/technical-design-engage-in-context.md
 * §2.9): an owner's overview (a thread's or loop's; an item's Project/Area
 * page), or Review's "Someday / Maybe" filtered to the owner's Someday/Maybe
 * todos (`label` names it, `keys` are their entry keys `<item path>#<index>`).
 */
export type EngageExit =
  | {kind: 'overview'; owner: EngageOwner}
  | {kind: 'someday'; owner: EngageOwner; label: string; keys: string[]};

export interface EngageAck {
  /** Done, Someday, Remove #next, or #next from the Plan tab. */
  kind: 'done' | 'someday' | 'unnext' | 'next';
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
  /** The options screen's tab; null until the first `dataChanged` after opening or choosing an owner picks it. */
  tab: EngageTab | null;
  /** The way back to the stored current todo of another owner (Addendum "Engage follows the note"); one step only. */
  back: OwnedTodo | null;
  /** The meeting whose note page the panel was opened on; it belongs to the note's owner only (E6). */
  pageMeeting: MeetingRef | null;
}

export type EngageEvent =
  | {type: 'open'; owner: EngageOwner | null; current: EngageTodoKey | null; ring: FocusRing; back?: OwnedTodo | null; pageMeeting?: MeetingRef | null}
  | {type: 'picked'; key: EngageTodoKey}
  | {type: 'acted'; ack: EngageAck}
  | {type: 'undone'}
  | {type: 'selectFocus'}
  | {type: 'selectNewFocus'}
  | {type: 'back'}
  | {type: 'ownerChosen'; owner: EngageOwner}
  | {type: 'expandQuickAdd'}
  | {type: 'collapseQuickAdd'}
  | {type: 'selectTab'; tab: EngageTab}
  | {type: 'goBack'}
  /**
   * The cache changed: the owner's options, the effective ring, how many
   * owners today's focus still has, the current todo found again
   * (`resolveTodoKey`; null when it is gone, D7), and how many rows the
   * Next (`engageListsOf`), From, Waiting and Agreements tabs list.
   */
  | {
      type: 'dataChanged';
      options: EngageOptions | null;
      ring: FocusRing;
      dailyLeft: number;
      current: EngageTodoKey | null;
      nextRows: number;
      fromRows: number;
      waitingRows: number;
      agreementRows: number;
    };

export const INITIAL_ENGAGE_STATE: EngageState = {
  owner: null,
  current: null,
  screen: {kind: 'selectFocus', ring: 'daily'},
  ack: null,
  ownerEmpty: false,
  ring: 'daily',
  tab: null,
  back: null,
  pageMeeting: null,
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
        tab: null,
        back: event.back ?? null,
        pageMeeting: event.owner ? event.pageMeeting ?? null : null,
      };
    case 'picked':
      // A todo chosen in this context becomes the stored one: the way back goes.
      return {...state, current: event.key, ack: null, back: null};
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
      return {...state, owner: event.owner, current: null, ack: null, ownerEmpty: false, screen: {kind: 'options'}, tab: null, back: backAfterChoosing(state, event.owner), pageMeeting: null};
    case 'expandQuickAdd':
      return state.owner ? {...state, screen: {kind: 'quickAdd'}} : state;
    case 'collapseQuickAdd':
      return state.screen.kind === 'quickAdd' ? {...state, screen: ownerScreen(state)} : state;
    case 'selectTab':
      return {...state, tab: event.tab};
    case 'goBack':
      if (!state.back) return state;
      return {...state, owner: state.back.owner, current: state.back.key, ack: null, ownerEmpty: false, screen: {kind: 'options'}, tab: null, back: null, pageMeeting: null};
    case 'dataChanged':
      return onDataChanged(state, event);
  }
}

/** Choosing another owner keeps the todo you worked on reachable: the current one, else the way back already offered. */
function backAfterChoosing(state: EngageState, owner: EngageOwner): OwnedTodo | null {
  const back = state.owner && state.current ? {owner: state.owner, key: state.current} : state.back;
  return back && !sameOwner(back.owner, owner) ? back : null;
}

function sameKey(a: EngageTodoKey | null, b: EngageTodoKey | null): boolean {
  return a === b || (sameTodo(a, b) && a!.taskText === b!.taskText);
}

/** The only place the owner-empty and all-done transitions live. */
function onDataChanged(state: EngageState, event: Extract<EngageEvent, {type: 'dataChanged'}>): EngageState {
  const ownerEmpty = event.options?.ownerEmpty ?? false;
  // The same key keeps its object, so a hook that reacts to `current` doesn't run again for nothing.
  const current = sameKey(state.current, event.current) ? state.current : event.current;
  // Next when it lists anything, else Plan; an empty Next always gives way to Plan. Adding #next from Plan doesn't switch.
  const nextOrPlan: EngageTab = event.nextRows > 0 ? 'next' : 'plan';
  const rowsOf: Record<EngageTab, number> = {from: event.fromRows, next: event.nextRows, plan: 0, waiting: event.waitingRows, agreements: event.agreementRows};
  // Opened on a meeting page with From rows: From first (R14); an emptied From, Waiting or Agreements gives way like an empty Next.
  const tab: EngageTab =
    state.tab === null
      ? state.pageMeeting && event.fromRows > 0
        ? 'from'
        : nextOrPlan
      : state.tab === 'next' || (VANISHING_TABS.includes(state.tab) && rowsOf[state.tab] === 0)
        ? nextOrPlan
        : state.tab;
  const next = {...state, ownerEmpty, ring: event.ring, current, tab};
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
