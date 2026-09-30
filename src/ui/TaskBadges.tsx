/**
 * The small pill badges shown next to a task's text - flow-state, due-date/
 * overdue, and (for Waiting For) who it's waiting on (technical-design-
 * tags.md §5.2). One definition, imported by every task-row surface
 * (screens/DailyView.tsx's Open-tasks rows and Inbox rows,
 * screens/ProjectDataPanel.tsx's grouped Todos rows, screens/ReviewScreen.tsx's
 * Inbox-to-zero cards) so "what a badge says and looks like" never drifts
 * between them.
 *
 * `context` controls whether the flow-state itself gets a badge:
 * - 'flat': Daily's lists aren't grouped by flow-state, so a "Next" badge is
 *   the only way a Next task reads as such there. Waiting For/Someday/Maybe
 *   never reach a 'flat' list in the first place (storage/dailyAggregate.ts's
 *   exclusion rule) or, on the two surfaces that read Inbox.txt directly
 *   (DailyView's Inbox rows, ReviewScreen's Inbox-to-zero cards - Inbox
 *   isn't covered by that exclusion rule), read-only informational badges
 *   are still shown since there's no grouping to convey it otherwise.
 * - 'grouped': Project/Area's Todos list groups by flow-state (the section
 *   header already says it), so repeating it on every row would be
 *   redundant - only Waiting-on and Due/Overdue badges show there.
 *
 * Icon-only glyphs, tap-to-reveal (2026-09-03 Daily-cleanup pass,
 * technical-design-daily-compact-ui.md §2) - reuses the existing "a single
 * Unicode/emoji glyph inside a <Text>" pattern already established
 * throughout this app (✕ cancel, 📓/+📓 note, 🔄 refresh, ★ focused, ●
 * review-overdue, ⚠ error, ☑/☐ checkbox) rather than introducing a new icon
 * subsystem - grayscale-safe by construction, no new dependency. Tapping a
 * badge reveals its full text (the same string taskBadgeLabels below
 * produces) for ~2s, then collapses back to the glyph automatically.
 * `taskBadgeLabels` itself is untouched - still the source of the full text
 * a screen-reader-equivalent or a standalone check would want.
 *
 * The Next/Now badge (docs/dev/technical-design-now-focus-mode.md §3) doubles as
 * the #now toggle: outline ▷ (task.now === false) vs filled ▶ (task.now ===
 * true) - same monochrome, icon-only convention as every other badge here,
 * no color dependency. Double-tapping specifically *this* badge (and only
 * this one - Waiting-on/Due keep single-tap-reveal only) flips `now` via the
 * optional `onToggleNow` prop; a single tap still reveals "Next"/"Now" as
 * text like any other badge. See handlePress below for how the two gestures
 * are told apart on the same Pressable.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {setFlowStateTag, setNowTag, titleCaseSlug} from '../domain/flowState';
import {setDueTag} from '../domain/markdown';
import {todayIso} from '../domain/meetingTime';
import {Task} from '../domain/types';
import {FONT} from './theme';

export type TaskBadgeContext = 'flat' | 'grouped';

interface BadgeInfo {
  glyph: string;
  label: string;
}

function badgeInfos(task: Task, context: TaskBadgeContext, today: string, contextActive: boolean): BadgeInfo[] {
  const badges: BadgeInfo[] = [];
  if (context === 'flat' && task.flowState === 'next') {
    badges.push(task.now ? {glyph: '▶', label: 'Now'} : {glyph: '▷', label: 'Next'});
  }
  // Someday gets no badge at all normally (see this module's own doc
  // comment below) - but an active Daily context filter (technical-design-
  // context-tags.md §6) is a new way for a Someday task to reach a 'flat'
  // list, where it would otherwise look indistinguishable from a Next task.
  // `contextActive` is true only when the caller (ui/TaskRow.tsx, only from
  // screens/DailyView.tsx's own instances) knows a context filter produced
  // this list - my own addition, not yet confirmed as wanted (§6, §11).
  if (context === 'flat' && task.flowState === 'someday' && contextActive) {
    badges.push({glyph: '○', label: 'Someday'});
  }
  if (task.flowState === 'waiting-for' && task.waitingOn) {
    badges.push({glyph: '⏸', label: `Waiting on: ${titleCaseSlug(task.waitingOn)}`});
  }
  if (task.dueDate) {
    const overdue = task.dueDate < today;
    badges.push({
      glyph: overdue ? '⚠' : '📅',
      label: `${overdue ? 'Overdue' : 'Due'} ${task.dueDate}`,
    });
  }
  return badges;
}

/** Pure - exported separately from the render component so callers that need just the strings (tests, non-visual checks) don't need React. */
export function taskBadgeLabels(
  task: Task,
  context: TaskBadgeContext,
  today: string = todayIso(),
  contextActive: boolean = false,
): string[] {
  return badgeInfos(task, context, today, contextActive).map(b => b.label);
}

/**
 * Whether `task`'s flow-state is already shown some other way - a badge
 * above (mirrors badgeInfos' own conditions exactly: the 'next' badge only
 * appears in 'flat' context, the 'waiting-for' badge only when `waitingOn`
 * is set) or, in 'grouped' context, the section heading itself
 * (domain/flowState.ts's groupTasksByFlowState - a 'grouped' row is always
 * under the heading matching its own flowState). Someday/Maybe get no badge
 * at all today, so in 'flat' context they fall through to `false` - nothing
 * else on screen would show them, so hiding the tag there would make the
 * flow-state disappear entirely (2026-09-07 feedback's own scoping: hide
 * only "when this is displayed as a special tag-flag" elsewhere).
 */
export function isFlowStateConveyed(task: Task, context: TaskBadgeContext, contextActive: boolean = false): boolean {
  if (!task.flowState) return false;
  if (context === 'grouped') return true;
  if (task.flowState === 'next') return true;
  if (task.flowState === 'waiting-for' && task.waitingOn) return true;
  // Mirrors badgeInfos' own Someday-under-active-context condition above -
  // once that badge shows, the #someday tag it conveys should strip from
  // displayTaskText's output the same way every other conveyed flow tag
  // already does.
  if (task.flowState === 'someday' && contextActive) return true;
  return false;
}

/**
 * `task.text` with its flow-state/due/#now tags removed wherever something
 * else on screen already conveys them (see isFlowStateConveyed above) - the
 * due tag's badge always shows, in both contexts, whenever dueDate is set,
 * so that one strips unconditionally; `#now` strips exactly when the Next/Now
 * badge itself would render (context === 'flat' && flowState === 'next' -
 * the same condition badgeInfos uses), since that badge's filled-vs-outline
 * glyph is already what conveys it. Reuses setFlowStateTag/setDueTag/
 * setNowTag's own "pass false/null, get the stripped text back" path rather
 * than a new regex - `task.text` itself is never touched, this is
 * display-only (see domain/markdown.ts's "tags are read out of text, never
 * stripped from it" rule for the stored value).
 */
export function displayTaskText(task: Task, context: TaskBadgeContext, contextActive: boolean = false): string {
  const withoutDue = task.dueDate ? setDueTag(task.text, null) : task.text;
  const withoutFlowState = isFlowStateConveyed(task, context, contextActive)
    ? setFlowStateTag(withoutDue, null)
    : withoutDue;
  const nowConveyed = context === 'flat' && task.flowState === 'next';
  return nowConveyed ? setNowTag(withoutFlowState, false) : withoutFlowState;
}

const REVEAL_MS = 2000;
// How close together two taps on the *same* Next/Now badge need to land to
// count as a double-tap rather than two independent single-tap-reveals
// (docs/dev/technical-design-now-focus-mode.md §3). Only this one badge ever
// checks this - Waiting-on/Due keep plain single-tap-reveal, unchanged.
const DOUBLE_TAP_MS = 350;

interface Props {
  task: Task;
  context: TaskBadgeContext;
  textColor: string;
  borderColor: string;
  /**
   * Double-tapping the Next/Now badge calls this instead of (single-tap)
   * revealing its label - only wired where a caller can actually flip
   * `#now` on this task (docs/dev/technical-design-now-focus-mode.md §3).
   * Omitting it simply leaves that badge single-tap-reveal-only, same as
   * every other badge here - existing call sites that don't pass it need no
   * changes.
   */
  onToggleNow?: () => void;
  /** Whether this row is showing because of an active Daily context filter (technical-design-context-tags.md §6) - only ui/TaskRow.tsx's Daily instances know this, derived from whether a `contextTag` was passed. Enables the Someday visual cue above; every other badge is unaffected. */
  contextActive?: boolean;
}

/** Renders nothing when there's nothing to show - safe to always mount next to a row's text. */
export default function TaskBadges({task, context, textColor, borderColor, onToggleNow, contextActive = false}: Props): React.JSX.Element | null {
  const infos = badgeInfos(task, context, todayIso(), contextActive);
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // {index, at} of the most recent tap on ANY badge - only ever compared
  // against a second tap on the same index, so a stray tap elsewhere never
  // arms a false double-tap.
  const lastTapRef = useRef<{index: number; at: number} | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (infos.length === 0) return null;

  const handlePress = (index: number, info: BadgeInfo) => {
    const now = Date.now();
    const isNowBadge = onToggleNow && (info.label === 'Next' || info.label === 'Now');
    if (isNowBadge && lastTapRef.current?.index === index && now - lastTapRef.current.at < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      setRevealedIndex(null);
      onToggleNow!();
      return;
    }
    lastTapRef.current = {index, at: now};
    if (timerRef.current) clearTimeout(timerRef.current);
    setRevealedIndex(index);
    timerRef.current = setTimeout(() => setRevealedIndex(null), REVEAL_MS);
  };

  return (
    <>
      {infos.map((info, index) => (
        <Pressable key={index} onPress={() => handlePress(index, info)} hitSlop={6}>
          <Text style={[styles.badge, {borderColor, color: textColor}]}>
            {revealedIndex === index ? info.label : info.glyph}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: FONT.small,
    opacity: 0.65,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 8,
  },
});
