// docs/dev/history/technical-design-engage.md §3.3: every event from every screen.
import {EngageAck, EngageEvent, EngageScreen, engageFlow, EngageState, INITIAL_ENGAGE_STATE} from '../../src/domain/engageFlow';
import {EngageOptions} from '../../src/domain/engageOptions';
import {task} from '../../test-helpers/fixtures';

const OWNER = {kind: 'item' as const, itemPath: '/a'};
const OTHER = {kind: 'loop' as const, itemPath: '/b', tag: 'proj/x'};
const KEY = {itemPath: '/a', taskText: 'Brief #next', taskIndex: 1};
const ack = (wasCurrent: boolean): EngageAck => ({
  kind: 'done',
  text: 'Brief',
  key: KEY,
  wasCurrent,
  undo: {itemPath: '/a', taskIndex: 1, before: task('Brief #next'), afterText: 'Brief #next'},
});
const options = (ownerEmpty: boolean): EngageOptions => ({next: [], plan: [], ownerEmpty});
const data = (ownerEmpty: boolean, dailyLeft = 2, ring: 'daily' | 'weekly' = 'daily'): EngageEvent => ({type: 'dataChanged', options: options(ownerEmpty), ring, dailyLeft});

const S = {
  options: {kind: 'options'},
  ownerEmpty: {kind: 'ownerEmpty'},
  daily: {kind: 'selectFocus', ring: 'daily'},
  weekly: {kind: 'selectFocus', ring: 'weekly'},
  focusDone: {kind: 'focusDone'},
  quickAdd: {kind: 'quickAdd'},
} satisfies Record<string, EngageScreen>;

const state = (screen: EngageScreen, extra: Partial<EngageState> = {}): EngageState => ({
  ...INITIAL_ENGAGE_STATE,
  owner: OWNER,
  current: KEY,
  ownerEmpty: screen.kind === 'ownerEmpty',
  screen,
  ...extra,
});

type Row = [name: string, from: EngageState, event: EngageEvent, screen: EngageScreen];
const rows: Row[] = [
  ['open with an owner → its options', state(S.daily, {owner: null}), {type: 'open', owner: OWNER, current: null, ring: 'daily'}, S.options],
  ['open without an owner → today\'s focus', state(S.options), {type: 'open', owner: null, current: null, ring: 'daily'}, S.daily],
  ['open without an owner, no daily focus → the week\'s', state(S.options), {type: 'open', owner: null, current: null, ring: 'weekly'}, S.weekly],
  ['owner ran empty → S8', state(S.options), data(true), S.ownerEmpty],
  ['owner ran empty and today\'s focus is done → S10', state(S.options), data(true, 0), S.focusDone],
  ['owner ran empty, no daily focus → S8', state(S.options), data(true, 0, 'weekly'), S.ownerEmpty],
  ['owner still has options → stays', state(S.options), data(false, 0), S.options],
  ['S8 gets a todo again → options', state(S.ownerEmpty), data(false), S.options],
  ['S8 and today\'s focus done → S10', state(S.ownerEmpty), data(true, 0), S.focusDone],
  ['S8 stays S8 while focus is left', state(S.ownerEmpty), data(true, 3), S.ownerEmpty],
  ['S9 with nothing left today → S10', state(S.daily), data(true, 0), S.focusDone],
  ['S11 stays when today is done', state(S.weekly), data(true, 0), S.weekly],
  ['S10 stays', state(S.focusDone), data(false, 3), S.focusDone],
  ['Quick Add stays open on data', state(S.quickAdd), data(true, 0), S.quickAdd],
  ['Select next focus → the effective ring', state(S.ownerEmpty, {ring: 'weekly'}), {type: 'selectFocus'}, S.weekly],
  ['Select new focus → the week', state(S.focusDone), {type: 'selectNewFocus'}, S.weekly],
  ['back from S9 → the owner\'s options', state(S.daily), {type: 'back'}, S.options],
  ['back from S9 → S8 when the owner is empty', state(S.daily, {ownerEmpty: true}), {type: 'back'}, S.ownerEmpty],
  ['back without an owner stays', state(S.daily, {owner: null}), {type: 'back'}, S.daily],
  ['an owner chosen → its options', state(S.daily), {type: 'ownerChosen', owner: OTHER}, S.options],
  ['expand Quick Add', state(S.options), {type: 'expandQuickAdd'}, S.quickAdd],
  ['expand Quick Add without an owner does nothing', state(S.daily, {owner: null}), {type: 'expandQuickAdd'}, S.daily],
  ['collapse Quick Add → options', state(S.quickAdd), {type: 'collapseQuickAdd'}, S.options],
  ['collapse Quick Add → S8 when empty', state(S.quickAdd, {ownerEmpty: true}), {type: 'collapseQuickAdd'}, S.ownerEmpty],
  ['collapse outside Quick Add does nothing', state(S.options), {type: 'collapseQuickAdd'}, S.options],
  ['picked keeps the screen', state(S.options), {type: 'picked', key: KEY}, S.options],
  ['acted keeps the screen', state(S.options), {type: 'acted', ack: ack(true)}, S.options],
  ['undone keeps the screen', state(S.options, {ack: ack(true)}), {type: 'undone'}, S.options],
];

describe('engageFlow screens', () => {
  it.each(rows)('%s', (_name, from, event, screen) => {
    expect(engageFlow(from, event).screen).toEqual(screen);
  });
});

describe('engageFlow state', () => {
  it('open resets ack and sets the current todo', () => {
    const next = engageFlow(state(S.options, {ack: ack(false)}), {type: 'open', owner: OWNER, current: KEY, ring: 'daily'});
    expect(next).toMatchObject({owner: OWNER, current: KEY, ack: null});
  });
  it('acting on the current todo clears it; Undo brings it back', () => {
    const acted = engageFlow(state(S.options), {type: 'acted', ack: ack(true)});
    expect(acted.current).toBeNull();
    expect(acted.ack?.kind).toBe('done');
    const undone = engageFlow(acted, {type: 'undone'});
    expect(undone.current).toEqual(KEY);
    expect(undone.ack).toBeNull();
  });
  it('acting on another todo keeps the current one', () => {
    const other = {...ack(false), key: {...KEY, taskIndex: 4}};
    expect(engageFlow(state(S.options), {type: 'acted', ack: other}).current).toEqual(KEY);
  });
  it('picked makes a todo current and drops the ack', () => {
    const key = {itemPath: '/a', taskText: 'Other', taskIndex: 3};
    expect(engageFlow(state(S.options, {ack: ack(false)}), {type: 'picked', key})).toMatchObject({current: key, ack: null});
  });
  it('the owner changes only through ownerChosen', () => {
    const events: EngageEvent[] = [data(true, 0), {type: 'selectFocus'}, {type: 'selectNewFocus'}, {type: 'back'}, {type: 'expandQuickAdd'}, {type: 'undone'}];
    for (const event of events) expect(engageFlow(state(S.options), event).owner).toEqual(OWNER);
    expect(engageFlow(state(S.daily), {type: 'ownerChosen', owner: OTHER})).toMatchObject({owner: OTHER, current: null, ack: null});
  });
  it('undone without an ack is a no-op', () => {
    const s = state(S.options);
    expect(engageFlow(s, {type: 'undone'})).toBe(s);
  });
});
