// Quick Add's edit session (ui/quickAdd/useEditSession.ts) and edit target (ui/quickAdd/types.ts):
// loading, the create draft surviving an edit detour, focus on a fresh edit, save-then-switch.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('sn-plugin-lib', () => ({NativePluginManager: {}, PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/storage/tagUsage', () => ({
  getRecentTags: () => new Promise(() => undefined),
  getRecentTagsSync: () => [],
  recordTagsUsed: async () => undefined,
}));
jest.mock('../../src/ui/useAbbrevItems', () => ({useAbbrevItems: () => []}));

import React from 'react';
import {TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import QuickAddWidget, {editTargetFor, QuickAddEditTarget} from '../../src/ui/QuickAddWidget';
import {sameEditTarget} from '../../src/ui/quickAdd/types';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {Meeting, Task} from '../../src/domain/types';

const task = (text: string): Task =>
  ({text, done: false, cancelled: false, tags: [], dueDate: null, flowState: null, waitingOn: null, now: false, notePath: '', linkedFile: ''}) as unknown as Task;
const meeting = (title: string): Meeting => ({
  title,
  date: '2026-10-22',
  time: '10:00',
  endTime: '',
  days: 1,
  tags: [],
  cancelled: false,
  notePath: '',
  linkedFile: '',
});

describe('editTargetFor / sameEditTarget', () => {
  it('builds one target, a todo winning over a meeting', () => {
    const t = task('Call Tom');
    const m = meeting('Sync');
    expect(editTargetFor('task:1', {task: t, meeting: m})).toEqual({kind: 'task', mode: 'edit', key: 'task:1', task: t});
    expect(editTargetFor('loop', {task: t, loop: true})).toEqual({kind: 'loop', mode: 'edit', key: 'loop', task: t});
    expect(editTargetFor('meeting:2', {meeting: m})).toEqual({kind: 'meeting', mode: 'edit', key: 'meeting:2', meeting: m});
    expect(editTargetFor('x', {task: null, meeting: undefined})).toBeNull();
  });

  it('counts a fresh wrapper around the same item as the same target', () => {
    const t = task('Call Tom');
    expect(sameEditTarget(editTargetFor('task:1', {task: t}), editTargetFor('task:1', {task: t}))).toBe(true);
    expect(sameEditTarget(editTargetFor('task:1', {task: t}), editTargetFor('task:2', {task: t}))).toBe(false);
    expect(sameEditTarget(editTargetFor('task:1', {task: t}), editTargetFor('task:1', {task: task('Call Tom')}))).toBe(false);
    expect(sameEditTarget(null, undefined)).toBe(true);
    expect(sameEditTarget(null, editTargetFor('task:1', {task: t}))).toBe(false);
  });
});

interface Harness {
  r: TestRenderer.ReactTestRenderer;
  setTarget: (target: QuickAddEditTarget | null) => void;
  flushEditRef: React.MutableRefObject<(() => Promise<boolean>) | null>;
  focused: string[];
}

function render(onSaveEditTask: jest.Mock, onSaveEditMeeting = jest.fn(async () => undefined)): Harness {
  const flushEditRef: Harness['flushEditRef'] = {current: null};
  const focused: string[] = [];
  const element = (target: QuickAddEditTarget | null) => (
    <StatusProvider>
      <QuickAddWidget
        fixedDestination={{type: 'inbox'}}
        onAddTask={async () => undefined}
        onAddMeeting={async () => undefined}
        editTarget={target}
        onSaveEditTask={onSaveEditTask}
        onSaveEditMeeting={onSaveEditMeeting}
        flushEditRef={flushEditRef}
        onCancelEdit={() => undefined}
        textColor="#000"
        borderColor="#000"
        placeholderColor="#888"
      />
    </StatusProvider>
  );
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(element(null));
  });
  const setTarget = (target: QuickAddEditTarget | null) => act(() => r.update(element(target)));
  return {r, setTarget, flushEditRef, focused};
}

const field = (r: TestRenderer.ReactTestRenderer, placeholder: string) =>
  r.root.findAllByType(TextInput).find(i => i.props.placeholder === placeholder)!;
const type = (r: TestRenderer.ReactTestRenderer, placeholder: string, text: string) =>
  act(() => field(r, placeholder).props.onChangeText(text));

describe('Quick Add edit session', () => {
  it('loads the target, keeps typing on a fresh object, reloads on a new key', () => {
    const {r, setTarget} = render(jest.fn(async () => undefined));
    const t = task('Call Tom');
    setTarget(editTargetFor('task:1', {task: t}));
    expect(field(r, 'New task').props.value).toBe('Call Tom');
    type(r, 'New task', 'Call Tom today');
    setTarget(editTargetFor('task:1', {task: {...t}}));
    expect(field(r, 'New task').props.value).toBe('Call Tom today');
    setTarget(editTargetFor('task:2', {task: task('Book room')}));
    expect(field(r, 'New task').props.value).toBe('Book room');
  });

  it('keeps the create draft through an edit detour', () => {
    const {r, setTarget} = render(jest.fn(async () => undefined));
    type(r, 'New task', 'half typed');
    setTarget(editTargetFor('task:1', {task: task('Call Tom')}));
    expect(field(r, 'New task').props.value).toBe('Call Tom');
    setTarget(null);
    expect(field(r, 'New task').props.value).toBe('half typed');
  });

  it('focuses the field on a fresh edit only, not on a switch', () => {
    const {r, setTarget, focused} = render(jest.fn(async () => undefined));
    for (const placeholder of ['New task', 'New meeting title']) {
      field(r, placeholder).instance.focus = () => focused.push(placeholder);
    }
    setTarget(editTargetFor('meeting:1', {meeting: meeting('Sync')}));
    expect(focused).toEqual(['New meeting title']);
    setTarget(editTargetFor('task:1', {task: task('Call Tom')}));
    expect(focused).toEqual(['New meeting title']);
    setTarget(null);
    setTarget(editTargetFor('task:1', {task: task('Call Tom')}));
    expect(focused).toEqual(['New meeting title', 'New task']);
  });

  it('flush saves only a changed edit and reports a failed save', async () => {
    const onSave = jest.fn(async () => undefined as void | boolean);
    const {r, setTarget, flushEditRef} = render(onSave);
    setTarget(editTargetFor('task:1', {task: task('Call Tom')}));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await flushEditRef.current!();
    });
    expect(ok).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    type(r, 'New task', 'Call Tom today');
    onSave.mockResolvedValueOnce(false);
    await act(async () => {
      ok = await flushEditRef.current!();
    });
    expect(ok).toBe(false);
    expect(onSave).toHaveBeenCalledWith('Call Tom today', '');
  });

  it('saves a changed meeting when the widget unmounts and clears the flush', async () => {
    const onSaveMeeting = jest.fn(async () => undefined);
    const {r, setTarget, flushEditRef} = render(jest.fn(async () => undefined), onSaveMeeting);
    setTarget(editTargetFor('meeting:1', {meeting: meeting('Sync')}));
    type(r, 'New meeting title', 'Sync #team');
    await act(async () => r.unmount());
    expect(onSaveMeeting).toHaveBeenCalledWith(
      {title: 'Sync #team', date: '2026-10-22', time: '10:00', endTime: '', days: 1},
      '',
    );
    expect(flushEditRef.current).toBeNull();
  });
});
