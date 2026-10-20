// docs/dev/history/technical-design-quality-hardening.md §3.3: after a failed settings load
// the app runs on defaults, and no save replaces the stored settings with them.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {loadSettings, patchSettings, resetSettingsToDefaults, saveSettings} from '../../src/storage/settingsStorage';
import {getSettingsUnreadable} from '../../src/storage/settingsUnreadable';

const KEY = 'gtdpara:settings:v1';
const CORRUPT = '{"basePath": "/storage/emulated/0/Note/My PARA", "hideDoneInboxT';

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(KEY, CORRUPT);
});

it('runs on defaults, remembers why, and refuses every save', async () => {
  expect(await loadSettings()).toBe(DEFAULT_SETTINGS);
  expect(getSettingsUnreadable()).not.toBeNull();
  await expect(saveSettings({...DEFAULT_SETTINGS, hideDoneInboxTasks: true})).rejects.toThrow('Not saved');
  await expect(patchSettings({lastSeenVersion: '9.9.9'})).rejects.toThrow();
  expect(await AsyncStorage.getItem(KEY)).toBe(CORRUPT);
});

it('"Start over" stores the defaults and allows saving again', async () => {
  await loadSettings();
  await resetSettingsToDefaults();
  expect(getSettingsUnreadable()).toBeNull();
  await saveSettings({...DEFAULT_SETTINGS, hideDoneInboxTasks: true});
  expect(JSON.parse((await AsyncStorage.getItem(KEY))!).hideDoneInboxTasks).toBe(true);
});

it('a later load that succeeds allows saving again', async () => {
  await loadSettings();
  await AsyncStorage.setItem(KEY, JSON.stringify({...DEFAULT_SETTINGS, hideDoneInboxTasks: true}));
  expect((await loadSettings()).hideDoneInboxTasks).toBe(true);
  expect(getSettingsUnreadable()).toBeNull();
  await expect(saveSettings({...DEFAULT_SETTINGS})).resolves.toBeUndefined();
});
