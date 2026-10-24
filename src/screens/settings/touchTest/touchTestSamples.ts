/**
 * The touch test's fixed sample rows - made-up todos and meetings, never the
 * user's data. Each kind covers one hit-area question: a plain 1-line and a
 * 2-line title, several context tags, `#next` with due and waiting-for
 * labels, a nested thread tag, a loop-style tag, and meetings in both
 * layouts. Every title starts with its row number, so a tap without a new
 * marker can be named.
 *
 * Parsed from file lines like real entries, so the rows get exactly the
 * fields the parser derives.
 */
import {isoDateOffset} from '../../../domain/meetingTime';
import {parseMeetingsSpan, parseTasksSpan} from '../../../domain/markdown';
import {Meeting, Task} from '../../../domain/types';
import {MeetingRowLayout} from '../../../ui/MeetingRow';

export type TouchSample =
  | {kind: 'task'; number: number; task: Task}
  | {kind: 'meeting'; number: number; meeting: Meeting; layout: MeetingRowLayout};

type Template = {kind: 'task'; line: (n: number) => string} | {kind: 'meeting'; line: (n: number) => string; layout: MeetingRowLayout};

const TEMPLATES: Template[] = [
  {kind: 'task', line: n => `- [ ] ${n} Buy stamps`},
  {
    kind: 'task',
    line: n => `- [ ] ${n} Write the long summary of the workshop results and send it to everyone who took part → [[Notes/Workshop.note]]`,
  },
  {kind: 'task', line: n => `- [ ] ${n} Call about the offer #phone #office #errand`},
  {kind: 'task', line: n => `- [ ] ${n} Draft the budget #next #wf/meier [due:: ${isoDateOffset(3)}] +[[Files/Budget.pdf]]`},
  {kind: 'task', line: n => `- [ ] ${n} Prepare questions #sparring/mieke`},
  {kind: 'meeting', layout: 'oneLine', line: n => `- ${isoDateOffset(0)} 09:30-10:00 ${n} Stand-up`},
  {kind: 'task', line: n => `- [ ] ${n} Collect points for #retro/team → [[Notes/Retro.note]]`},
  {kind: 'meeting', layout: 'twoLine', line: n => `- ${isoDateOffset(0)} 14:00-15:00 ${n} Planning #sparring/mieke → [[Meetings/Planning.note]]`},
];

/** Row `index` (0-based) of the endlessly repeating sample set, numbered `index + 1`. */
export function touchSample(index: number): TouchSample {
  const template = TEMPLATES[index % TEMPLATES.length];
  const number = index + 1;
  if (template.kind === 'task') {
    return {kind: 'task', number, task: parseTasksSpan(`## Tasks\n\n${template.line(number)}\n`).tasks[0]};
  }
  return {kind: 'meeting', number, layout: template.layout, meeting: parseMeetingsSpan(`## Meetings\n\n${template.line(number)}\n`).meetings[0]};
}
