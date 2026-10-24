/**
 * The Engage panel over the note (docs/dev/history/technical-design-engage.md
 * §3.7): the frame - backdrop, panel, the body for `state.screen.kind` - and
 * the wiring of the hooks to the parts: "Next here" under the header, "Also
 * here" under the tabs and "Today next" above the footer
 * (docs/dev/history/technical-design-engage-in-context.md §2.8). Which screen follows which action is
 * the reducer's (domain/engageFlow.ts); every write goes through
 * ui/useEntryActions.ts, Close loop… through ui/useCloseLoop.ts.
 */
import React, {useEffect, useState} from 'react';
import {LayoutChangeEvent, Text, View} from 'react-native';
import {Destination} from '../../domain/destination';
import {EngageAck, EngageExit, EngageRequest} from '../../domain/engageFlow';
import {EngageFlowChoice} from '../../domain/engageOptions';
import {EngageOwner, EngageSource, EngageTodoRef, ownerHomePath, todoKeyOf} from '../../domain/engageOwner';
import {ENGAGE_TEXT, nextHereText, todayNextText} from '../../domain/engageText';
import {meetingStartMs, todayIso} from '../../domain/meetingTime';
import {setEngageCurrent} from '../../storage/engageCurrent';
import {openHomeNotebook} from '../../storage/homeNotebooks';
import CollapsedQuickAdd from '../../ui/CollapsedQuickAdd';
import StatusFrame from '../../ui/status/StatusFrame';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {useThemeColors} from '../../ui/theme';
import {useActionError} from '../../ui/useActionError';
import {useCloseLoop} from '../../ui/useCloseLoop';
import {useEntryActions} from '../../ui/useEntryActions';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../../utils/screenRefresh';
import AckLine from './AckLine';
import AlsoHereLine from './AlsoHereLine';
import BackLine from './BackLine';
import Celebration from './Celebration';
import EngageFooter from './EngageFooter';
import EngageHeader from './EngageHeader';
import GoToLine from './GoToLine';
import {ENGAGE_BACKDROP_TRANSPARENT, ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';
import MarksLine from './MarksLine';
import MeetingLine from './MeetingLine';
import NowBox from './NowBox';
import OptionTabs from './OptionTabs';
import OwnerEmpty from './OwnerEmpty';
import OwnerList from './OwnerList';
import ReflectLine from './ReflectLine';
import {useEngageFlow} from './useEngageFlow';
import {useEngageGoTo} from './useEngageGoTo';
import {useEngageExits} from './useEngageExits';
import {useEngageView} from './useEngageView';

const NAME = 'EngageOverlay';

interface Props {
  request: EngageRequest;
  onClose: () => void;
  onOpenGtdpara: () => void;
  /** Leaves the panel to a place in gtdpara (an overview, Review's Someday / Maybe). */
  onExit: (exit: EngageExit) => void;
}

function destinationOf(owner: EngageOwner, source: EngageSource): Destination | null {
  const item = source.items.find(i => i.path === ownerHomePath(owner));
  return item ? {type: 'item', kind: item.kind, name: item.name, path: item.path} : null;
}

const forget = (owner: EngageOwner | null) =>
  setEngageCurrent(owner, null).catch(e => logError(`${NAME}: forgetting the current todo failed`, errorMessage(e)));

export default function EngageOverlay({request, onClose, onOpenGtdpara, onExit}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor, isDarkMode} = useThemeColors();
  const background = isDarkMode ? '#000000' : '#ffffff';
  const rootBackground = ENGAGE_BACKDROP_TRANSPARENT ? 'transparent' : background;
  const {state, dispatch, source} = useEngageFlow(request);
  const view = useEngageView(state, source);
  const actions = useEntryActions(NAME);
  const closeLoop = useCloseLoop(NAME);
  const goTo = useEngageGoTo(state.owner);
  const goToAction = useActionError(`${NAME}.goToError`, `${NAME}: opening the home notebook failed`);
  const exits = useEngageExits(state.owner, source, actions, onExit, onClose);
  useEinkRefreshOnLoad(source === null);
  const {owner, screen, ack} = state;

  // Over the transparent backdrop the A5 X can keep showing the previous panel
  // after a change (the note behind is not redrawn), so the panel never gets
  // smaller while it is open and every screen change asks for a refresh.
  const [panelHeight, setPanelHeight] = useState(0);
  const onPanelLayout = (e: LayoutChangeEvent) => {
    const height = Math.round(e.nativeEvent.layout.height);
    if (height > panelHeight) setPanelHeight(height);
  };
  useEffect(() => {
    log(`${NAME}: screen`, screen.kind, 'panelHeight=' + panelHeight);
    requestEinkRefresh();
    // Logged and refreshed per screen; the height is read, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.kind, ack === null, state.tab]);
  const press = (what: string, run: () => void) => {
    log(`${NAME}: press`, what);
    run();
  };

  const titleOf = (todo: EngageTodoRef) => taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat').title;

  const act = async (todo: EngageTodoRef, kind: EngageAck['kind'], wasCurrent: boolean) => {
    log(`${NAME}: action`, kind);
    const flow: EngageFlowChoice = kind === 'someday' ? 'someday' : kind === 'next' ? 'next' : null;
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

  /** A Next row: work on it (only `#next` todos can be chosen; a plan todo first gets #next). */
  const pick = async (todo: EngageTodoRef) => {
    log(`${NAME}: action`, 'pick');
    const key = todoKeyOf(todo);
    dispatch({type: 'picked', key});
    if (owner) await setEngageCurrent(owner, key);
  };

  /** The Now box's note and file: once one opened, it is in front and the panel goes. */
  const openNote = async (todo: EngageTodoRef) => {
    log(`${NAME}: action`, 'note', todo.task.notePath ? 'open' : 'new');
    if (await actions.taskNote(todo)) onClose();
  };
  const openFile = async (linkedFile: string) => {
    log(`${NAME}: action`, 'file');
    if (await actions.openTaskFile(linkedFile)) onClose();
  };

  /** "Go to <notebook> ›": the notebook comes to the front and the panel goes, like a todo's note. */
  const openGoTo = (path: string) => {
    log(`${NAME}: action`, 'goTo');
    goToAction.run(async () => {
      await openHomeNotebook(path);
      onClose();
    });
  };

  /** The meeting whose page this is (R10), for "Reflect on this meeting ›". */
  const pageMeetingItem = state.pageMeeting && source ? source.items.find(i => i.path === state.pageMeeting?.itemPath) : undefined;
  const pageMeeting = state.pageMeeting && pageMeetingItem ? pageMeetingItem.meetings[state.pageMeeting.meetingIndex] : undefined;
  const reflectLine =
    pageMeeting && pageMeetingItem && state.pageMeeting ? (
      <ReflectLine
        meeting={pageMeeting}
        itemPath={pageMeetingItem.path}
        onPress={() => reflect({item: pageMeetingItem, meetingIndex: state.pageMeeting?.meetingIndex ?? 0, meeting: pageMeeting})}
        textColor={textColor}
      />
    ) : null;
  /** The reflection comes to the front and the panel goes, like a todo's note. */
  const reflect = async (entry: Parameters<typeof actions.reflection>[0]) => {
    log(`${NAME}: action`, 'reflection');
    if (await actions.reflection(entry)) onClose();
  };

  const homeName = (o: EngageOwner) => source?.items.find(i => i.path === ownerHomePath(o))?.name ?? '';

  // The stored current todo stays: it is the way back from the owner chosen here.
  const choose = (next: EngageOwner) => {
    log(`${NAME}: action`, 'owner', next.kind);
    dispatch({type: 'ownerChosen', owner: next});
  };
  const goBack = async () => {
    const back = state.back;
    if (!back) return;
    log(`${NAME}: action`, 'back', back.owner.kind);
    dispatch({type: 'goBack'});
    await setEngageCurrent(back.owner, back.key);
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
            {owner ? <MarksLine owner={owner} itemName={homeName(owner)} textColor={textColor} /> : null}
            {reflectLine}
          </>
        );
      case 'quickAdd':
      case 'options': {
        if (!owner) return null;
        const destination = destinationOf(owner, source);
        const lists = view.lists;
        const nowTodo = lists?.nowTodo ?? null;
        const isCurrent = lists?.nowKind === 'current';
        const tab = state.tab ?? 'next';
        return (
          <>
            {nowTodo && screen.kind === 'options' ? (
              <NowBox
                todo={nowTodo}
                caption={isCurrent ? ENGAGE_TEXT.workingOn : ENGAGE_TEXT.nextAction}
                onDone={() => act(nowTodo, 'done', isCurrent)}
                onRemoveNext={() => act(nowTodo, 'unnext', isCurrent)}
                onSomeday={() => act(nowTodo, 'someday', isCurrent)}
                onNote={() => openNote(nowTodo)}
                onFile={openFile}
                textColor={textColor}
                borderColor={borderColor}
              />
            ) : null}
            {!nowTodo && screen.kind === 'options' && lists && lists.next.length > 0 ? (
              <Text style={[styles.caption, {color: textColor}]}>{ENGAGE_TEXT.pickBelow}</Text>
            ) : null}
            {ackLine}
            {screen.kind === 'options' && lists ? (
              <OptionTabs
                owner={owner}
                tab={tab}
                next={lists.next}
                plan={lists.plan}
                onTab={next => press('tab', () => dispatch({type: 'selectTab', tab: next}))}
                onPick={pick}
                onRemoveNext={todo => act(todo, 'unnext', false)}
                onMakeNext={todo => act(todo, 'next', false)}
                onSomeday={todo => act(todo, 'someday', false)}
                from={view.options?.from ?? []}
                onDone={todo => act(todo, 'done', false)}
                textColor={textColor}
                borderColor={borderColor}
              />
            ) : null}
            {screen.kind === 'options' && view.options ? (
              <AlsoHereLine
                someday={view.options.alsoHere.someday}
                onSomeday={exits.openSomeday}
                onOverview={exits.openOverview}
                textColor={textColor}
              />
            ) : null}
            {screen.kind === 'options' && tab === 'plan' ? <MarksLine owner={owner} itemName={homeName(owner)} textColor={textColor} /> : null}
            {screen.kind === 'options' ? reflectLine : null}
            {goTo && screen.kind === 'options' ? <GoToLine fileName={goTo.fileName} onPress={() => openGoTo(goTo.path)} textColor={textColor} /> : null}
            {destination ? (
              <CollapsedQuickAdd
                label={ENGAGE_TEXT.quickAdd}
                cancelLabel={ENGAGE_TEXT.cancel}
                expanded={screen.kind === 'quickAdd'}
                onExpand={() => press('quickAdd', () => dispatch({type: 'expandQuickAdd'}))}
                onCollapse={() => press('quickAddCancel', () => dispatch({type: 'collapseQuickAdd'}))}
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

  const lists = view.lists;
  const nothingToPick = screen.kind === 'options' && lists !== null && !lists.nowTodo && lists.next.length === 0 && lists.plan.length === 0;
  const select =
    screen.kind === 'focusDone'
      ? {kind: 'new' as const, onPress: () => press('selectNewFocus', () => dispatch({type: 'selectNewFocus'}))}
      : screen.kind === 'ownerEmpty' || nothingToPick
        ? {kind: 'next' as const, onPress: () => press('selectFocus', () => dispatch({type: 'selectFocus'}))}
        : undefined;
  const onFocusScreen = screen.kind === 'selectFocus';
  // The meeting lines (E8, E9) on the owner's screens; the two merge when they name the same meeting.
  const ownerScreen = screen.kind === 'options' || screen.kind === 'ownerEmpty';
  const nextMeeting = ownerScreen ? view.options?.nextMeeting ?? null : null;
  const todayNext = ownerScreen ? view.todayNext : null;
  const merged = !!nextMeeting && !!todayNext && nextMeeting.item.path === todayNext.item.path && nextMeeting.meetingIndex === todayNext.meetingIndex;

  return (
    <View style={[styles.root, {backgroundColor: rootBackground}]}>
      <StatusFrame>
        <View style={[styles.panel, {backgroundColor: background, borderColor: textColor, minHeight: panelHeight}]} onLayout={onPanelLayout}>
          <EngageHeader
            title={view.title}
            heading={onFocusScreen || screen.kind === 'focusDone' || !owner ? ENGAGE_TEXT.heading : undefined}
            onClose={onClose}
            onBack={onFocusScreen && owner ? () => dispatch({type: 'back'}) : undefined}
            textColor={textColor}
          />
          {nextMeeting ? (
            <MeetingLine
              variant="next"
              text={nextHereText(nextMeeting.meeting, todayIso(), merged)}
              onPress={() => exits.openNextMeeting(nextMeeting)}
              textColor={textColor}
            />
          ) : null}
          {body()}
          {view.back && (screen.kind === 'options' || screen.kind === 'ownerEmpty') ? (
            <BackLine todo={view.back.todo} onPress={goBack} textColor={textColor} />
          ) : null}
          {todayNext && !merged ? (
            <MeetingLine variant="today" text={todayNextText(todayNext.meeting, meetingStartMs(todayNext.meeting), view.nowMs)} textColor={textColor} />
          ) : null}
          <EngageFooter
            select={select}
            closeIsMain={screen.kind === 'ownerEmpty' || screen.kind === 'focusDone'}
            onOpenGtdpara={() => press('openGtdpara', onOpenGtdpara)}
            onClose={() => press('close', onClose)}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      </StatusFrame>
    </View>
  );
}
