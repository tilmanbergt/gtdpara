// docs/dev/history/technical-design-note-setups.md §8: the debug bundle counts setups, never names or tags.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}, PluginManager: {}, NativePluginManager: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {createNoteSetup, seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';
import {noteSetupsLine, summarizeSettings} from '../../src/storage/debugBundle';

const settings: GtdParaSettings = {
  ...DEFAULT_SETTINGS,
  noteSetups: [
    {...createNoteSetup('1', 'thread'), name: 'Sparring Peter', tags: ['sparring'], notebook: {name: 'x', folder: ''}},
    {...createNoteSetup('2', 'thread'), name: 'Clients', tags: ['client'], enabled: false},
    {...createNoteSetup('3', 'loop'), name: 'Workshop', tags: ['workshop']},
  ],
  noteSetupDefaults: seedNoteSetupDefaults(),
  noteSetupsMigrated: true,
};

describe('noteSetupsLine', () => {
  it('counts kinds, switched-off setups, notebooks, Default pages and the migration', () => {
    expect(noteSetupsLine(settings, false)).toBe('note setups: thread 1 · loop 1 · off 1 · notebook 1 · default pages 2 · migrated no');
    expect(noteSetupsLine({...settings, tagRules: [{} as never]}, false)).toContain('migrated yes');
    expect(noteSetupsLine(settings, true)).toContain('migrated failed');
  });

  it('is part of the settings summary and carries no names or tags', () => {
    const text = summarizeSettings(settings).join('\n');
    expect(text).toContain('note setups: thread 1');
    expect(text).not.toMatch(/Sparring|Peter|sparring|workshop|client/);
  });
});
