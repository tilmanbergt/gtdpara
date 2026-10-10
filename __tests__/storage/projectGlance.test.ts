/** The Projects tab's rows (docs/dev/history/technical-design-projects-findable-notes.md §1). */
import {emptyTaskFields} from '../../src/domain/taskLine';
import {Task} from '../../src/domain/types';
import {buildProjectGlance, glanceCountsText, glanceMeetingText} from '../../src/storage/projectGlance';
import {item, meeting, task} from '../../test-helpers/fixtures';

const NOW = new Date(2026, 9, 8, 12, 0, 0);
const TODAY = '2026-10-08';

function created(text: string, date: string, extra: Partial<Task> = {}): Task {
  return task(text, {fields: {...emptyTaskFields(), created: date}, ...extra});
}

const garden = item('project', 'Garden renovation', {
  area: 'Home',
  meetings: [
    meeting('2026-09-30', 'Walk the site', {time: '10:00', endTime: '11:00'}),
    meeting('2026-09-01', 'Kickoff'),
    meeting('2026-10-14', 'Plants'),
    meeting('2026-10-10', 'Cancelled one', {cancelled: true}),
    meeting('2026-10-08', 'Today, still running', {time: '11:30', endTime: '13:00'}),
  ],
  tasks: [
    task('Order soil #next'),
    task('Call builder #next'),
    task('Sketch beds'),
    created('Quote back #wf/builder', '2026-09-26'),
    created('Permit #wf/city', '2026-10-01'),
    task('Old #next', {done: true}),
    task('Dropped #next', {cancelled: true}),
  ],
});
const shelved = item('project', 'attic', {area: 'Home', tasks: [task('Someday insulate #someday')]});
const paused = item('project', 'Boat', {area: 'Home', status: 'on-hold'});
const done = item('project', 'Done one', {area: 'Home', status: 'done'});
const archived = item('project', 'Old', {area: 'Home', status: 'archived'});
const elsewhere = item('project', 'Other area', {area: 'Work'});
const anArea = item('area', 'Home');
const items = [garden, shelved, paused, done, archived, elsewhere, anArea];

describe('buildProjectGlance', () => {
  const rows = buildProjectGlance('Home', items, TODAY, NOW);

  it('lists the Area’s Active Projects alphabetically, then On hold; no Done, Archived or others', () => {
    expect(rows.map(r => [r.item.name, r.status])).toEqual([
      ['attic', 'active'],
      ['Garden renovation', 'active'],
      ['Boat', 'on-hold'],
    ]);
  });

  it('takes the latest ended and the next not-ended, not-cancelled meeting', () => {
    const g = rows.find(r => r.item === garden)!;
    expect(g.lastMeeting).toBe('2026-09-30');
    expect(g.nextMeeting).toBe('2026-10-08');
    expect(glanceMeetingText(g, TODAY)).toBe('last 30.9. · next 8.10.');
  });

  it('counts open, next and the oldest Waiting For', () => {
    const g = rows.find(r => r.item === garden)!;
    expect(g).toMatchObject({open: 5, next: 2, stalled: false, waitingCount: 2, oldestWaitingDays: 12});
    expect(glanceCountsText(g)).toBe('5 open · 2 next · w/f 12 d');
  });

  it('marks a Project stalled when it has no actionable open todo', () => {
    const a = rows.find(r => r.item === shelved)!;
    expect(a).toMatchObject({open: 1, next: 0, stalled: true});
    expect(glanceCountsText(a)).toBe('1 open · no next action');
    const b = rows.find(r => r.item === paused)!;
    expect(glanceMeetingText(b, TODAY)).toBe('last — · next —');
    expect(glanceCountsText(b)).toBe('0 open · no next action');
  });

  it('gives no age for Waiting Fors without a created date', () => {
    const p = item('project', 'P', {area: 'Home', tasks: [task('Ask #wf/anna'), task('Do it #next')]});
    const [row] = buildProjectGlance('Home', [p], TODAY, NOW);
    expect(row.oldestWaitingDays).toBeNull();
    expect(glanceCountsText(row)).toBe('2 open · 1 next · 1 w/f');
  });

  it('is empty for an Area without Projects', () => {
    expect(buildProjectGlance('Nowhere', items, TODAY, NOW)).toEqual([]);
  });
});
