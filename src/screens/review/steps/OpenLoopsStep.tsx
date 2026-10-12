/**
 * Review step "Open loops" (docs/dev/history/technical-design-loops.md §4.8):
 * the active loops per scope (storage/loopRoster.ts), frozen when the step
 * is entered - an Area with its Projects, then each Project without an Area.
 * Two lines a row: ○ the loop and its kind (and its Project, inside an
 * Area's scope); then main date · next meeting and the counts of its own
 * todos, and what needs a look: "no next action", or "was <date> · close?".
 *
 * Right: Quick Add - a new todo gets the loop's tag and goes to the loop's
 * Area or Project - above the loop's summary with "Open overview ›" and
 * "Close loop" (ui/useCloseLoop.ts). Closed loops stay listed with a
 * checkmark.
 */
import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatDate} from '../../../domain/dateFormat';
import {Destination} from '../../../domain/destination';
import {withLoopTag} from '../../../domain/loopEdit';
import {todayIso} from '../../../domain/meetingTime';
import {loopDateText} from '../../../storage/loopGlance';
import {buildLoopRoster, LoopRosterEntry, LoopRosterScope, loopRosterCount} from '../../../storage/loopRoster';
import {glanceCountsText} from '../../../storage/projectGlance';
import {openOverview} from '../../../ui/overviewStore';
import QuickAddWidget from '../../../ui/QuickAddWidget';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {FONT, SPACING} from '../../../ui/theme';
import {useCloseLoop} from '../../../ui/useCloseLoop';
import {useLoopKinds} from '../../../ui/useLoopKinds';
import {bump} from '../reviewVisit';
import {noopAddMeeting, ReviewEmptyDetail, ReviewStepProps} from '../shared';
import {useFrozenStepList} from '../useFrozenStepList';
import {ReviewData} from '../useReviewData';

const HEAD_HEIGHT = 30;
const ROW_HEIGHT = 57;

type LoopRow = {kind: 'head'; key: string; label: string} | {kind: 'loop'; key: string; label: string};

const entryKey = (e: LoopRosterEntry) => `${e.owner.path}|${e.glance.line.tag}`;

/** The live roster of open loops. */
export function useLoopRoster(data: ReviewData): LoopRosterScope[] {
  const {kinds} = useLoopKinds();
  const {items} = data;
  return useMemo(() => buildLoopRoster(items, kinds, todayIso()), [items, kinds]);
}

/** The step's count: the loops that need a look. */
export const openLoopsCount = loopRosterCount;

function rosterRows(roster: LoopRosterScope[]): LoopRow[] {
  const rows: LoopRow[] = [];
  for (const scope of roster) {
    rows.push({kind: 'head', key: `h-${scope.owner.path}`, label: scope.owner.name});
    scope.loops.forEach(e => rows.push({kind: 'loop', key: entryKey(e), label: e.glance.loop.name}));
  }
  return rows;
}

/** "was <date> · close?" for a loop past its main date; "no next action" is in the counts already. */
function attentionText(entry: LoopRosterEntry, today: string): string | null {
  return entry.attention === 'pastMainDate' && entry.glance.line.mainDate ? `was ${formatDate(entry.glance.line.mainDate, today)} · close?` : null;
}

export default function OpenLoopsStep({data, stepEntryToken, onAddTask, textColor, borderColor, placeholderColor}: ReviewStepProps): React.JSX.Element {
  const roster = useLoopRoster(data);
  const source = useMemo(() => rosterRows(roster), [roster]);
  const frozen = useFrozenStepList(source, stepEntryToken);
  const live = new Map<string, LoopRosterEntry>();
  for (const scope of roster) for (const e of scope.loops) live.set(entryKey(e), e);
  const closeLoop = useCloseLoop('ReviewScreen.openLoops');
  const today = todayIso();
  const dateOf = (iso: string) => formatDate(iso, today);

  const renderRow = (row: LoopRow, selected: boolean, actedOn: boolean): React.ReactNode => {
    if (row.kind === 'head') {
      return (
        <Text key={row.key} style={[styles.head, {color: textColor}]} numberOfLines={1}>
          {row.label}
        </Text>
      );
    }
    const entry = live.get(row.key);
    const flag = entry ? attentionText(entry, today) : null;
    const inProject = entry && entry.owner.kind === 'project' ? ` · ${entry.owner.name}` : '';
    const line2 = entry ? [loopDateText(entry.glance, dateOf), glanceCountsText(entry.glance)].filter(Boolean).join(' · ') : 'closed';
    return (
      <View style={[styles.row, {borderColor}, selected && styles.rowSelected]}>
        <View style={styles.line}>
          <Text style={[styles.name, {color: textColor}, actedOn && styles.acted]} numberOfLines={1}>
            {actedOn ? '✓ ' : '○ '}
            {row.label}
          </Text>
          <Text style={[styles.small, styles.dim, {color: textColor}]} numberOfLines={1}>
            {entry ? ` ${entry.glance.loop.kind}${inProject}` : ''}
          </Text>
          <View style={styles.spacer} />
          {flag && <Text style={[styles.small, styles.flag, {color: textColor}]}>{flag}</Text>}
        </View>
        <Text style={[styles.small, styles.dim, {color: textColor}]} numberOfLines={1}>
          {line2}
        </Text>
      </View>
    );
  };

  const renderDetail = (selectedKey: string | null): React.ReactNode => {
    const entry = selectedKey ? live.get(selectedKey) : undefined;
    if (!entry) {
      return (
        <ReviewEmptyDetail
          title={selectedKey ? 'Loop closed' : 'No loop selected'}
          text="Your loops, per Area or Project. Does each have a next action or a meeting ahead? Is one past its main date - done, or dropped?"
          hint="Tap a loop on the left to get started."
          textColor={textColor}
        />
      );
    }
    const {owner, glance} = entry;
    const tag = glance.line.tag;
    const destination: Destination = {type: 'item', kind: owner.kind, name: owner.name, path: owner.path};
    const flag = attentionText(entry, today);
    return (
      <View>
        <QuickAddWidget
          layoutKey="openLoops"
          fixedDestination={destination}
          taskOnly
          onAddTask={(text, dest) => onAddTask(withLoopTag(text, tag), dest)}
          onAddMeeting={noopAddMeeting}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
        <View style={styles.summary}>
          <Text style={[styles.title, {color: textColor}]}>○ {glance.loop.name}</Text>
          <Text style={[styles.small, {color: textColor}]}>{`${glance.loop.kind} · in ${owner.name}`}</Text>
          <Text style={[styles.small, {color: textColor}]}>{loopDateText(glance, dateOf)}</Text>
          <Text style={[styles.small, {color: textColor}]}>{glanceCountsText(glance)}</Text>
          {flag && <Text style={[styles.small, styles.flag, {color: textColor}]}>{flag}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={() => openOverview({tag, ownerPath: owner.path})} hitSlop={8} style={[styles.button, {borderColor}]}>
              <Text style={[styles.small, styles.buttonText, {color: textColor}]}>Open overview ›</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                closeLoop(owner.path, tag, () => {
                  bump('loopsClosed');
                  frozen.markActed(entryKey(entry));
                  data.refreshFromCache();
                })
              }
              hitSlop={8}
              style={[styles.button, {borderColor}]}>
              <Text style={[styles.small, styles.buttonText, {color: textColor}]}>Close loop</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ReviewMasterDetail<LoopRow>
      header="Open loops"
      rows={frozen.list}
      rowHeight={row => (row.kind === 'head' ? HEAD_HEIGHT : ROW_HEIGHT)}
      isSelectable={row => row.kind === 'loop'}
      isCountableRow={row => row.kind === 'loop'}
      rowKey={row => row.key}
      renderRow={renderRow}
      renderDetail={renderDetail}
      actedOnKeys={frozen.actedOn}
      resetKey={stepEntryToken}
      emptyHint="No open loops. A Tag Rule with the context Loop makes its tag a kind of loop (#workshop/<name>)."
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
  flag: {fontWeight: '700'},
  spacer: {flex: 1},
  summary: {marginTop: SPACING.md, gap: 4},
  title: {fontSize: FONT.large, fontWeight: '700'},
  actions: {flexDirection: 'row', marginTop: SPACING.sm, gap: SPACING.sm},
  button: {borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4},
  buttonText: {fontWeight: '600'},
});
