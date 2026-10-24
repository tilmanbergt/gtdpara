// docs/dev/history/technical-design-quality-hardening.md §5.3 F1: a todo's or meeting's own note
// that is not there is reported, with where a note of that name is when there is one.
import {checkNoteMissing, IntegrityCheckInput} from '../../src/domain/integrityCheck';
import {newTask} from '../../src/domain/taskEdit';

const existing = new Set(['/Note/1 Projects/Web/Todos/Here.note']);
const io = {fileExists: async (p: string) => existing.has(p), folderExists: async () => true};
const input = (notePaths: string[], notesByName?: Map<string, string[]>): IntegrityCheckInput => ({
  itemKind: 'inbox',
  itemPath: '/Note/2 Areas/0 Inbox',
  tasks: notePaths.map(notePath => ({...newTask({text: `todo ${notePath}`}), notePath})),
  meetings: [],
  rawContent: '',
  basePath: '/Note',
  resourcesPath: '/Note/3 Resources',
  defaultResourceFolder: null,
  notesByName,
});

it('reports nothing for a note that is there, no note, or a page link', async () => {
  expect(await checkNoteMissing(input(['/Note/1 Projects/Web/Todos/Here.note', '', 'Book.note#Call']), io)).toEqual([]);
});

it('names where a note of the same name is', async () => {
  const [finding] = await checkNoteMissing(input(['Todos/Call Anna.note'], new Map([['Call Anna.note', ['/Note/1 Projects/Web/Todos/Call Anna.note']]])), io);
  expect(finding).toMatchObject({checkId: 'noteMissing', entityKind: 'task', notePath: 'Todos/Call Anna.note'});
  expect(finding.message).toBe(
    'The note "2 Areas/0 Inbox/Todos/Call Anna.note" was not found, but a note with this name is in "1 Projects/Web/Todos/Call Anna.note" ' +
      '- a move may have stopped halfway. Link that note to this entry again, or remove the entry if it is a duplicate.',
  );
});

it('says it may have been deleted when no note of that name is anywhere', async () => {
  const [finding] = await checkNoteMissing(input(['Todos/Gone.note'], new Map()), io);
  expect(finding.message).toContain('may have been deleted or moved outside Kept GTD');
});
