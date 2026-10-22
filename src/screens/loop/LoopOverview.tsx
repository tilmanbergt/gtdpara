/**
 * The loop overview (docs/dev/history/technical-design-loops.md §4.5):
 * everything of one loop in its owner - drawn over the tab body by
 * screens/useAppOverlays.tsx, opened from a loop tag or a loop row
 * (ui/overviewStore.ts).
 *
 * Header: "‹ <tab>" (closes it), ○ the loop's name, its kind and owner, the
 * main date with the days to go (or that it is closed), then Note › (the
 * loop note, created from the Loop rule on first use), File › - or Link
 * file, which opens the loop's page with its Files pane armed - Edit and
 * Close loop (ui/useCloseLoop.ts) - Reopen for a closed loop. Left: Ahead above Looking back, the thread overview's sections over
 * storage/loopAggregate.ts. Right: Quick Add - a new todo gets the loop's
 * tag and goes to the owner; Edit loads the loop itself (its tag, main date
 * and file) and saves through storage/loops.ts's `updateLoop`, which asks
 * about renames in the status slot. Below it the selected Looking back row.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatDate} from '../../domain/dateFormat';
import {Destination} from '../../domain/destination';
import {loopAsTodo, parseLoopEdit, titleWithLoopTag, withLoopTag} from '../../domain/loopEdit';
import {todayIso} from '../../domain/meetingTime';
import {daysBetween} from '../../domain/nextMeeting';
import {getCachedData} from '../../storage/dataCache';
import {buildLoopOverview} from '../../storage/loopAggregate';
import {setLoopStatus, updateLoop} from '../../storage/loops';
import {nextMeetingOffers, PastMeeting} from '../../storage/threadAggregate';
import QuickAddWidget, {editTargetFor} from '../../ui/QuickAddWidget';
import {MeetingSeed} from '../../ui/quickAdd/useDraftRequests';
import {COLORS, FONT, SPACING, useThemeColors} from '../../ui/theme';
import {requestLoopLink} from '../../ui/loopLinkStore';
import {useActionError} from '../../ui/useActionError';
import {useCloseLoop} from '../../ui/useCloseLoop';
import {useCachedItems} from '../../ui/useCachedItems';
import {useLoopKinds} from '../../ui/useLoopKinds';
import {useLoopNote} from '../../ui/useLoopNote';
import {useStatusConfirm} from '../../ui/useStatusConfirm';
import {log} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {useLinkedFileMissing} from '../usePlanningScreen';
import AheadSection, {NextOffer} from '../thread/AheadSection';
import {useMeetingCard} from '../../ui/itemCard/useMeetingCard';
import {useTodoCard} from '../../ui/itemCard/useTodoCard';
import LookingBackSection, {SINCE_KEY} from '../thread/LookingBackSection';
import PastMeetingPanel, {PanelSelection} from '../thread/PastMeetingPanel';
import EngageButton from '../../ui/EngageButton';
import {requestReviewStep, somedayFilterOf} from '../review/reviewNav';
import {meetingEntryKey, taskEntryKey, useEntryActions} from '../../ui/useEntryActions';

/** Ahead's fixed list height (dp), as in the thread overview; Looking back takes the rest. */
const AHEAD_VIEWPORT_DP = 480;
const LOOP_EDIT_KEY = 'loop';

/** A loop overview request: the loop's tag and the Project or Area it lives in. */
export interface LoopOverviewRequest {
  tag: string;
  ownerPath: string;
}

interface Props {
  request: LoopOverviewRequest;
  backLabel: string;
  onClose: () => void;
}

export default function LoopOverview(props: Props): React.JSX.Element {
  const requestKey = `${props.request.tag}|${props.request.ownerPath}`;
  // The same e-ink refresh as the thread overview (one commit replaces the whole tab body).
  useEffect(() => {
    log('LoopOverview: opened');
    requestEinkRefresh();
  }, [requestKey]);
  return <LoopOverviewBody key={requestKey} {...props} />;
}

function LoopOverviewBody({request, backLabel, onClose}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor} = useThemeColors();
  const items = useCachedItems();
  const {kinds} = useLoopKinds();
  const actions = useEntryActions();
  const {edit} = actions;
  const ask = useStatusConfirm('LoopOverview.confirm');
  const openNote = useLoopNote('LoopOverview');
  const closeLoop = useCloseLoop('LoopOverview');
  const loopAction = useActionError('LoopOverview.loopError', 'LoopOverview: loop save failed');
  const overview = useMemo(
    () => buildLoopOverview(items, request.tag, request.ownerPath, kinds),
    [items, request.tag, request.ownerPath, kinds],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [seed, setSeed] = useState<MeetingSeed | null>(null);
  const [loopEditing, setLoopEditing] = useState(false);
  // A row taken into edit ends the loop's own edit.
  useEffect(() => {
    if (edit.target) setLoopEditing(false);
  }, [edit.target]);

  const lists = overview?.lists ?? null;
  const target = edit.target;
  const taskEntries = lists ? [...lists.ahead.owe, ...lists.ahead.waiting, ...lists.ahead.relevant, ...lists.since.done, ...lists.past.flatMap(p => p.agreed)] : [];
  const meetingEntries = lists ? [...lists.ahead.meetings, ...lists.past.map(p => p.entry)] : [];
  const editingTask = target?.type === 'task' ? taskEntries.find(e => taskEntryKey(e) === target.key) ?? null : null;
  const editingMeeting = target?.type === 'meeting' ? meetingEntries.find(e => meetingEntryKey(e) === target.key) ?? null : null;
  const editing = editingTask ? {task: editingTask} : editingMeeting ? {meeting: editingMeeting} : null;
  const linkedFileMissing = useLinkedFileMissing(
    editingTask?.task.linkedFile ?? editingMeeting?.meeting.linkedFile,
    getCachedData()?.paths ?? null,
  );

  // The selected Ahead meeting's card in Quick Add's place (docs/dev/history/technical-design-item-card.md §6).
  const meetingCard = useMeetingCard(actions.cardOptions(loopEditing ? null : editingMeeting));
  const todoCard = useTodoCard(actions.todoCardOptions(loopEditing ? null : editingTask));

  if (!overview || !lists) {
    return (
      <View style={styles.overlay}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={[styles.back, {color: textColor}]}>{backLabel}</Text>
        </Pressable>
        <Text style={[styles.hint, {color: textColor}]}>#{request.tag} is not a loop here.</Text>
      </View>
    );
  }

  const {loop, line, owner} = overview;
  const today = todayIso();
  const sinceSelected = selectedKey === SINCE_KEY && !!lists.since.from;
  const selected: PastMeeting | null = sinceSelected
    ? null
    : lists.past.find(p => meetingEntryKey(p.entry) === selectedKey) ?? lists.past[0] ?? null;
  const panel: PanelSelection | null =
    sinceSelected && lists.since.from
      ? {kind: 'since', from: lists.since.from, done: lists.since.done}
      : selected
        ? {kind: 'meeting', past: selected}
        : null;
  const offers: NextOffer[] = nextMeetingOffers(lists, today).map(({type, seed: fields}) => ({
    type,
    onPress: () =>
      edit.afterSave(() => {
        edit.set(null);
        setLoopEditing(false);
        setSeed({fields, nonce: Date.now()});
      }),
  }));
  const destination: Destination = {type: 'item', kind: owner.kind === 'area' ? 'area' : 'project', name: owner.name, path: owner.path};

  const dateText = !line
    ? 'not tracked yet'
    : line.status !== 'active'
      ? `${line.status}${line.mainDate ? ` · ${formatDate(line.mainDate, today)}` : ''}`
      : line.mainDate
        ? `${formatDate(line.mainDate, today)} · ${daysText(daysBetween(today, line.mainDate))}`
        : 'no main date';

  const startLoopEdit = () =>
    edit.afterSave(() => {
      edit.set(null);
      setLoopEditing(true);
    });
  const saveLoop = async (composed: string, linkedFile: string): Promise<boolean> => {
    const next = parseLoopEdit(composed, kinds);
    if (!next) {
      loopAction.runSave(async () => {
        throw new Error('A loop is its tag and a main date only - write todos of it as todos.');
      });
      return false;
    }
    let saved = false;
    const ok = await loopAction.runSave(async () => {
      saved = await updateLoop(owner.path, loop.tag, next, linkedFile, ask);
    });
    if (!ok || !saved) return false;
    setLoopEditing(false);
    if (next.loop.tag !== loop.tag) onClose();
    return true;
  };

  const headerAction = (label: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} hitSlop={8} style={[styles.action, {borderColor}]}>
      <Text style={[styles.actionText, {color: textColor}]}>{label}</Text>
    </Pressable>
  );
  const file = line?.linkedFile ?? null;

  return (
    <View style={styles.overlay}>
      <View style={[styles.header, {borderColor}]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.backButton}>
          <Text style={[styles.back, {color: textColor}]}>{backLabel}</Text>
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={[styles.title, {color: textColor}]} numberOfLines={1}>
            ○ {loop.name}
          </Text>
          <Text style={[styles.sub, {color: textColor}]} numberOfLines={1}>
            {`${loop.kind} · in ${owner.name} · ${dateText}`}
          </Text>
        </View>
        {line && headerAction('Note ›', () => openNote(owner.path, loop.tag))}
        {file && headerAction('File ›', () => actions.openFile(file))}
        {line?.status === 'active' && !file && headerAction('Link file', () => {
          requestLoopLink({ownerPath: owner.path, tag: loop.tag});
          onClose();
        })}
        {line && headerAction(loopEditing ? 'Editing…' : 'Edit', startLoopEdit)}
        {line?.status === 'active' && headerAction('Close loop', () => closeLoop(owner.path, loop.tag))}
        {line?.status === 'active' && <EngageButton owner={{kind: 'loop', itemPath: owner.path, tag: loop.tag}} textColor={textColor} borderColor={borderColor} />}
        {line && line.status !== 'active' && headerAction('Reopen', () => loopAction.run(() => setLoopStatus(owner.path, loop.tag, 'active')))}
      </View>
      <View style={styles.body}>
        <View style={[styles.column, styles.left]}>
          <AheadSection
            overview={lists}
            actions={actions}
            nextOffers={offers}
            viewportHeight={AHEAD_VIEWPORT_DP}
            sectionLabels={{owe: 'Agreed in its meetings', relevant: 'Todos'}}
            onOpenSomeday={entries => requestReviewStep('somedayMaybe', somedayFilterOf(`#${loop.tag}`, entries))}
            textColor={textColor}
            borderColor={borderColor}
          />
          <View style={styles.gap} />
          <LookingBackSection
            overview={lists}
            selectedKey={sinceSelected ? SINCE_KEY : selected ? meetingEntryKey(selected.entry) : null}
            onSelect={setSelectedKey}
            resetKey={loop.tag}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
        <View style={styles.column}>
          <QuickAddWidget
            layoutKey="loop"
            fixedDestination={destination}
            meetingSeed={seed}
            onAddTask={(text, dest) => actions.addTask(withLoopTag(text, loop.tag), dest)}
            onAddMeeting={(fields, dest) => actions.addMeeting({...fields, title: titleWithLoopTag(fields.title, loop.tag)}, dest)}
            editTarget={editTargetFor(loopEditing ? LOOP_EDIT_KEY : target ? `${target.type}:${target.key}` : null, {
              task: loopEditing && line ? loopAsTodo(line) : editingTask?.task,
              loop: loopEditing,
              meeting: loopEditing ? undefined : editingMeeting?.meeting,
            }, loopEditing ? 'edit' : edit.mode)}
            meetingCard={meetingCard}
            todoCard={todoCard}
            flushEditRef={edit.flushEditRef}
            editingItemPath={owner.path}
            linkedFileMissing={loopEditing ? false : linkedFileMissing}
            onSaveEditTask={(text, linkedFile) =>
              loopEditing ? saveLoop(text, linkedFile) : editingTask ? actions.commitTaskEdit(editingTask, text, linkedFile) : Promise.resolve(true)
            }
            onSaveEditMeeting={(fields, linkedFile) =>
              editingMeeting ? actions.commitMeetingEdit(editingMeeting, fields, linkedFile) : Promise.resolve(true)
            }
            onCancelEdit={() => (loopEditing ? setLoopEditing(false) : edit.cancel())}
            onDeleteEdit={() => editing && actions.cancelEntry(editing)}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
          <PastMeetingPanel selection={panel} actions={actions} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    </View>
  );
}

function daysText(days: number): string {
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderBottomWidth: 1,
    marginBottom: SPACING.sm,
  },
  backButton: {paddingRight: SPACING.base, paddingVertical: SPACING.xs},
  back: {fontSize: FONT.medium, fontWeight: '600'},
  titleBox: {flex: 1, flexDirection: 'row', alignItems: 'baseline'},
  title: {fontSize: FONT.large, fontWeight: '700', marginRight: SPACING.md},
  sub: {flex: 1, fontSize: FONT.small, opacity: 0.6},
  action: {borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginLeft: SPACING.sm},
  actionText: {fontSize: FONT.small, fontWeight: '600'},
  hint: {fontSize: FONT.medium, opacity: 0.6, marginTop: SPACING.md},
  body: {flex: 1, flexDirection: 'row'},
  column: {flex: 1},
  left: {marginRight: SPACING.base},
  gap: {height: 18},
});
