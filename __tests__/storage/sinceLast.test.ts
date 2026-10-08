/** The "Since last time" piece (docs/dev/history/technical-design-tending-threads.md §3.11, D10). */
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {renderSinceLast, SINCE_LAST_BLOCK_LINES} from '../../src/domain/sinceLastText';
import {renderPieceText} from '../../src/domain/tagRules';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {Meeting, Task} from '../../src/domain/types';
import {buildSinceLast} from '../../src/storage/sinceLast';
import {item, meeting, task} from '../../test-helpers/fixtures';

const NOW = new Date(2026, 9, 8, 9, 0, 0);
const TODAY = '2026-10-08';

function m(date: string, title: string, extra: Partial<Meeting> = {}): Meeting {
  return meeting(date, title, {...deriveMeetingFields(title), time: '10:00', endTime: '11:00', ...extra});
}
function withFields(text: string, fields: Partial<Task['fields']>, extra: Partial<Task> = {}): Task {
  return task(text, {fields: {...emptyTaskFields(), ...fields}, ...extra});
}

const first = m('2026-09-23', 'Retro #retro/alpha');
const previous = m('2026-09-30', 'Retro #retro/alpha');
const current = m('2026-10-08', 'Retro #retro/alpha');
const area = item('area', 'Coaching', {
  meetings: [first, previous, current, m('2026-10-01', 'Retro #retro/beta')],
  tasks: [
    withFields('Send minutes #retro/alpha', {meeting: meetingKey(previous)}),
    withFields('Book room', {meeting: meetingKey(previous), completion: '2026-10-01'}, {done: true}),
    withFields('Agreed and waiting #wf', {meeting: meetingKey(previous)}),
    withFields('Old promise', {meeting: meetingKey(first)}),
    task('Signed offer #wf/alpha'),
    task('Raise budget #alpha'),
    withFields('Ticked since #retro/alpha', {completion: '2026-10-02'}, {done: true}),
    withFields('Ticked before #retro/alpha', {completion: '2026-09-29'}, {done: true}),
    task('Other thread #retro/beta'),
  ],
});
const items = [area];

describe('buildSinceLast', () => {
  const since = buildSinceLast(current, area.path, items, null, NOW)!;

  it('lists each todo once, agreed-last-time ones (open, then done) in their own block', () => {
    expect(since.previous).toBe('2026-09-30');
    const byTitle = Object.fromEntries(since.blocks.map(b => [b.title, b.lines.map(l => `${l.done ? 'x' : 'o'} ${l.text}`)]));
    expect(byTitle).toEqual({
      'Agreed last time': ['o Send minutes #retro/alpha', 'o Agreed and waiting', 'x Book room'],
      'I owe': ['o Old promise'],
      'Waiting for': ['o Signed offer'],
      Relevant: ['o Raise budget #alpha'],
      'Done since then': ['x Ticked since #retro/alpha'],
    });
    const all = since.blocks.flatMap(b => b.lines.map(l => l.text));
    expect(new Set(all).size).toBe(all.length);
  });

  it('writes nothing without a previous meeting or a thread tag', () => {
    expect(buildSinceLast(first, area.path, items, null, NOW)).toBeNull();
    expect(buildSinceLast(m('2026-10-08', 'Plain'), area.path, items, null, NOW)).toBeNull();
  });
});

describe('renderSinceLast', () => {
  it('formats blocks, leaves empty ones out, cuts at 6 lines with "… +N more"', () => {
    const lines = Array.from({length: SINCE_LAST_BLOCK_LINES + 2}, (_, i) => ({text: `t${i}`, done: false}));
    const text = renderSinceLast({previous: '2026-09-30', blocks: [{title: 'I owe', lines}, {title: 'Relevant', lines: []}, {title: 'Done since then', lines: [{text: 'd', done: true}]}]}, TODAY);
    expect(text.split('\n')).toEqual(['Since last time · Wed 30.9.', 'I owe:', '- t0', '- t1', '- t2', '- t3', '- t4', '- t5', '… +2 more', 'Done since then:', '✓ d']);
    expect(renderSinceLast({previous: '2026-09-30', blocks: [{title: 'I owe', lines: []}]})).toBe('');
    expect(renderSinceLast(null)).toBe('');
  });

  it('is what the sinceLast piece renders', () => {
    const piece = {type: 'sinceLast' as const, x: 0, y: 0, fontSize: 30, step: 5};
    expect(renderPieceText(piece, {title: 'x'})).toBe('');
    expect(renderPieceText(piece, {title: 'x', sinceLast: {previous: '2026-09-30', blocks: [{title: 'I owe', lines: [{text: 'a', done: false}]}]}})).toContain('I owe:\n- a');
  });
});
