/**
 * The compact panel of one counterpart in Review's "Tending threads"
 * (docs/dev/history/technical-design-tending-threads.md §3.10): the actions
 * (Tend / Not for a new one or one back in use; "Open overview ›" and "Set
 * inactive" for an active one), then its next meetings or "+ Next <type>",
 * I owe, Waiting for, Relevant and the last three past meetings - the
 * overview's counterpart lens, a few lines each, "+N more" for the rest.
 * Nothing scrolls: every list is cut to `PER_GROUP` lines.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {formatDate} from '../../domain/dateFormat';
import {oneOffLabel} from '../../domain/counterparts';
import {meetingDisplayTitle} from '../../domain/meetingTracking';
import {todayIso} from '../../domain/meetingTime';
import {displayTaskText} from '../../domain/taskLabels';
import {pastMeetingSummary} from '../../domain/threadText';
import {RosterEntry} from '../../storage/tendingRoster';
import {nextMeetingOffers, NextMeetingOffer, ThreadTaskEntry} from '../../storage/threadAggregate';
import {FONT, SPACING} from '../../ui/theme';

const PER_GROUP = 3;

interface Props {
  entry: RosterEntry;
  /** Whether Tend / Not are offered (new, or back in use and not dismissed). */
  confirm: boolean;
  onTend: () => void;
  onNot: () => void;
  onOpenOverview: () => void;
  onSetInactive: () => void;
  onNextMeeting: (offer: NextMeetingOffer) => void;
  textColor: string;
  borderColor: string;
}

export default function ThreadSummary({entry, confirm, onTend, onNot, onOpenOverview, onSetInactive, onNextMeeting, textColor, borderColor}: Props): React.JSX.Element {
  const today = todayIso();
  const {overview, counterpart} = entry;
  const offers = nextMeetingOffers(overview, today);
  const action = (label: string, onPress: () => void) => (
    <Text key={label} onPress={onPress} suppressHighlighting style={[styles.action, {color: textColor, borderColor}]}>
      {label}
    </Text>
  );
  const status = counterpart.status === 'new' ? 'new' : counterpart.backInUse && confirm ? 'back in use' : counterpart.status;

  const todoLines = (label: string, list: ThreadTaskEntry[]) =>
    list.length === 0 ? null : (
      <View key={label}>
        <Text style={[styles.group, {color: textColor}]}>
          {label} · {list.length}
        </Text>
        {list.slice(0, PER_GROUP).map(e => (
          <Text key={`${e.item.path}#${e.taskIndex}`} style={[styles.line, {color: textColor}]} numberOfLines={1}>
            • {displayTaskText(e.task, 'grouped')}
          </Text>
        ))}
        {list.length > PER_GROUP && <Text style={[styles.more, {color: textColor}]}>+{list.length - PER_GROUP} more</Text>}
      </View>
    );

  return (
    <View>
      <Text style={[styles.title, {color: textColor}]} numberOfLines={1}>
        {counterpart.leaf}
      </Text>
      <Text style={[styles.meta, {color: textColor}]} numberOfLines={1}>
        {status} · in {entry.owner.name}
        {counterpart.oneOff ? ` · ${oneOffLabel(counterpart.oneOff)}` : ''}
      </Text>
      <View style={styles.actions}>
        {confirm ? [action('Tend', onTend), action('Not', onNot)] : null}
        {action('Open overview ›', onOpenOverview)}
        {!confirm && counterpart.status === 'active' && action('Set inactive', onSetInactive)}
      </View>

      <Text style={[styles.group, {color: textColor}]}>Next meetings</Text>
      {overview.ahead.meetings.slice(0, PER_GROUP).map(m => (
        <Text key={`${m.item.path}#${m.meetingIndex}`} style={[styles.line, {color: textColor}]} numberOfLines={1}>
          {formatDate(m.meeting.date, today)} {meetingDisplayTitle(m.meeting)}
        </Text>
      ))}
      {overview.ahead.meetings.length === 0 && offers.length === 0 && (
        <Text style={[styles.more, {color: textColor}]}>{counterpart.oneOff ? 'No meeting expected.' : 'None planned.'}</Text>
      )}
      {offers.length > 0 && <View style={styles.actions}>{offers.map(offer => action(`+ Next ${offer.type}`, () => onNextMeeting(offer)))}</View>}

      {todoLines('I owe', overview.ahead.owe)}
      {todoLines('Waiting for', overview.ahead.waiting)}
      {todoLines('Relevant', overview.ahead.relevant)}

      {overview.past.length > 0 && <Text style={[styles.group, {color: textColor}]}>Looking back</Text>}
      {overview.past.slice(0, 3).map(p => (
        <Text key={`${p.entry.item.path}#${p.entry.meetingIndex}`} style={[styles.line, {color: textColor}]} numberOfLines={1}>
          {formatDate(p.entry.meeting.date, today)} {meetingDisplayTitle(p.entry.meeting)} · {pastMeetingSummary(p.counts)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: FONT.large, fontWeight: '700'},
  meta: {fontSize: FONT.small, opacity: 0.6, marginTop: 2},
  actions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.sm},
  action: {
    fontSize: FONT.small,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  group: {fontSize: FONT.small, fontWeight: '600', opacity: 0.6, marginTop: SPACING.md, marginBottom: 2},
  line: {fontSize: FONT.medium, paddingVertical: 2},
  more: {fontSize: FONT.small, opacity: 0.6},
});
