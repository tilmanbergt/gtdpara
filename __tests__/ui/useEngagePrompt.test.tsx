// docs/dev/history/technical-design-engage.md §3.8 (R5): the prompt after a Done elsewhere in gtdpara.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}, NativePluginManager: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
const mockStore: {tasks: Task[]} = {tasks: []};
jest.mock('../../src/storage/dataCache', () => ({
  ...jest.requireActual('../../src/storage/dataCache'),
  getCachedData: () => ({paths: {inboxFolder: '/Note/2 Areas/0 Inbox'}, items: [mockItem()]}),
}));
jest.mock('../../src/storage/itemMutations', () => ({
  ...jest.requireActual('../../src/storage/itemMutations'),
  mutateEntryTasks: async (_entry: unknown, mutate: (tasks: Task[]) => Task[]) => {
    mockStore.tasks = mutate(mockStore.tasks.slice());
    return {nextInbox: null};
  },
}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Task} from '../../src/domain/types';
import {StatusEntry, StatusProvider, useStatusList} from '../../src/ui/status/StatusProvider';
import {EngagePrompt, useEngagePrompt} from '../../src/ui/useEngagePrompt';
import {item, task} from '../../test-helpers/fixtures';

const mockItem = () => item('area', 'Coaching', {tasks: mockStore.tasks});
const PATH = '/Note/2 Areas/Coaching';
let prompt: EngagePrompt | null = null;
let list: StatusEntry[] = [];
function Probe(): null {
  prompt = useEngagePrompt('Test');
  list = useStatusList();
  return null;
}
async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

beforeEach(async () => {
  await act(async () => {
    TestRenderer.create(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
  });
});

describe('useEngagePrompt', () => {
  it('the last #next done: offers the plan; a pick adds #next; Later clears', async () => {
    mockStore.tasks = [task('Brief #next', {done: true}), task('Plan dinner'), task('Call caterer')];
    await act(async () => prompt!.afterDone(PATH, mockStore.tasks[0]));
    await settle();
    expect(list).toHaveLength(1);
    expect(list[0].msg.text).toBe('Coaching has no next action. Pick one:');
    expect(list[0].msg.actions!.map(a => a.label)).toEqual(['Plan dinner', 'Call caterer', 'Later']);
    await act(async () => list[0].msg.actions![1].onPress());
    await settle();
    expect(mockStore.tasks[2].text).toBe('Call caterer #next');
    expect(list).toHaveLength(0);

    await act(async () => prompt!.afterDone(PATH, mockStore.tasks[0]));
    await settle();
    expect(list).toHaveLength(0); // a #next is there now
  });

  it('nothing while a #next is left', async () => {
    mockStore.tasks = [task('Brief #next', {done: true}), task('Other #next'), task('Plan dinner')];
    await act(async () => prompt!.afterDone(PATH, mockStore.tasks[0]));
    await settle();
    expect(list).toHaveLength(0);
  });
});
