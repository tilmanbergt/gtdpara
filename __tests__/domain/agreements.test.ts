// docs/dev/history/technical-design-meetings-0.21.md R17, R22, §2.1: the `## Agreements` line format,
// its round-trip, the lifecycle helpers and the valid-till presets.
import {
  AGREEMENTS_HEADING,
  buildAgreement,
  endedAgreement,
  isActiveAgreement,
  isOverAgreement,
  keptAgreement,
  parseAgreementLine,
  parseAgreementsSpan,
  serializeAgreementLine,
  validTillOf,
  withAgreementEdit,
  writeAgreementsIntoContent,
} from '../../src/domain/agreements';

const TODAY = '2026-10-24';

describe('parseAgreementLine', () => {
  it('reads text, tags and the four fields', () => {
    const a = parseAgreementLine('- Feedback only in our 1:1s #sparring/mieke [meeting:: 2026-10-24 Sparring Mieke sparring/mieke] [created:: 2026-10-24] [valid:: 2026-12-31]')!;
    expect(a.text).toBe('Feedback only in our 1:1s #sparring/mieke');
    expect(a.tags).toEqual(['sparring/mieke']);
    expect(a.fields).toEqual({meeting: '2026-10-24 Sparring Mieke sparring/mieke', created: '2026-10-24', valid: '2026-12-31', ended: null, extra: []});
  });

  it('keeps unknown fields and a task\'s keys verbatim', () => {
    const a = parseAgreementLine('- Both sign #mieke [created:: 2026-10-01] [who:: both] [due:: 2026-11-01]')!;
    expect(a.fields.extra).toEqual(['[due:: 2026-11-01]', '[who:: both]']);
  });

  it('is not a todo, not a heading, not empty', () => {
    expect(parseAgreementLine('- [ ] A todo')).toBeNull();
    expect(parseAgreementLine('- [x] Done todo')).toBeNull();
    expect(parseAgreementLine('# comment')).toBeNull();
    expect(parseAgreementLine('-')).toBeNull();
    expect(parseAgreementLine('- [created:: 2026-10-01]')).toBeNull();
  });

  it('a bullet that starts with a link-like bracket is still an agreement', () => {
    expect(parseAgreementLine('- [[Note]] stays shared')?.text).toBe('[[Note]] stays shared');
  });
});

describe('serializeAgreementLine', () => {
  it('writes the fields in order: meeting, created, valid, ended, then unknown', () => {
    const a = buildAgreement('No calls on Friday #mieke', {today: TODAY, valid: '2026-12-31', meeting: '2026-10-24 Sparring Mieke'});
    expect(serializeAgreementLine(endedAgreement({...a, fields: {...a.fields, extra: ['[who:: both]']}}, '2026-11-02'))).toBe(
      '- No calls on Friday #mieke [meeting:: 2026-10-24 Sparring Mieke] [created:: 2026-10-24] [valid:: 2026-12-31] [ended:: 2026-11-02] [who:: both]',
    );
  });

  it('writes a line nobody changed exactly as read', () => {
    const raw = '-   Odd  spacing #mieke   [valid::2026-12-31]  [created:: 2026-10-01]';
    expect(serializeAgreementLine(parseAgreementLine(raw)!)).toBe(raw);
  });

  it('re-serializes a changed line in the canonical order', () => {
    const a = parseAgreementLine('- Odd #mieke [valid:: 2026-12-31] [created:: 2026-10-01]')!;
    expect(serializeAgreementLine(endedAgreement(a, TODAY))).toBe('- Odd #mieke [created:: 2026-10-01] [valid:: 2026-12-31] [ended:: 2026-10-24]');
  });
});

describe('section round-trip (scenario 17)', () => {
  const file = [
    '---',
    'status: active',
    '---',
    '## Tasks',
    '- [ ] Something',
    '',
    AGREEMENTS_HEADING,
    '- First #mieke [created:: 2026-10-01] [who:: both]',
    'Comment line written by hand',
    '',
    '- Second #mieke [created:: 2026-10-02]',
    '',
    '## Meetings',
    '- 2026-10-24 10:00-11:00 Sparring Mieke #sparring/mieke',
    '',
  ].join('\n');

  it('reads agreements and keeps the other lines', () => {
    const {agreements, extraLines} = parseAgreementsSpan(file);
    expect(agreements.map(a => a.text)).toEqual(['First #mieke', 'Second #mieke']);
    expect(extraLines).toEqual(['Comment line written by hand']);
  });

  it('writes back byte-identical when nothing changed', () => {
    const {agreements, extraLines} = parseAgreementsSpan(file);
    expect(writeAgreementsIntoContent(file, agreements, extraLines)).toBe(file);
  });

  it('ending one changes only that line', () => {
    const {agreements, extraLines} = parseAgreementsSpan(file);
    const next = agreements.map((a, i) => (i === 1 ? endedAgreement(a, TODAY) : a));
    const written = writeAgreementsIntoContent(file, next, extraLines);
    expect(written).toBe(file.replace('- Second #mieke [created:: 2026-10-02]', '- Second #mieke [created:: 2026-10-02] [ended:: 2026-10-24]'));
  });

  it('a new one goes after the last agreement', () => {
    const {agreements, extraLines} = parseAgreementsSpan(file);
    const written = writeAgreementsIntoContent(file, [...agreements, buildAgreement('Third', {today: TODAY, valid: null, meeting: null})], extraLines);
    expect(written).toBe(file.replace('- Second #mieke [created:: 2026-10-02]\n', '- Second #mieke [created:: 2026-10-02]\n- Third [created:: 2026-10-24]\n'));
  });

  it('a file without the section gets it appended', () => {
    const plain = '## Tasks\n- [ ] Something\n';
    const written = writeAgreementsIntoContent(plain, [buildAgreement('One #mieke', {today: TODAY, valid: null, meeting: null})]);
    expect(written).toBe('## Tasks\n- [ ] Something\n\n## Agreements\n- One #mieke [created:: 2026-10-24]\n');
    expect(parseAgreementsSpan(written).agreements).toHaveLength(1);
  });

  it('an empty section before the next heading keeps its blank line last', () => {
    const empty = '## Agreements\n\n## Meetings\n';
    const written = writeAgreementsIntoContent(empty, [buildAgreement('One', {today: TODAY, valid: null, meeting: null})]);
    expect(written).toBe('## Agreements\n- One [created:: 2026-10-24]\n\n## Meetings\n');
  });
});

describe('lifecycle (R22)', () => {
  const a = buildAgreement('  Feedback only in our 1:1s #sparring/mieke ', {today: TODAY, valid: '2026-12-31', meeting: 'm'});

  it('builds an active agreement made today', () => {
    expect(a.text).toBe('Feedback only in our 1:1s #sparring/mieke');
    expect(a.tags).toEqual(['sparring/mieke']);
    expect(a.fields.created).toBe(TODAY);
    expect(isActiveAgreement(a)).toBe(true);
  });

  it('edit keeps created, meeting and unknown fields', () => {
    const e = withAgreementEdit({...a, fields: {...a.fields, extra: ['[who:: both]']}}, 'New words #mieke', null);
    expect(e.text).toBe('New words #mieke');
    expect(e.tags).toEqual(['mieke']);
    expect(e.fields).toEqual({meeting: 'm', created: TODAY, valid: null, ended: null, extra: ['[who:: both]']});
  });

  it('ended is not active and never over', () => {
    const ended = endedAgreement(a, TODAY);
    expect(isActiveAgreement(ended)).toBe(false);
    expect(isOverAgreement(ended, '2027-01-05')).toBe(false);
  });

  it('over = active and valid before today', () => {
    expect(isOverAgreement(a, '2026-12-31')).toBe(false);
    expect(isOverAgreement(a, '2027-01-01')).toBe(true);
    expect(isOverAgreement(keptAgreement(a, null), '2027-01-01')).toBe(false);
    expect(isOverAgreement(keptAgreement(a, 'someday'), '2027-01-01')).toBe(false);
  });
});

describe('validTillOf (R21)', () => {
  it.each([
    ['none', '2026-10-24', null],
    ['1m', '2026-10-24', '2026-11-24'],
    ['3m', '2026-10-24', '2027-01-24'],
    ['eoy', '2026-10-24', '2026-12-31'],
    ['1m', '2026-01-31', '2026-02-28'],
    ['1m', '2028-01-31', '2028-02-29'],
    ['3m', '2026-11-30', '2027-02-28'],
    ['1m', '2026-12-15', '2027-01-15'],
  ] as const)('%s from %s = %s', (preset, today, expected) => {
    expect(validTillOf(preset, today)).toBe(expected);
  });
});
