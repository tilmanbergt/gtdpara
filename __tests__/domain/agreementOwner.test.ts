// docs/dev/history/technical-design-meetings-0.21.md R18, R19, §2.2: which agreements an owner holds,
// where a new one is written, and the meeting it was made in.
import {agreementMadeIn, agreementTargetPath, lensAgreements, ownerAgreements} from '../../src/domain/agreementOwner';
import {Agreement, buildAgreement, endedAgreement} from '../../src/domain/agreements';
import {EngageSource} from '../../src/domain/engageOwner';
import {LoopLine} from '../../src/domain/loopsSection';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {threadLensContext} from '../../src/domain/threadLens';
import {Meeting} from '../../src/domain/types';
import {item, meeting} from '../../test-helpers/fixtures';

const TODAY = '2026-10-24';
const INBOX = '/Note/2 Areas/0 Inbox';
const a = (text: string, meetingField: string | null = null): Agreement => buildAgreement(text, {today: TODAY, valid: null, meeting: meetingField});
const m = (date: string, title: string, extra: Partial<Meeting> = {}): Meeting => meeting(date, title, {...deriveMeetingFields(title), ...extra});
const loopLine = (tag: string, status: LoopLine['status'] = 'active'): LoopLine => ({tag, status, mainDate: null, linkedFile: null, extraColumns: [], raw: null});
const texts = (refs: Array<{agreement: Agreement}>) => refs.map(r => r.agreement.text);

const spar = m('2026-10-14', 'Sparring Mieke #sparring/mieke', {time: '10:00', endTime: '11:00'});
const coaching = item('area', 'Coaching', {
  meetings: [spar],
  loops: [loopLine('proj/offsite'), loopLine('proj/old', 'done')],
  agreements: [
    a('Feedback in 1:1s #sparring/mieke', meetingKey(spar)), // 0 thread
    a('Leaf only #mieke'), // 1 counterpart leaf
    a('Other person #sparring/sven'), // 2 another thread
    a('Venue booked early #proj/offsite'), // 3 loop
    a('Plain area rule'), // 4 item
    endedAgreement(a('Old #sparring/mieke'), TODAY), // 5 ended
    a('Old loop rule #proj/old'), // 6 closed loop: the item's
    a('Wf note #wf/mieke'), // 7 counterpart type only
  ],
});
const leadership = item('project', 'Leadership program', {
  area: 'Coaching',
  agreements: [a('Untagged project rule'), a('Project thread rule #sparring/mieke')],
});
const solo = item('project', 'Solo', {agreements: [a('Solo #sparring/mieke')]});
const source: EngageSource = {
  items: [coaching, leadership, solo],
  inbox: {path: INBOX, tasks: [], meetings: [m(TODAY, 'Dentist')]},
  loopKinds: ['proj'],
  threadTypes: ['sparring'],
};
const mieke = {kind: 'thread' as const, scopeOwnerPath: coaching.path, tag: 'sparring/mieke'};

describe('ownerAgreements (R19)', () => {
  it('thread: its scope, thread tag or plain leaf, active only', () => {
    expect(texts(ownerAgreements(mieke, source))).toEqual(['Feedback in 1:1s #sparring/mieke', 'Leaf only #mieke', 'Project thread rule #sparring/mieke']);
  });

  it('loop: its item, tagged with the loop', () => {
    expect(texts(ownerAgreements({kind: 'loop', itemPath: coaching.path, tag: 'proj/offsite'}, source))).toEqual(['Venue booked early #proj/offsite']);
  });

  it('Area: own file, no active loop, no thread', () => {
    expect(texts(ownerAgreements({kind: 'item', itemPath: coaching.path}, source))).toEqual(['Leaf only #mieke', 'Plain area rule', 'Old loop rule #proj/old', 'Wf note #wf/mieke']);
  });

  it('Project: its own file only (scenario 13)', () => {
    expect(texts(ownerAgreements({kind: 'item', itemPath: leadership.path}, source))).toEqual(['Untagged project rule']);
  });

  it('refs carry the index into the full array', () => {
    const refs = ownerAgreements(mieke, source);
    expect(refs.map(r => [r.itemPath, r.index])).toEqual([[coaching.path, 0], [coaching.path, 1], [leadership.path, 1]]);
  });

  it('an unknown owner holds none', () => {
    expect(ownerAgreements({kind: 'item', itemPath: '/nope'}, source)).toEqual([]);
  });
});

describe('lensAgreements', () => {
  const lensSources = source.items.map(i => ({ref: {kind: i.kind, name: i.name, path: i.path, abbrev: null}, tasks: i.tasks, meetings: i.meetings}));

  it('thread lens: active and ended, the other thread left out (scenario 12)', () => {
    const ctx = threadLensContext(source.items, lensSources, INBOX, 'sparring/mieke', 'thread', coaching.path)!;
    const {active, ended} = lensAgreements(ctx, source.items);
    expect(texts(active)).toEqual(['Feedback in 1:1s #sparring/mieke', 'Leaf only #mieke', 'Project thread rule #sparring/mieke']);
    expect(texts(ended)).toEqual(['Old #sparring/mieke']);
  });

  it('counterpart lens: any type used with the counterpart', () => {
    const ctx = threadLensContext(source.items, lensSources, INBOX, 'sparring/mieke', 'counterpart', coaching.path)!;
    expect(texts(lensAgreements(ctx, source.items).active)).toEqual(['Feedback in 1:1s #sparring/mieke', 'Leaf only #mieke', 'Project thread rule #sparring/mieke']);
  });

  it('a Project without an Area is its own scope', () => {
    const ctx = threadLensContext(source.items, lensSources, INBOX, 'sparring/mieke', 'thread', solo.path)!;
    expect(texts(lensAgreements(ctx, source.items).active)).toEqual(['Solo #sparring/mieke']);
  });
});

describe('agreementTargetPath (R18)', () => {
  it('thread → the scope owner\'s file', () => {
    expect(agreementTargetPath(mieke, source)).toBe(coaching.path);
    expect(agreementTargetPath({kind: 'thread', scopeOwnerPath: leadership.path, tag: 'sparring/mieke'}, source)).toBe(coaching.path);
    expect(agreementTargetPath({kind: 'thread', scopeOwnerPath: solo.path, tag: 'sparring/mieke'}, source)).toBe(solo.path);
  });

  it('loop and item → their own file', () => {
    expect(agreementTargetPath({kind: 'loop', itemPath: coaching.path, tag: 'proj/offsite'}, source)).toBe(coaching.path);
    expect(agreementTargetPath({kind: 'item', itemPath: leadership.path}, source)).toBe(leadership.path);
  });

  it('never the Inbox, never an unknown file (scenario 18)', () => {
    expect(agreementTargetPath({kind: 'item', itemPath: INBOX}, source)).toBeNull();
    expect(agreementTargetPath({kind: 'item', itemPath: '/nope'}, source)).toBeNull();
  });
});

describe('agreementMadeIn', () => {
  it('resolves the meeting field like a todo\'s provenance', () => {
    expect(agreementMadeIn({itemPath: coaching.path, index: 0, agreement: coaching.agreements[0]}, source)).toEqual({itemPath: coaching.path, meetingIndex: 0});
  });

  it('null without a field or when it does not resolve', () => {
    expect(agreementMadeIn({itemPath: coaching.path, index: 1, agreement: coaching.agreements[1]}, source)).toBeNull();
    expect(agreementMadeIn({itemPath: coaching.path, index: 9, agreement: a('x', '2020-01-01 Gone')}, source)).toBeNull();
  });
});
