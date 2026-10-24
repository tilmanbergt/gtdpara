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
const options = (ownerEmpty: boolean): EngageOptions => ({next: [], plan: [], from: [], waiting: [], agreements: [], alsoHere: {someday: 0}, nextMeeting: null, ownerEmpty});
const data = (ownerEmpty: boolean, dailyLeft = 2, ring: 'daily' | 'weekly' = 'daily'): EngageEvent => ({
  type: 'dataChanged',
  options: options(ownerEmpty),
  ring,
  dailyLeft,
  current: KEY,
  nextRows: 1,
  fromRows: 0,
  waitingRows: 0,
  agreementRows: 0,
});

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
  it('dataChanged takes the current todo as found again, or drops it', () => {
    const moved = {...KEY, taskIndex: 5};
    expect(engageFlow(state(S.options), {...(data(false) as Extract<EngageEvent, {type: 'dataChanged'}>), current: moved}).current).toEqual(moved);
    expect(engageFlow(state(S.options), {...(data(false) as Extract<EngageEvent, {type: 'dataChanged'}>), current: null}).current).toBeNull();
    const from = state(S.options);
    expect(engageFlow(from, {...(data(false) as Extract<EngageEvent, {type: 'dataChanged'}>), current: {...KEY}}).current).toBe(from.current);
  });
  it('tabs: Next when it lists anything, else Plan; an empty Next gives way to Plan; #next from Plan does not switch', () => {
    const changed = (from: EngageState, nextRows: number) =>
      engageFlow(from, {...(data(false) as Extract<EngageEvent, {type: 'dataChanged'}>), nextRows}).tab;
    const opened = engageFlow(state(S.daily), {type: 'open', owner: OWNER, current: null, ring: 'daily'});
    expect(opened.tab).toBeNull();
    expect(changed(opened, 2)).toBe('next');
    expect(changed(opened, 0)).toBe('plan');
    expect(changed(state(S.options, {tab: 'next'}), 0)).toBe('plan');
    expect(changed(state(S.options, {tab: 'plan'}), 3)).toBe('plan');
    expect(engageFlow(state(S.options, {tab: 'plan'}), {type: 'selectTab', tab: 'next'}).tab).toBe('next');
    expect(engageFlow(state(S.options, {tab: 'plan'}), {type: 'ownerChosen', owner: OTHER}).tab).toBeNull();
  });
  it('the way back: kept from open, offered after choosing another owner, gone after a pick, taken by goBack', () => {
    const back = {owner: OTHER, key: {...KEY, itemPath: '/b'}};
    const opened = engageFlow(state(S.options), {type: 'open', owner: OWNER, current: null, ring: 'daily', back});
    expect(opened.back).toEqual(back);
    expect(engageFlow(opened, {type: 'picked', key: KEY}).back).toBeNull();
    const returned = engageFlow(opened, {type: 'goBack'});
    expect(returned).toMatchObject({owner: OTHER, current: back.key, back: null, tab: null, screen: S.options});
    // Choosing another owner from the focus list offers the todo worked on before.
    const chosen = engageFlow(state(S.daily, {current: KEY}), {type: 'ownerChosen', owner: OTHER});
    expect(chosen.back).toEqual({owner: OWNER, key: KEY});
    // The way back already offered stays, unless it is the owner chosen now.
    expect(engageFlow(state(S.daily, {back, current: null}), {type: 'ownerChosen', owner: OTHER}).back).toBeNull();
    expect(engageFlow(state(S.daily, {back, current: null}), {type: 'ownerChosen', owner: {kind: 'item', itemPath: '/c'}}).back).toEqual(back);
    expect(engageFlow(state(S.options), {type: 'goBack'})).toEqual(state(S.options));
  });
  describe('tab rule (docs/dev/history/technical-design-meetings-0.21.md R14)', () => {
    const page = {itemPath: '/a', meetingIndex: 2};
    type Rows = {nextRows?: number; fromRows?: number; waitingRows?: number; agreementRows?: number};
    const changed = (from: EngageState, counts: Rows) => engageFlow(from, {...(data(false) as Extract<EngageEvent, {type: 'dataChanged'}>), ...counts}).tab;
    const onPage = engageFlow(state(S.daily), {type: 'open', owner: OWNER, current: null, ring: 'daily', pageMeeting: page});
    const elsewhere = engageFlow(state(S.daily), {type: 'open', owner: OWNER, current: null, ring: 'daily'});

    it.each([
      ['on a meeting page with From rows', onPage, {fromRows: 2}, 'from'],
      ['on a meeting page without From rows, Next has rows', onPage, {fromRows: 0, nextRows: 1}, 'next'],
      ['on a meeting page, nothing in From or Next', onPage, {fromRows: 0, nextRows: 0}, 'plan'],
      ['off a meeting page, even with From rows', elsewhere, {fromRows: 2, nextRows: 1}, 'next'],
      ['off a meeting page, From rows, no Next', elsewhere, {fromRows: 2, nextRows: 0}, 'plan'],
    ] as const)('first data %s → %s', (_label, from, counts, tab) => {
      expect(changed(from, counts)).toBe(tab);
    });

    it.each([
      ['from', {fromRows: 0, nextRows: 1}, 'next'],
      ['from', {fromRows: 0, nextRows: 0}, 'plan'],
      ['from', {fromRows: 1}, 'from'],
      ['waiting', {waitingRows: 0, nextRows: 1}, 'next'],
      ['waiting', {waitingRows: 2}, 'waiting'],
      ['agreements', {agreementRows: 0, nextRows: 0}, 'plan'],
      ['agreements', {agreementRows: 1}, 'agreements'],
      ['next', {nextRows: 0}, 'plan'],
      ['plan', {nextRows: 3}, 'plan'],
    ] as const)('selected %s with %j → %s', (selected, counts, tab) => {
      expect(changed(state(S.options, {tab: selected}), counts)).toBe(tab);
    });

    it('a tab is selected by tapping it', () => {
      for (const tab of ['from', 'waiting', 'agreements'] as const) {
        expect(engageFlow(state(S.options, {tab: 'next'}), {type: 'selectTab', tab}).tab).toBe(tab);
      }
    });
  });
  it('the page meeting belongs to the note owner: ownerChosen and goBack clear it; no owner, no page meeting', () => {
    const page = {itemPath: '/a', meetingIndex: 2};
    const back = {owner: OTHER, key: {...KEY, itemPath: '/b'}};
    const opened = engageFlow(state(S.daily), {type: 'open', owner: OWNER, current: null, ring: 'daily', back, pageMeeting: page});
    expect(engageFlow(opened, {type: 'ownerChosen', owner: OTHER}).pageMeeting).toBeNull();
    expect(engageFlow(opened, {type: 'goBack'}).pageMeeting).toBeNull();
    expect(engageFlow(opened, {type: 'picked', key: KEY}).pageMeeting).toEqual(page);
    expect(engageFlow(state(S.daily), {type: 'open', owner: null, current: null, ring: 'daily', pageMeeting: page}).pageMeeting).toBeNull();
  });
  it('undone without an ack is a no-op', () => {
    const s = state(S.options);
    expect(engageFlow(s, {type: 'undone'})).toBe(s);
  });
});
