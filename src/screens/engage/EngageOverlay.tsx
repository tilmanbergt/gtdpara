/**
 * The Engage panel over the note (docs/dev/history/technical-design-engage.md
 * §3.7): the frame - backdrop, panel, the body for `state.screen.kind` - and
 * the wiring of the hooks to the parts. Which screen follows which action is
 * the reducer's (domain/engageFlow.ts); every write goes through
 * ui/useEntryActions.ts, Close loop… through ui/useCloseLoop.ts.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Destination} from '../../domain/destination';
import {EngageAck} from '../../domain/engageFlow';
import {EngageFlowChoice} from '../../domain/engageOptions';
import {EngageOwner, EngageSource, EngageTodoRef, ownerHomePath, todoKeyOf} from '../../domain/engageOwner';
import {ENGAGE_TEXT} from '../../domain/engageText';
import {setEngageCurrent} from '../../storage/engageCurrent';
import CollapsedQuickAdd from '../../ui/CollapsedQuickAdd';
import StatusFrame from '../../ui/status/StatusFrame';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {useThemeColors} from '../../ui/theme';
import {useCloseLoop} from '../../ui/useCloseLoop';
import {useEntryActions} from '../../ui/useEntryActions';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';
import {useEinkRefreshOnLoad} from '../../utils/screenRefresh';
import AckLine from './AckLine';
import Celebration from './Celebration';
import EngageFooter from './EngageFooter';
import EngageHeader from './EngageHeader';
import {ENGAGE_BACKDROP_TRANSPARENT, ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';
import MarksLine from './MarksLine';
import NowBox from './NowBox';
import OptionList from './OptionList';
import OwnerEmpty from './OwnerEmpty';
import OwnerList from './OwnerList';
import {EngageRequest, useEngageFlow} from './useEngageFlow';
import {useEngageView} from './useEngageView';

const NAME = 'EngageOverlay';

interface Props {
  request: EngageRequest;
  onClose: () => void;
  onOpenGtdpara: () => void;
}

function destinationOf(owner: EngageOwner, source: EngageSource): Destination | null {
  const item = source.items.find(i => i.path === ownerHomePath(owner));
  return item ? {type: 'item', kind: item.kind, name: item.name, path: item.path} : null;
}

const forget = (owner: EngageOwner | null) =>
  setEngageCurrent(owner, null).catch(e => logError(`${NAME}: forgetting the current todo failed`, errorMessage(e)));

export default function EngageOverlay({request, onClose, onOpenGtdpara}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor, isDarkMode} = useThemeColors();
  const background = isDarkMode ? '#000000' : '#ffffff';
  const rootBackground = ENGAGE_BACKDROP_TRANSPARENT ? 'transparent' : background;
  const {state, dispatch, source} = useEngageFlow(request);
  const view = useEngageView(state, source);
  const actions = useEntryActions(NAME);
  const closeLoop = useCloseLoop(NAME);
  useEinkRefreshOnLoad(source === null);
  const {owner, screen, ack} = state;

  const titleOf = (todo: EngageTodoRef) => taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat').title;

  const act = async (todo: EngageTodoRef, kind: EngageAck['kind'], wasCurrent: boolean) => {
    log(`${NAME}: action`, kind);
    const flow: EngageFlowChoice = kind === 'someday' ? 'someday' : null;
    const undo = kind === 'done' ? await actions.completeTask(todo) : await actions.setTaskFlow(todo, flow);
    if (!undo) return;
    dispatch({type: 'acted', ack: {kind, text: titleOf(todo), key: todoKeyOf(todo), wasCurrent, undo}});
    if (wasCurrent) forget(owner);
  };

  const undo = async () => {
    if (!ack) return;
    log(`${NAME}: action`, 'undo');
    if (!(await actions.undoTask(ack.undo))) return;
    dispatch({type: 'undone'});
    if (ack.wasCurrent && owner) await setEngageCurrent(owner, ack.key);
  };

  const pick = async (todo: EngageTodoRef) => {
    log(`${NAME}: action`, 'pick');
    let key = todoKeyOf(todo);
    if (todo.task.flowState !== 'next' && !todo.task.now) {
      const changed = await actions.setTaskFlow(todo, 'next');
      if (!changed) return;
      key = {...key, taskText: changed.afterText};
    }
    dispatch({type: 'picked', key});
    if (owner) await setEngageCurrent(owner, key);
    // The todo's note comes to the front, so the panel goes; without a note the todo just becomes current.
    if (todo.task.notePath && (await actions.taskNote(todo))) onClose();
  };

  const choose = (next: EngageOwner) => {
    log(`${NAME}: action`, 'owner', next.kind);
    forget(next);
    dispatch({type: 'ownerChosen', owner: next});
  };

  const body = (): React.ReactNode => {
    if (!source) return <Text style={[styles.caption, {color: textColor}]}>…</Text>;
    const ackLine = ack ? <AckLine ack={ack} onUndo={undo} textColor={textColor} /> : null;
    switch (screen.kind) {
      case 'selectFocus':
        return <OwnerList ring={screen.ring} lines={view.lines} onChoose={line => choose(line.owner)} textColor={textColor} borderColor={borderColor} />;
      case 'focusDone':
        return (
          <>
            {ackLine}
            <Celebration names={view.focusNames} textColor={textColor} />
          </>
        );
      case 'ownerEmpty':
        return (
          <>
            {ackLine}
            <OwnerEmpty
              ownerName={view.title?.name ?? ''}
              onCloseLoop={owner?.kind === 'loop' ? () => closeLoop(owner.itemPath, owner.tag) : undefined}
              onAddTodo={() => dispatch({type: 'expandQuickAdd'})}
              textColor={textColor}
              borderColor={borderColor}
            />
            {owner ? <MarksLine owner={owner} textColor={textColor} /> : null}
          </>
        );
      case 'quickAdd':
      case 'options': {
        if (!owner) return null;
        const destination = destinationOf(owner, source);
        const options = view.options;
        const current = view.currentTodo;
        return (
          <>
            {current && screen.kind === 'options' ? (
              <NowBox
                todo={current}
                onDone={() => act(current, 'done', true)}
                onRemoveNext={() => act(current, 'unnext', true)}
                onSomeday={() => act(current, 'someday', true)}
                onOpen={() => pick(current)}
                textColor={textColor}
                borderColor={borderColor}
              />
            ) : null}
            {ackLine}
            {screen.kind === 'options' && options ? (
              <OptionList
                owner={owner}
                next={options.next}
                plan={options.plan}
                onPick={pick}
                onSomeday={todo => act(todo, 'someday', false)}
                textColor={textColor}
                borderColor={borderColor}
              />
            ) : null}
            {screen.kind === 'options' && options?.next.length === 0 ? <MarksLine owner={owner} textColor={textColor} /> : null}
            {destination ? (
              <CollapsedQuickAdd
                label={ENGAGE_TEXT.quickAdd}
                cancelLabel={ENGAGE_TEXT.close}
                expanded={screen.kind === 'quickAdd'}
                onExpand={() => dispatch({type: 'expandQuickAdd'})}
                onCollapse={() => dispatch({type: 'collapseQuickAdd'})}
                destination={destination}
                ownerTag={owner.kind === 'item' ? null : owner.tag}
                layoutKey="engage"
                onAddTask={actions.addTask}
                onAddMeeting={actions.addMeeting}
                textColor={textColor}
                borderColor={borderColor}
                placeholderColor={placeholderColor}
              />
            ) : null}
          </>
        );
      }
    }
  };

  const nothingToPick = screen.kind === 'options' && !view.currentTodo && view.options?.next.length === 0 && view.options.plan.length === 0;
  const select =
    screen.kind === 'focusDone'
      ? {kind: 'new' as const, onPress: () => dispatch({type: 'selectNewFocus'})}
      : screen.kind === 'ownerEmpty' || nothingToPick
        ? {kind: 'next' as const, onPress: () => dispatch({type: 'selectFocus'})}
        : undefined;
  const onFocusScreen = screen.kind === 'selectFocus';

  return (
    <View style={[styles.root, {backgroundColor: rootBackground}]}>
      <StatusFrame>
        <View style={[styles.panel, {backgroundColor: background, borderColor: textColor}]}>
          <EngageHeader
            title={view.title}
            heading={onFocusScreen || screen.kind === 'focusDone' || !owner ? ENGAGE_TEXT.heading : undefined}
            onClose={onClose}
            onBack={onFocusScreen && owner ? () => dispatch({type: 'back'}) : undefined}
            textColor={textColor}
          />
          {body()}
          {screen.kind === 'quickAdd' ? null : (
            <EngageFooter
              select={select}
              closeIsMain={screen.kind === 'ownerEmpty' || screen.kind === 'focusDone'}
              onOpenGtdpara={onOpenGtdpara}
              onClose={onClose}
              textColor={textColor}
              borderColor={borderColor}
            />
          )}
        </View>
      </StatusFrame>
    </View>
  );
}
