/**
 * The thread overview (docs/dev/history/technical-design-tending-threads.md
 * §3.5): everything around one thread or counterpart, inside the owner's
 * scope - drawn over the tab body by screens/useAppOverlays.tsx, opened from
 * a nested tag or a `#w/f Name` label (ui/threadOverlayStore.ts).
 *
 * Header: "‹ <tab>" (closes it), the tag, the owner, the lens switch
 * (thread | all of the counterpart). Left: Ahead above Looking back. Right:
 * Quick Add, then the selected past meeting (the latest by default) with the
 * todos agreed in it. While a past meeting is selected, a new todo records
 * it as provenance and goes to that meeting's item; otherwise new entries go
 * to the owner (the Inbox when there is none). "+ Next <type>" fills Quick
 * Add's meeting draft from the thread's latest meeting, to that meeting's
 * item.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Destination} from '../../domain/destination';
import {todayIso} from '../../domain/meetingTime';
import {MeetingSeedFields, nextMeetingSeed} from '../../domain/nextMeeting';
import {belongsToThread, ThreadLens, ThreadRef} from '../../domain/threads';
import {lensLabels} from '../../domain/threadText';
import {buildThreadOverview, PastMeeting, ThreadItemRef, ThreadOverview as Overview} from '../../storage/threadAggregate';
import MiniTabs from '../../ui/MiniTabs';
import QuickAddWidget from '../../ui/QuickAddWidget';
import {MeetingSeed} from '../../ui/quickAdd/useDraftRequests';
import {useProvenance} from '../../ui/quickAdd/useProvenance';
import {ThreadOverviewRequest} from '../../ui/threadOverlayStore';
import {COLORS, FONT, SPACING, useThemeColors} from '../../ui/theme';
import {useCachedItems} from '../../ui/useCachedItems';
import {getCachedData} from '../../storage/dataCache';
import {useLinkedFileMissing} from '../usePlanningScreen';
import AheadSection, {NextOffer} from './AheadSection';
import LookingBackSection from './LookingBackSection';
import PastMeetingPanel from './PastMeetingPanel';
import {meetingEntryKey, taskEntryKey, useThreadActions} from './useThreadActions';

/** Ahead's fixed list height (dp), design §3.5.2; Looking back takes the rest of the column. */
const AHEAD_VIEWPORT_DP = 480;

function destinationOf(item: ThreadItemRef | null): Destination {
  if (!item || item.kind === 'inbox') return {type: 'inbox'};
  return {type: 'item', kind: item.kind, name: item.name, path: item.path};
}

/** "+ Next <type>" offers: per type, the thread's meetings in the overview, seeded from the latest. */
function nextSeeds(overview: Overview, today: string): Array<{type: string; seed: MeetingSeedFields; item: ThreadItemRef}> {
  const types = overview.lens === 'thread' ? [overview.thread.type] : overview.types.filter(t => t !== 'wf');
  const entries = [...overview.ahead.meetings, ...overview.past.map(p => p.entry)];
  const out: Array<{type: string; seed: MeetingSeedFields; item: ThreadItemRef}> = [];
  for (const type of types) {
    const thread: ThreadRef = {type, counterpart: overview.thread.counterpart, tag: `${type}/${overview.thread.counterpart}`};
    const own = entries.filter(e => belongsToThread(e.meeting.tags, thread));
    const seed = nextMeetingSeed(own.map(e => e.meeting), today);
    const base = own.reduce<(typeof own)[number] | null>(
      (latest, e) => (!latest || `${e.meeting.date} ${e.meeting.time}` > `${latest.meeting.date} ${latest.meeting.time}` ? e : latest),
      null,
    );
    if (seed && base) out.push({type, seed, item: base.item});
  }
  return out;
}

interface Props {
  request: ThreadOverviewRequest;
  backLabel: string;
  onClose: () => void;
}

export default function ThreadOverview(props: Props): React.JSX.Element {
  // A new request (another tag tapped inside) starts fresh.
  return <ThreadOverviewBody key={`${props.request.tag}|${props.request.ownerPath ?? ''}|${props.request.lens}`} {...props} />;
}

function ThreadOverviewBody({request, backLabel, onClose}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor} = useThemeColors();
  const items = useCachedItems();
  const actions = useThreadActions();
  const {inbox, inboxPath, edit} = actions;
  const [lens, setLens] = useState<ThreadLens>(request.lens);
  const overview = useMemo(
    () =>
      buildThreadOverview(
        items,
        inbox && inboxPath ? {path: inboxPath, tasks: inbox.tasks, meetings: inbox.meetings} : null,
        request.tag,
        lens,
        request.ownerPath,
      ),
    [items, inbox, inboxPath, request.tag, request.ownerPath, lens],
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected: PastMeeting | null =
    overview?.past.find(p => meetingEntryKey(p.entry) === selectedKey) ?? overview?.past[0] ?? null;
  const origin = useProvenance(selected?.entry.meeting ?? null);
  const [seed, setSeed] = useState<MeetingSeed | null>(null);
  const [seedItem, setSeedItem] = useState<ThreadItemRef | null>(null);

  // The edited row, found in whichever list shows it.
  const target = edit.target;
  const taskEntries = overview ? [...overview.ahead.owe, ...overview.ahead.waiting, ...overview.ahead.relevant, ...overview.past.flatMap(p => p.agreed)] : [];
  const meetingEntries = overview ? [...overview.ahead.meetings, ...overview.past.map(p => p.entry)] : [];
  const editingTask = target?.type === 'task' ? taskEntries.find(e => taskEntryKey(e) === target.key) ?? null : null;
  const editingMeeting = target?.type === 'meeting' ? meetingEntries.find(e => meetingEntryKey(e) === target.key) ?? null : null;
  const editing = editingTask ? {task: editingTask} : editingMeeting ? {meeting: editingMeeting} : null;
  const editedItem = (editingTask ?? editingMeeting)?.item ?? null;
  const linkedFileMissing = useLinkedFileMissing(
    editingTask?.task.linkedFile ?? editingMeeting?.meeting.linkedFile,
    getCachedData()?.paths ?? null,
  );

  if (!overview) {
    return (
      <View style={styles.overlay}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={[styles.back, {color: textColor}]}>{backLabel}</Text>
        </Pressable>
        <Text style={[styles.hint, {color: textColor}]}>#{request.tag} is not a thread tag.</Text>
      </View>
    );
  }

  const today = todayIso();
  const offers: NextOffer[] = nextSeeds(overview, today).map(({type, seed: fields, item}) => ({
    type,
    onPress: () =>
      edit.afterSave(() => {
        edit.set(null);
        setSeed({fields, nonce: Date.now()});
        setSeedItem(item);
      }),
  }));

  const fixedDestination = destinationOf(seedItem ?? (origin.active && selected ? selected.entry.item : overview.owner));
  const labels = lensLabels(overview.thread);

  return (
    <View style={styles.overlay}>
      <View style={[styles.header, {borderColor}]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.backButton}>
          <Text style={[styles.back, {color: textColor}]}>{backLabel}</Text>
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={[styles.tag, {color: textColor}]} numberOfLines={1}>
            #{overview.thread.tag}
          </Text>
          <Text style={[styles.owner, {color: textColor}]} numberOfLines={1}>
            {overview.owner ? `in ${overview.owner.name}` : 'in all files'}
          </Text>
        </View>
        <View style={styles.lens}>
          <MiniTabs<ThreadLens>
            tabs={[
              {key: 'thread', label: labels.thread},
              {key: 'counterpart', label: labels.counterpart},
            ]}
            activeKey={lens}
            onChange={next => edit.afterSave(() => {
              edit.set(null);
              setLens(next);
            })}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      </View>
      <View style={styles.body}>
        <View style={[styles.column, styles.left]}>
          <AheadSection
            overview={overview}
            actions={actions}
            nextOffers={offers}
            viewportHeight={AHEAD_VIEWPORT_DP}
            textColor={textColor}
            borderColor={borderColor}
          />
          <View style={styles.gap} />
          <LookingBackSection
            past={overview.past}
            selectedKey={selected ? meetingEntryKey(selected.entry) : null}
            onSelect={p => setSelectedKey(meetingEntryKey(p.entry))}
            resetKey={`${overview.thread.tag}|${lens}`}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
        <View style={styles.column}>
          <QuickAddWidget
            layoutKey="thread"
            fixedDestination={fixedDestination}
            provenance={origin.provenance}
            meetingSeed={seed}
            onAddTask={(line, dest) => actions.addTask(origin.apply(line), dest).then(origin.added)}
            onAddMeeting={(fields, dest) => actions.addMeeting(fields, dest).then(() => setSeedItem(null))}
            editingTask={editingTask?.task}
            editingMeeting={editingMeeting?.meeting}
            editTargetKey={target ? `${target.type}:${target.key}` : null}
            flushEditRef={edit.flushEditRef}
            editingItemPath={editedItem ? (editedItem.kind === 'inbox' ? null : editedItem.path) : undefined}
            linkedFileMissing={linkedFileMissing}
            onSaveEditTask={(line, linkedFile) => (editingTask ? actions.commitTaskEdit(editingTask, line, linkedFile) : Promise.resolve(true))}
            onSaveEditMeeting={(fields, linkedFile) =>
              editingMeeting ? actions.commitMeetingEdit(editingMeeting, fields, linkedFile) : Promise.resolve(true)
            }
            onCancelEdit={edit.cancel}
            onDeleteEdit={() => editing && actions.cancelEntry(editing)}
            onQuickFile={(match, payload) => (editing ? actions.quickFile(editing, match, payload) : Promise.resolve())}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
          <PastMeetingPanel past={selected} actions={actions} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    </View>
  );
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
  tag: {fontSize: FONT.large, fontWeight: '700', marginRight: SPACING.md},
  owner: {flex: 1, fontSize: FONT.small, opacity: 0.6},
  lens: {width: 380},
  hint: {fontSize: FONT.medium, opacity: 0.6, marginTop: SPACING.md},
  body: {flex: 1, flexDirection: 'row'},
  column: {flex: 1},
  left: {marginRight: SPACING.base},
  gap: {height: 18},
});
