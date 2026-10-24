/**
 * The overview's "Looking back" (docs/dev/history/technical-design-tending-threads.md
 * §3.5.2): first a "Since <date> · n done" row for the todos done since the
 * latest past meeting (only when there is one), then one two-line row per
 * past meeting, newest first - the meeting on line 1, what was agreed in it
 * and how much of that is done or open on line 2. A tap selects a row; the
 * right column then shows its todos.
 */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {todayIso} from '../../domain/meetingTime';
import {agreementsEndedText} from '../../domain/agreementText';
import {pastMeetingSummary, sinceRowLabel} from '../../domain/threadText';
import {PastMeeting, ThreadOverview} from '../../storage/threadAggregate';
import MeetingRow, {MEETING_ROW_HEIGHT} from '../../ui/MeetingRow';
import PagedSection from '../../ui/PagedSection';
import {COLORS, FONT} from '../../ui/theme';
import {meetingEntryKey} from '../../ui/useEntryActions';

/** The selection key of the "Since" row; meeting rows use `meetingEntryKey`. */
export const SINCE_KEY = 'since';
/** The selection key of the "n agreements ended" row. */
export const ENDED_KEY = 'ended-agreements';

type BackRow = {kind: 'since'; from: string; count: number} | {kind: 'ended'; count: number} | {kind: 'meeting'; past: PastMeeting};

interface Props {
  overview: Pick<ThreadOverview, 'past' | 'since' | 'endedAgreements'>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  resetKey: string;
  textColor: string;
  borderColor: string;
}

function rowsOf({past, since, endedAgreements}: Props['overview']): BackRow[] {
  const rows: BackRow[] = past.map(p => ({kind: 'meeting', past: p}));
  if (endedAgreements.length > 0) rows.unshift({kind: 'ended', count: endedAgreements.length});
  return since.from ? [{kind: 'since', from: since.from, count: since.done.length}, ...rows] : rows;
}

export default function LookingBackSection({overview, selectedKey, onSelect, resetKey, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <PagedSection<BackRow>
      header="Looking back"
      rows={rowsOf(overview)}
      resetKey={resetKey}
      rowHeight={() => MEETING_ROW_HEIGHT.twoLine}
      emptyHint="No past meetings in this thread yet."
      renderRow={row => {
        if (row.kind === 'since' || row.kind === 'ended') {
          const key = row.kind === 'since' ? SINCE_KEY : ENDED_KEY;
          const selected = selectedKey === key;
          return (
            <Pressable key={key} onPress={() => onSelect(key)} style={[styles.since, {borderBottomColor: borderColor}, selected && styles.selected]}>
              <Text style={[styles.sinceText, {color: textColor}]} numberOfLines={1}>
                {row.kind === 'since' ? sinceRowLabel(row.from, row.count, todayIso()) : agreementsEndedText(row.count)}
              </Text>
            </Pressable>
          );
        }
        const p = row.past;
        const key = meetingEntryKey(p.entry);
        return (
          <MeetingRow
            key={key}
            meeting={p.entry.meeting}
            layout="twoLine"
            time="dateTime"
            source={{abbrev: p.entry.item.abbrev ?? p.entry.item.name, name: pastMeetingSummary(p.counts)}}
            onPress={() => onSelect(key)}
            state={key === selectedKey ? 'selected' : undefined}
            ownerPath={p.entry.item.path}
            textColor={textColor}
            borderColor={borderColor}
          />
        );
      }}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

const styles = StyleSheet.create({
  // The height and marking of a two-line MeetingRow, so the list pages by one row height.
  since: {height: MEETING_ROW_HEIGHT.twoLine, justifyContent: 'center', borderBottomWidth: 1},
  selected: {borderLeftWidth: 4, borderLeftColor: COLORS.accent, paddingLeft: 4, backgroundColor: '#e8e8e8'},
  sinceText: {fontSize: FONT.medium, fontWeight: '700'},
});
