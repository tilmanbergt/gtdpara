import {buildDemoFiles, demoProfileSettings, DEMO_BASE_ROOT} from '../../src/domain/demoSpace';
import {
  parseFrontMatter,
  parseMeetingsSpan,
  parseMonthlyGoalsSpan,
  parseScopeSpan,
  parseTasksSpan,
  parseWeeklyGoalsSpan,
} from '../../src/domain/markdown';
import {profileSettingsOf, sanitizeProfileSettings} from '../../src/domain/profiles';

const today = new Date(2026, 9, 1); // Thu 2026-10-01

describe('demo space', () => {
  const files = buildDemoFiles(today);
  const byPath = (p: string) => files.find(f => f.path === p)!.content;

  it('has projects, areas, inbox and the folders', () => {
    const paths = files.map(f => f.path);
    expect(paths.filter(p => p.startsWith('1 Projects/')).length).toBe(5);
    expect(paths.filter(p => p.startsWith('2 Areas/') && p.endsWith('/area.txt')).length).toBe(3);
    expect(paths).toContain('2 Areas/0 Inbox/Inbox.txt');
    expect(paths).not.toContain('Inbox.txt');
    expect(paths).toContain('3 Resources/README.txt');
  });

  it('parses cleanly with the real project-file parser', () => {
    for (const f of files.filter(x => x.path.endsWith('.txt') && !x.path.includes('README'))) {
      expect(parseTasksSpan(f.content).extraLines).toEqual([]);
      expect(parseMeetingsSpan(f.content).extraLines).toEqual([]);
    }
    const garden = byPath('1 Projects/Garden renovation/project.txt');
    const fm = parseFrontMatter(garden);
    expect(fm).toMatchObject({status: 'active', dailyFocus: true, weeklyFocus: true, area: 'Home', abbrev: 'GR'});
    const tasks = parseTasksSpan(garden).tasks;
    expect(tasks).toHaveLength(5);
    expect(tasks.find(t => t.text.startsWith('Order soil'))!.dueDate).toBe('2026-10-03');
    expect(tasks.find(t => t.text.startsWith('Get a quote'))!.waitingOn).toBe('marco');
    expect(parseScopeSpan(garden)).toContain('vegetable');
    expect(parseWeeklyGoalsSpan(garden).goals).toEqual([{weekKey: '2026-W40', text: 'Beds measured and soil ordered'}]);
    const offsite = byPath('1 Projects/Team offsite/project.txt');
    expect(parseMonthlyGoalsSpan(offsite).goals[0].monthKey).toBe('2026-10');
    const meetings = parseMeetingsSpan(offsite).meetings;
    expect(meetings.map(m => m.date)).toEqual(['2026-09-30', '2026-10-02', '2026-10-21']);
    expect(meetings[2].days).toBe(2);
    expect(parseFrontMatter(byPath('1 Projects/Bike repair/project.txt')).status).toBe('on-hold');
    const team = parseMeetingsSpan(byPath('2 Areas/Team/area.txt')).meetings;
    expect(team.filter(m => m.title.startsWith('Team sync')).map(m => m.date)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
  });

  it('profile settings point at the demo folders and survive the profile file filter', () => {
    const s = demoProfileSettings();
    expect(s.baseRoot).toBe(DEMO_BASE_ROOT);
    expect(s.tagRules).toHaveLength(2);
    expect(sanitizeProfileSettings(profileSettingsOf(s))).toEqual(profileSettingsOf(s));
  });
});
