// docs/dev/history/technical-design-quality-hardening.md §3.3: with unreadable settings no
// profile file is written from the defaults, and switching to a saved profile restores them.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
const mockFiles = new Map<string, string>();
jest.mock('../../src/supernote/fileSystem', () => ({
  PROFILES_FOLDER_PATH: '/EXPORT/gtdpara/profiles',
  ensureFolderExists: async () => undefined,
  listFolderEntries: async () => [],
  readTextFile: async (path: string) => mockFiles.get(path) ?? null,
  writeTextFile: async (path: string, content: string) => {
    mockFiles.set(path, content);
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_PROFILE_ID, serializeProfile} from '../../src/domain/profiles';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {ensureDefaultProfileFile, saveActiveProfile, switchProfile} from '../../src/storage/profiles';
import {loadSettings} from '../../src/storage/settingsStorage';
import {getSettingsUnreadable} from '../../src/storage/settingsUnreadable';

const PROFILE = `/EXPORT/gtdpara/profiles/${DEFAULT_PROFILE_ID}.json`;
const SAVED = serializeProfile('Production', {...DEFAULT_SETTINGS, hideDoneInboxTasks: true}, new Date(0), 'test');

beforeEach(async () => {
  mockFiles.clear();
  mockFiles.set(PROFILE, SAVED);
  await AsyncStorage.clear();
  await AsyncStorage.setItem('gtdpara:settings:v1', '{"broken');
  await loadSettings();
  expect(getSettingsUnreadable()).not.toBeNull();
});

it('saves no profile from the defaults', async () => {
  await expect(saveActiveProfile()).rejects.toThrow('Not saved');
  await ensureDefaultProfileFile();
  expect(mockFiles.get(PROFILE)).toBe(SAVED);
});

it('switching to the saved active profile brings its settings back', async () => {
  const next = await switchProfile(DEFAULT_PROFILE_ID);
  expect(next.hideDoneInboxTasks).toBe(true);
  expect(getSettingsUnreadable()).toBeNull();
  expect(mockFiles.get(PROFILE)).toBe(SAVED);
});
