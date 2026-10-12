// docs/dev/history/technical-design-loops.md §4.7: the Projects / Loops tab lists an item's loops and
// follows the cache, which updates the item in place when a loop starts.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('sn-plugin-lib', () => ({NativePluginManager: {}, PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}}));
jest.mock('../../src/storage/dataCache', () => ({getCachedData: () => null}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/storage/linkedFiles', () => ({openLinkedFile: jest.fn()}));
jest.mock('../../src/ui/useLoopNote', () => ({useLoopNote: () => () => undefined}));
jest.mock('../../src/storage/loops', () => ({trackLoop: jest.fn(async () => undefined)}));
jest.mock('../../src/ui/status/StatusProvider', () => ({useErrorStatus: () => undefined}));
const mockKinds = {kinds: ['workshop'], rules: {}};
jest.mock('../../src/ui/useLoopKinds', () => ({useLoopKinds: () => mockKinds}));
let mockItems: unknown[] = [];
jest.mock('../../src/ui/useCachedItems', () => ({useCachedItems: () => mockItems}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {newLoopLine} from '../../src/domain/loopsSection';
import ProjectsTab from '../../src/screens/area/ProjectsTab';
import {item, task} from '../../test-helpers/fixtures';

const rowsOf = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => n.props.header === 'Loops' && Array.isArray(n.props.rows))[0].props.rows.map((row: {key: string}) => row.key);

describe('the Loops tab', () => {
  it('shows a loop started on an item the cache updated in place', () => {
    const owner = item('project', 'Garden', {tasks: [task('Book room #workshop/offsite #next')]});
    mockItems = [owner];
    const tab = () => (
      <ProjectsTab ownerKind="project" ownerPath={owner.path} areaName="" viewportHeight={600} textColor="#000" borderColor="#000" />
    );
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(tab());
    });
    expect(rowsOf(r)).toEqual(['head-new', 'new-workshop/offsite']);
    // The conversion: same object, new contents, a new items array.
    Object.assign(owner, {loops: [newLoopLine('workshop/offsite', '2026-11-14')]});
    mockItems = [owner];
    act(() => r.update(tab()));
    expect(rowsOf(r)).toEqual(['loop-workshop/offsite']);
    act(() => r.unmount());
  });
});
