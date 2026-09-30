import {
  activeReviewSteps,
  isReviewOverdue,
  nextReviewStepId,
  prevReviewStepId,
  REVIEW_STEPS,
} from '../../src/domain/reviewSteps';

describe('activeReviewSteps', () => {
  const off = activeReviewSteps({gmail: false});
  it('hides the gmail step when gmail is off', () => {
    expect(off.map(s => s.id)).not.toContain('gmailInbox');
    expect(off).toHaveLength(REVIEW_STEPS.length - 1);
    expect(activeReviewSteps({gmail: true})).toBe(REVIEW_STEPS);
  });
  it('next/previous skip the hidden step', () => {
    expect(nextReviewStepId('meetingsCloseOut', off)).toBe('inbox');
    expect(prevReviewStepId('inbox', off)).toBe('meetingsCloseOut');
    expect(nextReviewStepId('meetingsCloseOut')).toBe('gmailInbox');
  });
  it('a hidden, never-reviewed step does not make the review overdue', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const recent = {reviewedAt: '2026-09-30T10:00:00Z', counts: {} as never};
    const steps = Object.fromEntries(off.map(s => [s.id, recent]));
    expect(isReviewOverdue(steps, now, off)).toBe(false);
    expect(isReviewOverdue(steps, now)).toBe(true);
  });
});
