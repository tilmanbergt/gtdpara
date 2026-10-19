// docs/dev/history/technical-design-quality-hardening.md §3.2: open "which version wins?"
// questions wait in order; without a UI and on a profile switch the answer is "file".
jest.mock('../../src/storage/profileKeys', () => {
  const listeners: Array<() => void> = [];
  return {
    onActiveProfileChange: (l: () => void) => {
      listeners.push(l);
      return () => undefined;
    },
    mockSwitch: () => listeners.forEach(l => l()),
  };
});

import {
  answerWriteConflict,
  askWriteConflict,
  getWriteConflict,
  installWriteConflictUi,
} from '../../src/storage/writeConflicts';

const {mockSwitch} = jest.requireMock('../../src/storage/profileKeys') as {mockSwitch: () => void};

it('answers "file" at once when no UI is installed', async () => {
  await expect(askWriteConflict('Website', ['## Tasks'])).resolves.toBe('file');
  expect(getWriteConflict()).toBeNull();
});

it('shows one question at a time, in order', async () => {
  const uninstall = installWriteConflictUi();
  const first = askWriteConflict('Website', ['## Tasks']);
  const second = askWriteConflict('Inbox', ['## Meetings']);
  const shown = getWriteConflict()!;
  expect(shown.fileName).toBe('Website');
  answerWriteConflict(shown.id + 1, 'mine'); // not the one shown: ignored
  expect(getWriteConflict()!.fileName).toBe('Website');
  answerWriteConflict(shown.id, 'mine');
  await expect(first).resolves.toBe('mine');
  expect(getWriteConflict()!.fileName).toBe('Inbox');
  answerWriteConflict(getWriteConflict()!.id, 'file');
  await expect(second).resolves.toBe('file');
  expect(getWriteConflict()).toBeNull();
  uninstall();
});

it('a profile switch answers every open question with "file"', async () => {
  const uninstall = installWriteConflictUi();
  const open = askWriteConflict('Website', ['## Tasks']);
  mockSwitch();
  await expect(open).resolves.toBe('file');
  expect(getWriteConflict()).toBeNull();
  uninstall();
});
