/**
 * Review step "Tending threads" (docs/dev/history/technical-design-tending-threads.md
 * §3.10): ongoing relationships and series as a matter of keeping one's
 * word. Left, the roster (storage/tendingRoster.ts), frozen when the step is
 * entered: the New block on top (new counterparts and inactive ones back in
 * use, decisions D3/D20), then each scope's active counterparts (an Area
 * with its Projects, or a Project without an Area; the Inbox has none,
 * decision D18). Two lines a row: last · next meeting, or the one-off label
 * (decision D17); then I owe and the oldest Waiting for. No ranking:
 * scopes in the Areas/Projects order, counterparts alphabetically.
 *
 * Right, Quick Add (to the scope's owner; "+ Next <type>" fills its meeting
 * draft, to the thread's item) above screens/thread/ThreadSummary.tsx. "Open
 * overview ›" opens the overlay over Review; its Back returns to the step as
 * it was. "Set inactive" runs the close-out (ui/CounterpartCloseOut.tsx) in
 * the detail column. Rows acted on stay listed with a checkmark.
 */
import React, {useCallback, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Destination} from '../../../domain/destination';
import {oneOffLabel, ruleTypesOf} from '../../../domain/counterparts';
import {todayIso} from '../../../domain/meetingTime';
import {rosterCountsText, rosterMeetingText} from '../../../domain/threadText';
import {CounterpartStatus} from '../../../domain/threadsSection';
import {setCachedInbox} from '../../../storage/dataCache';
import {addMeetingToDestination, buildMeeting} from '../../../storage/itemMutations';
import {buildTendingRoster, RosterEntry, RosterScope} from '../../../storage/tendingRoster';
import {NextMeetingOffer, ThreadItemRef} from '../../../storage/threadAggregate';
import CounterpartCloseOut, {useSetInactive} from '../../../ui/CounterpartCloseOut';
import QuickAddWidget, {MeetingQuickAddFields} from '../../../ui/QuickAddWidget';
import {MeetingSeed} from '../../../ui/quickAdd/useDraftRequests';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {FONT, SPACING} from '../../../ui/theme';
import {openThreadOverview} from '../../../ui/threadOverlayStore';
import {log} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import {needsConfirm, useTendActions} from '../../thread/useTending';
import ThreadSummary from '../../thread/ThreadSummary';
import {bump} from '../reviewVisit';
import {ReviewEmptyDetail, ReviewStepProps} from '../shared';
import {useFrozenStepList} from '../useFrozenStepList';
import {ReviewData} from '../useReviewData';

const HEAD_HEIGHT = 30;
const ROW_HEIGHT = 57;

type RosterRow = {kind: 'head'; key: string; label: string} | {kind: 'cp'; key: string; ownerPath: string; leaf: string};

const entryKey = (e: RosterEntry) => `${e.owner.path}|${e.counterpart.leaf}`;

/** The live roster of every scope, or null until settings (the Tag Rules) are loaded. */
export function useTendingRoster(data: ReviewData): RosterScope[] | null {
  const {items, inbox, inboxPath, settings} = data;
  return useMemo(() => {
    if (!settings) return null;
    const inboxInput = inbox && inboxPath ? {path: inboxPath, tasks: inbox.tasks, meetings: inbox.meetings} : null;
    return buildTendingRoster(items, inboxInput, ruleTypesOf(settings.tagRules));
  }, [items, inbox, inboxPath, settings]);
}

/** The step's count: counterparts to confirm plus the active ones. */
export function tendingCount(roster: RosterScope[] | null): number {
  if (!roster) return 0;
  return roster.reduce((sum, scope) => sum + scope.confirm.filter(needsConfirm).length + scope.active.length, 0);
}

/** The frozen rows: the New block, then each scope's active counterparts under its name. */
function rosterRows(roster: RosterScope[]): RosterRow[] {
  const all = roster.flatMap(scope => scope.confirm).filter(needsConfirm);
  const rows: RosterRow[] = [];
  if (all.length > 0) {
    rows.push({kind: 'head', key: 'h-new', label: 'New'});
    all.forEach(e => rows.push({kind: 'cp', key: entryKey(e), ownerPath: e.owner.path, leaf: e.counterpart.leaf}));
  }
  for (const scope of roster) {
    if (scope.active.length === 0) continue;
    rows.push({kind: 'head', key: `h-${scope.owner.path}`, label: scope.owner.name});
    scope.active.forEach(e => rows.push({kind: 'cp', key: entryKey(e), ownerPath: e.owner.path, leaf: e.counterpart.leaf}));
  }
  return rows;
}

function destinationOf(item: ThreadItemRef): Destination {
  return item.kind === 'inbox' ? {type: 'inbox'} : {type: 'item', kind: item.kind, name: item.name, path: item.path};
}

export default function TendingThreadsStep({data, stepEntryToken, onAddTask, textColor, borderColor, placeholderColor}: ReviewStepProps): React.JSX.Element {
  const roster = useTendingRoster(data);
  const source = useMemo(() => (roster ? rosterRows(roster) : null), [roster]);
  const frozen = useFrozenStepList(source, stepEntryToken);
  const live = new Map<string, RosterEntry>();
  for (const scope of roster ?? []) for (const e of [...scope.confirm, ...scope.active, ...scope.inactive]) live.set(entryKey(e), e);

  const [closeOutKey, setCloseOutKey] = useState<string | null>(null);
  const [seed, setSeed] = useState<MeetingSeed | null>(null);
  const [seedItem, setSeedItem] = useState<ThreadItemRef | null>(null);
  const today = todayIso();

  const onChanged = useCallback(
    (entry: RosterEntry, status: CounterpartStatus | 'dismissed') => {
      if (status === 'active') bump('counterpartsConfirmed');
      else if (status === 'inactive') bump('counterpartsSetInactive');
      frozen.markActed(entryKey(entry));
      data.refreshFromCache();
    },
    [frozen, data],
  );
  const tend = useTendActions('ReviewScreen.tending', onChanged);
  const setInactive = useSetInactive('ReviewScreen.setInactive', entry => onChanged(entry, 'inactive'));

  const addMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, {inbox: data.inbox, inboxPath: data.inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    if (seedItem) bump('nextMeetingsAdded');
    log('TendingThreadsStep: meeting added', seedItem ? 'from + Next' : 'new');
    setSeedItem(null);
    data.refreshFromCache();
    requestEinkRefresh();
  };

  const renderRow = (row: RosterRow, selected: boolean, actedOn: boolean): React.ReactNode => {
    if (row.kind === 'head') {
      return (
        <Text key={row.key} style={[styles.head, {color: textColor}]} numberOfLines={1}>
          {row.label}
        </Text>
      );
    }
    const entry = live.get(row.key);
    const cp = entry?.counterpart;
    const marker = cp?.backInUse && cp.status === 'inactive' ? 'back in use' : cp?.status === 'new' ? 'new' : null;
    const oneOff = cp?.oneOff ? oneOffLabel(cp.oneOff) : null;
    const counts = entry ? rosterCountsText(entry) : '';
    const meeting = entry ? rosterMeetingText(entry, oneOff, today) : '';
    return (
      <View style={[styles.row, {borderColor}, selected && styles.rowSelected]}>
        <View style={styles.line}>
          <Text style={[styles.name, {color: textColor}, actedOn && styles.acted]} numberOfLines={1}>
            {actedOn ? '✓ ' : ''}
            {row.leaf}
          </Text>
          {marker && <Text style={[styles.small, styles.dim, {color: textColor}]}> · {marker}</Text>}
          <View style={styles.spacer} />
          {entry && marker && (
            <Text style={[styles.small, styles.dim, {color: textColor}]} numberOfLines={1}>
              {entry.owner.name}
            </Text>
          )}
        </View>
        <Text style={[styles.small, styles.dim, {color: textColor}]} numberOfLines={1}>
          {counts ? `${meeting} · ${counts}` : meeting}
        </Text>
      </View>
    );
  };

  const renderDetail = (selectedKey: string | null): React.ReactNode => {
    const entry = selectedKey ? live.get(selectedKey) : undefined;
    if (!entry) {
      return (
        <ReviewEmptyDetail
          title="No counterpart selected"
          text="The people, teams and series you meet or owe something to, per Area or Project. Is the next meeting set up? Agreements followed up? Anything waiting too long? New ones: Tend or Not."
          hint="Tap a counterpart on the left to get started."
          textColor={textColor}
        />
      );
    }
    if (closeOutKey === selectedKey) {
      return (
        <CounterpartCloseOut
          entry={entry}
          onClose={applied => {
            if (applied) onChanged(entry, 'inactive');
            setCloseOutKey(null);
          }}
          textColor={textColor}
          borderColor={borderColor}
        />
      );
    }
    const destination = destinationOf(seedItem ?? entry.owner);
    return (
      <View>
        <QuickAddWidget
          layoutKey="tending"
          fixedDestination={destination}
          meetingSeed={seed}
          onAddTask={onAddTask}
          onAddMeeting={addMeeting}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
        <ThreadSummary
          entry={entry}
          confirm={needsConfirm(entry)}
          onTend={() => tend.confirm(entry, true)}
          onNot={() => tend.confirm(entry, false)}
          onOpenOverview={() => openThreadOverview({tag: entry.tag, ownerPath: entry.owner.path, lens: 'counterpart'})}
          onSetInactive={() =>
            setInactive(entry).then(result => {
              if (result === 'closeOut') setCloseOutKey(entryKey(entry));
            })
          }
          onNextMeeting={(offer: NextMeetingOffer) => {
            setSeed({fields: offer.seed, nonce: Date.now()});
            setSeedItem(offer.item);
          }}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
    );
  };

  return (
    <ReviewMasterDetail<RosterRow>
      header="Tending threads"
      rows={frozen.list}
      rowHeight={row => (row.kind === 'head' ? HEAD_HEIGHT : ROW_HEIGHT)}
      isSelectable={row => row.kind === 'cp'}
      isCountableRow={row => row.kind === 'cp'}
      rowKey={row => row.key}
      renderRow={renderRow}
      renderDetail={renderDetail}
      actedOnKeys={frozen.actedOn}
      resetKey={stepEntryToken}
      emptyHint="No counterparts yet. Nested tags of your Tag Rules (#retro/alpha), #wf/<name> and #owe/<name> make them."
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

const styles = StyleSheet.create({
  head: {fontSize: FONT.small, fontWeight: '600', opacity: 0.6, height: HEAD_HEIGHT, paddingTop: 10},
  row: {height: ROW_HEIGHT, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACING.xs},
  rowSelected: {borderLeftWidth: 4},
  line: {flexDirection: 'row', alignItems: 'baseline'},
  name: {fontSize: FONT.medium, fontWeight: '600', flexShrink: 1},
  acted: {opacity: 0.6},
  small: {fontSize: FONT.small},
  dim: {opacity: 0.7},
  spacer: {flex: 1},
});
