/**
 * Profile files on the device (docs/dev/history/technical-design-profiles-demo-space.md
 * §3.1-3.2): EXPORT/gtdpara/profiles/<id>.json. The active settings stay in
 * AsyncStorage as before; the files are snapshots that a switch writes (the
 * profile being left) and reads (the profile being entered). Secrets are
 * kept per profile in AsyncStorage, never in a file.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildActiveSettings,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  isValidProfileId,
  parseProfile,
  ProfileSecrets,
  secretsOf,
  serializeProfile,
} from '../domain/profiles';
import {GtdParaSettings} from '../domain/settings';
import {BUILD_INFO} from '../generated/buildInfo';
import {ensureFolderExists, listFolderEntries, PROFILES_FOLDER_PATH, readTextFile, writeTextFile} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {loadSettings, saveSettings} from './settingsStorage';
import {errorMessage} from '../utils/errorMessage';

const SECRETS_KEY = 'gtdpara:profileSecrets:v1';

export interface ProfileInfo {
  id: string;
  name: string;
  savedAt: string | null;
  /** Set when the file exists but can't be used (shown in the list, not switchable). */
  error?: string;
}

function profilePath(id: string): string {
  return `${PROFILES_FOLDER_PATH}/${id}.json`;
}

async function readSecretsMap(): Promise<Record<string, ProfileSecrets>> {
  try {
    const raw = await AsyncStorage.getItem(SECRETS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSecrets(id: string, secrets: ProfileSecrets): Promise<void> {
  const map = await readSecretsMap();
  map[id] = secrets;
  await AsyncStorage.setItem(SECRETS_KEY, JSON.stringify(map));
}

/** All profile files, default profile first, then by name. Unreadable files are listed with `error`. */
export async function listProfiles(): Promise<ProfileInfo[]> {
  await ensureFolderExists(PROFILES_FOLDER_PATH);
  const entries = await listFolderEntries(PROFILES_FOLDER_PATH);
  const infos: ProfileInfo[] = [];
  for (const entry of entries) {
    if (entry.isFolder || !entry.name.toLowerCase().endsWith('.json')) {
      continue;
    }
    const id = entry.name.slice(0, -'.json'.length);
    if (!isValidProfileId(id)) {
      infos.push({id, name: entry.name, savedAt: null, error: 'file name must be lowercase letters, digits and "-"'});
      continue;
    }
    try {
      const text = await readTextFile(entry.path);
      const parsed = parseProfile(text ?? '', id);
      infos.push({id, name: parsed.name, savedAt: parsed.savedAt});
    } catch (e) {
      infos.push({id, name: id, savedAt: null, error: errorMessage(e)});
    }
  }
  return infos.sort((a, b) =>
    a.id === DEFAULT_PROFILE_ID ? -1 : b.id === DEFAULT_PROFILE_ID ? 1 : a.name.localeCompare(b.name),
  );
}

async function readProfileName(id: string): Promise<string | null> {
  const text = await readTextFile(profilePath(id));
  if (text == null) {
    return null;
  }
  try {
    return parseProfile(text, id).name;
  } catch {
    return null;
  }
}

/** Writes `settings` as profile `id` (file + secrets). Keeps the name already in the file unless `name` is given. */
export async function writeProfile(id: string, settings: GtdParaSettings, name?: string): Promise<void> {
  if (!isValidProfileId(id)) {
    throw new Error(`invalid profile id "${id}"`);
  }
  await ensureFolderExists(PROFILES_FOLDER_PATH);
  const finalName = name ?? (await readProfileName(id)) ?? (id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id);
  await writeTextFile(profilePath(id), serializeProfile(finalName, settings, new Date(), BUILD_INFO.version));
  await writeSecrets(id, secretsOf(settings));
  log('profiles: saved profile', id);
}

/** "Save": the active settings into the active profile's file. */
export async function saveActiveProfile(): Promise<string> {
  const settings = await loadSettings();
  await writeProfile(settings.activeProfileId, settings);
  return settings.activeProfileId;
}

/**
 * Before the first switch ever: puts the user's real setup on file as
 * production.json, so it can always be switched back to. No-op when the
 * file exists or another profile is active.
 */
export async function ensureDefaultProfileFile(): Promise<void> {
  const settings = await loadSettings();
  if (settings.activeProfileId !== DEFAULT_PROFILE_ID) {
    return;
  }
  const existing = await readTextFile(profilePath(DEFAULT_PROFILE_ID));
  if (existing == null) {
    await writeProfile(DEFAULT_PROFILE_ID, settings, DEFAULT_PROFILE_NAME);
  }
}

/**
 * Switches to profile `targetId` (§3.2): saves the active profile to its
 * file, then builds and stores the target's settings. Resolves to the new
 * active settings; the caller resets in-memory state and remounts (§3.4).
 * Throws (nothing changed) when the target can't be read.
 */
export async function switchProfile(targetId: string): Promise<GtdParaSettings> {
  const text = await readTextFile(profilePath(targetId));
  if (text == null) {
    throw new Error(`profile file ${targetId}.json not found`);
  }
  const target = parseProfile(text, targetId);
  const current = await loadSettings();
  if (current.activeProfileId === targetId) {
    return current;
  }
  await writeProfile(current.activeProfileId, current);
  const secrets = (await readSecretsMap())[targetId] ?? {};
  const next = buildActiveSettings(targetId, target.settings, secrets, current);
  await saveSettings(next);
  log('profiles: switched', current.activeProfileId, '->', targetId);
  // Re-read so the normal load migrations run on the new settings.
  return loadSettings();
}
