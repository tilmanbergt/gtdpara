import {redactText} from '../../src/domain/redact';

describe('redactText', () => {
  const secrets = {
    gmailEmail: 'tilman.example@gmail.com',
    gmailAppPassword: 'abcd efgh ijkl mnop',
    googleCalendarIcsUrl: 'https://calendar.google.com/calendar/ical/me%40x.com/private-0123456789abcdef/basic.ics',
  };
  it('removes configured secrets in every form', () => {
    const text = [
      'login tilman.example@gmail.com pw abcd efgh ijkl mnop',
      'compact abcdefghijklmnop',
      'url https://calendar.google.com/calendar/ical/me%40x.com/private-0123456789abcdef/basic.ics end',
    ].join('\n');
    const out = redactText(text, secrets);
    expect(out).not.toContain('tilman.example');
    expect(out).not.toContain('abcd efgh');
    expect(out).not.toContain('abcdefghijklmnop');
    expect(out).not.toContain('private-0123');
    expect(out).toContain('[gmail-password]');
    expect(out).toContain('[ics-url]');
    expect(out).toContain('[email]');
  });
  it('removes any email address and any ics url without configured secrets', () => {
    const out = redactText('from someone@example.org see webcal://cal.example.com/feed.ics?x=1 ok');
    expect(out).toBe('from [email] see [ics-url] ok');
  });
  it('keeps paths and ordinary text', () => {
    const t = '/storage/emulated/0/Note/1 Projects/Garden/project.txt saved';
    expect(redactText(t, secrets)).toBe(t);
  });
  it('ignores too-short secrets', () => {
    expect(redactText('a b c', {gmailAppPassword: 'a'})).toBe('a b c');
  });
});
