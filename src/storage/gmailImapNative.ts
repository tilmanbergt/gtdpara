/**
 * Thin JS-side bridge to the native `GmailImapModule.kt` (docs/technical-
 * design-review-gmail-inbox.md §4). This is a first-party native module -
 * the exact same pattern this plugin's own `supernote/GtdParaFileModule.kt`
 * already established (see docs/dev/design-overview.md §2.12/§2.17's own
 * mentions of it: a plain Kotlin `ReactContextBaseJavaModule`, registered in
 * this plugin's own `ReactPackage` alongside GtdParaFileModule) - NOT a
 * Supernote-SDK module, so it does not use `sn-plugin-lib`'s
 * `APIResponse<T>` shape.
 *
 * Revision note (2026-09-20): an earlier pass of this design doc worried
 * that a Supernote plugin's JS bundle might not be able to ship its own
 * compiled native Android code at all, and sketched a pure-JS TLS-socket
 * IMAP client as a fallback. That worry doesn't hold up against this exact
 * codebase's own history: `GtdParaFileModule.kt` is already a hand-written,
 * first-party native module this plugin ships and has extended more than
 * once (most recently with `moveFolder` for Archive, docs/dev/design-
 * overview.md §2.12) - proof this build pipeline already compiles and
 * registers custom native Android code into the running plugin, not just
 * whatever `sn-plugin-lib` itself exposes. So `GmailImapModule.kt` follows
 * that same, already-proven path: JavaMail's `gimap` provider (Gmail's own
 * IMAP extensions - X-GM-LABELS, X-GM-MSGID - directly, so "archive" is one
 * call) + Jsoup for HTML-to-text, both added as plain Gradle dependencies,
 * not new npm/JS packages.
 *
 * Every method here is a plain Promise-returning call (this project's own
 * native-module convention - see supernote/fileSystem.ts's own wrapper
 * around GtdParaFileModule for the precedent), not the SDK's separate
 * APIResponse<T> pattern. A rejected promise means the operation failed
 * (network error, bad credentials, IMAP error, message no longer present,
 * etc.) - callers surface `e.message`, same as every other storage module
 * in this app already does.
 */
import {NativeModules} from 'react-native';
import {ensureInternetPermission} from '../supernote/pluginPermissions';

const {GmailImapModule} = NativeModules;

export interface GmailAttachmentInfo {
  /** Opaque id the native side uses to re-fetch this exact MIME part later (an IMAP/JavaMail body-part path, e.g. "1.2", under the hood) - never parsed or constructed on the JS side. */
  partId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface GmailMessageSummary {
  /** IMAP UID, stable for a message's lifetime in the mailbox - the identifier storage/gmailInboxCache.ts keys everything on. Carried as a string end to end (a JS `number` can't safely hold every IMAP UID). */
  uid: string;
  from: string;
  subject: string;
  /** ISO timestamp, best-effort parsed from the message's Date header natively; '' if unparseable. */
  date: string;
  /** A short plain-text preview (HTML already stripped natively via Jsoup where needed) - cheap enough to compute for every listed message up front, unlike a full body fetch. */
  snippet: string;
  attachments: GmailAttachmentInfo[];
}

export interface GmailCredentials {
  email: string;
  appPassword: string;
  imapHost: string;
}

interface GmailImapNativeModule {
  listInboxMessages(email: string, appPassword: string, imapHost: string, limit: number): Promise<GmailMessageSummary[]>;
  fetchMessageBody(email: string, appPassword: string, imapHost: string, uid: string): Promise<string>;
  fetchAttachment(email: string, appPassword: string, imapHost: string, uid: string, partId: string): Promise<string>;
  archiveMessage(email: string, appPassword: string, imapHost: string, uid: string): Promise<void>;
}

function requireModule(): GmailImapNativeModule {
  if (!GmailImapModule) {
    throw new Error(
      'Gmail support is not available in this build (native module not linked yet) - rebuild the plugin after pulling this change.',
    );
  }
  return GmailImapModule as GmailImapNativeModule;
}

export type GmailErrorKind = 'permission' | 'auth' | 'network' | 'other';

/**
 * Turns whatever a native call rejected with into an Error whose message
 * says, up front, WHICH kind of failure it was (2026-09-21, Tilman: "clearly
 * state if it is permission or network unavailable or something else") - the
 * Review step shows `e.message` verbatim, so this is what the user reads.
 * The native side only forwards `Throwable.message` (code "E_IMAP"), so the
 * kind is recognised from message text; anything unrecognised keeps its raw
 * message under "Gmail error:" rather than being guessed into a category.
 * `kind` is also attached to the Error for callers that want to branch on it
 * (no `instanceof` on purpose - unreliable for Error subclasses under Hermes).
 */
export function describeGmailFailure(e: unknown): Error & {kind: GmailErrorKind} {
  const raw = e instanceof Error ? e.message : String(e);
  let kind: GmailErrorKind = 'other';
  let message: string;
  if (/no NETWORK permission|Internet access was not allowed/i.test(raw)) {
    kind = 'permission';
    message =
      'No permission - the Supernote did not allow this plugin to use the internet. Allow it when asked (or in the plugin\'s permissions), then tap Refresh.';
  } else if (/AUTHENTICATIONFAILED|Invalid credentials|authentication failed|application-specific password|LOGIN failed/i.test(raw)) {
    kind = 'auth';
    message = `Login failed - check your Gmail address and app password in Settings → Gmail. (${raw})`;
  } else if (
    /Couldn't connect|UnknownHost|Unable to resolve host|No address associated|timed out|timeout|unreachable|Connection (reset|refused)|SSLException|SocketException|Software caused connection abort/i.test(
      raw,
    )
  ) {
    kind = 'network';
    message = `No connection to Gmail - check that the Supernote is online, then tap Refresh. (${raw})`;
  } else {
    message = `Gmail error: ${raw}`;
  }
  return Object.assign(new Error(message), {kind});
}

/**
 * Bug fix (2026-09-21): the Supernote host enforces the plugin's INTERNET
 * permission at the socket level (java.net.SocketException: "Plugin [...] has
 * no NETWORK permission for: <ip>:993" from BlockGuardOs.connect), so the
 * runtime grant has to be requested before the IMAP socket is opened, exactly
 * as storage/googleCalendarCache.ts's refreshGoogleCalendar already does
 * before its own fetch. The Gmail path never did, so every IMAP connect was
 * refused by the host. Every network-touching call in this file goes through
 * this one gate (never eagerly, never at Settings time), so no caller,
 * present or future, can reach the IMAP socket without it - and every
 * failure leaves here as a categorised describeGmailFailure() error.
 */
async function callNative<T>(call: (native: GmailImapNativeModule) => Promise<T>): Promise<T> {
  try {
    const native = requireModule();
    const granted = await ensureInternetPermission('Allow GtdPara to connect to your Gmail inbox (imap.gmail.com) - only when you tap Load or act on an email.');
    if (!granted) {
      throw new Error('Internet access was not allowed.');
    }
    return await call(native);
  } catch (e) {
    throw describeGmailFailure(e);
  }
}

/** Up to `limit` most recent inbox messages, newest first. Each message's full body/attachments are fetched separately (below), only once the user actually opens that email - see storage/gmailInboxCache.ts's own doc comment on why this stays a thin, per-call bridge rather than a cache itself. */
export async function listInboxMessages(creds: GmailCredentials, limit: number): Promise<GmailMessageSummary[]> {
  return callNative(native => native.listInboxMessages(creds.email, creds.appPassword, creds.imapHost, limit));
}

/**
 * The message's body as plain text - HTML is already converted to text
 * natively (Jsoup) whenever the message has no plain-text part. Resolves to
 * the literal string 'unsupported' (not a thrown error) when neither a
 * plain-text nor an HTML part could be found or parsed - docs/technical-
 * design-review-gmail-inbox.md §6's fallback, kept as a normal return value
 * rather than an exception so callers don't need a special catch just for
 * this expected case.
 */
export async function fetchMessageBody(creds: GmailCredentials, uid: string): Promise<string | 'unsupported'> {
  const result = await callNative(native => native.fetchMessageBody(creds.email, creds.appPassword, creds.imapHost, uid));
  return result as string | 'unsupported';
}

/** Base64-encoded raw bytes of one attachment part - storage/gmailAttachments.ts decodes and writes it to disk via the existing GtdParaFileModule-backed write path. */
export async function fetchAttachment(creds: GmailCredentials, uid: string, partId: string): Promise<string> {
  return callNative(native => native.fetchAttachment(creds.email, creds.appPassword, creds.imapHost, uid, partId));
}

/** Removes the message from the Gmail inbox (native X-GM-LABELS -\Inbox) - Gmail's own definition of "Archive", not deletion (docs/dev/technical-design-review-gmail-inbox.md §7). */
export async function archiveMessage(creds: GmailCredentials, uid: string): Promise<void> {
  await callNative(native => native.archiveMessage(creds.email, creds.appPassword, creds.imapHost, uid));
}
