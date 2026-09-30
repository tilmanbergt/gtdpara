/**
 * ItemContextRows — ItemScopeRow + ItemGoalRow, extracted from
 * ui/ItemFocusPanel.tsx (2026-09-16, docs/
 * technical-design-review-master-detail.md §Component inventory) so
 * Review's new master-detail detail panels (Stalled projects, Neglected
 * areas, Done awaiting review, On Hold reconsideration) can show Scope and
 * the latest weekly goal with byte-for-byte the same visual/UX logic
 * (including the tap-to-edit convention) that ItemFocusPanel.tsx's Current
 * tab already uses - rather than a second, drifting copy.
 *
 * Both rows were already fully decoupled from ItemFocusPanel's own state -
 * `disabled` (ItemGoalRow only) is a plain prop the caller computes, not
 * anything read internally - so this extraction is verbatim with no prop
 * shape changes. ItemFocusPanel.tsx now imports these from here instead of
 * defining them locally.
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {PeriodScope, periodLabel, periodOf, periodsBetween} from '../domain/period';
import {PeriodGoal} from '../storage/periodGoals';
import InlineTextEditor from './InlineTextEditor';
import {FONT} from './theme';

/**
 * The Scope text - see ui/ItemFocusPanel.tsx's module doc comment's "Scope"
 * paragraph for the display/edit rules. Not editing: shows the current
 * scope plain (no `numberOfLines` truncation - deliberately unclamped,
 * unlike ItemGoalRow's `numberOfLines={2}` below, since Scope is meant to
 * hold the fuller 1-3 sentence description rather than a short phrase) or,
 * when empty, the dim "+ Add a scope" prompt - both tappable to enter edit
 * mode. Never `disabled` by status, unlike ItemGoalRow - there's no such
 * prop here at all. Editing: ui/InlineTextEditor.tsx (shared with both goal
 * rows since 2026-09-29) in its multiline mode.
 */
export function ItemScopeRow({
  scope,
  onSaveScope,
  textColor,
  borderColor,
  placeholderColor,
}: {
  scope: string;
  onSaveScope: (text: string) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <InlineTextEditor
        initialText={scope}
        onSave={onSaveScope}
        onClose={() => setEditing(false)}
        placeholder="What is this project/area about? (1-3 sentences)"
        multiline
        logLabel="ItemScopeRow: save scope failed"
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={4}>
      <Text style={[styles.scopeRow, {color: textColor}, !scope && styles.goalRowEmpty]}>
        {scope || '+ Add a scope'}
      </Text>
    </Pressable>
  );
}

/**
 * The single goal line below the Focus checkboxes - see
 * ui/ItemFocusPanel.tsx's module doc comment's "Weekly goal" paragraph for
 * the display/edit rules. Not editing: shows the latest-week entry (plain
 * if it's the current week, "Last goal (Week NN): ..." otherwise) or, with
 * no entries at all, a dim "+ Add a goal for this week" prompt - either
 * tappable to enter edit mode when not `disabled`. Editing:
 * ui/InlineTextEditor.tsx, shared with ItemScopeRow and
 * ui/PeriodFocusPanel.tsx's GoalRow since 2026-09-29.
 *
 * `disabled` is always externally supplied by the caller (ItemFocusPanel
 * passes `state.status !== 'active'`; Review's ui/ItemContextBlock.tsx
 * always passes `false`, since Review's own Area/Scope/Goal context block
 * is read-mostly and never status-gated the way the Current tab's Focus
 * section is) - nothing here is coupled to any particular screen's status
 * rules.
 *
 * `currentWeekKey` (2026-09-16, docs/dev/technical-design-review-master-
 * detail.md §4.2) drives both "is this the current week" (unchanged) and
 * the "N weeks ago" phrase on an older goal, via the new
 * `domain/weekDate.ts` `weeksBetween` helper. Optional, defaulting to
 * `isoWeekKey(new Date())` - ItemFocusPanel's existing call site needs no
 * change at all (same value it would compute itself); Review's
 * `ItemContextBlock` passes one `currentWeekKey` it computed once for the
 * whole step, so every card in the same review moment agrees on "now".
 */
export function ItemGoalRow({
  goals,
  scope = 'weekly',
  disabled,
  onSaveGoal,
  currentKey,
  textColor,
  borderColor,
  placeholderColor,
}: {
  /** This item's goals for `scope`, as `{key, text}` - storage/periodGoals.ts's `goalsOf`. */
  goals: PeriodGoal[];
  /** Week or month (docs/dev/technical-design-monthly-view.md §5.6) - drives the current key, labels and "N weeks/months ago". */
  scope?: PeriodScope;
  disabled: boolean;
  onSaveGoal: (text: string) => Promise<void>;
  /** The current period's key; defaults to the real current week/month. */
  currentKey?: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const thisKey = currentKey ?? periodOf(scope, new Date()).key;
  const unit = scope === 'weekly' ? 'week' : 'month';
  // Both key formats ("2026-W41", "2026-10") sort correctly as strings.
  const latest = goals.length > 0 ? goals.reduce((a, b) => (b.key > a.key ? b : a)) : null;
  const isCurrentWeek = latest?.key === thisKey;
  const displayText = latest?.text ?? '';

  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <InlineTextEditor
        initialText={displayText}
        onSave={onSaveGoal}
        onClose={() => setEditing(false)}
        placeholder={`Goal for this ${unit}`}
        logLabel="ItemGoalRow: save goal failed"
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  }

  return (
    <Pressable onPress={() => !disabled && setEditing(true)} disabled={disabled} hitSlop={4} style={disabled && styles.sectionDisabled}>
      <Text style={[styles.goalRow, {color: textColor}, !latest && styles.goalRowEmpty]} numberOfLines={2}>
        {latest
          ? isCurrentWeek
            ? `🎯 ${latest.text}`
            : (() => {
                const ago = Math.max(0, periodsBetween(scope, latest.key, thisKey));
                return `Last goal (${periodLabel(scope, latest.key)}, ${ago} ${unit}${ago === 1 ? '' : 's'} ago): ${latest.text}`;
              })()
          : `+ Add a goal for this ${unit}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionDisabled: {
    opacity: 0.4,
  },
  scopeRow: {
    fontSize: FONT.medium,
    marginBottom: 4,
  },
  goalRow: {
    fontSize: FONT.small,
    marginTop: 4,
  },
  goalRowEmpty: {
    opacity: 0.6,
  },
});
