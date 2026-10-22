// The Quick Add box keeps one height in every state (docs/dev/history/technical-design-item-card.md
// §4, K2): the frame is QUICK_ADD_HEIGHT and the four visible rows have their fixed heights, so the
// lists below the box never move.
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
const mockRecent = Array.from({length: 30}, (_, i) => `tag${i}`);
jest.mock('../../src/storage/tagUsage', () => ({
  getRecentTags: () => new Promise(() => undefined),
  getRecentTagsSync: () => mockRecent,
  recordTagsUsed: async () => undefined,
}));
jest.mock('../../src/ui/useAbbrevItems', () => ({
  useAbbrevItems: () => [{kind: 'project', name: 'Garden renovation', path: '/p/garden', abbrev: 'GR', status: 'active'}],
}));

import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View, ViewStyle} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import QuickAddWidget, {editTargetFor, QuickAddEditTarget} from '../../src/ui/QuickAddWidget';
import {QUICK_ADD_HEIGHT, QUICK_ADD_ROWS} from '../../src/ui/quickAdd/QuickAddFrame';
import {QuickAddAdds} from '../../src/ui/quickAdd/ProvenanceLine';
import FlowStateChips from '../../src/ui/FlowStateChips';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {Meeting, Task} from '../../src/domain/types';

const task = {text: 'Call Tom #tag1', done: false, cancelled: false, tags: [], dueDate: null, flowState: null, waitingOn: null, now: false, notePath: '', linkedFile: 'Docs/plan.pdf'} as unknown as Task;
const meeting: Meeting = {title: 'Sync', date: '2026-10-22', time: '10:00', endTime: '', days: 1, tags: [], cancelled: false, notePath: '', linkedFile: 'Docs/a.pdf'};

interface Setup {
  editTarget?: QuickAddEditTarget | null;
  provenance?: QuickAddAdds;
}

function render({editTarget = null, provenance}: Setup = {}) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <StatusProvider>
        <QuickAddWidget
          fixedDestination={{type: 'inbox'}}
          onAddTask={async () => undefined}
          onAddMeeting={async () => undefined}
          onAddNote={async () => undefined}
          noteFolderPath="/p/garden"
          editTarget={editTarget}
          onSaveEditTask={async () => undefined}
          onSaveEditMeeting={async () => undefined}
          onCancelEdit={() => undefined}
          onDeleteEdit={() => undefined}
          onRefile={() => undefined}
          onQuickFile={async () => undefined}
          provenance={provenance}
          textColor="#000"
          borderColor="#000"
          placeholderColor="#888"
        />
      </StatusProvider>,
    );
  });
  return r;
}

const frame = (r: TestRenderer.ReactTestRenderer) => r.root.findAll(n => n.type === View && n.props.testID === 'quick-add-frame')[0];
const visible = (style: ViewStyle) => StyleSheet.flatten(style)?.display !== 'none';

/** The heights of the frame and of its visible rows, top to bottom. */
function heights(r: TestRenderer.ReactTestRenderer): {frame: unknown; rows: unknown[]} {
  const box = frame(r);
  // The row Views directly under the frame, through the row components that render them.
  const rowViews = (node: TestRenderer.ReactTestInstance): TestRenderer.ReactTestInstance[] =>
    node.children.flatMap(c => (typeof c === 'string' ? [] : c.type === View ? [c] : rowViews(c)));
  const rows = rowViews(box)
    .filter(v => visible(v.props.style))
    .map(v => StyleSheet.flatten(v.props.style).height);
  return {frame: StyleSheet.flatten(box.props.style).height, rows};
}

const FIXED = [QUICK_ADD_ROWS.tabs, QUICK_ADD_ROWS.input, QUICK_ADD_ROWS.meta, QUICK_ADD_ROWS.extra];
const pressText = (r: TestRenderer.ReactTestRenderer, label: string) =>
  act(() => {
    r.root.findAll(n => n.type === Pressable && n.findAllByType(Text).some(t => t.props.children === label))[0].props.onPress();
  });

describe('Quick Add box height', () => {
  it('is 174 dp: border, padding, four rows and three gaps', () => {
    expect(QUICK_ADD_HEIGHT).toBe(174);
  });

  // Measured on the A5 X: a chip label (FONT.small, weight 600) draws about 21 dp high. A chip in
  // R3/R4 is that plus its padding and border; it must fit its row, or the row clips it.
  const DEVICE_CHIP_LABEL_DP = 22;
  it('a chip as tall as on the device fits R3 and R4', () => {
    const r = render();
    const chipStyles = r.root
      .findAll(n => n.type === Pressable && n.findAllByType(Text).some(t => /^(Next|#tag0)$/.test(String(t.props.children))))
      .map(p => StyleSheet.flatten(p.props.style));
    expect(chipStyles.length).toBeGreaterThanOrEqual(2);
    for (const style of chipStyles) {
      const height = 2 * Number(style.borderWidth ?? 0) + 2 * Number(style.paddingVertical ?? 0) + DEVICE_CHIP_LABEL_DP;
      expect(height).toBeLessThanOrEqual(Math.min(QUICK_ADD_ROWS.meta, QUICK_ADD_ROWS.extra));
    }
  });

  const cases: Array<[string, () => TestRenderer.ReactTestRenderer]> = [
    ['create Todo', () => render()],
    ['create Meeting', () => {
      const r = render();
      pressText(r, 'Meeting');
      return r;
    }],
    ['create Note', () => {
      const r = render();
      pressText(r, 'Note');
      return r;
    }],
    ['create Todo, w/f', () => {
      const r = render();
      act(() => r.root.findByType(FlowStateChips).props.onChange('waiting-for'));
      return r;
    }],
    ['create Todo, tags on page 2', () => {
      const r = render();
      pressText(r, '›');
      return r;
    }],
    ['create Todo with provenance', () =>
      render({provenance: [{key: 'meeting', label: '↳ from Retro alpha · Wed 30.9.', onClear: () => undefined}]})],
    ['edit todo with a linked file', () => render({editTarget: editTargetFor('task:1', {task})})],
    ['edit todo with "Save to"', () => {
      const r = render({editTarget: editTargetFor('task:1', {task})});
      act(() => r.root.findAllByType(TextInput).find(i => i.props.placeholder === 'New task')!.props.onChangeText('Call Tom #gr'));
      return r;
    }],
    ['edit meeting', () => render({editTarget: editTargetFor('meeting:1', {meeting})})],
  ];

  it.each(cases)('%s: the frame and its four rows keep their heights', (_name, make) => {
    const r = make();
    expect(heights(r)).toEqual({frame: QUICK_ADD_HEIGHT, rows: FIXED});
  });
});

describe('Quick Add rows', () => {
  const allTexts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

  it('R1 holds + Add while creating and Cancel · Save while editing; Save to <Name> with an abbreviation tag', () => {
    const create = render();
    expect(allTexts(create)).toContain('+ Add');
    const edit = render({editTarget: editTargetFor('task:1', {task})});
    expect(allTexts(edit)).toEqual(expect.arrayContaining(['Cancel', 'Save', 'Refile']));
    act(() => edit.root.findAllByType(TextInput).find(i => i.props.placeholder === 'New task')!.props.onChangeText('Call Tom #gr'));
    expect(allTexts(edit)).toContain('Save to Garden renovat…');
    // Save to replaces Refile: the tag already names where the todo goes.
    expect(allTexts(edit)).not.toContain('Refile');
  });

  it('the provenance line takes R4 while creating a todo', () => {
    const r = render({provenance: [{key: 'meeting', label: '↳ from Retro alpha', onClear: () => undefined}]});
    expect(allTexts(r)).toContain('↳ from Retro alpha');
  });

  it('the edit form keeps delete, New from this, unlink and M in R4', () => {
    const r = render({editTarget: editTargetFor('meeting:1', {meeting})});
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Delete' && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
    expect(allTexts(r)).toEqual(expect.arrayContaining(['New from this', 'M', '✕']));
  });
});
