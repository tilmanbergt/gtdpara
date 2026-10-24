// docs/dev/history/technical-design-kept-gtd.md §3.1/§3.5: the values that identify the plugin to the
// host or are already written into users' storage and notes keep the name gtdpara. Renaming one
// would lose settings, marks or note links on upgrade, so this test fails when one changes.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {readFileSync} from 'fs';
import {join} from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SETTINGS} from '../src/domain/settings';
import {loadSettings} from '../src/storage/settingsStorage';
import {MARK_USERDATA_PREFIX, markDoneUserData, markUserData, parseMarkUserData} from '../src/domain/marks';
import {
  MEETING_NOTE_BLOCK_USERDATA,
  NOTE_HEADING_USERDATA,
  NOTE_LINK_USERDATA,
  notePieceUserData,
} from '../src/domain/meetingNoteBlock';
import {PROFILE_FILE_FORMAT} from '../src/domain/profiles';
import {writeTempPathFor} from '../src/domain/fileName';

const ROOT = join(__dirname, '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const json = (path: string): Record<string, unknown> => JSON.parse(read(path));

describe('plugin identity', () => {
  it('keeps pluginID, pluginKey and the app name', () => {
    expect(json('PluginConfig.json').pluginID).toBe('ndx27q77pojfqh6l');
    expect(json('PluginConfig.json').pluginKey).toBe('gtdpara');
    expect(json('app.json').name).toBe('gtdpara');
  });

  it('registers the app under app.json name, as the native side expects', () => {
    expect(read('index.js')).toContain("import {name as appName} from './app.json'");
    expect(read('android/app/src/main/java/eu/embodyagile/gtdpara/MainActivity.kt')).toContain('getMainComponentName(): String = "gtdpara"');
  });

  it('keeps the Android package', () => {
    expect(read('android/app/build.gradle')).toContain('applicationId "eu.embodyagile.gtdpara"');
  });

  it('keeps the native module names', () => {
    expect(read('src/supernote/fileSystem.ts')).toContain('GtdParaFile');
    expect(read('src/supernote/pdfNative.ts')).toContain('GtdParaPdf');
    expect(read('src/supernote/pluginRuntime.ts')).toContain('GtdParaRuntime');
  });
});

describe('storage keys', () => {
  it('reads settings stored under gtdpara:settings:v1 (K9)', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('gtdpara:settings:v1', JSON.stringify({...DEFAULT_SETTINGS, hideDoneInboxTasks: true}));
    expect((await loadSettings()).hideDoneInboxTasks).toBe(true);
  });

  it.each([
    ['src/storage/settingsStorage.ts', 'gtdpara:settings:v1'],
    ['src/storage/profiles.ts', 'gtdpara:profileSecrets:v1'],
    ['src/storage/destinationUsage.ts', 'gtdpara:captureDestinations:v1'],
    ['src/storage/tagUsage.ts', 'gtdpara:tagUsage:v1'],
    ['src/storage/googleCalendarCache.ts', 'gtdpara:googleCalendarCache:v1'],
  ])('%s keeps %s', (file, key) => {
    expect(read(file)).toContain(`'${key}'`);
  });
});

describe('markers written into notes', () => {
  it('keeps the mark marker and still reads one (K9)', () => {
    expect(MARK_USERDATA_PREFIX).toBe('gtdpara:mark:');
    expect(markUserData('a1')).toBe('gtdpara:mark:a1');
    expect(markDoneUserData('a1')).toBe('gtdpara:mark:a1:done');
    expect(parseMarkUserData('gtdpara:mark:a1')).toEqual({id: 'a1', done: false});
  });

  it('keeps the note heading, piece, meeting block and note link markers', () => {
    expect(NOTE_HEADING_USERDATA).toBe('gtdpara:note-heading:v1');
    expect(notePieceUserData(2)).toBe('gtdpara:note-piece:2:v1');
    expect(MEETING_NOTE_BLOCK_USERDATA).toBe('gtdpara:meeting-note-block:v1');
    expect(NOTE_LINK_USERDATA).toBe('gtdpara:meeting-note-link:v1');
  });
});

describe('file formats', () => {
  it('keeps the profile format id', () => {
    expect(PROFILE_FILE_FORMAT).toBe('gtdpara-profile');
  });

  it('keeps the temp suffix of the atomic write, here and in the native module', () => {
    expect(writeTempPathFor('/p/Website/project.txt')).toBe('/p/Website/.project.txt.gtdpara-tmp');
    expect(read('android/app/src/main/java/eu/embodyagile/gtdpara/GtdParaFileModule.kt')).toContain('.gtdpara-tmp');
  });
});
