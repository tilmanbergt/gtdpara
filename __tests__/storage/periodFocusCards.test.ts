// Week/Month focus cards count Next and Plan (docs/dev/history/technical-design-engage.md, Addendum "Plan across the app").
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}, PluginManager: {}, NativePluginManager: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {periodOf} from '../../src/domain/period';
import {buildPeriodFocusCards} from '../../src/storage/periodFocusCards';
import {item, task} from '../../test-helpers/fixtures';

describe('buildPeriodFocusCards', () => {
  it('counts open #next and plan todos (no flow state); Someday, Maybe, Waiting For and done ones not', () => {
    const today = new Date(2026, 9, 16);
    const garden = item('project', 'Garden', {
      weeklyFocus: true,
      tasks: [task('Measure #next'), task('Order wood'), task('Cut boards'), task('One day #someday'), task('Ask #wf/anna'), task('Old', {done: true})],
    });
    const [card] = buildPeriodFocusCards([garden], periodOf('weekly', today), today);
    expect(card).toMatchObject({nextCount: 1, planCount: 2});
  });
});
