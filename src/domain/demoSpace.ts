/**
 * Content of the demo space (docs/dev/history/technical-design-profiles-demo-space.md
 * §3.5): a small, fictional PARA setup with todos, meetings, tags, goals and
 * focus, dated relative to `today` so it always looks current. Pure - the
 * files are written by storage/demoSpace.ts. Everything here is written in
 * the normal project-file format, so it is also a readable example of it.
 */
import {createDefaultMeetingRule} from './tagRules';
import {monthKeyOf} from './period';
import {DEFAULT_SETTINGS, GtdParaSettings} from './settings';
import {INBOX_FILE_NAME} from './types';
import {isoWeekKey} from './weekDate';

export const DEMO_PROFILE_ID = 'demo';
export const DEMO_PROFILE_NAME = 'Demo';
export const DEMO_BASE_ROOT = '/storage/emulated/0/Note/gtdpara-demo';

export interface DemoFile {
  /** Relative to DEMO_BASE_ROOT, "/"-separated. */
  path: string;
  content: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function day(today: Date, offset: number): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Offset (in days) from `today` to the next given weekday (1 = Monday), 0..6. */
function toWeekday(today: Date, weekday: number): number {
  return (weekday - today.getDay() + 7) % 7;
}

interface ItemSpec {
  kind: 'project' | 'area';
  status?: 'active' | 'on-hold' | 'done';
  dailyFocus?: boolean;
  weeklyFocus?: boolean;
  monthlyFocus?: boolean;
  area?: string;
  abbrev: string;
  scope: string;
  tasks: string[];
  meetings: string[];
  weeklyGoal?: string;
  monthlyGoal?: string;
}

function itemFile(spec: ItemSpec, today: Date): string {
  const fm = [`kind: ${spec.kind}`, `status: ${spec.status ?? 'active'}`];
  if (spec.dailyFocus) {fm.push('dailyFocus: true');}
  if (spec.weeklyFocus) {fm.push('weeklyFocus: true');}
  if (spec.monthlyFocus) {fm.push('monthlyFocus: true');}
  if (spec.area) {fm.push(`area: ${spec.area}`);}
  fm.push(`abbrev: ${spec.abbrev}`);
  const parts = ['---', ...fm, '---', '', '## Scope', '', spec.scope, '', '## Tasks', '', ...spec.tasks, '', '## Meetings', '', ...spec.meetings, ''];
  if (spec.weeklyGoal) {parts.push('## Weekly Goals', '', `- ${isoWeekKey(today)}: ${spec.weeklyGoal}`, '');}
  if (spec.monthlyGoal) {parts.push('## Monthly Goals', '', `- ${monthKeyOf(today)}: ${spec.monthlyGoal}`, '');}
  return parts.join('\n');
}

/** All files of the demo space for `today`. */
export function buildDemoFiles(today: Date): DemoFile[] {
  const d = (offset: number) => day(today, offset);
  const monday = toWeekday(today, 1);
  const files: DemoFile[] = [];
  const project = (name: string, spec: Omit<ItemSpec, 'kind'>) =>
    files.push({path: `1 Projects/${name}/project.txt`, content: itemFile({...spec, kind: 'project'}, today)});
  const area = (name: string, spec: Omit<ItemSpec, 'kind'>) =>
    files.push({path: `2 Areas/${name}/area.txt`, content: itemFile({...spec, kind: 'area'}, today)});

  project('Garden renovation', {
    area: 'Home',
    abbrev: 'GR',
    dailyFocus: true,
    weeklyFocus: true,
    scope: 'Turn the back garden into a low-maintenance vegetable and herb garden before winter.',
    tasks: [
      '- [x] Sketch the new layout',
      '- [ ] Measure the raised beds #next',
      `- [ ] Order soil and compost #next [due:: ${d(2)}]`,
      '- [ ] Get a quote from the landscaper #wf/marco',
      '- [ ] Build a small greenhouse #someday',
    ],
    meetings: [`- ${d(3)} 10:00-11:00 Site visit with Marco #marco`],
    weeklyGoal: 'Beds measured and soil ordered',
  });
  project('Team offsite', {
    area: 'Team',
    abbrev: 'TO',
    weeklyFocus: true,
    monthlyFocus: true,
    scope: 'Two calm days away with the team: look back, choose three priorities for next quarter.',
    tasks: [
      '- [ ] Collect agenda topics from the team #next #lena',
      `- [ ] Book the venue [due:: ${d(5)}]`,
      '- [ ] Send the invitation #wf/lena',
      '- [ ] Plan an outdoor afternoon #maybe',
    ],
    meetings: [
      `- ${d(-1)} 15:00-15:30 Offsite kickoff #lena #reviewed`,
      `- ${d(1)} 14:00-14:30 Offsite prep with Lena #lena #1on1`,
      `- ${d(20)} 2d Team offsite #monthly`,
    ],
    weeklyGoal: 'Agenda topics collected',
    monthlyGoal: 'Offsite happens and three priorities are agreed',
  });
  project('Learn Spanish', {
    abbrev: 'LS',
    scope: 'Hold a simple conversation on the next holiday.',
    tasks: ['- [ ] Book the first lesson #next', '- [ ] Practise 15 minutes a day #next', '- [ ] Watch a film without subtitles #maybe'],
    meetings: [0, 7, 14, 21].map(w => `- ${d(toWeekday(today, 3) + w)} 18:00-19:00 Spanish lesson #spanish`),
  });
  project('Bike repair', {
    status: 'on-hold',
    area: 'Home',
    abbrev: 'BR',
    scope: 'Get the old bike roadworthy again - paused until spring.',
    tasks: ['- [ ] Buy new brake pads', '- [ ] Replace the chain'],
    meetings: [],
  });
  project('Website relaunch', {
    status: 'done',
    area: 'Team',
    abbrev: 'WR',
    scope: 'New team page online, old pages redirected.',
    tasks: ['- [x] Write new texts', '- [x] Redirect old pages', '- [x] Announce the new page'],
    meetings: [`- ${d(-12)} 11:00-12:00 Relaunch retrospective #reviewed`],
  });

  area('Health', {
    abbrev: 'HE',
    dailyFocus: true,
    scope: 'Sleep, movement and check-ups - the basis for everything else.',
    tasks: [`- [ ] Book the dentist appointment #next [due:: ${d(0)}]`, '- [ ] Try the new yoga class #someday'],
    meetings: [`- ${d(2)} 07:00-08:00 Running with Sam #sam`],
  });
  area('Home', {
    abbrev: 'HO',
    scope: 'A calm, working home.',
    tasks: ['- [ ] Fix the leaking tap #next', `- [ ] Replace the smoke detector batteries [due:: ${d(-2)}]`],
    meetings: [],
  });
  area('Team', {
    abbrev: 'TM',
    weeklyFocus: true,
    scope: 'Leading a small team well: clear priorities, regular 1:1s, room to think.',
    tasks: ['- [ ] Prepare the quarterly check-in #next', '- [ ] Update the onboarding checklist #someday'],
    meetings: [
      ...[-7, 0, 7, 14].map(w => `- ${d(monday + w)} 09:30-10:00 Team sync #team-sync`),
      `- ${d(7)} 13:00-13:30 1:1 Lena #lena #1on1`,
    ],
  });

  files.push({
    // The Inbox's own folder under Areas (docs/dev/history/technical-design-inbox-as-area.md).
    path: `${DEFAULT_SETTINGS.areasFolder}/${DEFAULT_SETTINGS.inboxFolder}/${INBOX_FILE_NAME}`,
    content: [
      '---',
      'kind: inbox',
      'status: active',
      '---',
      '',
      '## Scope',
      '',
      '## Tasks',
      '',
      '- [ ] Call the insurance about the bike',
      '- [ ] Idea: family photo book',
      '',
      '## Meetings',
      '',
      `- ${d(9)} 19:00-20:30 Parents evening at school`,
      '',
    ].join('\n'),
  });
  // Empty folders the Files pane and archive expect to exist.
  files.push({path: '3 Resources/README.txt', content: 'Reference material for the demo space.\n'});
  files.push({path: '4 Archive/README.txt', content: 'Archived projects of the demo space land here.\n'});
  return files;
}

/** Per-profile settings of the demo profile: the demo folders, two Tag Rules, integrations off. */
export function demoProfileSettings(): GtdParaSettings {
  const meeting = createDefaultMeetingRule('1');
  const oneOnOne = {
    ...createDefaultMeetingRule('2'),
    name: '1:1 meetings',
    tags: ['1on1'],
    isDefault: false,
    trackPrep: true,
    trackReview: true,
  };
  return {
    ...DEFAULT_SETTINGS,
    baseRoot: DEMO_BASE_ROOT,
    tagRules: [meeting, oneOnOne],
    nextTagRuleId: 3,
    experimentalGoogleCalendar: false,
    experimentalGmail: false,
    activeProfileId: DEMO_PROFILE_ID,
  };
}
