/**
 * The owner's options under the Now box (Addendum "Next and Plan tabs" of
 * docs/dev/history/technical-design-engage.md;
 * docs/dev/history/technical-design-meetings-0.21.md R9-R13, §4.3): mini
 * tabs "From Thread n · Next n · Plan n · Waiting n · Agreements n" over one
 * PagedSection in a fixed 5-row viewport. From, Waiting and Agreements show
 * only while they have rows; which tab shows is the reducer's
 * (domain/engageFlow.ts).
 *
 * - From: one caption row per meeting ("Tue 14.10. · Sparring Mieke",
 *   28 dp, so fewer rows fit on a page with captions), then its rows by
 *   state: `#next` → tap to work on it; Waiting For → Done; plan → #next;
 *   done → struck, no action; an agreement → Change / End.
 * - Next rows are tapped to work on them and carry Remove #next; Plan rows
 *   carry #next and Someday; Waiting rows carry Done and where they were
 *   agreed ("from 14.10."); Agreements rows show Change and End on a tap.
 */
import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {AgreementRef} from '../../domain/agreementOwner';
import {EngageTab} from '../../domain/engageFlow';
import {FromGroup, fromRowCount, isNextTask} from '../../domain/engageOptions';
import {EngageOwner, EngageTodoRef, MeetingRef, ownerKey, OwnerTodoRef} from '../../domain/engageOwner';
import {ENGAGE_TEXT, fromCaption, fromMeetingText, tabLabel} from '../../domain/engageText';
import {todayIso} from '../../domain/meetingTime';
import {Meeting} from '../../domain/types';
import MiniTabs from '../../ui/MiniTabs';
import PagedSection from '../../ui/PagedSection';
import {agreementRefKey} from '../../ui/useAgreementActions';
import AgreementOptionRow from './AgreementOptionRow';
import {ENGAGE_CAPTION_H, ENGAGE_LIST_VIEWPORT, ENGAGE_ROW_H, engageStyles as styles} from './engageStyles';
import OptionRow from './OptionRow';

interface Props {
  owner: EngageOwner;
  tab: EngageTab;
  next: EngageTodoRef[];
  plan: EngageTodoRef[];
  from: FromGroup[];
  waiting: OwnerTodoRef[];
  agreements: AgreementRef[];
  /** The meeting a waiting todo was agreed in, for its "from 14.10.". */
  meetingAt: (ref: MeetingRef) => Pick<Meeting, 'date'> | null;
  onTab: (tab: EngageTab) => void;
  onPick: (todo: EngageTodoRef) => void;
  onRemoveNext: (todo: EngageTodoRef) => void;
  onMakeNext: (todo: EngageTodoRef) => void;
  onSomeday: (todo: EngageTodoRef) => void;
  onDone: (todo: EngageTodoRef) => void;
  onChangeAgreement: (ref: AgreementRef) => void;
  onEndAgreement: (ref: AgreementRef) => void;
  textColor: string;
  borderColor: string;
}

type ListRow =
  | {kind: 'caption'; key: string; label: string}
  | {kind: 'todo'; key: string; todo: EngageTodoRef; as: 'next' | 'plan' | 'waiting' | 'done'; detail: string | null; actions: 'remove' | 'plan' | 'make' | 'done' | 'none'}
  | {kind: 'agreement'; key: string; ref: AgreementRef};

const todoKey = (todo: EngageTodoRef) => `${todo.item.path}#${todo.taskIndex}`;

/** A From row's look and action by the todo's state (R13). */
function fromTodoRow(todo: EngageTodoRef, group: string): ListRow {
  const key = `${group}:${todoKey(todo)}`;
  if (todo.task.done) return {kind: 'todo', key, todo, as: 'done', detail: null, actions: 'none'};
  if (isNextTask(todo.task)) return {kind: 'todo', key, todo, as: 'next', detail: null, actions: 'none'};
  if (todo.task.flowState === 'waiting-for') return {kind: 'todo', key, todo, as: 'waiting', detail: null, actions: 'done'};
  return {kind: 'todo', key, todo, as: 'plan', detail: null, actions: 'make'};
}

export default function OptionTabs(props: Props): React.JSX.Element {
  const {owner, next, plan, from, waiting, agreements, meetingAt, onTab, textColor, borderColor} = props;
  const [openAgreement, setOpenAgreement] = useState<string | null>(null);
  const today = todayIso();
  const fromCount = fromRowCount(from);
  const shown: Record<EngageTab, boolean> = {from: fromCount > 0, next: true, plan: true, waiting: waiting.length > 0, agreements: agreements.length > 0};
  // A vanishing tab that lists nothing shows Next until the reducer moves off it.
  const tab: EngageTab = shown[props.tab] ? props.tab : 'next';

  const tabs: Array<{key: EngageTab; label: string}> = [
    ...(shown.from ? [{key: 'from' as const, label: tabLabel('from', fromCount, owner.kind)}] : []),
    {key: 'next', label: tabLabel('next', next.length)},
    {key: 'plan', label: tabLabel('plan', plan.length)},
    ...(shown.waiting ? [{key: 'waiting' as const, label: tabLabel('waiting', waiting.length)}] : []),
    ...(shown.agreements ? [{key: 'agreements' as const, label: tabLabel('agreements', agreements.length)}] : []),
  ];

  const rows: ListRow[] = (() => {
    switch (tab) {
      case 'from':
        return from.flatMap((group, i): ListRow[] => {
          const id = `g${i}`;
          return [
            {kind: 'caption', key: `${id}:caption`, label: fromCaption(group.meeting.meeting, today)},
            ...group.rows.map(row =>
              row.kind === 'agreement' ? {kind: 'agreement' as const, key: `${id}:${agreementRefKey(row.agreement)}`, ref: row.agreement} : fromTodoRow(row.todo, id),
            ),
          ];
        });
      case 'next':
        return next.map(todo => ({kind: 'todo', key: todoKey(todo), todo, as: 'next', detail: null, actions: 'remove'}));
      case 'plan':
        return plan.map(todo => ({kind: 'todo', key: todoKey(todo), todo, as: 'plan', detail: null, actions: 'plan'}));
      case 'waiting':
        return waiting.map(todo => {
          const meeting = todo.agreedIn ? meetingAt(todo.agreedIn) : null;
          return {kind: 'todo', key: todoKey(todo), todo, as: 'waiting', detail: meeting ? fromMeetingText(meeting, today) : null, actions: 'done'};
        });
      case 'agreements':
        return agreements.map(ref => ({kind: 'agreement', key: agreementRefKey(ref), ref}));
    }
  })();

  const renderRow = (row: ListRow): React.ReactNode => {
    if (row.kind === 'caption') {
      return (
        <View key={row.key} style={styles.groupCaption}>
          <Text style={[styles.caption, {color: textColor}]} numberOfLines={1}>
            {row.label}
          </Text>
        </View>
      );
    }
    if (row.kind === 'agreement') {
      const key = agreementRefKey(row.ref);
      return (
        <AgreementOptionRow
          key={row.key}
          agreement={row.ref}
          open={openAgreement === key}
          onToggle={() => setOpenAgreement(openAgreement === key ? null : key)}
          onChange={() => props.onChangeAgreement(row.ref)}
          onEnd={() => props.onEndAgreement(row.ref)}
          textColor={textColor}
          borderColor={borderColor}
        />
      );
    }
    const {todo} = row;
    const actions = {
      remove: [{label: ENGAGE_TEXT.removeNext, onPress: () => props.onRemoveNext(todo)}],
      plan: [
        {label: ENGAGE_TEXT.makeNext, onPress: () => props.onMakeNext(todo)},
        {label: ENGAGE_TEXT.someday, onPress: () => props.onSomeday(todo)},
      ],
      make: [{label: ENGAGE_TEXT.makeNext, onPress: () => props.onMakeNext(todo)}],
      done: [{label: ENGAGE_TEXT.done, onPress: () => props.onDone(todo)}],
      none: [],
    }[row.actions];
    return (
      <OptionRow
        key={row.key}
        todo={todo}
        kind={row.as}
        detail={row.detail}
        onPick={row.as === 'next' ? () => props.onPick(todo) : undefined}
        actions={actions}
        textColor={textColor}
        borderColor={borderColor}
      />
    );
  };

  return (
    <View>
      <MiniTabs<EngageTab> tabs={tabs} activeKey={tab} onChange={onTab} textColor={textColor} borderColor={borderColor} />
      <PagedSection<ListRow>
        // The tabs name the list; the header line only carries the page arrows.
        header=""
        rows={rows}
        rowHeight={row => (row.kind === 'caption' ? ENGAGE_CAPTION_H : ENGAGE_ROW_H)}
        isCountableRow={row => row.kind !== 'caption'}
        viewportHeight={ENGAGE_LIST_VIEWPORT}
        resetKey={`${ownerKey(owner)}:${tab}`}
        emptyHint={tab === 'next' ? ENGAGE_TEXT.noOtherNext : ENGAGE_TEXT.emptyPlan}
        textColor={textColor}
        borderColor={borderColor}
        renderRow={renderRow}
      />
    </View>
  );
}
