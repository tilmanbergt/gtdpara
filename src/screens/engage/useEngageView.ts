/**
 * What the Engage panel shows for its state
 * (docs/dev/history/technical-design-engage.md §3.7): memoized `optionsOf` /
 * `focusOwnerLines` over the cache. Decides nothing about screens.
 */
import {useMemo} from 'react';
import {EngageSource, EngageTodoRef, ownerTitle, OwnerTitle, resolveTodoKey, todoKeyOf} from '../../domain/engageOwner';
import {EngageLists, EngageOptions, engageListsOf, focusItems, focusOwnerLines, optionsOf, OwnerLine} from '../../domain/engageOptions';
import {EngageState} from '../../domain/engageFlow';

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
}

export function useEngageView(state: EngageState, source: EngageSource | null): EngageView {
  return useMemo(() => {
    if (!source) return {options: null, lists: null, title: null, back: null, lines: [], focusNames: []};
    const nowMs = Date.now();
    const currentTodo = state.current ? resolveTodoKey(state.current, source) : null;
    const {owner, screen} = state;
    const options = owner ? optionsOf(owner, source, nowMs, currentTodo ? todoKeyOf(currentTodo) : null) : null;
    const backTodo = state.back ? resolveTodoKey(state.back.key, source) : null;
    return {
      back: state.back && backTodo ? {todo: backTodo} : null,
      options,
      lists: options ? engageListsOf(options, currentTodo) : null,
      title: owner ? ownerTitle(owner, source) : null,
      lines: screen.kind === 'selectFocus' ? focusOwnerLines(screen.ring, owner, source, nowMs) : [],
      focusNames: screen.kind === 'focusDone' ? focusItems('daily', source).map(item => item.name) : [],
    };
  }, [state, source]);
}
