/**
 * The owner's options (S2/S4/S5 `#next`, S6 the plan,
 * docs/dev/history/technical-design-engage.md §3.7): one PagedSection with
 * room for five rows; the plan rows carry Someday.
 */
import React from 'react';
import {EngageOwner, EngageTodoRef, ownerKey} from '../../domain/engageOwner';
import {ENGAGE_TEXT} from '../../domain/engageText';
import PagedSection from '../../ui/PagedSection';
import {ENGAGE_LIST_VIEWPORT, ENGAGE_ROW_H} from './engageStyles';
import OptionRow from './OptionRow';

interface Props {
  owner: EngageOwner;
  next: EngageTodoRef[];
  plan: EngageTodoRef[];
  onPick: (todo: EngageTodoRef) => void;
  onSomeday: (todo: EngageTodoRef) => void;
  textColor: string;
  borderColor: string;
}

const rowKey = (todo: EngageTodoRef) => `${todo.item.path}#${todo.taskIndex}`;

export default function OptionList({owner, next, plan, onPick, onSomeday, textColor, borderColor}: Props): React.JSX.Element {
  const showPlan = next.length === 0;
  const rows = showPlan ? plan : next;
  return (
    <PagedSection
      header={showPlan ? ENGAGE_TEXT.planIntro : ENGAGE_TEXT.heading}
      rows={rows}
      rowHeight={() => ENGAGE_ROW_H}
      viewportHeight={ENGAGE_LIST_VIEWPORT}
      resetKey={`${ownerKey(owner)}:${showPlan ? 'plan' : 'next'}`}
      emptyHint={ENGAGE_TEXT.nothingToPick}
      textColor={textColor}
      borderColor={borderColor}
      renderRow={todo => (
        <OptionRow
          key={rowKey(todo)}
          todo={todo}
          kind={showPlan ? 'plan' : 'next'}
          onPick={() => onPick(todo)}
          action={showPlan ? {label: ENGAGE_TEXT.someday, onPress: () => onSomeday(todo)} : undefined}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
    />
  );
}
