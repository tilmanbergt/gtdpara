/**
 * Which agreements belong to an owner, and where a new one is written
 * (docs/dev/history/technical-design-meetings-0.21.md R18, R19, §2.2). Pure.
 *
 * Membership uses the same seams as todos (domain/engageOwner.ts,
 * domain/threadLens.ts, domain/loops.ts):
 * - a thread: the agreements of every file in its scope whose tags are in
 *   the thread lens (the thread tag or deeper, or the plain counterpart
 *   tag); the counterpart lens takes any type used with that counterpart;
 * - a loop: the loop's own item file, tagged with the loop (or deeper);
 * - a Project or Area: its own file, tagged with none of its active loops
 *   and with no thread.
 *
 * A new agreement goes to the file that owns the scope (R18): a thread's
 * scope owner (where its `## Threads` line lives), a loop's item, a
 * Project's or Area's own file - never the Inbox.
 */
import {Agreement, isActiveAgreement} from './agreements';
import {EngageOwner, EngageSource, itemAt, lensSourcesOf, MeetingRef, threadOfTags} from './engageOwner';
import {scopeOwnerOf} from './counterparts';
import {belongsToLoop} from './loops';
import {resolveProvenance} from './provenance';
import {threadLensContext, ThreadLensContext} from './threadLens';
import {scopeOf} from './threads';

/** One agreement: its item and its index into the item's full agreements array. */
export interface AgreementRef {
  itemPath: string;
  index: number;
  agreement: Agreement;
}

/** An item as agreements are read from it (a cached item fits). */
export interface AgreementSourceItem {
  path: string;
  agreements: readonly Agreement[];
}

function refsOf(item: AgreementSourceItem, keep: (a: Agreement) => boolean): AgreementRef[] {
  const out: AgreementRef[] = [];
  item.agreements.forEach((agreement, index) => {
    if (keep(agreement)) out.push({itemPath: item.path, index, agreement});
  });
  return out;
}

/**
 * The agreements of a thread or counterpart lens inside its scope, active
 * and ended, in item and file order. `items` are the files read for
 * agreements (the Inbox has none).
 */
export function lensAgreements(ctx: Pick<ThreadLensContext, 'scope' | 'inLens'>, items: readonly AgreementSourceItem[]): {active: AgreementRef[]; ended: AgreementRef[]} {
  const all = items.filter(item => ctx.scope.includes(item.path)).flatMap(item => refsOf(item, a => ctx.inLens(a.tags)));
  return {active: all.filter(r => isActiveAgreement(r.agreement)), ended: all.filter(r => !isActiveAgreement(r.agreement))};
}

/** The owner's active agreements, in item and file order (R19). */
export function ownerAgreements(owner: EngageOwner, source: EngageSource): AgreementRef[] {
  if (owner.kind === 'thread') {
    const ctx = threadLensContext(source.items, lensSourcesOf(source), source.inbox?.path ?? null, owner.tag, 'thread', owner.scopeOwnerPath);
    return ctx ? lensAgreements(ctx, source.items).active : [];
  }
  const item = itemAt(source, owner.itemPath);
  if (!item) return [];
  if (owner.kind === 'loop') return refsOf(item, a => isActiveAgreement(a) && belongsToLoop(a.tags, owner.tag));
  const loops = item.loops.filter(l => l.status === 'active').map(l => l.tag);
  return refsOf(
    item,
    a => isActiveAgreement(a) && !loops.some(tag => belongsToLoop(a.tags, tag)) && threadOfTags(a.tags, source) === null,
  );
}

/** The meeting an agreement was made in, resolved in its item's scope first; null when unknown. */
export function agreementMadeIn(ref: AgreementRef, source: EngageSource): MeetingRef | null {
  if (!ref.agreement.fields.meeting) return null;
  const sources = lensSourcesOf(source).map(s => ({path: s.ref.path, meetings: s.meetings}));
  const match = resolveProvenance(ref.agreement, sources, scopeOf(ref.itemPath, source.items, source.inbox?.path ?? null));
  return match ? {itemPath: match.path, meetingIndex: match.meetingIndex} : null;
}

/** Where a new agreement of `owner` is written (R18); null when its file is unknown or is the Inbox. */
export function agreementTargetPath(owner: EngageOwner, source: EngageSource): string | null {
  const path = owner.kind === 'thread' ? owner.scopeOwnerPath : owner.itemPath;
  if (path === source.inbox?.path) return null;
  const item = itemAt(source, path);
  if (!item) return null;
  return owner.kind === 'thread' ? scopeOwnerOf(item.path, source.items)?.path ?? item.path : item.path;
}
