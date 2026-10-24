/**
 * The one write path for agreements (docs/dev/history/technical-design-meetings-0.21.md
 * §2.3, R22): every add, edit, change, end and keep writes the `## Agreements`
 * section of one Area's or Project's file through storage/projectFile.ts's
 * `saveAgreements` (and so `writeDataFile`), then the cache (write-through).
 *
 * Each call on an existing agreement first finds its line again: the one at
 * the ref's index while its text and state still match, else the first with
 * the same text and state; else it throws "That agreement changed in the
 * file - look again". Nothing is ever deleted: Change ends the old line and
 * adds the new one in one write, End sets `[ended:: today]`.
 *
 * The Inbox never holds agreements (R18): a target there throws, and the UI
 * never offers one. Logging names the action and the file kind only, never
 * an agreement's text.
 */
import {AgreementRef} from '../domain/agreementOwner';
import {Agreement, buildAgreement, endedAgreement, keptAgreement, withAgreementEdit} from '../domain/agreements';
import {AGREEMENT_VANISHED_TEXT} from '../domain/fileChangeText';
import {todayIso} from '../domain/meetingTime';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {CachedItem, findCachedItem, getCachedData, updateItemAgreements} from './dataCache';
import {saveAgreements} from './projectFile';

type AgreementAction = 'added' | 'edited' | 'changed' | 'ended' | 'kept';

function itemFor(path: string): CachedItem {
  if (path === getCachedData()?.paths.inboxFolder) throw new Error('Agreements live in a Project or Area, not in the Inbox.');
  const item = findCachedItem(path);
  if (!item) throw new Error('That Project or Area is not loaded - Settings → Advanced → Reload all files.');
  if (item.loadError) throw new Error(item.loadError);
  return item;
}

const sameState = (a: Agreement, b: Agreement) => !a.fields.ended === !b.fields.ended;

/** The index of `ref`'s line in the item as it is now. */
function locate(item: CachedItem, ref: AgreementRef): number {
  const at = item.agreements[ref.index];
  if (at && at.text === ref.agreement.text && sameState(at, ref.agreement)) return ref.index;
  const index = item.agreements.findIndex(a => a.text === ref.agreement.text && sameState(a, ref.agreement));
  if (index < 0) {
    log('agreements: line not found');
    throw new Error(AGREEMENT_VANISHED_TEXT);
  }
  return index;
}

async function write(item: CachedItem, agreements: Agreement[], action: AgreementAction): Promise<void> {
  try {
    const next = await saveAgreements(item.kind, item.path, item.rawContent, agreements, item.agreementsExtraLines);
    updateItemAgreements(item.path, next, agreements, item.agreementsExtraLines);
  } catch (e) {
    logError('agreements: write failed', action, item.kind, errorMessage(e));
    throw e;
  }
  log(`agreements: ${action}`, item.kind);
}

/** Replaces the line of `ref` with `change(line)` and appends `added`. */
async function update(ref: AgreementRef, action: AgreementAction, change: (a: Agreement) => Agreement, added: Agreement[] = []): Promise<void> {
  const item = itemFor(ref.itemPath);
  const index = locate(item, ref);
  const agreements = item.agreements.map((a, i) => (i === index ? change(a) : a));
  await write(item, [...agreements, ...added], action);
}

/** Adds `agreement` to the file at `targetPath` (from domain/agreementOwner.ts's `agreementTargetPath`). */
export async function addAgreement(targetPath: string, agreement: Agreement): Promise<void> {
  const item = itemFor(targetPath);
  await write(item, [...item.agreements, agreement], 'added');
}

/** New wording and valid-till for the same agreement (R22 Edit). */
export async function editAgreement(ref: AgreementRef, text: string, valid: string | null): Promise<void> {
  await update(ref, 'edited', a => withAgreementEdit(a, text, valid));
}

/** Ends `ref` today and adds the new agreement after it in the same file, in one write (R22 Change). */
export async function changeAgreement(ref: AgreementRef, text: string, valid: string | null, meeting: string | null): Promise<void> {
  const today = todayIso();
  await update(ref, 'changed', a => endedAgreement(a, today), [buildAgreement(text, {today, valid, meeting})]);
}

/** Sets `[ended:: today]` (R22 End). */
export async function endAgreement(ref: AgreementRef): Promise<void> {
  const today = todayIso();
  await update(ref, 'ended', a => endedAgreement(a, today));
}

/** A new valid-till, or none (R22 Keep, in the Review). */
export async function keepAgreement(ref: AgreementRef, valid: string | null): Promise<void> {
  await update(ref, 'kept', a => keptAgreement(a, valid));
}
