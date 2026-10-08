/**
 * Weekly Review hub and end page (docs/dev/history/technical-design-review-hub.md §5) -
 * presentational only: everything comes in as props (the persisted
 * per-step records, the live per-step counts, "now"), nothing is loaded or
 * written here. Kept out of screens/ReviewScreen.tsx so that (already very
 * large) file doesn't grow further.
 *
 * - `ReviewHub`: the page the Review tab opens on - "last review" headline
 *   (the OLDEST last-reviewed date over the steps that currently need a look),
 *   the combined recap of every step's last recorded visit, and one tappable
 *   row per step: title, how much is waiting in it, when it was last reviewed.
 *   A row whose last review is more than a week old (or that was never
 *   reviewed) carries the `●` marker - the same glyph and the same 7-day
 *   threshold (domain/reviewSteps.ts's REVIEW_STALE_MS) as the Review tab's
 *   badge. A backlog step with nothing in it says "nothing to review" instead
 *   of a date (domain/reviewSteps.ts's stepRowState).
 * - `ReviewEnd`: what "Skip"/"Reviewed" on the last step lands on - the same
 *   headline and recap, plus a way back to the hub.
 * - `ReviewStatsBlock`: the recap bullets, shared by both.
 *
 * Grayscale only (ui/theme.ts): emphasis is bold weight + the `●` glyph, never
 * colour. A plain flat list - eight to ten single-line rows plus a few recap
 * lines fit the screen with room to spare, so no PagedSection; if the step
 * list ever outgrows one screen, wrap the rows in one (see the design doc).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  formatReviewedAt,
  oldestRelevantReview,
  pluralize,
  REVIEW_STEPS,
  ReviewStepDef,
  ReviewStepId,
  ReviewStepsMap,
  ReviewSummaryCounts,
  stepRowState,
  sumReviewSummaries,
  summaryLines,
} from '../domain/reviewSteps';
import {ReviewStepCount} from '../storage/reviewAggregate';
import {common} from './commonStyles';
import {FONT, SPACING} from './theme';

/** "5 meetings", "7 items", "5 of 8 slots filled" - the count column of a step's row. */
function countText(id: ReviewStepId, count: ReviewStepCount): string {
  switch (id) {
    case 'weekAhead':
    case 'meetingsCloseOut':
      return pluralize(count.n, 'meeting');
    case 'tendingThreads':
      return pluralize(count.n, 'counterpart');
    case 'gmailInbox':
      return pluralize(count.n, 'email');
    case 'inbox':
    case 'onHold':
      return pluralize(count.n, 'item');
    case 'stalled':
    case 'done':
      return pluralize(count.n, 'project');
    case 'neglected':
      return pluralize(count.n, 'area');
    case 'unfocusedNext':
      return pluralize(count.n, 'task');
    case 'weeklyFocus':
      return `${count.n} of ${count.of ?? 0} slots filled`;
  }
}

interface CommonProps {
  steps: ReviewStepsMap;
  counts: Record<ReviewStepId, ReviewStepCount>;
  now: Date;
  textColor: string;
  borderColor: string;
  /** The steps shown (domain/reviewSteps.ts's activeReviewSteps). Defaults to all. */
  stepDefs?: ReviewStepDef[];
}

/** The recap bullets - renders nothing when there is nothing to show. */
export function ReviewStatsBlock({summary, textColor}: {summary: ReviewSummaryCounts; textColor: string}): React.JSX.Element | null {
  const lines = summaryLines(summary);
  if (lines.length === 0) return null;
  return (
    <View style={common.sectionSpacingSmall}>
      <Text style={[common.subheading, {color: textColor}]}>From your last reviews</Text>
      {lines.map(line => (
        <Text key={line} style={[styles.recapLine, {color: textColor}]}>
          • {line}
        </Text>
      ))}
    </View>
  );
}

function ReviewHeadline({steps, counts, now, textColor, stepDefs = REVIEW_STEPS}: Omit<CommonProps, 'borderColor'>): React.JSX.Element {
  const oldest = oldestRelevantReview(steps, counts, stepDefs);
  return (
    <Text style={[common.hint, {color: textColor}]}>
      {oldest.kind === 'never' ? 'No complete review yet.' : `Last review: ${formatReviewedAt(oldest.iso, now)} (oldest step)`}
    </Text>
  );
}

function ReviewStepRow({
  def,
  steps,
  count,
  now,
  onOpen,
  textColor,
  borderColor,
}: {
  def: ReviewStepDef;
  steps: ReviewStepsMap;
  count: ReviewStepCount;
  now: Date;
  onOpen: () => void;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const state = stepRowState(def, steps[def.id], count.n, now);
  const alarm = state.kind === 'stale' || state.kind === 'never';
  const lastText =
    state.kind === 'empty'
      ? '-'
      : state.kind === 'never'
      ? 'never'
      : formatReviewedAt(state.lastAt ?? '', now);
  return (
    <Pressable onPress={onOpen} hitSlop={4} style={[styles.row, {borderColor}]}>
      <Text style={[styles.rowTitle, {color: textColor}]} numberOfLines={1}>
        {def.title}
      </Text>
      <Text style={[styles.rowCount, {color: textColor}]} numberOfLines={1}>
        {state.kind === 'empty' ? 'nothing to review' : countText(def.id, count)}
      </Text>
      <Text style={[styles.rowLast, {color: textColor}, alarm && styles.rowLastAlarm]} numberOfLines={1}>
        {alarm ? '● ' : ''}
        {lastText}
      </Text>
    </Pressable>
  );
}

export function ReviewHub({
  steps,
  counts,
  now,
  onOpenStep,
  textColor,
  borderColor,
  stepDefs = REVIEW_STEPS,
}: CommonProps & {onOpenStep: (id: ReviewStepId) => void}): React.JSX.Element {
  return (
    <View>
      <ReviewHeadline steps={steps} counts={counts} now={now} textColor={textColor} stepDefs={stepDefs} />
      <ReviewStatsBlock summary={sumReviewSummaries(steps)} textColor={textColor} />
      <View style={[styles.list, {borderColor}]}>
        {stepDefs.map(def => (
          <ReviewStepRow
            key={def.id}
            def={def}
            steps={steps}
            count={counts[def.id]}
            now={now}
            onOpen={() => onOpenStep(def.id)}
            textColor={textColor}
            borderColor={borderColor}
          />
        ))}
      </View>
    </View>
  );
}

export function ReviewEnd({
  steps,
  counts,
  now,
  onOverview,
  textColor,
  borderColor,
  stepDefs = REVIEW_STEPS,
}: CommonProps & {onOverview: () => void}): React.JSX.Element {
  return (
    <View>
      <Text style={[styles.endTitle, {color: textColor}]}>That was the last step.</Text>
      <ReviewHeadline steps={steps} counts={counts} now={now} textColor={textColor} stepDefs={stepDefs} />
      <ReviewStatsBlock summary={sumReviewSummaries(steps)} textColor={textColor} />
      <Pressable onPress={onOverview} hitSlop={8} style={[styles.overviewButton, {borderColor}]}>
        <Text style={[styles.overviewButtonText, {color: textColor}]}>Overview</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  recapLine: {
    fontSize: FONT.medium,
    marginBottom: 2,
  },
  list: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: SPACING.sm,
  },
  rowTitle: {
    flex: 5,
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  rowCount: {
    flex: 3,
    fontSize: FONT.medium,
  },
  rowLast: {
    flex: 3,
    fontSize: FONT.medium,
    textAlign: 'right',
  },
  rowLastAlarm: {
    fontWeight: '700',
  },
  endTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  overviewButton: {
    alignSelf: 'flex-start',
    marginTop: SPACING.base,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: SPACING.base,
    paddingVertical: 10,
  },
  overviewButtonText: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
});
