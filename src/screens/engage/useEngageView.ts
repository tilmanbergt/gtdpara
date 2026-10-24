/**
 * What the Engage panel shows for its state
 * (docs/dev/history/technical-design-engage.md §3.7): memoized `optionsOf` /
 * `focusOwnerLines` over the cache, and today's next meeting
 * (docs/dev/history/technical-design-engage-in-context.md E9). Decides
 * nothing about screens.
 */
import {useMemo} from 'react';
import {EngageSource, EngageTodoRef, itemRefOf, MeetingEntryRef, ownerTitle, OwnerTitle, resolveTodoKey, todoKeyOf} from '../../domain/engageOwner';
import {
  EngageLists,
  EngageOptions,
  engageListsOf,
  engagePageOf,
  focusItems,
  focusOwnerLines,
  optionsOf,
  OwnerLine,
  todayNextMeeting,
} from '../../domain/engageOptions';
import {EngageState} from '../../domain/engageFlow';
import {MeetingMoment, momentByTime} from '../../domain/meetingMoment';
import {chosenMomentAt, useMomentChoices} from '../../ui/meetingMomentStore';

export interface EngageView {
  options: EngageOptions | null;
  /** The Now box todo and the tabs' rows; null without an owner. */
  lists: EngageLists | null;
  title: OwnerTitle | null;
  /** The way back, found again and ready to show; null when there is none or it is gone. */
  back: {todo: EngageTodoRef} | null;
  /** The focus screen's owner lines (S9/S11). */
  lines: OwnerLine[];
  /** Today's focus items, for S10. */
  focusNames: string[];
  /** The next timed meeting today (E9), as of when the data last changed; never refreshed by a timer. */
  todayNext: MeetingEntryRef | null;
  /** When `todayNext` was computed, for its "in … min". */
  nowMs: number;
  /** The page's meeting with its moment (chosen, else by time) while it has one (R1, R2); null otherwise. */
  page: {entry: MeetingEntryRef; moment: MeetingMoment; byTime: MeetingMoment} | null;
}

export function useEngageView(state: EngageState, source: EngageSource | null): EngageView {
  const moments = useMomentChoices();
  return useMemo(() => {
    if (!source) return {options: null, lists: null, title: null, back: null, lines: [], focusNames: [], todayNext: null, nowMs: 0, page: null};
    const nowMs = Date.now();
    const currentTodo = state.current ? resolveTodoKey(state.current, source) : null;
    const {owner, screen} = state;
    const chosen = chosenMomentAt(state.pageMeeting, source);
    const pageRef = engagePageOf(state.pageMeeting, source, nowMs, chosen);
    const pageItem = pageRef ? source.items.find(i => i.path === pageRef.meeting.itemPath) : undefined;
    const pageMeeting = pageRef && pageItem ? pageItem.meetings[pageRef.meeting.meetingIndex] : undefined;
    const byTime = pageMeeting ? momentByTime(pageMeeting, nowMs) : null;
    const page =
      pageRef && pageItem && pageMeeting && byTime
        ? {entry: {item: itemRefOf(pageItem), meetingIndex: pageRef.meeting.meetingIndex, meeting: pageMeeting}, moment: pageRef.moment, byTime}
        : null;
    const options = owner ? optionsOf(owner, source, nowMs, currentTodo ? todoKeyOf(currentTodo) : null, pageRef) : null;
    const backTodo = state.back ? resolveTodoKey(state.back.key, source) : null;
    return {
      back: state.back && backTodo ? {todo: backTodo} : null,
      options,
      lists: options ? engageListsOf(options, currentTodo) : null,
      title: owner ? ownerTitle(owner, source) : null,
      lines: screen.kind === 'selectFocus' ? focusOwnerLines(screen.ring, owner, source, nowMs) : [],
      focusNames: screen.kind === 'focusDone' ? focusItems('daily', source).map(item => item.name) : [],
      todayNext: todayNextMeeting(source, nowMs),
      nowMs,
      page,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `moments` recomputes when a moment is chosen (the choice is read from the store)
  }, [state, source, moments]);
}
