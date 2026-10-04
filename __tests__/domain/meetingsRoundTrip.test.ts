import {parseMeetingsSpan, writeMeetingsIntoContent} from '../../src/domain/markdown';

// gtdpara has no recurring meetings (0.6.0 R6): a hand-written series line and its
// indented occurrence lines are unknown lines and must survive a save untouched.
const FILE = [
  '---',
  'kind: project',
  'status: active',
  '---',
  '',
  '## Meetings',
  '',
  '- 2026-10-07 10:00 Kickoff',
  'every monday 09:00 Standup',
  '  - 2026-10-05 → [[Meetings/Standup.note]]',
  '- 2026-10-09 1d Offsite',
  '',
].join('\n');

describe('meetings round trip with hand-written series lines', () => {
  it('parses only the one-off meetings', () => {
    const {meetings, extraLines} = parseMeetingsSpan(FILE);
    expect(meetings.map(m => m.title)).toEqual(['Kickoff', 'Offsite']);
    expect(extraLines).toEqual(['every monday 09:00 Standup', '  - 2026-10-05 → [[Meetings/Standup.note]]']);
    expect(meetings[0]).not.toHaveProperty('recurrence');
    expect(meetings[0]).not.toHaveProperty('occurrences');
  });

  it('keeps the series lines when the meetings are written back', () => {
    const {meetings, extraLines} = parseMeetingsSpan(FILE);
    const written = writeMeetingsIntoContent(FILE, [...meetings, {...meetings[0], title: 'Review', date: '2026-10-10'}], extraLines);
    expect(written).toContain('every monday 09:00 Standup');
    expect(written).toContain('  - 2026-10-05 → [[Meetings/Standup.note]]');
    expect(parseMeetingsSpan(written).meetings.map(m => m.title)).toEqual(['Kickoff', 'Offsite', 'Review']);
  });
});
