/**
 * What the Engage panel shows for its state
 * (docs/dev/history/technical-design-engage.md §3.7): memoized `optionsOf` /
 * `focusOwnerLines` over the cache. Decides nothing about screens.
 */
import {useMemo} from 'react';
import {EngageSource, EngageTodoRef, ownerTitle, OwnerTitle, resolveTodoKey, todoKeyOf} from '../../domain/engageOwner';
import {EngageOptions, focusItems, focusOwnerLines, optionsOf, OwnerLine} from '../../domain/engageOptions';
import {EngageState} from '../../domain/engageFlow';

export interface EngageView {
  currentTodo: EngageTodoRef | null;
  options: EngageOptions | null;
  title: OwnerTitle | null;
  /** The focus screen's owner lines (S9/S11). */
  lines: OwnerLine[];
  /** Today's focus items, for S10. */
  focusNames: string[];
}

export function useEngageView(state: EngageState, source: EngageSource | null): EngageView {
  return useMemo(() => {
    if (!source) return {currentTodo: null, options: null, title: null, lines: [], focusNames: []};
    const nowMs = Date.now();
    const currentTodo = state.current ? resolveTodoKey(state.current, source) : null;
    const {owner, screen} = state;
    return {
      currentTodo,
      options: owner ? optionsOf(owner, source, nowMs, currentTodo ? todoKeyOf(currentTodo) : null) : null,
      title: owner ? ownerTitle(owner, source) : null,
      lines: screen.kind === 'selectFocus' ? focusOwnerLines(screen.ring, owner, source, nowMs) : [],
      focusNames: screen.kind === 'focusDone' ? focusItems('daily', source).map(item => item.name) : [],
    };
  }, [state, source]);
}
