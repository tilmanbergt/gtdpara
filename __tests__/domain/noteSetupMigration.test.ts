import {
  LegacyTagRule,
  migrateNoteSetupSettings,
  migrateTagRules,
  migrationCounts,
} from '../../src/domain/noteSetupMigration';
import {createDefaultMeetingPage, seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {addPiece, NotePiece} from '../../src/domain/pageLayout';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';
import {sanitizeProfileSettings, buildActiveSettings, PROFILE_KEYS} from '../../src/domain/profiles';

// docs/dev/history/technical-design-note-setups.md §5, §9.1

let nextRuleId = 1;
function rule(context: LegacyTagRule['context'], tags: string[], extra: Partial<LegacyTagRule> = {}): LegacyTagRule {
  const id = String(nextRuleId++);
  return {
    id,
    name: `R${id}`,
    context,
    tags,
    isDefault: false,
    enabled: true,
    template: '',
    pieces: [],
    ...extra,
  };
}

function pieces(...types: NotePiece['type'][]): NotePiece[] {
  return types.reduce((l, t) => addPiece(l, t), {template: '', pieces: [] as NotePiece[]}).pieces;
}

beforeEach(() => {
  nextRuleId = 1;
});

describe('migrateTagRules - grouping and notebooks', () => {
  it('one shared meeting rule -> Thread setup with notebook, Todo page on Default layout', () => {
    const r = rule('meeting', ['sparring'], {
      name: 'Sparring',
      noteTarget: 'shared',
      sharedFileName: '{tag} {subtag} {year}',
      pieces: pieces('dateTitle'),
      template: 'lines.png',
    });
    const {setups, report, nextId} = migrateTagRules([r], 1);
    expect(setups).toHaveLength(1);
    const s = setups[0];
    expect(s).toMatchObject({id: '1', name: 'Sparring', kind: 'thread', tags: ['sparring'], enabled: true});
    expect(s.notebook).toEqual({name: '{tag} {subtag} {year}', folder: 'Meetings'});
    expect(s.pages.meeting).toEqual({template: 'lines.png', pieces: r.pieces});
    expect(s.pages.todo).toBeUndefined();
    expect(report).toEqual([]);
    expect(nextId).toBe(2);
  });

  it("a blank file name field is the rule name; 'root' is the Project/Area root", () => {
    const r = rule('meeting', ['daily'], {name: 'Daily', noteTarget: 'shared', sharedFileFolder: 'root'});
    expect(migrateTagRules([r], 1).setups[0].notebook).toEqual({name: 'Daily', folder: ''});
  });

  it('a shared todo rule notebook lives in Todos', () => {
    const r = rule('todo', ['call'], {noteTarget: 'shared', sharedFileName: 'Calls'});
    expect(migrateTagRules([r], 1).setups[0].notebook).toEqual({name: 'Calls', folder: 'Todos'});
  });

  it('no shared member -> own note per item', () => {
    expect(migrateTagRules([rule('meeting', ['x'])], 1).setups[0].notebook).toBeNull();
  });

  it('meeting shared + todo own, same tag -> one setup, report merged + intoNotebook', () => {
    const m = rule('meeting', ['sparring'], {name: 'Sparring', noteTarget: 'shared', sharedFileName: 'Sparring {subtag}'});
    const t = rule('todo', ['sparring'], {name: 'Sparring todos', pieces: pieces('title')});
    const {setups, report} = migrateTagRules([m, t], 1);
    expect(setups).toHaveLength(1);
    expect(setups[0].pages.todo?.pieces).toEqual(t.pieces);
    expect(report.map(e => e.change)).toEqual(['merged', 'intoNotebook']);
    expect(report[1]).toEqual({
      setup: 'Sparring',
      change: 'intoNotebook',
      detail: 'New todos with #sparring now get pages in Sparring {subtag}.',
    });
  });

  it("meeting shared + todo shared with different names -> the meeting's notebook, notebookChanged", () => {
    const t = rule('todo', ['coaching'], {noteTarget: 'shared', sharedFileName: 'Coaching todos'});
    const m = rule('meeting', ['coaching'], {name: 'Coaching', noteTarget: 'shared', sharedFileName: 'Coaching {subtag}'});
    const {setups, report} = migrateTagRules([t, m], 1);
    expect(setups[0].notebook).toEqual({name: 'Coaching {subtag}', folder: 'Meetings'});
    expect(setups[0].name).toBe('Coaching');
    expect(report.find(e => e.change === 'notebookChanged')?.detail).toBe('New todos now go into Meetings/Coaching {subtag}.');
  });

  it('a shared member with the same notebook is not reported', () => {
    const m = rule('meeting', ['a'], {noteTarget: 'shared', sharedFileName: 'N', sharedFileFolder: 'root'});
    const t = rule('todo', ['a'], {noteTarget: 'shared', sharedFileName: 'N', sharedFileFolder: 'root'});
    expect(migrateTagRules([m, t], 1).report.map(e => e.change)).toEqual(['merged']);
  });

  it('overlapping tags [sparring, retro] + [sparring] (+ [retro]) -> one component', () => {
    const a = rule('meeting', ['sparring', 'retro'], {name: 'Sparring'});
    const b = rule('todo', ['sparring']);
    const c = rule('meeting', ['other']);
    const d = rule('todo', ['RETRO', '#demand']);
    const {setups} = migrateTagRules([a, b, c, d], 1);
    expect(setups.map(s => [s.name, s.tags])).toEqual([
      ['Sparring', ['sparring', 'retro', 'demand']],
      ['R3', ['other']],
    ]);
  });

  it('two members of the same context: the first wins, conflict reported', () => {
    const a = rule('meeting', ['x'], {pieces: pieces('title')});
    const b = rule('meeting', ['x', 'y'], {pieces: pieces('time'), name: 'Second'});
    const {setups, report} = migrateTagRules([a, b], 1);
    expect(setups[0].pages.meeting?.pieces).toEqual(a.pieces);
    expect(report.find(e => e.change === 'conflict')?.detail).toBe('Rule Second left out: the Meeting page comes from an earlier rule.');
  });

  it('name: the meeting member, else the first member; an unnamed setup is its first tag', () => {
    expect(migrateTagRules([rule('todo', ['a'], {name: 'T'}), rule('meeting', ['a'], {name: 'M'})], 1).setups[0].name).toBe('M');
    expect(migrateTagRules([rule('todo', ['a'], {name: 'T'})], 1).setups[0].name).toBe('T');
    expect(migrateTagRules([rule('todo', ['a'], {name: ' '})], 1).setups[0].name).toBe('#a');
    expect(migrateTagRules([rule('meeting', ['tango', 'salsa'], {name: 'Untitled'})], 1).setups[0].name).toBe('#tango #salsa');
  });

  it('keeps texts with their page', () => {
    const r = rule('meeting', ['a'], {texts: [{id: 't1', name: 'Agenda', text: 'Agenda'}]});
    expect(migrateTagRules([r], 1).setups[0].pages.meeting?.texts).toEqual(r.texts);
  });
});

describe('migrateTagRules - loops', () => {
  it('loop rule + todo rule on the loop kind -> Loop setup with a Todo page', () => {
    const loop = rule('loop', ['workshop'], {name: 'Workshop', pieces: pieces('dateTitle', 'link'), sharedFileName: '{tag} {subtag}'});
    const todo = rule('todo', ['workshop'], {pieces: pieces('title')});
    const {setups, report} = migrateTagRules([loop, todo], 1);
    expect(setups).toHaveLength(1);
    expect(setups[0]).toMatchObject({kind: 'loop', name: 'Workshop', tags: ['workshop'], notebook: {name: '{tag} {subtag}', folder: ''}});
    expect(setups[0].pages.first?.pieces).toEqual(loop.pieces);
    expect(setups[0].pages.todo?.pieces).toEqual(todo.pieces);
    expect(setups[0].pages.meeting).toBeUndefined();
    expect(report.map(e => e.change)).toEqual(['merged']);
  });

  it('a blank loop note name is the default name', () => {
    expect(migrateTagRules([rule('loop', ['reading'])], 1).setups[0].notebook).toEqual({name: '{year}-{month} {tag} {subtag}', folder: ''});
  });

  it('loop rule + a rule on [workshop, jf] -> split: the loop kind is taken out, reported', () => {
    const loop = rule('loop', ['workshop'], {name: 'Workshop'});
    const m = rule('meeting', ['workshop', 'jf'], {name: 'JF'});
    const {setups, report} = migrateTagRules([loop, m], 1);
    expect(setups.map(s => [s.name, s.kind, s.tags])).toEqual([
      ['Workshop', 'loop', ['workshop']],
      ['JF', 'thread', ['jf']],
    ]);
    expect(report).toEqual([{setup: 'JF', change: 'removed', detail: '#workshop left out: a loop kind belongs to its Loop setup.'}]);
  });

  it('a rule that only had loop kinds of different loops is left out', () => {
    const {setups} = migrateTagRules([rule('loop', ['a']), rule('loop', ['b']), rule('todo', ['a', 'b'])], 1);
    expect(setups.map(s => s.tags)).toEqual([['a'], ['b']]);
  });

  it('a shared rule on a loop kind is reported: outside an active loop its items get their own note', () => {
    const {report} = migrateTagRules([rule('loop', ['w']), rule('meeting', ['w'], {noteTarget: 'shared'})], 1);
    expect(report.find(e => e.change === 'notebookChanged')?.detail).toBe('New meetings outside an active loop now get their own note.');
  });

  it('tracking of a loop setup comes from its meeting member', () => {
    const {setups} = migrateTagRules([rule('loop', ['w']), rule('meeting', ['w'], {trackReview: true})], 1);
    expect(setups[0].tracking).toEqual({trackPrep: false, trackReview: true});
  });
});

describe('migrateTagRules - defaults, disabled, dropped', () => {
  it('the first enabled Default per context becomes the Default page; its tracking the Default tracking', () => {
    const offDefault = rule('meeting', [], {isDefault: true, enabled: false, pieces: pieces('time')});
    const meetingDefault = rule('meeting', [], {isDefault: true, pieces: createDefaultMeetingPage().pieces, trackPrep: true});
    const second = rule('meeting', [], {isDefault: true});
    const todoDefault = rule('todo', [], {isDefault: true, pieces: pieces('title'), template: 't.png'});
    const {defaults, setups, report} = migrateTagRules([offDefault, meetingDefault, second, todoDefault], 1);
    expect(setups).toEqual([]);
    expect(defaults.pages.meeting?.pieces).toEqual(meetingDefault.pieces);
    expect(defaults.pages.todo).toEqual({template: 't.png', pieces: todoDefault.pieces});
    expect(defaults.pages.first).toEqual(seedNoteSetupDefaults().pages.first);
    expect(defaults.tracking).toEqual({trackPrep: true, trackReview: false});
    expect(report.filter(e => e.change === 'removed').map(e => e.setup)).toEqual(['R1', 'R3']);
  });

  it('no Default rule -> no Default page for that kind (blank, as in 0.14)', () => {
    const {defaults} = migrateTagRules([rule('meeting', ['a'])], 1);
    expect(defaults.pages.meeting).toBeUndefined();
    expect(defaults.pages.todo).toBeUndefined();
  });

  it('a shared Default rule becomes the Default notebook; no shared Default, no notebook', () => {
    const shared = migrateTagRules([rule('meeting', [], {isDefault: true, noteTarget: 'shared', sharedFileName: 'Daily'})], 1);
    expect(shared.defaults.notebook).toEqual({name: 'Daily', folder: 'Meetings'});
    expect(shared.report).toEqual([]);
    expect(migrateTagRules([rule('meeting', [], {isDefault: true})], 1).defaults.notebook).toBeNull();
  });

  it('the Default Meeting rule decides the notebook; the Default Todo rule is reported when its items change place', () => {
    const todoShared = rule('todo', [], {isDefault: true, noteTarget: 'shared', sharedFileName: 'Inbox todos', name: 'todo default'});
    const meetingShared = rule('meeting', [], {isDefault: true, noteTarget: 'shared', sharedFileName: 'Daily', sharedFileFolder: 'root'});
    const both = migrateTagRules([todoShared, meetingShared], 1);
    expect(both.defaults.notebook).toEqual({name: 'Daily', folder: ''});
    expect(both.report).toEqual([{setup: 'todo default', change: 'notebookChanged', detail: 'New todos now go into Daily.'}]);
    const todoOwn = migrateTagRules([meetingShared, rule('todo', [], {isDefault: true, name: 'todo default'})], 1);
    expect(todoOwn.report).toEqual([{setup: 'todo default', change: 'intoNotebook', detail: 'New todos without a setup now get pages in Daily.'}]);
  });

  it('Project/Area rules are dropped and reported', () => {
    const {setups, report} = migrateTagRules([rule('project', ['p']), rule('area', [], {isDefault: true})], 1);
    expect(setups).toEqual([]);
    expect(report.map(e => [e.change, e.detail])).toEqual([
      ['removed', 'Removed: Project and Area rules never had an effect.'],
      ['removed', 'Removed: Project and Area rules never had an effect.'],
    ]);
  });

  it('a rule without tags is dropped', () => {
    expect(migrateTagRules([rule('todo', [])], 1).report[0].detail).toBe('Removed: a rule without tags never matched.');
  });

  it('disabled duplicates colliding with an enabled setup are dropped; a fully disabled component stays, off', () => {
    const on = rule('meeting', ['sparring'], {name: 'On'});
    const offDup = rule('todo', ['sparring', 'other'], {enabled: false, name: 'OffDup'});
    const offAlone = rule('meeting', ['old'], {enabled: false, name: 'Old'});
    const offAlone2 = rule('todo', ['old'], {enabled: false});
    const {setups, report} = migrateTagRules([offAlone, on, offDup, offAlone2], 1);
    expect(setups.map(s => [s.name, s.enabled, s.tags])).toEqual([
      ['Old', false, ['old']],
      ['On', true, ['sparring']],
    ]);
    expect(report.find(e => e.setup === 'OffDup')?.change).toBe('removed');
  });

  it('a disabled rule in the same component as an enabled one... is dropped, so the setup stays enabled', () => {
    const {setups} = migrateTagRules([rule('meeting', ['a'], {enabled: false}), rule('todo', ['a'])], 1);
    expect(setups.map(s => [s.enabled, Object.keys(s.pages)])).toEqual([[true, ['todo']]]);
  });

  it('tracking is the OR of the meeting members', () => {
    const {setups} = migrateTagRules(
      [rule('meeting', ['a'], {trackPrep: true}), rule('meeting', ['a', 'b'], {trackReview: true}), rule('todo', ['b'], {trackPrep: true})],
      1,
    );
    expect(setups[0].tracking).toEqual({trackPrep: true, trackReview: true});
  });

  it("a setup without a meeting member takes the Default's tracking (0.14 tracked its meetings by the Default)", () => {
    const {setups} = migrateTagRules([rule('meeting', [], {isDefault: true, trackPrep: true}), rule('todo', ['a']), rule('meeting', ['b'])], 1);
    expect(setups.map(s => s.tracking)).toEqual([
      {trackPrep: true, trackReview: false},
      {trackPrep: false, trackReview: false},
    ]);
  });

  it('order follows the first member; ids count up from nextId', () => {
    const {setups, nextId} = migrateTagRules([rule('todo', ['b']), rule('meeting', ['a']), rule('meeting', ['b'])], 7);
    expect(setups.map(s => [s.id, s.tags])).toEqual([
      ['7', ['b']],
      ['8', ['a']],
    ]);
    expect(nextId).toBe(9);
  });

  it('survives malformed stored rules', () => {
    const broken = [null, {context: 'meeting'}, {context: 'todo', tags: [3, '#ok']}] as unknown as LegacyTagRule[];
    const {setups} = migrateTagRules(broken, 1);
    expect(setups.map(s => [s.tags, s.pages.todo])).toEqual([[['ok'], {template: '', pieces: []}]]);
  });
});

describe('migrateNoteSetupSettings', () => {
  const rules = [rule('meeting', [], {isDefault: true, pieces: pieces('dateTitle')}), rule('meeting', ['x'], {name: 'X'})];
  const old: GtdParaSettings = {...DEFAULT_SETTINGS, tagRules: rules, nextTagRuleId: 3};

  it('migrates once, keeps the Tag Rules untouched, stores the report', () => {
    const migrated = migrateNoteSetupSettings(old);
    expect(migrated.noteSetupsMigrated).toBe(true);
    expect(migrated.noteSetups.map(s => s.name)).toEqual(['X']);
    expect(migrated.nextNoteSetupId).toBe(2);
    expect(migrated.noteSetupsNotice).toEqual([]);
    expect(migrated.tagRules).toBe(rules);
    expect(migrated.nextTagRuleId).toBe(3);
  });

  it('is idempotent: once migrated, nothing runs again', () => {
    const migrated = migrateNoteSetupSettings(old);
    expect(migrateNoteSetupSettings(migrated)).toBe(migrated);
    expect(migrateNoteSetupSettings({...migrated, noteSetups: []})).toEqual({...migrated, noteSetups: []});
  });

  it('a fresh install (no Tag Rules) seeds the Default and no notice', () => {
    const fresh = migrateNoteSetupSettings(DEFAULT_SETTINGS);
    expect(fresh.noteSetups).toEqual([]);
    expect(fresh.noteSetupDefaults).toEqual(seedNoteSetupDefaults());
    expect(fresh.noteSetupsNotice).toBeNull();
    expect(fresh.tagRules).toEqual([]);
  });

  it('completes settings migrated before the Default had a notebook: notebook from the kept rules, Untitled renamed, once', () => {
    const kept = [rule('meeting', [], {isDefault: true, noteTarget: 'shared', sharedFileName: 'Daily'}), rule('meeting', ['tango'], {name: 'Untitled'})];
    const migrated = migrateNoteSetupSettings({...old, tagRules: kept});
    const withoutNotebook = {...migrated.noteSetupDefaults};
    delete withoutNotebook.notebook;
    const earlier = {...migrated, noteSetupDefaults: withoutNotebook, noteSetups: migrated.noteSetups.map(x => ({...x, name: 'Untitled'}))};
    const completed = migrateNoteSetupSettings(earlier);
    expect(completed.noteSetupDefaults.notebook).toEqual({name: 'Daily', folder: 'Meetings'});
    expect(completed.noteSetups.map(x => x.name)).toEqual(['#tango']);
    expect(migrateNoteSetupSettings(completed)).toBe(completed);
  });

  it('a profile saved by 0.14 migrates after a switch (the switch fills the new keys from the defaults)', () => {
    const profile = sanitizeProfileSettings({tagRules: rules, nextTagRuleId: 3});
    const active = buildActiveSettings('demo', profile, {}, migrateNoteSetupSettings(DEFAULT_SETTINGS));
    expect(active.noteSetupsMigrated).toBe(false);
    expect(migrateNoteSetupSettings(active).noteSetups.map(s => s.name)).toEqual(['X']);
  });

  it('every new key is per profile', () => {
    for (const key of ['noteSetups', 'noteSetupDefaults', 'nextNoteSetupId', 'noteSetupsNotice', 'noteSetupsMigrated', 'tagRules'] as const) {
      expect(PROFILE_KEYS).toContain(key);
    }
  });

  it('counts for the log line carry no names', () => {
    const counts = migrationCounts(migrateNoteSetupSettings({...old, tagRules: [...rules, rule('todo', ['x'])]}));
    expect(counts).toEqual({setups: 1, merged: 1, removed: 0, intoNotebook: 0, notebookChanged: 0, conflict: 0});
  });
});

describe('a representative 0.14 rule list (anonymized)', () => {
  // Shapes seen in real use: a seeded default, thread rules sharing a notebook
  // across meeting and todo, a coaching notebook per client, a loop kind with
  // its own todo rule, an old Project rule, a switched-off duplicate.
  const list: LegacyTagRule[] = [
    rule('meeting', [], {name: 'Meeting (default)', isDefault: true, pieces: createDefaultMeetingPage().pieces}),
    rule('meeting', ['sparring', 'retro'], {name: 'Sparring', noteTarget: 'shared', sharedFileName: '{tag} {subtag} {year}', trackPrep: true, trackReview: true}),
    rule('todo', ['sparring'], {name: 'Sparring todos', pieces: pieces('title', 'link')}),
    rule('meeting', ['coaching'], {name: 'Coaching', noteTarget: 'shared', sharedFileName: 'Coaching {subtag} {year}', sharedFileFolder: 'root'}),
    rule('loop', ['workshop'], {name: 'Workshop', pieces: pieces('dateTitle', 'link')}),
    rule('todo', ['workshop'], {name: 'Workshop todos', pieces: pieces('title')}),
    rule('meeting', ['workshop', 'team'], {name: 'Team'}),
    rule('project', [], {name: 'Project (default)', isDefault: true}),
    rule('meeting', ['retro'], {name: 'Retro (old)', enabled: false}),
  ];

  it('migrates to four setups with a readable report', () => {
    const {setups, defaults, report} = migrateTagRules(list, 1);
    expect(setups.map(s => [s.name, s.kind, s.tags, s.notebook?.folder ?? null, s.enabled])).toEqual([
      ['Sparring', 'thread', ['sparring', 'retro'], 'Meetings', true],
      ['Coaching', 'thread', ['coaching'], '', true],
      ['Workshop', 'loop', ['workshop'], '', true],
      ['Team', 'thread', ['team'], null, true],
    ]);
    expect(setups[0].tracking).toEqual({trackPrep: true, trackReview: true});
    expect(defaults.pages.meeting?.pieces.map(p => p.type)).toEqual(['dateTitle', 'time', 'link', 'related']);
    expect(report.map(e => `${e.setup}: ${e.change}`)).toEqual([
      'Project (default): removed',
      'Team: removed',
      'Retro (old): removed',
      'Sparring: merged',
      'Sparring: intoNotebook',
      'Workshop: merged',
    ]);
  });
});

// Runs only with NOTE_SETUPS_FIXTURE=<path to a profile export>: prints what
// the migration makes of a real profile (names and tags included - it only
// runs locally; the file never enters the repository).
const fixturePath = process.env.NOTE_SETUPS_FIXTURE;
(fixturePath ? describe : describe.skip)('local profile export', () => {
  it('migrates its Tag Rules', () => {
    const fs = require('fs');
    const raw = JSON.parse(String(fs.readFileSync(fixturePath, 'utf8')).replace(/^﻿/, ''));
    const settings = raw.settings ?? raw;
    const rules: LegacyTagRule[] = settings.tagRules ?? settings.noteCreationDefinitions ?? [];
    const result = migrateTagRules(rules, 1);
    const lines = [
      `${rules.length} Tag Rules -> ${result.setups.length} Note setups`,
      '',
      'Setups:',
      ...result.setups.map(
        s =>
          `- ${s.name} [${s.kind}${s.enabled ? '' : ', off'}] ${s.tags.map(t => `#${t}`).join(' ')}` +
          ` · ${s.notebook ? `notebook ${s.notebook.folder ? `${s.notebook.folder}/` : ''}${s.notebook.name}` : 'own note per item'}` +
          ` · own pages: ${Object.keys(s.pages).join(', ') || 'none'}` +
          ` · tracks ${s.tracking.trackPrep ? 'prep ' : ''}${s.tracking.trackReview ? 'review' : ''}`,
      ),
      '',
      `Default pages: ${Object.keys(result.defaults.pages).join(', ')} · tracking ${JSON.stringify(result.defaults.tracking)}`,
      '',
      'Report:',
      ...result.report.map(e => `- ${e.setup} (${e.change}): ${e.detail}`),
    ];
    process.stdout.write(`\n${lines.join('\n')}\n\n`);
    expect(result.setups.length).toBeGreaterThanOrEqual(0);
  });
});
