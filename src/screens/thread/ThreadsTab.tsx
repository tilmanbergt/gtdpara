/**
 * The Threads tab of the Current page's Files area
 * (docs/dev/history/technical-design-tending-threads.md §3.9.4): the
 * counterparts of the page's scope (on a Project with an Area, the Area's
 * counterparts this Project's entries use; otherwise all of the scope's), in
 * one PagedSection:
 *
 * - **New** - counterparts in use without a status line, and inactive ones
 *   back in use (decision D20): "Tend" writes `active`, "Not" `inactive`
 *   (a back-in-use offer is only hidden, screens/thread/useTending.ts).
 * - **Active** - two lines: the counterpart, then "last · next" (or the
 *   one-off label, decision D17) and the open I-owe / oldest Waiting-for
 *   counts. ▸ expands its meeting threads with their next date and "+ next";
 *   `wf`/`owe` are no threads. Tapping the name filters the Todos and
 *   Meetings on the right by the counterpart (§1.2.1); tapping it again, or
 *   the pill above Quick Add, clears the filter. › opens its overview.
 *   "Set inactive" shows on the filtered row and runs the close-out
 *   (ui/CounterpartCloseOut.tsx).
 * - **Inactive** - folded into one row; unfolded, each can be tended again.
 *
 * Every status write goes to the scope's owner file (decision D16) through
 * storage/counterparts.ts. The signals are storage/tendingRoster.ts's.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CounterpartScope, counterpartsOf, oneOffLabel, scopeMembers, scopeOwnerOf} from '../../domain/counterparts';
import {todayIso} from '../../domain/meetingTime';
import {belongsToThread, ThreadRef} from '../../domain/threads';
import {rosterCountsText, rosterMeetingText} from '../../domain/threadText';
import {formatDate} from '../../domain/dateFormat';
import {CachedItem} from '../../storage/dataCache';
import {buildScopeRoster, RosterEntry} from '../../storage/tendingRoster';
import {nextMeetingOffers, NextMeetingOffer} from '../../storage/threadAggregate';
import CounterpartCloseOut, {useSetInactive} from '../../ui/CounterpartCloseOut';
import PagedSection from '../../ui/PagedSection';
import {FONT, SPACING} from '../../ui/theme';
import {openThreadOverview} from '../../ui/threadOverlayStore';
import {needsConfirm, useTendActions, useTendingData} from './useTending';

const HEAD_HEIGHT = 30;
const CONFIRM_HEIGHT = 44;
const ACTIVE_HEIGHT = 57;
const THREAD_HEIGHT = 37;
const FOLD_HEIGHT = 37;
const INACTIVE_HEIGHT = 44;

type Row =
  | {kind: 'head'; key: string; label: string}
  | {kind: 'confirm'; key: string; entry: RosterEntry}
  | {kind: 'active'; key: string; entry: RosterEntry}
  | {kind: 'thread'; key: string; entry: RosterEntry; thread: ThreadRef; next: string | null; offer: NextMeetingOffer | null}
  | {kind: 'fold'; key: string; count: number}
  | {kind: 'inactive'; key: string; entry: RosterEntry};

const HEIGHTS: Record<Row['kind'], number> = {
  head: HEAD_HEIGHT,
  confirm: CONFIRM_HEIGHT,
  active: ACTIVE_HEIGHT,
  thread: THREAD_HEIGHT,
  fold: FOLD_HEIGHT,
  inactive: INACTIVE_HEIGHT,
};

/** The scope of the page `path` and, on a Project with an Area, the counterparts its own entries use. */
function pageScope(path: string, items: CachedItem[], ruleTypes: string[]): {scope: CounterpartScope<CachedItem>; only: Set<string> | null} | null {
  const owner = scopeOwnerOf(path, items);
  if (!owner) return null;
  const scope = {owner, members: scopeMembers(owner, items)};
  if (owner.path === path) return {scope, only: null};
  const page = items.find(i => i.path === path);
  if (!page) return {scope, only: new Set()};
  const used = counterpartsOf({owner: page, members: [page]}, ruleTypes).filter(c => c.inUse);
  return {scope, only: new Set(used.map(c => c.leaf))};
}

/** What the tab needs from the row the filter is on. */
export interface CounterpartSelection {
  leaf: string;
  tag: string;
}

interface Props {
  path: string;
  selected: CounterpartSelection | null;
  onSelect: (selection: CounterpartSelection | null) => void;
  /** "+ next" on a thread row: the seed for Quick Add's meeting draft and the item it goes to. */
  onNextMeeting: (offer: NextMeetingOffer) => void;
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
}

export default function ThreadsTab({path, selected, onSelect, onNextMeeting, viewportHeight, textColor, borderColor}: Props): React.JSX.Element {
  const {items, inbox, ruleTypes} = useTendingData();
  const tend = useTendActions('ThreadsTab.error');
  const setInactive = useSetInactive('ThreadsTab.setInactive', entry => {
    if (selected?.leaf === entry.counterpart.leaf) onSelect(null);
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [closeOut, setCloseOut] = useState<RosterEntry | null>(null);
  const today = todayIso();

  const built = useMemo(() => {
    const page = pageScope(path, items, ruleTypes);
    if (!page) return null;
    const scopeRoster = buildScopeRoster(items, inbox, page.scope, ruleTypes);
    const keep = (e: RosterEntry) => page.only === null || page.only.has(e.counterpart.leaf);
    return {owner: scopeRoster.owner, all: [...scopeRoster.confirm, ...scopeRoster.active, ...scopeRoster.inactive].filter(keep)};
  }, [path, items, inbox, ruleTypes]);
  // Split outside the memo: a "Not" on a back-in-use row changes only needsConfirm.
  const roster = built && {
    owner: built.owner,
    confirm: built.all.filter(needsConfirm),
    active: built.all.filter(e => e.counterpart.status === 'active'),
    inactive: built.all.filter(e => e.counterpart.status === 'inactive' && !needsConfirm(e)),
  };

  if (closeOut) {
    return (
      <CounterpartCloseOut
        entry={closeOut}
        onClose={applied => {
          if (applied && selected?.leaf === closeOut.counterpart.leaf) onSelect(null);
          setCloseOut(null);
        }}
        viewportHeight={viewportHeight}
        textColor={textColor}
        borderColor={borderColor}
      />
    );
  }

  const rows: Row[] = [];
  if (roster) {
    if (roster.confirm.length > 0) {
      rows.push({kind: 'head', key: 'h-new', label: 'New'});
      roster.confirm.forEach(entry => rows.push({kind: 'confirm', key: `c-${entry.counterpart.leaf}`, entry}));
    }
    if (roster.active.length > 0) {
      rows.push({kind: 'head', key: 'h-active', label: 'Active'});
      for (const entry of roster.active) {
        rows.push({kind: 'active', key: `a-${entry.counterpart.leaf}`, entry});
        if (!expanded.has(entry.counterpart.leaf)) continue;
        const offers = nextMeetingOffers(entry.overview, today);
        for (const thread of entry.counterpart.threads) {
          const next = entry.overview.ahead.meetings.find(m => belongsToThread(m.meeting.tags, thread))?.meeting.date ?? null;
          const offer = offers.find(o => o.type === thread.type) ?? null;
          rows.push({kind: 'thread', key: `t-${thread.tag}`, entry, thread, next, offer});
        }
      }
    }
    if (roster.inactive.length > 0) {
      rows.push({kind: 'fold', key: 'fold', count: roster.inactive.length});
      if (showInactive) roster.inactive.forEach(entry => rows.push({kind: 'inactive', key: `i-${entry.counterpart.leaf}`, entry}));
    }
  }

  const toggleSelect = (entry: RosterEntry) =>
    onSelect(selected?.leaf === entry.counterpart.leaf ? null : {leaf: entry.counterpart.leaf, tag: entry.tag});
  const openOverview = (entry: RosterEntry) => openThreadOverview({tag: entry.tag, ownerPath: path, lens: 'counterpart'});
  const action = (label: string, onPress: () => void) => (
    <Text key={label} onPress={onPress} suppressHighlighting style={[styles.action, {color: textColor, borderColor}]}>
      {label}
    </Text>
  );
  const nameText = (entry: RosterEntry) => (
    <Text
      onPress={() => toggleSelect(entry)}
      suppressHighlighting
      numberOfLines={1}
      style={[styles.name, {color: textColor}, selected?.leaf === entry.counterpart.leaf && styles.nameSelected]}>
      {entry.counterpart.leaf}
    </Text>
  );
  const label = (entry: RosterEntry) => (entry.counterpart.oneOff ? oneOffLabel(entry.counterpart.oneOff) : null);

  const renderRow = (row: Row): React.ReactNode => {
    switch (row.kind) {
      case 'head':
        return (
          <Text key={row.key} style={[styles.head, {color: textColor}]}>
            {row.label}
          </Text>
        );
      case 'confirm': {
        const back = row.entry.counterpart.status === 'inactive';
        const oneOff = label(row.entry);
        return (
          <View key={row.key} style={[styles.row, styles.line, {height: CONFIRM_HEIGHT, borderColor}]}>
            {back && <Text style={[styles.small, {color: textColor}]}>back in use: </Text>}
            {nameText(row.entry)}
            {oneOff && <Text style={[styles.small, styles.oneOff, {color: textColor}]}>{oneOff}</Text>}
            <View style={styles.spacer} />
            {action('Tend', () => tend.confirm(row.entry, true))}
            {action('Not', () => tend.confirm(row.entry, false))}
          </View>
        );
      }
      case 'active': {
        const cp = row.entry.counterpart;
        const counts = rosterCountsText(row.entry);
        const meetingText = rosterMeetingText(row.entry, label(row.entry), today);
        return (
          <View key={row.key} style={[styles.row, {height: ACTIVE_HEIGHT, borderColor}]}>
            <View style={styles.line}>
              {cp.threads.length > 0 ? (
                <Text
                  onPress={() =>
                    setExpanded(prev => {
                      const next = new Set(prev);
                      if (next.has(cp.leaf)) next.delete(cp.leaf);
                      else next.add(cp.leaf);
                      return next;
                    })
                  }
                  suppressHighlighting
                  style={[styles.toggle, {color: textColor}]}>
                  {expanded.has(cp.leaf) ? '▾' : '▸'}
                </Text>
              ) : (
                <View style={styles.toggleSpace} />
              )}
              {nameText(row.entry)}
              <View style={styles.spacer} />
              {selected?.leaf === cp.leaf &&
                action('Set inactive', () =>
                  setInactive(row.entry).then(result => {
                    if (result === 'closeOut') setCloseOut(row.entry);
                  }),
                )}
              <Text onPress={() => openOverview(row.entry)} suppressHighlighting style={[styles.open, {color: textColor}]}>
                ›
              </Text>
            </View>
            <Text style={[styles.small, styles.second, {color: textColor}]} numberOfLines={1}>
              {counts ? `${meetingText} · ${counts}` : meetingText}
            </Text>
          </View>
        );
      }
      case 'thread':
        return (
          <View key={row.key} style={[styles.row, styles.line, styles.threadRow, {height: THREAD_HEIGHT, borderColor}]}>
            <Text style={[styles.small, {color: textColor}]} numberOfLines={1}>
              #{row.thread.tag} · next {row.next ? formatDate(row.next, today) : '—'}
            </Text>
            <View style={styles.spacer} />
            {row.offer && action('+ next', () => row.offer && onNextMeeting(row.offer))}
          </View>
        );
      case 'fold':
        return (
          <Pressable key={row.key} onPress={() => setShowInactive(v => !v)} style={[styles.row, styles.line, {height: FOLD_HEIGHT, borderColor}]}>
            <Text style={[styles.small, {color: textColor}]}>
              {row.count} inactive {showInactive ? '▾' : '▸'}
            </Text>
          </Pressable>
        );
      case 'inactive':
        return (
          <View key={row.key} style={[styles.row, styles.line, {height: INACTIVE_HEIGHT, borderColor}]}>
            {nameText(row.entry)}
            <View style={styles.spacer} />
            {action('Tend', () => tend.setStatus(row.entry, 'active'))}
            <Text onPress={() => openOverview(row.entry)} suppressHighlighting style={[styles.open, {color: textColor}]}>
              ›
            </Text>
          </View>
        );
    }
  };

  const header = roster && roster.owner.path !== path ? `Threads · ${roster.owner.name}` : 'Threads';
  return (
    <View style={viewportHeight === undefined ? styles.fill : undefined}>
      <PagedSection
        header={header}
        rows={rows}
        rowHeight={row => HEIGHTS[row.kind]}
        isCountableRow={row => row.kind === 'confirm' || row.kind === 'active' || row.kind === 'inactive'}
        viewportHeight={viewportHeight}
        resetKey={path}
        renderRow={renderRow}
        emptyHint={roster ? 'No counterparts here yet. Nested tags like #retro/alpha make them.' : 'Counterparts belong to Projects and Areas.'}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  head: {fontSize: FONT.small, fontWeight: '600', opacity: 0.6, height: HEAD_HEIGHT, paddingTop: 10},
  row: {borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center'},
  line: {flexDirection: 'row', alignItems: 'center'},
  threadRow: {paddingLeft: 28},
  name: {fontSize: FONT.medium, fontWeight: '600', flexShrink: 1},
  nameSelected: {textDecorationLine: 'underline', fontWeight: '700'},
  small: {fontSize: FONT.small},
  oneOff: {opacity: 0.6, marginLeft: SPACING.sm},
  second: {opacity: 0.7, marginTop: 2, paddingLeft: 28},
  spacer: {flex: 1},
  toggle: {fontSize: FONT.medium, width: 28},
  toggleSpace: {width: 28},
  open: {fontSize: FONT.large, paddingHorizontal: SPACING.sm},
  action: {fontSize: FONT.small, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginLeft: SPACING.sm},
});
