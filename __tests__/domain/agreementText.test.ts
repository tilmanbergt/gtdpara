// docs/dev/history/technical-design-meetings-0.21.md R12, R21, R23, R24: the texts of agreements.
import {
  agreementCardHeading,
  agreementPlainText,
  agreementRowDetail,
  agreementsEndedText,
  agreementsLinkText,
  agreementValidLine,
  replacesLabel,
  validTillFieldText,
} from '../../src/domain/agreementText';
import {buildAgreement, endedAgreement} from '../../src/domain/agreements';

const TODAY = '2026-10-24';
const a = buildAgreement('Feedback only in our 1:1s #sparring/mieke', {today: '2026-10-14', valid: '2026-12-31', meeting: null});

it('plain text drops the tags', () => {
  expect(agreementPlainText(a)).toBe('Feedback only in our 1:1s');
  expect(agreementPlainText({text: '#mieke'})).toBe('#mieke');
});

it('row detail: since, till, over, ended', () => {
  expect(agreementRowDetail(a, TODAY)).toBe('since 14.10. · till 31.12.');
  expect(agreementRowDetail(a, '2027-01-02')).toBe('since 14.10.2026 · till 31.12.2026 – over');
  expect(agreementRowDetail(endedAgreement(a, TODAY), TODAY)).toBe('since 14.10. · till 31.12. · ended 24.10.');
});

it('card heading and valid line', () => {
  expect(agreementCardHeading(a, TODAY)).toBe('Agreement · since 14.10.');
  expect(agreementCardHeading(endedAgreement(a, TODAY), TODAY)).toBe('Agreement · ended 24.10.');
  expect(agreementValidLine(a, TODAY)).toBe('valid till 31.12.');
  expect(agreementValidLine({...a, fields: {...a.fields, valid: null}}, TODAY)).toBe('no end date');
});

it('field, replaces line and counts', () => {
  expect(validTillFieldText(null, TODAY)).toBe('valid till');
  expect(validTillFieldText('2026-12-31', TODAY)).toBe('till 31.12.');
  expect(replacesLabel(a)).toBe("↳ replaces 'Feedback only in our 1:1s'");
  expect(replacesLabel({text: 'x'.repeat(40)})).toBe(`↳ replaces '${'x'.repeat(32)}…'`);
  expect(agreementsEndedText(1)).toBe('1 agreement ended ›');
  expect(agreementsEndedText(3)).toBe('3 agreements ended ›');
  expect(agreementsLinkText(2)).toBe('◇ Agreements 2 ›');
});
