/**
 * The overview's "Looking back" (docs/dev/history/technical-design-tending-threads.md
 * §3.5.2): one two-line row per past meeting, newest first - the meeting on
 * line 1, what was agreed in it and how much of that is done or open on
 * line 2. A tap selects the meeting; the right column then shows its todos.
 */
import React from 'react';
import {pastMeetingSummary} from '../../domain/threadText';
import {PastMeeting} from '../../storage/threadAggregate';
import MeetingRow, {MEETING_ROW_HEIGHT} from '../../ui/MeetingRow';
import PagedSection from '../../ui/PagedSection';
import {meetingEntryKey} from './useThreadActions';

interface Props {
  past: PastMeeting[];
  selectedKey: string | null;
  onSelect: (past: PastMeeting) => void;
  resetKey: string;
  textColor: string;
  borderColor: string;
}

export default function LookingBackSection({past, selectedKey, onSelect, resetKey, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <PagedSection<PastMeeting>
      header="Looking back"
      rows={past}
      resetKey={resetKey}
      rowHeight={() => MEETING_ROW_HEIGHT.twoLine}
      emptyHint="No past meetings in this thread yet."
      renderRow={p => {
        const key = meetingEntryKey(p.entry);
        return (
          <MeetingRow
            key={key}
            meeting={p.entry.meeting}
            layout="twoLine"
            time="dateTime"
            source={{abbrev: p.entry.item.abbrev ?? p.entry.item.name, name: pastMeetingSummary(p.counts)}}
            onPress={() => onSelect(p)}
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
