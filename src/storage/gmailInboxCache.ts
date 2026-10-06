/**
 * In-memory Gmail inbox cache for the Weekly Review "Gmail inbox" step
 * (docs/dev/technical-design-review-gmail-inbox.md §5) - mirrors storage/
 * folderIndex.ts's own proven pattern (a module-level variable, explicit
 * refresh only, no background polling): a plugin running on an e-ink device
 * has no business quietly polling an IMAP server on a timer, so this cache
 * is populated only when the user taps the step's own Refresh/Load button
 * (2026-09-21: entering the step no longer fetches by itself - a failed fetch
 * used to be retried in a tight loop that also wiped its own error message;
 * see screens/ReviewScreen.tsx's renderGmailInbox) and stays exactly as it
 * was until the next explicit refresh, same "frozen for the visit" posture
 * screens/ReviewScreen.tsx's own snapshot state already uses for
 * Stalled/Neglected/etc.
 *
 * Deliberately NOT a wrapper that re-fetches automatically - every function
 * here does exactly the one IMAP round-trip its name says and nothing more
 * (list, fetch one body, fetch one attachment, archive one message), so a
 * caller always knows exactly when a network call happens. `refreshGmailInbox`
 * is the only one that repopulates the whole list; everything else mutates
 * the already-cached array in place (`removeCachedGmailMessage`/
 * `restoreCachedGmailMessage` for the optimistic archive UI,
 * `fetchGmailBody` to lazily fill in one message's `bodyText` once its detail
 * panel is actually opened - fetching every message's full body up front
 * would be one IMAP round-trip per message for content most of which is
 * never read).
 */
import {GtdParaSettings} from '../domain/settings';
import {
  archiveMessage,
  fetchMessageBody,
  GmailCredentials,
  GmailMessageSummary,
  listInboxMessages,
} from './gmailImapNative';
import {log, logError} from '../utils/log';
import {errorMessage} from '../utils/errorMessage';

/** Most recent messages fetched per refresh - a fixed, generous cap rather than paging, same reasoning as the rest of this step (a Weekly Review inbox triage is not expected to run against thousands of unread emails at once). */
export const GMAIL_INBOX_FETCH_LIMIT = 30;

export interface GmailCacheMessage extends GmailMessageSummary {
  /**
   * `'unfetched'` until the message's detail panel is opened (fetchGmailBody
   * below); `'unsupported'` when the native side found neither a usable
   * plain-text nor HTML part (docs/dev/technical-design-review-gmail-inbox.md
   * §6) - both are plain data states, not error conditions, so callers don't
   * need to special-case a rejected promise just to notice them.
   */
  bodyText: string | 'unfetched' | 'unsupported';
}

let cached: GmailCacheMessage[] | null = null;
/** When `cached` was last successfully fetched (ms epoch) - null until the first success this session. Drives the "Refresh (last HH:MM)" label, same as the Calendar panel's own fetchedAt. */
let cachedFetchedAt: number | null = null;

export function getGmailFetchedAt(): number | null {
  return cachedFetchedAt;
}

/** Whatever the last refresh produced, or null if the step has never been entered/refreshed this session - the caller decides what to show for "not loaded yet" (same convention storage/folderIndex.ts's own getCached uses). */
export function getCachedGmailInbox(): GmailCacheMessage[] | null {
  return cached;
}

/** Drops the cache entirely - used when Gmail settings change (a different account should never show the previous account's stale messages). */
export function clearCachedGmailInbox(): void {
  cached = null;
  cachedFetchedAt = null;
}

function credentialsFrom(settings: GtdParaSettings): GmailCredentials {
  return {
    email: settings.gmailEmail,
    appPassword: settings.gmailAppPassword,
    imapHost: settings.gmailImapHost || 'imap.gmail.com',
  };
}

/** Gmail is only attempted once both an address and an app password are set - see domain/settings.ts's own gmailEmail/gmailAppPassword doc comments. */
export function isGmailConfigured(settings: GtdParaSettings): boolean {
  return settings.gmailEmail.trim().length > 0 && settings.gmailAppPassword.trim().length > 0;
}

/**
 * Re-fetches the message list from the server and replaces the cache
 * wholesale - every message starts back at `bodyText: 'unfetched'` even if
 * it was previously opened this session, since a fresh list is a fresh set
 * of GmailMessageSummary objects with no way to carry that over cheaply, and
 * re-fetching a body lazily on next open is a small enough cost given how
 * infrequently this runs (step entry / manual 🔄 only).
 */
export async function refreshGmailInbox(settings: GtdParaSettings): Promise<GmailCacheMessage[]> {
  if (!isGmailConfigured(settings)) {
    cached = [];
    return cached;
  }
  log('gmailInboxCache: refresh start');
  const summaries = await listInboxMessages(credentialsFrom(settings), GMAIL_INBOX_FETCH_LIMIT);
  // Messages still being archived in the background stay hidden (see
  // pendingArchiveUids) - the server may simply not have processed them yet.
  cached = summaries
    .filter(summary => !pendingArchiveUids.has(summary.uid))
    .map(summary => ({...summary, bodyText: 'unfetched' as const}));
  cachedFetchedAt = Date.now();
  log('gmailInboxCache: refresh done', `${cached.length} messages`);
  return cached;
}

/**
 * Lazily fetches and caches one message's body the first time its detail
 * panel is opened. A message no longer present in the cache (e.g. archived
 * from another client between refreshes) is a no-op - the caller's own
 * `getCachedGmailInbox()` read afterwards simply won't find it either.
 */
export async function fetchGmailBody(settings: GtdParaSettings, uid: string): Promise<string | 'unsupported'> {
  const existing = cached?.find(m => m.uid === uid);
  if (existing && existing.bodyText !== 'unfetched') return existing.bodyText;
  const body = await fetchMessageBody(credentialsFrom(settings), uid);
  if (cached) {
    cached = cached.map(m => (m.uid === uid ? {...m, bodyText: body} : m));
  }
  return body;
}

/** A message taken out of the cache by removeCachedGmailMessage, with the position it had - so a failed archive can put it back exactly where it was. */
export interface RemovedGmailMessage {
  message: GmailCacheMessage;
  index: number;
}

/** Optimistically hides an archived message from the list without a full refresh - paired with restoreCachedGmailMessage if the archive call then fails. Returns the removed message + its index (for restore) or null if it wasn't cached. */
export function removeCachedGmailMessage(uid: string): RemovedGmailMessage | null {
  if (!cached) return null;
  const index = cached.findIndex(m => m.uid === uid);
  if (index < 0) return null;
  const message = cached[index];
  cached = cached.filter(m => m.uid !== uid);
  return {message, index};
}

/** Undoes removeCachedGmailMessage - re-inserted at its original index (2026-09-28: "wieder in die Liste setzen" should mean where it was), clamped to the current length. */
export function restoreCachedGmailMessage(removed: RemovedGmailMessage): void {
  if (!cached) return;
  if (cached.some(m => m.uid === removed.message.uid)) return;
  const index = Math.min(removed.index, cached.length);
  cached = [...cached.slice(0, index), removed.message, ...cached.slice(index)];
}

/**
 * Archives still running in the background (2026-09-28, docs/technical-
 * design-review-monthly-focus.md §4.3). A manual refresh while one of these
 * is queued/in flight would otherwise re-list a message the server hasn't
 * archived yet - refreshGmailInbox filters them out.
 */
const pendingArchiveUids = new Set<string>();
/** Serialises archives: quick consecutive taps must not open parallel IMAP sessions through the native module (its thread safety is untested). Each archive chains onto the previous one; a failure never breaks the chain. */
let archiveQueue: Promise<void> = Promise.resolve();

/**
 * Archives a message on the server (Gmail's own "remove from Inbox", not
 * deletion) and removes it from the cache. Optimistic-then-rollback: the
 * message is removed from the cache SYNCHRONOUSLY, before this returns its
 * promise, so the caller can re-read getCachedGmailInbox() immediately and
 * treat it as gone (2026-09-28: the email disappears right after the tap,
 * archiving runs in the background). The IMAP call itself is queued behind
 * any archive still running. If it fails, the message is restored to the
 * cache at its old position before the rejection reaches the caller.
 */
export function archiveGmailMessage(settings: GtdParaSettings, uid: string): Promise<void> {
  const removed = removeCachedGmailMessage(uid);
  pendingArchiveUids.add(uid);
  const credentials = credentialsFrom(settings);
  const run = archiveQueue.then(async () => {
    try {
      await archiveMessage(credentials, uid);
      log('gmailInboxCache: archived', uid);
    } catch (e) {
      if (removed) restoreCachedGmailMessage(removed);
      logError('gmailInboxCache: archive failed', uid, errorMessage(e));
      throw e;
    } finally {
      pendingArchiveUids.delete(uid);
    }
  });
  archiveQueue = run.catch(() => undefined);
  return run;
}
