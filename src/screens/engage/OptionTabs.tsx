/**
 * The owner's options under the Now box (Addendum "Next and Plan tabs" of
 * docs/dev/history/technical-design-engage.md): mini tabs "Agreed n · Next n
 * · Plan n" over one PagedSection of five rows. Agreed (only while it has
 * rows, docs/dev/history/technical-design-engage-in-context.md E6) starts
 * with the meeting's caption; its rows act by state. Next rows are tapped to
 * work on them and carry Remove #next; Plan rows carry #next and Someday.
 * Which tab shows is the reducer's (domain/engageFlow.ts).
 */
import React from 'react';
import {Text, View} from 'react-native';
import {EngageTab} from '../../domain/engageFlow';
import {AgreedList, isNextTask} from '../../domain/engageOptions';
import {EngageOwner, EngageTodoRef, ownerKey} from '../../domain/engageOwner';
import {agreedCaption, ENGAGE_TEXT, tabLabel} from '../../domain/engageText';
import {todayIso} from '../../domain/meetingTime';
import MiniTabs from '../../ui/MiniTabs';
import PagedSection from '../../ui/PagedSection';
import {ENGAGE_LIST_VIEWPORT, ENGAGE_ROW_H, engageStyles as styles} from './engageStyles';
import OptionRow from './OptionRow';

interface Props {
  owner: EngageOwner;
  tab: EngageTab;
  next: EngageTodoRef[];
  plan: EngageTodoRef[];
  /** The Agreed tab's meeting and rows; null hides the tab. */
  agreed: AgreedList | null;
  onTab: (tab: EngageTab) => void;
  onPick: (todo: EngageTodoRef) => void;
  onRemoveNext: (todo: EngageTodoRef) => void;
  onMakeNext: (todo: EngageTodoRef) => void;
  onSomeday: (todo: EngageTodoRef) => void;
  onDone: (todo: EngageTodoRef) => void;
  textColor: string;
  borderColor: string;
}

const rowKey = (todo: EngageTodoRef) => `${todo.item.path}#${todo.taskIndex}`;

export default function OptionTabs(props: Props): React.JSX.Element {
  const {owner, next, plan, agreed, onTab, onPick, onRemoveNext, onMakeNext, onSomeday, onDone, textColor, borderColor} = props;
  // Agreed only while it lists something; the reducer moves off it then.
  const tab: EngageTab = props.tab === 'agreed' && !agreed ? 'next' : props.tab;
  const rows = tab === 'agreed' ? agreed?.rows ?? [] : tab === 'next' ? next : plan;
  const tabs: Array<{key: EngageTab; label: string}> = [
    ...(agreed ? [{key: 'agreed' as const, label: tabLabel('agreed', agreed.rows.length)}] : []),
    {key: 'next', label: tabLabel('next', next.length)},
    {key: 'plan', label: tabLabel('plan', plan.length)},
  ];

  const nextRow = (todo: EngageTodoRef, actions: Array<{label: string; onPress: () => void}>) => (
    <OptionRow key={rowKey(todo)} todo={todo} kind="next" onPick={() => onPick(todo)} actions={actions} textColor={textColor} borderColor={borderColor} />
  );
  const planRow = (todo: EngageTodoRef, actions: Array<{label: string; onPress: () => void}>) => (
    <OptionRow key={rowKey(todo)} todo={todo} kind="plan" actions={actions} textColor={textColor} borderColor={borderColor} />
  );
  /** An Agreed row by its state: #next → work on it, Waiting For → Done, else → #next (E6). */
  const agreedRow = (todo: EngageTodoRef) => {
    if (isNextTask(todo.task)) return nextRow(todo, []);
    if (todo.task.flowState === 'waiting-for') {
      return (
        <OptionRow
          key={rowKey(todo)}
          todo={todo}
          kind="waiting"
          actions={[{label: ENGAGE_TEXT.done, onPress: () => onDone(todo)}]}
          textColor={textColor}
          borderColor={borderColor}
        />
      );
    }
    return planRow(todo, [{label: ENGAGE_TEXT.makeNext, onPress: () => onMakeNext(todo)}]);
  };

  return (
    <View>
      <MiniTabs<EngageTab> tabs={tabs} activeKey={tab} onChange={onTab} textColor={textColor} borderColor={borderColor} />
      <PagedSection
        // The tabs name the list; the header line only carries the page arrows.
        header=""
        subHeader={
          tab === 'agreed' && agreed ? (
            <Text style={[styles.caption, {color: textColor}]} numberOfLines={1}>
              {agreedCaption(agreed.meeting.meeting, todayIso())}
            </Text>
          ) : undefined
        }
        rows={rows}
        rowHeight={() => ENGAGE_ROW_H}
        viewportHeight={ENGAGE_LIST_VIEWPORT}
        resetKey={`${ownerKey(owner)}:${tab}`}
        emptyHint={tab === 'next' ? ENGAGE_TEXT.noOtherNext : ENGAGE_TEXT.emptyPlan}
        textColor={textColor}
        borderColor={borderColor}
        renderRow={todo =>
          tab === 'agreed'
            ? agreedRow(todo)
            : tab === 'next'
              ? nextRow(todo, [{label: ENGAGE_TEXT.removeNext, onPress: () => onRemoveNext(todo)}])
              : planRow(todo, [
                  {label: ENGAGE_TEXT.makeNext, onPress: () => onMakeNext(todo)},
                  {label: ENGAGE_TEXT.someday, onPress: () => onSomeday(todo)},
                ])
        }
      />
    </View>
  );
}
