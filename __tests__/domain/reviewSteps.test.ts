import {
  activeReviewSteps,
  isReviewOverdue,
  nextReviewStepId,
  prevReviewStepId,
  REVIEW_STEPS,
  sumReviewSummaries,
  summaryLines,
  ZERO_REVIEW_SUMMARY,
} from '../../src/domain/reviewSteps';

describe('activeReviewSteps', () => {
  const off = activeReviewSteps({gmail: false});
  it('hides the gmail step when gmail is off', () => {
    expect(off.map(s => s.id)).not.toContain('gmailInbox');
    expect(off).toHaveLength(REVIEW_STEPS.length - 1);
    expect(activeReviewSteps({gmail: true})).toBe(REVIEW_STEPS);
  });
  it('next/previous skip the hidden step', () => {
    expect(nextReviewStepId('meetingsCloseOut', off)).toBe('tendingThreads');
    expect(nextReviewStepId('tendingThreads', off)).toBe('inbox');
    expect(prevReviewStepId('inbox', off)).toBe('tendingThreads');
    expect(nextReviewStepId('tendingThreads')).toBe('gmailInbox');
  });
  it('a hidden, never-reviewed step does not make the review overdue', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const recent = {reviewedAt: '2026-09-30T10:00:00Z', counts: {} as never};
    const steps = Object.fromEntries(off.map(s => [s.id, recent]));
    expect(isReviewOverdue(steps, now, off)).toBe(false);
    expect(isReviewOverdue(steps, now)).toBe(true);
  });
});

describe('Someday / Maybe step (docs/dev/history/technical-design-engage-in-context.md §2.10)', () => {

  it('is a ritual step after "Unfocused next items" and before "Focus reset"', () => {
    const ids = REVIEW_STEPS.map(s => s.id);
    expect(ids.indexOf('somedayMaybe')).toBe(ids.indexOf('unfocusedNext') + 1);
    expect(ids.indexOf('weeklyFocus')).toBe(ids.indexOf('somedayMaybe') + 1);
    expect(REVIEW_STEPS.find(s => s.id === 'somedayMaybe')).toEqual({id: 'somedayMaybe', title: 'Someday / Maybe', kind: 'ritual'});
  });

  it('counts somedayActivated, read as 0 from older records', () => {
    expect(ZERO_REVIEW_SUMMARY.somedayActivated).toBe(0);
    const older = {inbox: {reviewedAt: null, counts: {tasksAdded: 1}}};
    expect(sumReviewSummaries(older as never).somedayActivated).toBe(0);
    expect(summaryLines({...ZERO_REVIEW_SUMMARY, somedayActivated: 2})).toEqual(['2 someday todos made #next']);
  });
});
