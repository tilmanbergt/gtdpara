import {
  effectiveInboxFolder,
  inboxFolderRelativeToBase,
  InboxMigrationInput,
  legacyInboxLeftovers,
  ListedEntry,
  planInboxMigration,
  rewriteMovedLinkedFile,
  rewriteMovedNotePath,
} from '../../src/domain/inboxMigration';
import {checkLegacyInboxLeftovers} from '../../src/domain/integrityCheck';

const BASE = '/storage/emulated/0/Note';
const TARGET = `${BASE}/2 Areas/0 Inbox`;

const file = (name: string): ListedEntry => ({name, isFolder: false});
const folder = (name: string): ListedEntry => ({name, isFolder: true});

function input(over: Partial<InboxMigrationInput> = {}): InboxMigrationInput {
  return {
    base: BASE,
    inboxFolder: TARGET,
    rootEntries: [folder('1 Projects'), folder('2 Areas'), file('Inbox.txt'), folder('Todos'), folder('Meetings')],
    targetEntries: [],
    rootNoteEntries: {Todos: ['a.note'], Meetings: ['m.note']},
    targetNoteEntries: {Todos: [], Meetings: []},
    ...over,
  };
}

describe('planInboxMigration', () => {
  it('does nothing without a root Inbox.txt (never moved, or already done)', () => {
    expect(planInboxMigration(input({rootEntries: [folder('2 Areas'), folder('Todos')]}))).toEqual({state: 'none'});
  });

  it('plans all moves, links before Inbox.txt, Inbox.txt last', () => {
    const plan = planInboxMigration(input());
    expect(plan.state).toBe('ready');
    if (plan.state !== 'ready') return;
    expect(plan.ops.map(o => o.id)).toEqual(['ensureFolder', 'move:Todos', 'move:Meetings', 'rewriteLinks', 'move:inbox']);
    expect(plan.ops[1]).toMatchObject({kind: 'moveFolderMerge', from: `${BASE}/Todos`, to: `${TARGET}/Todos`});
    expect(plan.ops[4]).toMatchObject({kind: 'moveFile', from: `${BASE}/Inbox.txt`, to: `${TARGET}/Inbox.txt`});
  });

  it('moves only what is there (only Inbox.txt)', () => {
    const plan = planInboxMigration(input({rootEntries: [file('Inbox.txt')]}));
    expect(plan.state === 'ready' && plan.ops.map(o => o.id)).toEqual(['ensureFolder', 'rewriteLinks', 'move:inbox']);
  });

  it('resumes after an interruption (Todos already moved, target partly filled)', () => {
    const plan = planInboxMigration(
      input({
        rootEntries: [file('Inbox.txt'), folder('Meetings')],
        targetEntries: [folder('Todos')],
        targetNoteEntries: {Todos: ['a.note'], Meetings: []},
      }),
    );
    expect(plan.state === 'ready' && plan.ops.map(o => o.id)).toEqual(['ensureFolder', 'move:Meetings', 'rewriteLinks', 'move:inbox']);
  });

  it('is blocked by a real Area with the same name', () => {
    expect(planInboxMigration(input({targetEntries: [file('area.txt')]}))).toMatchObject({state: 'blocked', reason: 'areaNameClash'});
    expect(planInboxMigration(input({targetEntries: [file('project.txt')]}))).toMatchObject({state: 'blocked', reason: 'areaNameClash'});
  });

  it('is blocked by two Inbox files', () => {
    expect(planInboxMigration(input({targetEntries: [file('Inbox.txt')]}))).toMatchObject({state: 'blocked', reason: 'twoInboxFiles'});
  });

  it('is blocked by a note name in both places, before anything moves', () => {
    const plan = planInboxMigration(input({targetEntries: [folder('Todos')], targetNoteEntries: {Todos: ['a.note'], Meetings: []}}));
    expect(plan).toMatchObject({state: 'blocked', reason: 'noteNameClash'});
  });
});

describe('link rewrites', () => {
  const rel = inboxFolderRelativeToBase(BASE, TARGET);

  it('computes the base-relative Inbox folder', () => {
    expect(rel).toBe('2 Areas/0 Inbox');
    expect(inboxFolderRelativeToBase(`${BASE}/`, `${TARGET}/`)).toBe('2 Areas/0 Inbox');
  });

  it('rewrites linkedFiles into the moved folders only', () => {
    expect(rewriteMovedLinkedFile('Todos/x.note', rel)).toBe('2 Areas/0 Inbox/Todos/x.note');
    expect(rewriteMovedLinkedFile('Meetings/y.note', rel)).toBe('2 Areas/0 Inbox/Meetings/y.note');
    expect(rewriteMovedLinkedFile('3 Resources/Todos/z.pdf', rel)).toBe('3 Resources/Todos/z.pdf');
    expect(rewriteMovedLinkedFile('Todos-old/x.note', rel)).toBe('Todos-old/x.note');
    expect(rewriteMovedLinkedFile('', rel)).toBe('');
  });

  it('is idempotent (a rewritten link is not rewritten again)', () => {
    const once = rewriteMovedLinkedFile('Todos/x.note', rel);
    expect(rewriteMovedLinkedFile(once, rel)).toBe(once);
    const abs = rewriteMovedNotePath(`${BASE}/Todos/x.note`, BASE, TARGET);
    expect(rewriteMovedNotePath(abs, BASE, TARGET)).toBe(abs);
  });

  it('rewrites absolute notePaths into the moved folders, leaves relative ones', () => {
    expect(rewriteMovedNotePath(`${BASE}/Meetings/m.note`, BASE, TARGET)).toBe(`${TARGET}/Meetings/m.note`);
    expect(rewriteMovedNotePath('Todos/x.note', BASE, TARGET)).toBe('Todos/x.note');
    expect(rewriteMovedNotePath(`${BASE}/1 Projects/P/Todos/x.note`, BASE, TARGET)).toBe(`${BASE}/1 Projects/P/Todos/x.note`);
    expect(rewriteMovedNotePath('', BASE, TARGET)).toBe('');
  });
});

describe('effective location and leftovers', () => {
  it('uses the new folder unless Inbox.txt is still only at the root', () => {
    expect(effectiveInboxFolder(BASE, TARGET, false, false)).toBe(TARGET); // fresh install
    expect(effectiveInboxFolder(BASE, TARGET, false, true)).toBe(TARGET); // moved
    expect(effectiveInboxFolder(BASE, TARGET, true, false)).toBe(BASE); // blocked / failed / not yet moved
    expect(effectiveInboxFolder(BASE, TARGET, true, true)).toBe(TARGET); // two files: the new one wins
  });

  it('lists leftovers at the root', () => {
    expect(legacyInboxLeftovers([file('Inbox.txt'), folder('Todos'), folder('2 Areas')])).toEqual(['Inbox.txt', 'Todos/']);
    expect(legacyInboxLeftovers([folder('2 Areas'), file('Todos')])).toEqual([]);
  });

  it('turns leftovers into one Integrity Check finding', () => {
    expect(checkLegacyInboxLeftovers([folder('2 Areas')], BASE, TARGET)).toEqual([]);
    const findings = checkLegacyInboxLeftovers([file('Inbox.txt'), folder('Meetings')], BASE, TARGET);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({checkId: 'legacyInboxLeftovers', itemKind: 'inbox', entityLabel: 'Inbox.txt, Meetings/'});
  });
});
