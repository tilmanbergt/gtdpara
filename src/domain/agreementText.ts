/**
 * Texts of agreements (docs/dev/history/technical-design-meetings-0.21.md
 * R12, R21, R23, R24): the row's detail, the card's lines, the valid-till
 * field and strip, the overview's counts. Pure; dates through
 * domain/dateFormat.ts.
 */
import {Agreement, isOverAgreement, ValidPreset} from './agreements';
import {formatDate} from './dateFormat';
import {stripAllTags} from './markdown';

/** The agreement's words without its tags ("Feedback only in our 1:1s"); the text itself when it is all tags. */
export function agreementPlainText(a: Pick<Agreement, 'text'>): string {
  return stripAllTags(a.text).replace(/\s+/g, ' ').trim() || a.text;
}

/** "till 31.12." / "till 30.9. – over" / null without a valid-till. */
export function validTillText(a: Agreement, today: string): string | null {
  if (!a.fields.valid) return null;
  return `till ${formatDate(a.fields.valid, today)}${isOverAgreement(a, today) ? ' – over' : ''}`;
}

/** The row's detail line: "since 14.10. · till 31.12." (parts that are known). */
export function agreementRowDetail(a: Agreement, today: string): string {
  const parts: string[] = [];
  if (a.fields.created) parts.push(`since ${formatDate(a.fields.created, today)}`);
  const till = validTillText(a, today);
  if (till) parts.push(till);
  if (a.fields.ended) parts.push(`ended ${formatDate(a.fields.ended, today)}`);
  return parts.join(' · ');
}

/** The card's heading: "Agreement · since 14.10.", "Agreement · ended 2.11.". */
export function agreementCardHeading(a: Agreement, today: string): string {
  if (a.fields.ended) return `Agreement · ended ${formatDate(a.fields.ended, today)}`;
  return a.fields.created ? `Agreement · since ${formatDate(a.fields.created, today)}` : 'Agreement';
}

/** The card's valid-till line: "valid till 31.12.", "valid till 30.9. – over", "no end date". */
export function agreementValidLine(a: Agreement, today: string): string {
  const till = validTillText(a, today);
  return till ? `valid ${till}` : 'no end date';
}

/** The Quick Add valid-till field: "till 31.12." or its placeholder. */
export function validTillFieldText(valid: string | null, today: string): string {
  return valid ? `till ${formatDate(valid, today)}` : 'valid till';
}

/** The valid-till strip's buttons, in order (R21). */
export const VALID_PRESETS: ReadonlyArray<{preset: ValidPreset; label: string}> = [
  {preset: 'none', label: 'none'},
  {preset: '1m', label: '+1 m'},
  {preset: '3m', label: '+3 m'},
  {preset: 'eoy', label: 'end of year'},
];

/** Quick Add's grey line while changing an agreement: "↳ replaces 'Fridays are quiet'". */
export function replacesLabel(a: Pick<Agreement, 'text'>): string {
  const words = agreementPlainText(a);
  return `↳ replaces '${words.length > 32 ? `${words.slice(0, 32)}…` : words}'`;
}

/** Looking back's row: "1 agreement ended ›" (R24). */
export function agreementsEndedText(count: number): string {
  return `${count} ${count === 1 ? 'agreement' : 'agreements'} ended ›`;
}

/** The Project/Area page's line under its todos: "◇ Agreements 2 ›". */
export function agreementsLinkText(count: number): string {
  return `◇ Agreements ${count} ›`;
}

/** End's question (R22: asks once). */
export function endAgreementConfirm(a: Pick<Agreement, 'text'>): {text: string; detail: string; actionLabel: string} {
  return {
    text: `End "${agreementPlainText(a)}"?`,
    detail: 'It stays in the file, marked as ended today.',
    actionLabel: 'End',
  };
}
