/**
 * Thin JS-side bridge to the native `GmailImapModule.kt` (
 * docs/dev/history/technical-design-review-gmail-inbox.md §4). A first-party native module like
 * `supernote/GtdParaFileModule.kt` (docs/dev/design-overview.md
 * §2.12/§2.17): a plain Kotlin `ReactContextBaseJavaModule` registered in
 * this plugin's own `ReactPackage` - NOT a Supernote-SDK module, so it does
 * not use `sn-plugin-lib`'s `APIResponse<T>` shape.
 *
 * Natively it uses JavaMail's `gimap` provider (Gmail's IMAP extensions -
 * X-GM-LABELS, X-GM-MSGID - so "archive" is one call) and Jsoup for
 * HTML-to-text, both plain Gradle dependencies, not npm packages.
 *
 * Every method is a plain Promise-returning call (the project's native-module
 * convention, see supernote/fileSystem.ts). A rejected promise means the
 * operation failed (network error, bad credentials, IMAP error, message gone,
 * etc.) - callers surface `e.message`, like every other storage module.
 */
import {NativeModules} from 'react-native';
import {ensureInternetPermission} from '../supernote/pluginPermissions';
import {errorMessage} from '../utils/errorMessage';

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
 * says, up front, WHICH kind of failure it was (permission, login, network
 * or something else) - the Review step shows `e.message` verbatim, so this is what the user reads.
 * The native side only forwards `Throwable.message` (code "E_IMAP"), so the
 * kind is recognised from message text; anything unrecognised keeps its raw
 * message under "Gmail error:" rather than being guessed into a category.
 * `kind` is also attached to the Error for callers that want to branch on it
 * (no `instanceof` on purpose - unreliable for Error subclasses under Hermes).
 */
export function describeGmailFailure(e: unknown): Error & {kind: GmailErrorKind} {
  const raw = errorMessage(e);
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
 * The Supernote host enforces the plugin's INTERNET permission at the socket
 * level (java.net.SocketException: "Plugin [...] has no NETWORK permission
 * for: <ip>:993" from BlockGuardOs.connect), so the runtime grant has to be
 * requested before the IMAP socket is opened, as storage/googleCalendarCache.ts's
 * refreshGoogleCalendar does before its fetch. Every network-touching call in
 * this file goes through this one gate (never eagerly, never at Settings
 * time), and every failure leaves here as a categorised describeGmailFailure()
 * error.
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
 * plain-text nor an HTML part could be found or parsed -
 * docs/dev/history/technical-design-review-gmail-inbox.md §6's fallback, kept as a normal return value
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

/** Removes the message from the Gmail inbox (native X-GM-LABELS -\Inbox) - Gmail's own definition of "Archive", not deletion (docs/dev/history/technical-design-review-gmail-inbox.md §7). */
export async function archiveMessage(creds: GmailCredentials, uid: string): Promise<void> {
  await callNative(native => native.archiveMessage(creds.email, creds.appPassword, creds.imapHost, uid));
}
