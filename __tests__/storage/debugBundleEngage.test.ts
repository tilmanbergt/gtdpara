// docs/dev/history/technical-design-engage.md §3.10: the debug bundle says whether a current todo is set, never which.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}, PluginManager: {}, NativePluginManager: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {summarizeSettings} from '../../src/storage/debugBundle';

describe('debug bundle: Engage', () => {
  it('yes/no only', () => {
    expect(summarizeSettings(DEFAULT_SETTINGS)[0]).toContain('engage current todo no');
    const set = {
      ...DEFAULT_SETTINGS,
      engageCurrent: {itemPath: '/Note/2 Areas/Secret', taskText: 'Call the lawyer', taskIndex: 3, owner: {kind: 'item' as const, itemPath: '/Note/2 Areas/Secret'}},
    };
    const text = summarizeSettings(set).join('\n');
    expect(text).toContain('engage current todo yes');
    expect(text).not.toContain('lawyer');
    expect(text).not.toContain('Secret');
  });
});
