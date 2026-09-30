import {featuresOf, migrateExperimentalFlags, shouldShowWhatsNew} from '../../src/domain/features';

const base = {
  experimentalGoogleCalendar: false,
  experimentalGmail: false,
  googleCalendarIcsUrl: '',
  gmailEmail: '',
  lastSeenVersion: '',
};

describe('featuresOf', () => {
  it('is all off without settings', () => {
    expect(featuresOf(null)).toEqual({googleCalendar: false, gmail: false});
  });
  it('reads the flags', () => {
    expect(featuresOf({...base, experimentalGmail: true})).toEqual({googleCalendar: false, gmail: true});
  });
});

describe('migrateExperimentalFlags', () => {
  it('fresh install: flags stay off, lastSeenVersion set', () => {
    const out = migrateExperimentalFlags(base, {}, '0.1.0');
    expect(out).toEqual({...base, lastSeenVersion: '0.1.0'});
  });
  it('fresh install with null raw', () => {
    expect(migrateExperimentalFlags(base, null, '0.1.0').lastSeenVersion).toBe('0.1.0');
  });
  it('existing install: configured integrations switched on, notice pending', () => {
    const merged = {...base, googleCalendarIcsUrl: 'https://x/ical/y.ics', gmailEmail: ''};
    const out = migrateExperimentalFlags(merged, {googleCalendarIcsUrl: 'https://x/ical/y.ics'}, '0.1.0');
    expect(out.experimentalGoogleCalendar).toBe(true);
    expect(out.experimentalGmail).toBe(false);
    expect(out.lastSeenVersion).toBe('');
  });
  it('existing install with gmail only', () => {
    const merged = {...base, gmailEmail: 'a@b.c'};
    const out = migrateExperimentalFlags(merged, {gmailEmail: 'a@b.c'}, '0.1.0');
    expect(out.experimentalGmail).toBe(true);
    expect(out.experimentalGoogleCalendar).toBe(false);
  });
  it('keys already stored: no-op, same reference', () => {
    const merged = {...base, googleCalendarIcsUrl: 'https://x/ical/y.ics'};
    const raw = {experimentalGoogleCalendar: false, experimentalGmail: false, googleCalendarIcsUrl: 'x'};
    expect(migrateExperimentalFlags(merged, raw, '0.1.0')).toBe(merged);
  });
});

describe('shouldShowWhatsNew', () => {
  it('only for release builds with a new version', () => {
    expect(shouldShowWhatsNew('', {version: '0.1.0', release: true})).toBe(true);
    expect(shouldShowWhatsNew('0.1.0', {version: '0.1.0', release: true})).toBe(false);
    expect(shouldShowWhatsNew('0.1.0', {version: '0.2.0', release: true})).toBe(true);
    expect(shouldShowWhatsNew('', {version: '0.1.0', release: false})).toBe(false);
  });
});
