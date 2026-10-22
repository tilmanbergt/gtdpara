/** The item cards' models (docs/dev/history/technical-design-item-card.md K8, K9, §6). */
import {meetingCardModel, MeetingCardInput, meetingPhase, originOfKey, todoCardModel, TodoCardInput} from '../../src/domain/itemCard';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {createNoteSetup, NoteSetupConfig} from '../../src/domain/noteSetups';
import {Meeting} from '../../src/domain/types';
import {meeting, task} from '../../test-helpers/fixtures';

// Wed 21.10.2026, noon.
const nowMs = new Date(2026, 9, 21, 12, 0).getTime();
const sparring = {...createNoteSetup('1', 'thread'), name: 'Sparring', tags: ['sparring'], tracking: {trackPrep: true, trackReview: true}};
const reviewOnly = {...sparring, tracking: {trackPrep: false, trackReview: true}};
const config = (setup = sparring): NoteSetupConfig => ({setups: [setup], defaults: {pages: {}, tracking: {trackPrep: false, trackReview: false}, notebook: null}});

const m = (date: string, title: string, extra: Partial<Meeting> = {}) => meeting(date, title, {time: '10:00', endTime: '11:00', ...deriveMeetingFields(title), ...extra});
const ahead = m('2026-10-23', 'Sparring #sparring/mieke');
const todayLater = m('2026-10-21', 'Sparring #sparring/mieke', {time: '15:00', endTime: '16:00'});
const over = m('2026-10-18', 'Sparring #sparring/mieke');

const model = (mtg: Meeting, extra: Partial<MeetingCardInput> = {}) =>
  meetingCardModel({meeting: mtg, setups: config(), nowMs, reflection: 'none', ownerName: 'Coaching', canLink: false, canRefile: false, ...extra});

describe('meetingPhase', () => {
  it('is before, today, over or cancelled (cancelled wins)', () => {
    expect(meetingPhase(ahead, nowMs)).toBe('before');
    expect(meetingPhase(todayLater, nowMs)).toBe('today');
    expect(meetingPhase(over, nowMs)).toBe('over');
    expect(meetingPhase({...over, cancelled: true}, nowMs)).toBe('cancelled');
  });
});

describe('meetingCardModel', () => {
  it('R1: heading by phase and the thread link from the nested tag', () => {
    expect(model(ahead).heading).toBe('Meeting · ahead');
    expect(model(todayLater).heading).toBe('Meeting · today');
    expect(model(over).heading).toBe('Meeting · over');
    expect(model({...over, cancelled: true}).heading).toBe('Meeting · cancelled');
    expect(model(ahead).thread).toEqual({tag: 'sparring/mieke', label: '#sparring/mieke ›'});
    expect(model(m('2026-10-23', 'Plain #team')).thread).toBeNull();
  });

  it('R2: the title without state tags, and when (today without a date)', () => {
    const ticked = m('2026-10-18', 'Sparring #sparring/mieke #reviewed #monthly');
    expect(model(ticked).title).toBe('Sparring #sparring/mieke');
    expect(model(todayLater).when).toBe('today 15:00-16:00');
    expect(model(ahead).when).toMatch(/23\.10\. 10:00-11:00$/);
  });

  it('R3: P before, R after, only when the setup tracks that phase', () => {
    expect(model(ahead).checkpoint).toEqual({kind: 'prep', done: false, label: 'P'});
    expect(model(over).checkpoint).toEqual({kind: 'review', done: false, label: 'R'});
    expect(model(m('2026-10-18', 'Sparring #sparring/mieke #reviewed')).checkpoint?.done).toBe(true);
    expect(model(ahead, {setups: config(reviewOnly)}).checkpoint).toBeNull();
    expect(model({...over, cancelled: true}).checkpoint).toBeNull();
  });

  it('R3: M, note, and Reflect only once over and not cancelled', () => {
    expect(model(m('2026-10-23', 'Board #monthly')).monthly).toBe(true);
    expect(model(ahead).monthly).toBe(false);
    expect(model(ahead).note).toBe('create');
    expect(model({...ahead, notePath: 'Meetings/x.note'}).note).toBe('open');
    expect(model(ahead).reflection).toBeNull();
    expect(model(over).reflection).toBe('none');
    expect(model(over, {reflection: 'exists'}).reflection).toBe('exists');
    expect(model(over, {reflection: 'unknown'}).reflection).toBe('unknown');
    expect(model({...over, cancelled: true}).reflection).toBeNull();
  });

  it('R3: the linked file, +clip where the screen can link, else nothing', () => {
    expect(model({...ahead, linkedFile: 'Resources/Docs/brief.pdf'}).file).toEqual({kind: 'linked', path: 'Resources/Docs/brief.pdf', name: 'brief.pdf'});
    expect(model(ahead, {canLink: true}).file).toEqual({kind: 'link'});
    expect(model(ahead).file).toBeNull();
  });

  it('R4: the area chip refiles only where the screen can; Cancel meeting unless cancelled', () => {
    expect(model(ahead).owner).toEqual({name: 'Coaching', canRefile: false});
    expect(model(ahead, {canRefile: true, ownerName: 'Inbox'}).owner).toEqual({name: 'Inbox', canRefile: true});
    expect(model(ahead).canCancel).toBe(true);
    expect(model({...ahead, cancelled: true}).canCancel).toBe(false);
  });
});

describe('todoCardModel', () => {
  const today = '2026-10-21';
  const todo = (text: string, extra: Parameters<typeof task>[1] = {}, input: Partial<TodoCardInput> = {}) =>
    todoCardModel({task: task(text, extra), today, ownerName: 'Garden renovation', canLink: false, canRefile: false, ...input});

  it('R1: done or deleted first, then the due date, then the flow state', () => {
    expect(todo('Order soil #next', {done: true}).heading).toBe('Todo · done');
    expect(todo('Order soil', {cancelled: true}).heading).toBe('Todo · deleted');
    expect(todo('Order soil #next', {dueDate: '2026-10-24'}).heading).toBe('Todo · due 24.10.');
    expect(todo('Order soil', {dueDate: '2026-10-21'}).heading).toBe('Todo · due today');
    expect(todo('Order soil', {dueDate: '2026-10-19'}).heading).toBe('Todo · overdue 19.10.');
    expect(todo('Quote #wf/marco').heading).toBe('Todo · waiting for Marco');
    expect(todo('Quote #someday').heading).toBe('Todo · someday');
    expect(todo('Quote').heading).toBe('Todo · open');
  });

  it('R1: the meeting it was agreed in, linking to its thread when the key has one', () => {
    const agreed = todo('Send the canvas', {fields: {...task('x').fields, meeting: '2026-10-14 Sparring Mieke sparring/mieke'}});
    expect(agreed.origin).toEqual({label: '↳ Sparring Mieke ›', threadTag: 'sparring/mieke'});
    const plain = todo('Send the canvas', {fields: {...task('x').fields, meeting: '2026-10-14 Team sync'}});
    expect(plain.origin).toEqual({label: '↳ Team sync', threadTag: null});
    expect(todo('Send the canvas').origin).toBeNull();
    expect(originOfKey('')).toBeNull();
  });

  it('R2: the title without the tags the labels show, then the labels', () => {
    const card = todo('Order soil #next #garden', {dueDate: '2026-10-24'});
    expect(card.title).toBe('Order soil #garden');
    expect(card.labels).toEqual(['#next', '#due 24.10.']);
  });

  it('R3: done, flow state, Now only with Next, note', () => {
    expect(todo('Order soil #next').nowOffered).toBe(true);
    expect(todo('Order soil #next #now').now).toBe(true);
    expect(todo('Order soil #someday').nowOffered).toBe(false);
    expect(todo('Order soil #maybe').flowState).toBe('maybe');
    expect(todo('Order soil').note).toBe('create');
    expect(todo('Order soil', {notePath: 'Todos/x.note'}).note).toBe('open');
  });

  it('R4: refile, file or +clip by screen; delete unless deleted', () => {
    expect(todo('Order soil', {}, {canRefile: true}).owner).toEqual({name: 'Garden renovation', canRefile: true});
    expect(todo('Order soil', {linkedFile: 'Resources/plan.pdf'}).file).toEqual({kind: 'linked', path: 'Resources/plan.pdf', name: 'plan.pdf'});
    expect(todo('Order soil', {}, {canLink: true}).file).toEqual({kind: 'link'});
    expect(todo('Order soil').file).toBeNull();
    expect(todo('Order soil').canDelete).toBe(true);
    expect(todo('Order soil', {cancelled: true}).canDelete).toBe(false);
  });
});
