/**
 * The owner's options under the Now box (Addendum "Next and Plan tabs" of
 * docs/dev/history/technical-design-engage.md): mini tabs "Next n · Plan n"
 * over one PagedSection of five rows. Next rows are tapped to work on them
 * and carry Remove #next; Plan rows carry #next and Someday. Which tab shows
 * is the reducer's (domain/engageFlow.ts).
 */
import React from 'react';
import {View} from 'react-native';
import {EngageTab} from '../../domain/engageFlow';
import {EngageOwner, EngageTodoRef, ownerKey} from '../../domain/engageOwner';
import {ENGAGE_TEXT, tabLabel} from '../../domain/engageText';
import MiniTabs from '../../ui/MiniTabs';
import PagedSection from '../../ui/PagedSection';
import {ENGAGE_LIST_VIEWPORT, ENGAGE_ROW_H} from './engageStyles';
import OptionRow from './OptionRow';

interface Props {
  owner: EngageOwner;
  tab: EngageTab;
  next: EngageTodoRef[];
  plan: EngageTodoRef[];
  onTab: (tab: EngageTab) => void;
  onPick: (todo: EngageTodoRef) => void;
  onRemoveNext: (todo: EngageTodoRef) => void;
  onMakeNext: (todo: EngageTodoRef) => void;
  onSomeday: (todo: EngageTodoRef) => void;
  textColor: string;
  borderColor: string;
}

const rowKey = (todo: EngageTodoRef) => `${todo.item.path}#${todo.taskIndex}`;

export default function OptionTabs(props: Props): React.JSX.Element {
  const {owner, tab, next, plan, onTab, onPick, onRemoveNext, onMakeNext, onSomeday, textColor, borderColor} = props;
  const rows = tab === 'next' ? next : plan;
  return (
    <View>
      <MiniTabs<EngageTab>
        tabs={[
          {key: 'next', label: tabLabel('next', next.length)},
          {key: 'plan', label: tabLabel('plan', plan.length)},
        ]}
        activeKey={tab}
        onChange={onTab}
        textColor={textColor}
        borderColor={borderColor}
      />
      <PagedSection
        // The tabs name the list; the header line only carries the page arrows.
        header=""
        rows={rows}
        rowHeight={() => ENGAGE_ROW_H}
        viewportHeight={ENGAGE_LIST_VIEWPORT}
        resetKey={`${ownerKey(owner)}:${tab}`}
        emptyHint={tab === 'next' ? ENGAGE_TEXT.noOtherNext : ENGAGE_TEXT.emptyPlan}
        textColor={textColor}
        borderColor={borderColor}
        renderRow={todo =>
          tab === 'next' ? (
            <OptionRow
              key={rowKey(todo)}
              todo={todo}
              kind="next"
              onPick={() => onPick(todo)}
              actions={[{label: ENGAGE_TEXT.removeNext, onPress: () => onRemoveNext(todo)}]}
              textColor={textColor}
              borderColor={borderColor}
            />
          ) : (
            <OptionRow
              key={rowKey(todo)}
              todo={todo}
              kind="plan"
              actions={[
                {label: ENGAGE_TEXT.makeNext, onPress: () => onMakeNext(todo)},
                {label: ENGAGE_TEXT.someday, onPress: () => onSomeday(todo)},
              ]}
              textColor={textColor}
              borderColor={borderColor}
            />
          )
        }
      />
    </View>
  );
}
