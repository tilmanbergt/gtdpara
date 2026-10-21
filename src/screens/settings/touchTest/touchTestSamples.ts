/**
 * The touch test's fixed sample rows - made-up todos and meetings, never the
 * user's data. Each one covers a hit-area question: plain 1-line and 2-line
 * titles, several context tags, `#next` and waiting-for with a due label, a
 * nested thread tag, a loop-style tag, meetings in both layouts, and rows
 * that are only tags or nearly only tags (where a tap can hardly miss a
 * span). A todo can show `#next` or `#w/f`, never both, so the two flow
 * labels sit in two rows.
 *
 * Rows are numbered by position (`Row 7` in the info column); a title that
 * isn't only tags starts with its number. Parsed from file lines like real
 * entries, so the rows get exactly the fields the parser derives.
 */
import {isoDateOffset} from '../../../domain/meetingTime';
import {parseMeetingsSpan, parseTasksSpan} from '../../../domain/markdown';
import {Meeting, Task} from '../../../domain/types';
import {MeetingRowLayout} from '../../../ui/MeetingRow';

export type TouchSample =
  | {kind: 'task'; number: number; task: Task; armLink: boolean}
  | {kind: 'meeting'; number: number; meeting: Meeting; layout: MeetingRowLayout; armLink: boolean};

type Template = {kind: 'task'; line: (n: number) => string} | {kind: 'meeting'; line: (n: number) => string; layout: MeetingRowLayout};

const today = () => isoDateOffset(0);
const due = () => `[due:: ${isoDateOffset(3)}]`;

const TEMPLATES: Template[] = [
  {kind: 'task', line: n => `- [ ] ${n} Buy stamps`},
  {kind: 'task', line: n => `- [ ] ${n} Write the long summary of the workshop results and send it to everyone who took part → [[Notes/Workshop.note]]`},
  {kind: 'task', line: n => `- [ ] ${n} Call about the offer #phone #office #errand`},
  {kind: 'task', line: n => `- [ ] ${n} Draft the budget #next ${due()} +[[Files/Budget.pdf]]`},
  {kind: 'task', line: n => `- [ ] ${n} Get the signed contract #wf/meier ${due()}`},
  {kind: 'meeting', layout: 'oneLine', line: n => `- ${today()} 09:30-10:00 ${n} Stand-up`},
  {kind: 'task', line: n => `- [ ] ${n} Prepare questions #sparring/mieke`},
  {kind: 'task', line: n => `- [ ] ${n} Collect points #retro/team → [[Notes/Retro.note]]`},
  {kind: 'task', line: () => '- [ ] #phone #office'},
  {kind: 'meeting', layout: 'twoLine', line: n => `- ${today()} 14:00-15:00 ${n} Planning #sparring/mieke → [[Meetings/Planning.note]]`},
  {kind: 'task', line: () => '- [ ] #sparring/mieke #next'},
  {kind: 'task', line: n => `- [ ] ${n} #retro/team #errand #next`},
  {kind: 'meeting', layout: 'oneLine', line: () => `- ${today()} 11:00-11:30 #sparring/mieke #office`},
  {kind: 'task', line: () => '- [ ] #wf/anna'},
  {kind: 'meeting', layout: 'twoLine', line: n => `- ${today()} 16:00-17:00 ${n} #retro/team`},
];

/**
 * Row `index` (0-based) of the endlessly repeating sample set, numbered
 * `index + 1`. Every second round of the set also shows the "+clip" target,
 * as on the Current tab; the others are wired like Daily.
 */
export function touchSample(index: number): TouchSample {
  const template = TEMPLATES[index % TEMPLATES.length];
  const number = index + 1;
  const armLink = Math.floor(index / TEMPLATES.length) % 2 === 1;
  if (template.kind === 'task') {
    return {kind: 'task', number, armLink, task: parseTasksSpan(`## Tasks\n\n${template.line(number)}\n`).tasks[0]};
  }
  const meeting = parseMeetingsSpan(`## Meetings\n\n${template.line(number)}\n`).meetings[0];
  return {kind: 'meeting', number, armLink, layout: template.layout, meeting};
}
