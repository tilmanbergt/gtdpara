package eu.embodyagile.gtdpara

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.sun.mail.gimap.GmailFolder
import com.sun.mail.imap.IMAPFolder
import org.jsoup.Jsoup
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.Properties
import java.util.TimeZone
import java.util.concurrent.Executors
import javax.mail.Address
import javax.mail.BodyPart
import javax.mail.FetchProfile
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.UIDFolder
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeUtility

/**
 * Gmail IMAP access for the Weekly Review "Gmail inbox" step (docs/
 * technical-design-review-gmail-inbox.md §4) - a first-party native module
 * this plugin ships itself, the same already-proven pattern
 * GtdParaFileModule.kt established (see that file's own doc comment, and
 * supernote/gmailImapNative.ts's revision note, for why a Supernote plugin
 * shipping its own compiled native code is safe: this codebase already does
 * it, extended more than once).
 *
 * Uses JavaMail's `gimap` provider (com.sun.mail:gimap), not plain `imap`,
 * specifically so "archive" is Gmail's own one-call label operation
 * (`GmailFolder.setLabels(messages, arrayOf("\Inbox"), false)` - the real
 * gimap API is one `setLabels(msgs, labels, set)` method, `set` chooses
 * add vs. remove, there's no separate add/removeGmailLabels pair) rather
 * than IMAP's `Flags.Flag.DELETED` + expunge, which would delete the
 * message outright - Gmail models "remove from Inbox" as a label change
 * (the message stays in All Mail), and this mirrors that exactly rather
 * than approximating it.
 *
 * Every method opens and closes its own short-lived IMAP connection - this
 * step is a once-per-review-visit triage, not a live-sync inbox, so paying
 * a fresh connect/login per call is a fair trade for never having to reason
 * about a long-lived connection going stale between calls. Each
 * @ReactMethod hands off to a dedicated single-thread executor immediately
 * (IMAP is blocking network I/O and must never run on the RN bridge thread).
 *
 * Logs under the "GmailImapModule" tag - pair with the JS-side "[GtdPara]"
 * console logs when debugging via:
 *   adb logcat -c; <reproduce>; adb logcat -d -s ReactNativeJS:V GmailImapModule:V
 */
class GmailImapModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "GmailImapModule"
    }

    override fun getName(): String = "GmailImapModule"

    // One dedicated background thread for all four calls - simple and
    // sufficient for a step the user visits at most a few times a day; no
    // need for a pool given every call already pays its own connect/login
    // cost and this plugin has no other concurrent Gmail work to interleave.
    private val executor = Executors.newSingleThreadExecutor()

    init {
        PluginRuntimeGuard.onModuleCreated("GmailImapModule")
    }

    /**
     * The React instance is going away (plugin reload/update): stop the
     * executor so its worker thread doesn't outlive this build. Before
     * 2026-09-29 it was never shut down, leaving one idle thread per React
     * instance (docs/dev/technical-design-host-update-crash.md). Queued calls are
     * dropped (their JS side is gone); a running one gets an interrupt, which
     * blocking IMAP socket I/O ignores, so it simply finishes on its own.
     */
    override fun invalidate() {
        PluginRuntimeGuard.onModuleInvalidated("GmailImapModule")
        val dropped = executor.shutdownNow().size
        if (dropped > 0) Log.w(TAG, "invalidate: dropped $dropped queued call(s)")
        super.invalidate()
    }

    private fun openInbox(email: String, appPassword: String, imapHost: String, readOnly: Boolean): GmailFolder {
        val props = Properties()
        props.setProperty("mail.store.protocol", "gimap")
        props.setProperty("mail.gimap.ssl.enable", "true")
        props.setProperty("mail.gimap.host", imapHost)
        props.setProperty("mail.gimap.port", "993")
        props.setProperty("mail.gimap.connectiontimeout", "20000")
        props.setProperty("mail.gimap.timeout", "20000")
        val session = Session.getInstance(props)
        val store = session.getStore("gimap")
        store.connect(imapHost, email, appPassword)
        val folder = store.getFolder("INBOX") as GmailFolder
        folder.open(if (readOnly) Folder.READ_ONLY else Folder.READ_WRITE)
        return folder
    }

    private fun closeQuietly(folder: Folder?) {
        try {
            val store = folder?.store
            if (folder != null && folder.isOpen) folder.close(false)
            store?.close()
        } catch (error: Throwable) {
            Log.w(TAG, "closeQuietly: failed", error)
        }
    }

    /** Best-effort ISO 8601 (UTC) from the message's own Date header, '' if unparseable/missing. */
    private fun isoDate(message: Message): String {
        val date = message.sentDate ?: message.receivedDate ?: return ""
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(date)
    }

    private fun addressList(addresses: Array<Address>?): String {
        if (addresses.isNullOrEmpty()) return ""
        return addresses.joinToString(", ") { address ->
            (address as? InternetAddress)?.let { it.personal ?: it.address } ?: address.toString()
        }
    }

    /** Decoded MIME "encoded-word" subject (RFC 2047) - falls back to the raw value if decoding fails (a plain-ASCII subject needs no decoding and MimeUtility.decodeText is a safe no-op on it either way). */
    private fun decodedSubject(message: Message): String {
        val raw = message.subject ?: return ""
        return try {
            MimeUtility.decodeText(raw)
        } catch (error: Exception) {
            raw
        }
    }

    /** Result of walking one message's MIME tree: the first text/plain and text/html parts found (for snippet/body), and every attachment-like part with its dotted IMAP/MIME section id ("1", "2.1", ...) and decoded filename. */
    private class Walked {
        var plainText: String? = null
        var htmlText: String? = null
        val attachments = mutableListOf<Triple<String, BodyPart, String>>()
    }

    /** Recurses into a multipart tree, assigning each part the same dotted section-number id IMAP body-part addressing uses, so `partId` here is stable and independent of any particular JS-side parsing. */
    private fun walk(part: Part, prefix: String, out: Walked) {
        if (part.isMimeType("multipart/*")) {
            val multipart = part.content as Multipart
            for (i in 0 until multipart.count) {
                val childPrefix = if (prefix.isEmpty()) "${i + 1}" else "$prefix.${i + 1}"
                walk(multipart.getBodyPart(i), childPrefix, out)
            }
            return
        }

        val disposition = try { part.disposition } catch (error: Exception) { null }
        val rawFileName = try { part.fileName } catch (error: Exception) { null }
        val fileName = rawFileName?.let { name -> try { MimeUtility.decodeText(name) } catch (error: Exception) { name } }
        val contentType = (try { part.contentType } catch (error: Exception) { null } ?: "").lowercase(Locale.US)

        val isAttachment = fileName != null &&
            (Part.ATTACHMENT.equals(disposition, ignoreCase = true) ||
                (!contentType.startsWith("text/plain") && !contentType.startsWith("text/html")))

        if (isAttachment && part is BodyPart) {
            out.attachments.add(Triple(prefix, part, fileName!!))
            return
        }

        if (part.isMimeType("text/plain") && out.plainText == null) {
            out.plainText = try { part.content as? String } catch (error: Exception) { null }
        } else if (part.isMimeType("text/html") && out.htmlText == null) {
            out.htmlText = try { part.content as? String } catch (error: Exception) { null }
        }
    }

    private fun walkMessage(message: Message): Walked {
        val out = Walked()
        try {
            when {
                message.isMimeType("multipart/*") -> walk(message, "", out)
                message.isMimeType("text/plain") -> out.plainText = try { message.content as? String } catch (error: Exception) { null }
                message.isMimeType("text/html") -> out.htmlText = try { message.content as? String } catch (error: Exception) { null }
            }
        } catch (error: Exception) {
            Log.w(TAG, "walkMessage: failed to walk MIME parts", error)
        }
        return out
    }

    /** Plain text, HTML-stripped via Jsoup if there is no text/plain part - capped and whitespace-collapsed for a one-line list preview. */
    private fun snippetFrom(walked: Walked): String {
        val text = walked.plainText?.trim()?.takeIf { it.isNotEmpty() }
            ?: walked.htmlText?.let { Jsoup.parse(it).text() }?.trim()?.takeIf { it.isNotEmpty() }
            ?: ""
        val collapsed = text.replace(Regex("\\s+"), " ")
        return if (collapsed.length > 200) collapsed.take(200) + "…" else collapsed
    }

    /** Full body, HTML-stripped via Jsoup if there is no text/plain part - the literal string "unsupported" (not an exception) when neither part could be found/parsed, docs/dev/technical-design-review-gmail-inbox.md §6. */
    private fun bodyTextFrom(walked: Walked): String {
        walked.plainText?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        walked.htmlText?.let {
            val text = Jsoup.parse(it).text().trim()
            if (text.isNotEmpty()) return text
        }
        return "unsupported"
    }

    private fun findByUid(folder: GmailFolder, uid: String): Message {
        val target = uid.toLongOrNull()
            ?: throw IllegalArgumentException("Invalid message uid: $uid")
        return folder.getMessageByUID(target)
            ?: throw IllegalStateException("Message no longer exists on the server (uid=$uid) - it may have changed since the list was loaded. Tap 🔄 to refresh.")
    }

    @ReactMethod
    fun listInboxMessages(email: String?, appPassword: String?, imapHost: String?, limit: Double, promise: Promise) {
        PluginRuntimeGuard.trace("GmailImapModule.listInboxMessages")
        if (email.isNullOrEmpty() || appPassword.isNullOrEmpty() || imapHost.isNullOrEmpty()) {
            promise.reject("E_CREDS", "Gmail email, app password and IMAP host are all required")
            return
        }
        executor.execute {
            var folder: GmailFolder? = null
            try {
                folder = openInbox(email, appPassword, imapHost, readOnly = true)
                val count = folder.messageCount
                if (count == 0) {
                    promise.resolve(WritableNativeArray())
                    return@execute
                }
                val fetchLimit = limit.toInt().coerceAtLeast(1)
                val start = (count - fetchLimit + 1).coerceAtLeast(1)
                val messages = folder.getMessages(start, count)

                // One bulk fetch for envelope/flags/uid instead of one round
                // trip per message per field - javax.mail's own recommended
                // pattern for listing a folder.
                val profile = FetchProfile()
                profile.add(FetchProfile.Item.ENVELOPE)
                profile.add(FetchProfile.Item.FLAGS)
                profile.add(UIDFolder.FetchProfileItem.UID)
                folder.fetch(messages, profile)

                val withUid = messages.map { message -> Triple(message, folder.getUID(message), walkMessage(message)) }
                    .sortedByDescending { (message, _, _) -> message.sentDate ?: message.receivedDate }

                val result: WritableArray = WritableNativeArray()
                for ((message, uid, walked) in withUid) {
                    val entry: WritableMap = WritableNativeMap()
                    entry.putString("uid", uid.toString())
                    entry.putString("from", addressList(message.from))
                    entry.putString("subject", decodedSubject(message))
                    entry.putString("date", isoDate(message))
                    entry.putString("snippet", snippetFrom(walked))
                    val attachmentsArr: WritableArray = WritableNativeArray()
                    for ((partId, part, fileName) in walked.attachments) {
                        val attachmentEntry: WritableMap = WritableNativeMap()
                        attachmentEntry.putString("partId", partId)
                        attachmentEntry.putString("fileName", fileName)
                        val mimeType = (try { part.contentType } catch (error: Exception) { null })
                            ?.substringBefore(";")?.trim()?.lowercase(Locale.US) ?: "application/octet-stream"
                        attachmentEntry.putString("mimeType", mimeType)
                        val size = try { part.size } catch (error: Exception) { -1 }
                        attachmentEntry.putDouble("sizeBytes", size.toDouble())
                        attachmentsArr.pushMap(attachmentEntry)
                    }
                    entry.putArray("attachments", attachmentsArr)
                    result.pushMap(entry)
                }
                Log.d(TAG, "listInboxMessages: done count=${result.size()}")
                promise.resolve(result)
            } catch (error: Throwable) {
                Log.e(TAG, "listInboxMessages: failed", error)
                promise.reject("E_IMAP", error.message, error)
            } finally {
                closeQuietly(folder)
            }
        }
    }

    @ReactMethod
    fun fetchMessageBody(email: String?, appPassword: String?, imapHost: String?, uid: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GmailImapModule.fetchMessageBody")
        if (email.isNullOrEmpty() || appPassword.isNullOrEmpty() || imapHost.isNullOrEmpty() || uid.isNullOrEmpty()) {
            promise.reject("E_CREDS", "Gmail email, app password, IMAP host and uid are all required")
            return
        }
        executor.execute {
            var folder: GmailFolder? = null
            try {
                folder = openInbox(email, appPassword, imapHost, readOnly = true)
                val message = findByUid(folder, uid)
                val walked = walkMessage(message)
                promise.resolve(bodyTextFrom(walked))
            } catch (error: Throwable) {
                Log.e(TAG, "fetchMessageBody: failed uid=$uid", error)
                promise.reject("E_IMAP", error.message, error)
            } finally {
                closeQuietly(folder)
            }
        }
    }

    @ReactMethod
    fun fetchAttachment(email: String?, appPassword: String?, imapHost: String?, uid: String?, partId: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GmailImapModule.fetchAttachment")
        if (email.isNullOrEmpty() || appPassword.isNullOrEmpty() || imapHost.isNullOrEmpty() || uid.isNullOrEmpty() || partId.isNullOrEmpty()) {
            promise.reject("E_CREDS", "Gmail email, app password, IMAP host, uid and partId are all required")
            return
        }
        executor.execute {
            var folder: GmailFolder? = null
            try {
                folder = openInbox(email, appPassword, imapHost, readOnly = true)
                val message = findByUid(folder, uid)
                val walked = walkMessage(message)
                val match = walked.attachments.firstOrNull { it.first == partId }
                    ?: throw IllegalStateException("Attachment part $partId was not found on this message any more - tap 🔄 to refresh.")
                val stream = ByteArrayOutputStream()
                match.second.inputStream.use { input -> input.copyTo(stream) }
                promise.resolve(Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP))
            } catch (error: Throwable) {
                Log.e(TAG, "fetchAttachment: failed uid=$uid partId=$partId", error)
                promise.reject("E_IMAP", error.message, error)
            } finally {
                closeQuietly(folder)
            }
        }
    }

    @ReactMethod
    fun archiveMessage(email: String?, appPassword: String?, imapHost: String?, uid: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GmailImapModule.archiveMessage")
        if (email.isNullOrEmpty() || appPassword.isNullOrEmpty() || imapHost.isNullOrEmpty() || uid.isNullOrEmpty()) {
            promise.reject("E_CREDS", "Gmail email, app password, IMAP host and uid are all required")
            return
        }
        executor.execute {
            var folder: GmailFolder? = null
            var verifyFolder: GmailFolder? = null
            try {
                folder = openInbox(email, appPassword, imapHost, readOnly = false)
                val uidLong = uid.toLongOrNull() ?: throw IllegalArgumentException("Invalid message uid: $uid")
                findByUid(folder, uid) // fail early, with the clear "no longer exists" message
                // Raw wire text on purpose (not gimap's parsed labels): the
                // first on-device test showed gimap reporting labels=[] both
                // before and after, which proved nothing either way.
                val before = rawCommand(folder, "UID FETCH $uid (X-GM-LABELS X-GM-THRID X-GM-MSGID FLAGS)")
                Log.d(TAG, "archiveMessage: uid=$uid BEFORE (raw) = $before")
                val threadId = Regex("X-GM-THRID (\\d+)").find(before.joinToString(" "))?.groupValues?.get(1)

                // Gmail's own model of "Archive": remove the \Inbox label so
                // the message stays in All Mail - NOT Flags.Flag.DELETED +
                // expunge, which would delete it outright.
                //
                // Bug fix (2026-09-21), found via on-device logs: both
                // gimap's setLabels(...) AND a raw `UID STORE <uid>
                // -X-GM-LABELS (\Inbox)` issued while INBOX is the selected
                // folder are accepted by Gmail ("OK Success") but change
                // nothing - the message stays in INBOX. In INBOX Gmail reports
                // X-GM-LABELS as () for an inbox message (the selected folder's
                // own label is implicit there), so the \Inbox label can't be
                // removed from that view. It has to be removed from the
                // "[Gmail]/All Mail" view, where \Inbox is an ordinary label:
                // find the same message there by its X-GM-MSGID (UIDs differ
                // per folder), then remove \Inbox from it.
                val msgId = Regex("X-GM-MSGID (\\d+)").find(before.joinToString(" "))?.groupValues?.get(1)
                    ?: throw IllegalStateException("Could not read the message's X-GM-MSGID from: $before")
                val allMail = findAllMailFolder(folder.store)
                Log.d(TAG, "archiveMessage: uid=$uid using All Mail folder '${allMail.fullName}' for msgid=$msgId")
                allMail.open(Folder.READ_WRITE)
                val responses: List<String> = try {
                    val found = rawCommand(allMail, "UID SEARCH X-GM-MSGID $msgId")
                    val allMailUid = Regex("\\* SEARCH (\\d+)").find(found.joinToString("\n"))?.groupValues?.get(1)
                        ?: throw IllegalStateException("Message not found in All Mail (msgid=$msgId): $found")
                    Log.d(TAG, "archiveMessage: uid=$uid is uid=$allMailUid in All Mail")
                    rawCommand(allMail, "UID STORE $allMailUid -X-GM-LABELS (\\Inbox)")
                } finally {
                    try { if (allMail.isOpen) allMail.close(false) } catch (error: Throwable) { Log.w(TAG, "archiveMessage: closing All Mail failed", error) }
                }
                Log.d(TAG, "archiveMessage: uid=$uid server replied: $responses")
                closeQuietly(folder)
                folder = null

                // Never trust "the server said OK": the real success criterion
                // is that the message is GONE from INBOX when a FRESH
                // connection looks for it by UID. If it is still there, fail
                // loudly so the JS side rolls the message back into the list
                // instead of showing a silent, fake success.
                verifyFolder = openInbox(email, appPassword, imapHost, readOnly = true)
                val stillInInbox = verifyFolder.getMessageByUID(uidLong) != null
                Log.d(TAG, "archiveMessage: uid=$uid still in INBOX on fresh connection = $stillInInbox")
                // Extra diagnostics (best effort, never allowed to break the archive itself).
                try {
                    if (stillInInbox) {
                        Log.d(TAG, "archiveMessage: uid=$uid AFTER (raw) = " +
                            rawCommand(verifyFolder, "UID FETCH $uid (X-GM-LABELS X-GM-THRID X-GM-MSGID FLAGS)"))
                    }
                    if (threadId != null) {
                        // Other INBOX messages of the same conversation: Gmail's web inbox lists a
                        // conversation for as long as ANY of its messages is still in the inbox.
                        Log.d(TAG, "archiveMessage: uid=$uid thread $threadId INBOX mates = " +
                            rawCommand(verifyFolder, "UID SEARCH X-GM-THRID $threadId"))
                    }
                } catch (error: Throwable) {
                    Log.w(TAG, "archiveMessage: diagnostics failed", error)
                }
                if (stillInInbox) {
                    throw IllegalStateException(
                        "Gmail accepted the archive command but the message is still in the Inbox. Server reply: $responses",
                    )
                }
                promise.resolve(null)
            } catch (error: Throwable) {
                Log.e(TAG, "archiveMessage: failed uid=$uid", error)
                promise.reject("E_IMAP", error.message, error)
            } finally {
                closeQuietly(folder)
                closeQuietly(verifyFolder)
            }
        }
    }

    /** Gmail's "All Mail" folder - found by its IMAP special-use attribute (\All), since its name is localised ("[Gmail]/Alle Nachrichten" etc.); falls back to the English name. */
    private fun findAllMailFolder(store: Store): IMAPFolder {
        for (candidate in store.defaultFolder.list("*")) {
            val attributes = (candidate as? IMAPFolder)?.attributes ?: continue
            if (attributes.any { it.equals("\\All", ignoreCase = true) }) return candidate as IMAPFolder
        }
        val english = store.getFolder("[Gmail]/All Mail")
        if (english.exists()) return english as IMAPFolder
        throw IllegalStateException("Could not find Gmail's \"All Mail\" folder (no folder with the \\All attribute).")
    }

    /**
     * Sends one raw IMAP command on the folder's connection and returns what
     * the server answered (untagged lines + the tagged completion) as text for
     * the log. Throws if the tagged completion is not OK. Used where JavaMail's
     * own wrapper can't express the exact wire form Gmail needs.
     */
    private fun rawCommand(folder: IMAPFolder, command: String): List<String> {
        @Suppress("UNCHECKED_CAST")
        return folder.doCommand(IMAPFolder.ProtocolCommand { protocol ->
            val responses = protocol.command(command, null)
            val lines = responses.filterNotNull().map { it.toString().trim() }
            val last = responses.lastOrNull()
            if (last == null || !last.isOK) {
                throw IllegalStateException("IMAP command failed: $command -> $lines")
            }
            lines
        }) as List<String>
    }
}
