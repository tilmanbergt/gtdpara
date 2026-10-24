// The todo card in Quick Add's place (docs/dev/history/technical-design-item-card.md K9): its slots per
// model and its buttons.
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
jest.mock('../../src/ui/useAbbrevItems', () => ({
  useAbbrevItems: () => [{kind: 'area', name: 'Coaching', path: '/a/coaching', abbrev: 'Co', status: 'active'}],
}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import QuickAddWidget, {editTargetFor} from '../../src/ui/QuickAddWidget';
import FlowStateChips from '../../src/ui/FlowStateChips';
import {todoCardModel, TodoCardInput} from '../../src/domain/itemCard';
import {Task} from '../../src/domain/types';
import {TodoCardData} from '../../src/ui/itemCard/useTodoCard';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {task} from '../../test-helpers/fixtures';

const TODAY = '2026-10-21';

function card(t: Task, extra: Partial<TodoCardInput> = {}, handlers: Partial<TodoCardData> = {}): TodoCardData {
  const model = todoCardModel({task: t, today: TODAY, ownerName: 'Garden renovation', canLink: false, canRefile: false, ...extra});
  return {
    task: t, model, onEdit: jest.fn(), onClose: jest.fn(), onToggleDone: jest.fn(), onFlow: jest.fn(), onToggleNow: jest.fn(),
    onNote: jest.fn(), onUnlink: jest.fn(), onDelete: jest.fn(), ...handlers,
  };
}

function render(t: Task, data: TodoCardData) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <StatusProvider>
        <QuickAddWidget
          fixedDestination={{type: 'inbox'}}
          onAddTask={async () => undefined}
          onAddMeeting={async () => undefined}
          editTarget={editTargetFor('task:0', {task: t}, 'card')}
          todoCard={data}
          textColor="#000"
          borderColor="#000"
          placeholderColor="#888"
        />
      </StatusProvider>,
    );
  });
  return r;
}

const labels = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && typeof n.props.onPress === 'function').map(n => n.props.accessibilityLabel as string);
const press = (r: TestRenderer.ReactTestRenderer, label: string) =>
  act(() => r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress());
const pressText = (r: TestRenderer.ReactTestRenderer, text: string) =>
  act(() => r.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === text))[0].props.onPress());
// The hidden create row has flow chips too; the card's come last.
const cardChips = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(FlowStateChips).at(-1)!;
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

describe('TodoCard', () => {
  it('a Next todo with a due date: heading, title and labels, Done, flow chips, Now, note, area chip, delete', () => {
    const t = task('Order soil #next', {dueDate: '2026-10-24'});
    const r = render(t, card(t));
    expect(texts(r)).toEqual(expect.arrayContaining(['Todo · due 24.10.', 'Order soil', '#next  #due 24.10.', 'Garden renovation', 'Edit', 'Now']));
    expect(labels(r)).toEqual(expect.arrayContaining(['Close', 'Done', 'Now', 'Create note', 'Delete']));
    expect(cardChips(r).props.value).toBe('next');
    expect(labels(r)).not.toContain('Link file');
    expect(labels(r)).not.toContain('Refile');
  });

  it('no Now without Next; no delete once deleted; +clip and refile where the screen can', () => {
    const someday = task('Learn Spanish #someday');
    const r = render(someday, card(someday, {canLink: true, canRefile: true}, {onLink: jest.fn(), onRefile: jest.fn()}));
    expect(labels(r)).not.toContain('Now');
    expect(labels(r)).toEqual(expect.arrayContaining(['Link file', 'Refile']));
    const deleted = task('Old idea', {cancelled: true});
    expect(labels(render(deleted, card(deleted)))).not.toContain('Delete');
  });

  it('the meeting it came from links to the thread overview', () => {
    const agreed = task('Send the canvas', {fields: {...task('x').fields, meeting: '2026-10-14 Sparring Mieke sparring/mieke'}});
    const data = card(agreed, {}, {onOpenOrigin: jest.fn()});
    const r = render(agreed, data);
    pressText(r, '↳ Sparring Mieke ›');
    expect(data.onOpenOrigin).toHaveBeenCalledTimes(1);
  });

  it('every button calls its handler; a flow chip passes its state', () => {
    const t = task('Order soil #next', {linkedFile: 'Resources/plan.pdf'});
    const data = card(t, {}, {onOpenFile: jest.fn(), onOpenOwner: jest.fn()});
    const r = render(t, data);
    pressText(r, 'Edit');
    press(r, 'Close');
    press(r, 'Done');
    press(r, 'Now');
    press(r, 'Create note');
    press(r, 'Delete');
    press(r, 'Unlink');
    press(r, 'Open linked file');
    press(r, 'Open Garden renovation');
    act(() => cardChips(r).props.onChange('someday'));
    for (const h of [data.onEdit, data.onClose, data.onToggleDone, data.onToggleNow, data.onNote, data.onDelete, data.onUnlink, data.onOpenFile, data.onOpenOwner]) {
      expect(h).toHaveBeenCalledTimes(1);
    }
    expect(data.onFlow).toHaveBeenCalledWith('someday');
  });
});
