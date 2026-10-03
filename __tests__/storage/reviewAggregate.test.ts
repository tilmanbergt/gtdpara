import {buildReviewAggregate, buildReviewStepCounts} from '../../src/storage/reviewAggregate';
import {REVIEW_STEPS} from '../../src/domain/reviewSteps';
import {item, meeting, task} from '../../test-helpers/fixtures';

// Saturday 2026-10-03: the Week ahead step shows next week, 2026-10-05..11.
const NOW = new Date(2026, 9, 3, 10, 0);
const names = (refs: Array<{name: string} | {item: {name: string}}>) =>
  refs.map(r => ('item' in r ? r.item.name : r.name));

describe('buildReviewAggregate', () => {
  const items = [
    item('project', 'Stalled', {tasks: [task('Idea #someday'), task('Old', {done: true})]}),
    item('project', 'Busy', {tasks: [task('Write #next')]}),
    item('project', 'Waiting', {tasks: [task('Answer #waiting-for:anna')]}),
    item('project', 'Finished', {status: 'done'}),
    item('area', 'Paused', {status: 'on-hold'}),
    item('area', 'Quiet', {tasks: [task('Maybe later #maybe')]}),
    item('area', 'Focused', {weeklyFocus: true, tasks: [task('Plan #next')]}),
    item('project', 'Broken', {loadError: 'read failed'}),
  ];
  const agg = buildReviewAggregate(items, NOW);

  it('stalled = active projects without actionable open todos (Someday/Maybe/done don\'t count, Waiting for does)', () => {
    expect(names(agg.stalledProjects)).toEqual(['Stalled']);
    expect(agg.stalledProjects[0].shelvedTasks.map(t => t.task.text)).toEqual(['Idea #someday']);
  });
  it('neglected = the same rule for areas', () => {
    expect(names(agg.neglectedAreas)).toEqual(['Quiet']);
  });
  it('done projects and on-hold items', () => {
    expect(names(agg.doneProjects)).toEqual(['Finished']);
    expect(names(agg.onHoldItems)).toEqual(['Paused']);
  });
  it('unfocused next items leave out focused items', () => {
    expect(names(agg.unfocusedNextItems)).toEqual(['Busy']);
  });
  it('items that failed to load are reported, not reviewed', () => {
    expect(agg.failedItems.map(f => f.item.name)).toEqual(['Broken']);
    expect(names(agg.stalledProjects)).not.toContain('Broken');
  });
});

describe('weekMeetings (the hub\'s Week ahead count)', () => {
  it('counts meetings in the week the step shows, once per meeting', () => {
    const p = item('project', 'P', {
      tasks: [task('x #next')],
      meetings: [
        meeting('2026-10-03', 'Today, not next week', {time: '09:00'}),
        meeting('2026-10-04', 'Three days, into next week', {days: 3}),
        meeting('2026-10-07', 'Midweek', {time: '14:00'}),
        meeting('2026-10-11', 'Sunday'),
        meeting('2026-10-12', 'Week after'),
        meeting('2026-10-08', 'Cancelled', {cancelled: true}),
      ],
    });
    const agg = buildReviewAggregate([p], NOW);
    expect(agg.weekMeetings.map(m => m.meeting.title).sort()).toEqual(
      ['Midweek', 'Sunday', 'Three days, into next week'].sort(),
    );
  });
});

describe('buildReviewStepCounts', () => {
  const settings = {weeklyFocusProjectCount: 2, weeklyFocusAreaCount: 2, monthlyFocusProjectCount: 1, monthlyFocusAreaCount: 1};
  it('has a count for every review step', () => {
    const counts = buildReviewStepCounts(buildReviewAggregate([], NOW), 0, [], settings, 0);
    for (const def of REVIEW_STEPS) expect(counts[def.id]).toBeDefined();
  });
  it('adds the Inbox meetings to Week ahead and passes Inbox/Gmail counts through', () => {
    const p = item('project', 'P', {meetings: [meeting('2026-10-06', 'A')]});
    const counts = buildReviewStepCounts(buildReviewAggregate([p], NOW), 4, [p], settings, 7, 2);
    expect(counts.weekAhead.n).toBe(3);
    expect(counts.inbox.n).toBe(4);
    expect(counts.gmailInbox.n).toBe(7);
  });
});
