/**
 * Profiles: named configurations stored as JSON files
 * (docs/dev/technical-design-profiles-demo-space.md). Pure logic - which
 * settings belong to a profile, which stay device-wide, which are secrets
 * that never go into a file, and reading/writing the file format.
 */
import {DEFAULT_SETTINGS, GtdParaSettings} from './settings';

export const DEFAULT_PROFILE_ID = 'production';
export const DEFAULT_PROFILE_NAME = 'Production';
export const PROFILE_FILE_FORMAT = 'gtdpara-profile';
export const PROFILE_FILE_VERSION = 1;

type SettingsKey = keyof GtdParaSettings;

/** Never switch with a profile. */
export const DEVICE_WIDE_KEYS: readonly SettingsKey[] = [
  'perfTracing',
  'keepTabsAlive',
  'debugLogging',
  'lastSeenVersion',
  'activeProfileId',
];

/** Switch with a profile, but are kept in the app's own storage, never in a profile file. */
export const SECRET_KEYS: readonly SettingsKey[] = ['gmailAppPassword', 'googleCalendarIcsUrl'];

/** Everything else: folders, focus counts, Tag Rules, review state, integrations, experimental switches. */
export const PROFILE_KEYS: readonly SettingsKey[] = (Object.keys(DEFAULT_SETTINGS) as SettingsKey[]).filter(
  k => !DEVICE_WIDE_KEYS.includes(k) && !SECRET_KEYS.includes(k),
);

export type ProfileSecrets = Partial<Pick<GtdParaSettings, 'gmailAppPassword' | 'googleCalendarIcsUrl'>>;

export interface ProfileFile {
  format: typeof PROFILE_FILE_FORMAT;
  formatVersion: number;
  name: string;
  savedAt: string;
  savedBy: string;
  settings: Partial<GtdParaSettings>;
}

/** "Demo 2" -> "demo-2". Empty result falls back to "profile". */
export function profileIdFromName(name: string): string {
  const id = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return id || 'profile';
}

export function isValidProfileId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(id);
}

/** The part of the settings that goes into a profile file. */
export function profileSettingsOf(settings: GtdParaSettings): Partial<GtdParaSettings> {
  const out: Partial<GtdParaSettings> = {};
  for (const key of PROFILE_KEYS) {
    (out as Record<string, unknown>)[key] = settings[key];
  }
  return out;
}

export function secretsOf(settings: GtdParaSettings): ProfileSecrets {
  return {gmailAppPassword: settings.gmailAppPassword, googleCalendarIcsUrl: settings.googleCalendarIcsUrl};
}

function sameKind(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) {
    return Array.isArray(value);
  }
  if (template !== null && typeof template === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  return typeof value === typeof template;
}

/**
 * Keeps only known per-profile keys whose value has the same kind as the
 * default (string/number/boolean/array/object), so a hand-edited or older
 * file can never smuggle in a device-wide setting, a secret or a wrong type.
 */
export function sanitizeProfileSettings(raw: unknown): Partial<GtdParaSettings> {
  const out: Partial<GtdParaSettings> = {};
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  const src = raw as Record<string, unknown>;
  for (const key of PROFILE_KEYS) {
    if (key in src && sameKind(src[key], DEFAULT_SETTINGS[key])) {
      (out as Record<string, unknown>)[key] = src[key];
    }
  }
  return out;
}

/**
 * The active settings after switching to profile `profileId`: defaults,
 * then the profile's own fields, then its secrets, then the current
 * device-wide fields (unchanged by a switch).
 */
export function buildActiveSettings(
  profileId: string,
  profileSettings: Partial<GtdParaSettings>,
  secrets: ProfileSecrets,
  current: GtdParaSettings,
): GtdParaSettings {
  const deviceWide: Partial<GtdParaSettings> = {};
  for (const key of DEVICE_WIDE_KEYS) {
    (deviceWide as Record<string, unknown>)[key] = current[key];
  }
  return {
    ...DEFAULT_SETTINGS,
    ...sanitizeProfileSettings(profileSettings),
    gmailAppPassword: typeof secrets.gmailAppPassword === 'string' ? secrets.gmailAppPassword : '',
    googleCalendarIcsUrl: typeof secrets.googleCalendarIcsUrl === 'string' ? secrets.googleCalendarIcsUrl : '',
    ...deviceWide,
    activeProfileId: profileId,
  };
}

export function serializeProfile(name: string, settings: GtdParaSettings, now: Date, appVersion: string): string {
  const file: ProfileFile = {
    format: PROFILE_FILE_FORMAT,
    formatVersion: PROFILE_FILE_VERSION,
    name,
    savedAt: now.toISOString(),
    savedBy: appVersion,
    settings: profileSettingsOf(settings),
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export interface ParsedProfile {
  name: string;
  savedAt: string | null;
  settings: Partial<GtdParaSettings>;
}

/** Throws with a readable message when the text is not a gtdpara profile. */
export function parseProfile(text: string, fallbackName: string): ParsedProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('not valid JSON');
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('not a profile file');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== PROFILE_FILE_FORMAT) {
    throw new Error('not a gtdpara profile ("format" is missing or different)');
  }
  if (typeof obj.formatVersion === 'number' && obj.formatVersion > PROFILE_FILE_VERSION) {
    throw new Error('made by a newer gtdpara version - please update');
  }
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : fallbackName,
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : null,
    settings: sanitizeProfileSettings(obj.settings),
  };
}
