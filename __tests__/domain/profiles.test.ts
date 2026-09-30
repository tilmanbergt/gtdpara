import {
  buildActiveSettings,
  DEVICE_WIDE_KEYS,
  isValidProfileId,
  parseProfile,
  PROFILE_KEYS,
  profileIdFromName,
  profileSettingsOf,
  SECRET_KEYS,
  serializeProfile,
} from '../../src/domain/profiles';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';

const real: GtdParaSettings = {
  ...DEFAULT_SETTINGS,
  projectsFolder: 'P',
  googleCalendarIcsUrl: 'https://calendar.google.com/calendar/ical/x/private-abc/basic.ics',
  gmailEmail: 'me@example.com',
  gmailAppPassword: 'abcd efgh ijkl mnop',
  experimentalGmail: true,
  perfTracing: true,
  debugLogging: true,
  lastSeenVersion: '0.1.0',
  activeProfileId: 'production',
};

describe('key classification', () => {
  it('covers every setting exactly once', () => {
    const all = Object.keys(DEFAULT_SETTINGS).sort();
    const classified = [...PROFILE_KEYS, ...DEVICE_WIDE_KEYS, ...SECRET_KEYS].sort();
    expect(classified).toEqual(all);
  });
});

describe('profile files', () => {
  it('never contain secrets or device-wide fields', () => {
    const text = serializeProfile('Production', real, new Date('2026-10-01T00:00:00Z'), '0.1.0');
    expect(text).not.toContain('private-abc');
    expect(text).not.toContain('abcd efgh');
    expect(text).not.toContain('perfTracing');
    expect(text).not.toContain('activeProfileId');
    expect(text).toContain('"gmailEmail": "me@example.com"');
    const parsed = parseProfile(text, 'x');
    expect(parsed.name).toBe('Production');
    expect(parsed.settings).toEqual(profileSettingsOf(real));
  });
  it('rejects non-profiles and newer formats', () => {
    expect(() => parseProfile('nope', 'x')).toThrow('JSON');
    expect(() => parseProfile('{"a":1}', 'x')).toThrow('not a gtdpara profile');
    expect(() => parseProfile('{"format":"gtdpara-profile","formatVersion":99}', 'x')).toThrow('newer');
  });
  it('ignores unknown keys, wrong types and smuggled device-wide/secret keys', () => {
    const text = JSON.stringify({
      format: 'gtdpara-profile',
      settings: {projectsFolder: 7, areasFolder: 'A', perfTracing: true, gmailAppPassword: 'x', bogus: 1, reviewSteps: []},
    });
    expect(parseProfile(text, 'fallback')).toEqual({name: 'fallback', savedAt: null, settings: {areasFolder: 'A'}});
  });
});

describe('buildActiveSettings', () => {
  it('takes profile fields and secrets, keeps device-wide fields', () => {
    const demo = {...profileSettingsOf(DEFAULT_SETTINGS), baseRoot: '/storage/emulated/0/Note/gtdpara-demo'};
    const next = buildActiveSettings('demo', demo, {}, real);
    expect(next.baseRoot).toBe('/storage/emulated/0/Note/gtdpara-demo');
    expect(next.projectsFolder).toBe(DEFAULT_SETTINGS.projectsFolder);
    expect(next.gmailAppPassword).toBe('');
    expect(next.googleCalendarIcsUrl).toBe('');
    expect(next.experimentalGmail).toBe(false);
    expect(next.perfTracing).toBe(true);
    expect(next.debugLogging).toBe(true);
    expect(next.lastSeenVersion).toBe('0.1.0');
    expect(next.activeProfileId).toBe('demo');
  });
  it('round-trips a profile with its secrets', () => {
    const back = buildActiveSettings('production', profileSettingsOf(real), {
      gmailAppPassword: real.gmailAppPassword,
      googleCalendarIcsUrl: real.googleCalendarIcsUrl,
    }, {...real, activeProfileId: 'demo'});
    expect(back).toEqual(real);
  });
});

describe('ids', () => {
  it('slugifies names', () => {
    expect(profileIdFromName('Demo 2')).toBe('demo-2');
    expect(profileIdFromName('Übung / Test')).toBe('ubung-test');
    expect(profileIdFromName('!!!')).toBe('profile');
  });
  it('validates ids', () => {
    expect(isValidProfileId('production')).toBe(true);
    expect(isValidProfileId('Demo')).toBe(false);
    expect(isValidProfileId('-x')).toBe(false);
  });
});
