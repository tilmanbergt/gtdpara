import {
  candidateForLink,
  createDefaultMeetingPage,
  createNoteSetup,
  distinctCandidates,
  layoutFor,
  matchingSetups,
  noteCandidates,
  NoteCandidate,
  NoteSetup,
  NoteSetupDefaults,
  normalizeSetupTag,
  normalizeSetupTags,
  pageKindsOf,
  seedNoteSetupDefaults,
  setupSubtag,
  setupTagProblemText,
  setupTypeTag,
  tagMatchesSetupTag,
  validateNotebookFolder,
  validateSetupTags,
} from '../../src/domain/noteSetups';
import {DEFAULT_PIECE_TYPES, PageLayout, PIECE_PAGES, withDefaultPieces} from '../../src/domain/pageLayout';
import {LoopRef} from '../../src/domain/loops';

// docs/dev/history/technical-design-note-setups.md §9.1

function setup(id: string, kind: 'thread' | 'loop', tags: string[], extra: Partial<NoteSetup> = {}): NoteSetup {
  return {...createNoteSetup(id, kind), name: `S${id}`, tags, ...extra};
}

const notebook = {name: '{tag} {subtag} {year}', folder: 'Meetings'};
const workshopLoop: LoopRef = {kind: 'workshop', name: 'offsite', tag: 'workshop/offsite'};

describe('tag matching', () => {
  it('matches the tag and nested tags, never a longer word or child -> parent', () => {
    expect(tagMatchesSetupTag('coaching', 'coaching')).toBe(true);
    expect(tagMatchesSetupTag('coaching/sabina', 'coaching')).toBe(true);
    expect(tagMatchesSetupTag('coachingx', 'coaching')).toBe(false);
    expect(tagMatchesSetupTag('coaching', 'coaching/sabina')).toBe(false);
  });

  it('setupSubtag and setupTypeTag pick the first nested / matched item tag', () => {
    expect(setupSubtag(['x', 'Coaching/Sabina', 'coaching/tom'], ['coaching'])).toBe('sabina');
    expect(setupSubtag(['coaching'], ['coaching'])).toBe('');
    expect(setupTypeTag(['retro/alpha', 'sparring/max'], ['sparring', 'retro'])).toBe('retro');
    expect(setupTypeTag(['other'], ['sparring'])).toBe('');
  });
});

describe('matchingSetups', () => {
  const a = setup('1', 'thread', ['sparring']);
  const b = setup('2', 'thread', ['retro'], {enabled: false});
  const c = setup('3', 'thread', ['team']);

  it('nested tags match, disabled setups are left out, list order is kept', () => {
    expect(matchingSetups(['team/jf', 'sparring/peter', 'retro'], [a, b, c]).map(s => s.id)).toEqual(['1', '3']);
  });

  it('matches case-insensitively', () => {
    expect(matchingSetups(['Sparring/Peter'], [{...a, tags: ['Sparring']}]).map(s => s.id)).toEqual(['1']);
  });

  it('no tags, no match', () => {
    expect(matchingSetups([], [a, c])).toEqual([]);
  });
});

describe('noteCandidates', () => {
  const sparring = setup('1', 'thread', ['sparring'], {notebook});
  const jf = setup('2', 'thread', ['jf']);
  const workshop = setup('3', 'loop', ['workshop'], {notebook: {name: '{tag}', folder: ''}});
  const all = [sparring, jf, workshop];
  const tags = ['workshop/offsite', 'sparring/peter'];

  function targets(cs: NoteCandidate[]): string[] {
    return cs.map(c => `${c.setup?.id ?? 'default'}:${c.target}`);
  }

  it('meeting: thread setups first, then loop setups', () => {
    const cs = noteCandidates({pageKind: 'meeting', tags, setups: all, activeLoops: [workshopLoop], forceOwn: false});
    expect(targets(cs)).toEqual(['1:notebook', '3:loop']);
    expect(cs[1].loop).toEqual(workshopLoop);
  });

  it('todo: loop setups first, then thread setups', () => {
    const cs = noteCandidates({pageKind: 'todo', tags, setups: all, activeLoops: [workshopLoop], forceOwn: false});
    expect(targets(cs)).toEqual(['3:loop', '1:notebook']);
  });

  it('a loop setup without an active loop is an own candidate', () => {
    const cs = noteCandidates({pageKind: 'todo', tags: ['workshop/offsite'], setups: all, activeLoops: [], forceOwn: false});
    expect(targets(cs)).toEqual(['3:own']);
  });

  it('an active loop of another kind does not count', () => {
    const other: LoopRef = {kind: 'reading', name: 'x', tag: 'reading/x'};
    const cs = noteCandidates({pageKind: 'todo', tags: ['workshop/offsite'], setups: all, activeLoops: [other], forceOwn: false});
    expect(targets(cs)).toEqual(['3:own']);
  });

  it('no match: the Default, own', () => {
    expect(noteCandidates({pageKind: 'meeting', tags: ['other'], setups: all, activeLoops: [], forceOwn: false})).toEqual([
      {setup: null, target: 'own'},
    ]);
  });

  it('no match with a Default notebook: the Default, notebook - but own for the Inbox', () => {
    const base = {pageKind: 'todo' as const, tags: ['other'], setups: all, activeLoops: [], defaultNotebook: true};
    expect(noteCandidates({...base, forceOwn: false})).toEqual([{setup: null, target: 'notebook'}]);
    expect(noteCandidates({...base, forceOwn: true})).toEqual([{setup: null, target: 'own'}]);
  });

  it('forceOwn (Inbox): the first candidate, own', () => {
    const cs = noteCandidates({pageKind: 'todo', tags, setups: all, activeLoops: [workshopLoop], forceOwn: true});
    expect(targets(cs)).toEqual(['3:own']);
  });

  it('candidates that certainly lead to the same note are merged', () => {
    // jf (own) and the inactive workshop loop (own) are both the item's own note.
    const cs = noteCandidates({pageKind: 'meeting', tags: ['jf', 'workshop/offsite'], setups: all, activeLoops: [], forceOwn: false});
    expect(targets(cs)).toEqual(['2:own']);
  });

  it('disabled setups are no candidates', () => {
    const cs = noteCandidates({
      pageKind: 'meeting',
      tags,
      setups: [{...sparring, enabled: false}, workshop],
      activeLoops: [workshopLoop],
      forceOwn: false,
    });
    expect(targets(cs)).toEqual(['3:loop']);
  });

  it('distinctCandidates keeps the first per file', () => {
    const files: Record<string, string> = {a: 'x.note', b: 'y.note', c: 'x.note'};
    expect(distinctCandidates(['a', 'b', 'c'], k => files[k])).toEqual(['a', 'b']);
  });
});

describe('layoutFor', () => {
  const own: PageLayout = {template: 'lines.png', pieces: []};
  const defaults: NoteSetupDefaults = {pages: {meeting: createDefaultMeetingPage()}, tracking: {trackPrep: false, trackReview: false}};

  it('own layout wins', () => {
    expect(layoutFor(setup('1', 'thread', ['a'], {pages: {meeting: own}}), 'meeting', defaults)).toBe(own);
  });

  it('else the Default page', () => {
    expect(layoutFor(setup('1', 'thread', ['a']), 'meeting', defaults)).toBe(defaults.pages.meeting);
    expect(layoutFor(null, 'meeting', defaults)).toBe(defaults.pages.meeting);
  });

  it('else blank (null)', () => {
    expect(layoutFor(setup('1', 'thread', ['a']), 'todo', defaults)).toBeNull();
    expect(layoutFor(null, 'first', defaults)).toBeNull();
  });
});

describe('candidateForLink', () => {
  const files: Record<string, string> = {a: 'Meetings/a.note', b: 'Sparring/b.note'};

  it('picks the candidate whose file equals the link', () => {
    expect(candidateForLink(['a', 'b'], 'Sparring/b.note', k => files[k])).toBe('b');
  });

  it('falls back to the first', () => {
    expect(candidateForLink(['a', 'b'], 'Other/c.note', k => files[k])).toBe('a');
  });
});

describe('validateSetupTags', () => {
  const sparring = setup('1', 'thread', ['sparring', 'retro']);
  const off = setup('2', 'thread', ['coaching'], {enabled: false, name: 'Coaching'});

  it('refuses a tag another setup has', () => {
    const problem = validateSetupTags(setup('3', 'thread', ['#Retro']), [sparring, off]);
    expect(problem).toEqual({kind: 'taken', tag: 'retro', otherSetup: 'S1'});
    expect(setupTagProblemText(problem!)).toBe('#retro is already in S1.');
  });

  it('checks disabled setups too', () => {
    expect(validateSetupTags(setup('3', 'thread', ['coaching']), [sparring, off])).toEqual({
      kind: 'taken',
      tag: 'coaching',
      otherSetup: 'Coaching',
    });
  });

  it('ignores the setup itself', () => {
    expect(validateSetupTags(sparring, [sparring, off])).toBeNull();
  });

  it('a loop kind is one word', () => {
    const problem = validateSetupTags(setup('3', 'loop', ['workshop/x']), []);
    expect(problem).toEqual({kind: 'loopNested', tag: 'workshop/x'});
    expect(setupTagProblemText(problem!)).toBe('A loop kind is one word, like workshop.');
    expect(validateSetupTags(setup('3', 'thread', ['team/jf']), [])).toBeNull();
  });

  it('normalizes tags', () => {
    expect(normalizeSetupTag('  #Retro ')).toBe('retro');
    expect(normalizeSetupTag(' # ')).toBe('');
    expect(normalizeSetupTags(['#A', 'a', '', 'b'])).toEqual(['a', 'b']);
  });
});

describe('validateNotebookFolder', () => {
  it("'' is the root", () => {
    expect(validateNotebookFolder('  ')).toEqual({ok: true, folder: ''});
    expect(validateNotebookFolder('/')).toEqual({ok: true, folder: ''});
  });

  it('nested folders, backslashes and outer slashes', () => {
    expect(validateNotebookFolder('Coaching/2026')).toEqual({ok: true, folder: 'Coaching/2026'});
    expect(validateNotebookFolder(' \\Sparring\\Peter\\ ')).toEqual({ok: true, folder: 'Sparring/Peter'});
  });

  it('refuses .., a leading dot, empty segments, illegal characters, too deep, too long', () => {
    expect(validateNotebookFolder('../x').ok).toBe(false);
    expect(validateNotebookFolder('a/./b').ok).toBe(false);
    expect(validateNotebookFolder('.hidden').ok).toBe(false);
    expect(validateNotebookFolder('a//b').ok).toBe(false);
    expect(validateNotebookFolder('a:b').ok).toBe(false);
    expect(validateNotebookFolder('a#b').ok).toBe(false);
    expect(validateNotebookFolder('a/b/c/d').ok).toBe(false);
    expect(validateNotebookFolder('x'.repeat(61)).ok).toBe(false);
    expect(validateNotebookFolder('x'.repeat(60)).ok).toBe(true);
  });

  it('names the problem', () => {
    const result = validateNotebookFolder('a:b');
    expect(result.ok ? '' : result.message).toBe('A folder name cannot contain :');
  });
});

describe('pages and defaults', () => {
  it('page rows per kind', () => {
    expect(pageKindsOf('thread')).toEqual(['meeting', 'todo', 'review']);
    expect(pageKindsOf('loop')).toEqual(['meeting', 'todo', 'first', 'review']);
  });

  it('a new setup uses the Default layout everywhere; a Loop setup has its loop note', () => {
    expect(createNoteSetup('1', 'thread')).toMatchObject({notebook: null, pages: {}, enabled: true});
    expect(createNoteSetup('2', 'loop').notebook).toEqual({name: '{year}-{month} {tag} {subtag}', folder: ''});
  });

  it('the seeded Default: Meeting page with related items, First and Home page, no Todo page, the home notebook', () => {
    const defaults = seedNoteSetupDefaults();
    expect(defaults.pages.meeting?.pieces.map(p => p.type)).toEqual(['dateTitle', 'time', 'link', 'related']);
    expect(defaults.pages.first?.pieces.map(p => p.type)).toEqual(['dateTitle', 'link']);
    expect(defaults.pages.todo).toBeUndefined();
    expect(defaults.tracking).toEqual({trackPrep: false, trackReview: false});
    expect(defaults.notebook).toEqual({name: '{name} {year}', folder: ''});
  });

  it('a todo page starts with its Title as a heading', () => {
    const page = withDefaultPieces<PageLayout>({template: '', pieces: []}, 'todo');
    expect(page.pieces.map(p => [p.type, p.heading])).toEqual([
      ['title', true],
      ['link', undefined],
    ]);
  });

  it('every default piece is offered on its page', () => {
    for (const kind of ['meeting', 'todo', 'first'] as const) {
      for (const type of DEFAULT_PIECE_TYPES[kind]) expect(PIECE_PAGES[type]).toContain(kind);
    }
  });
});
