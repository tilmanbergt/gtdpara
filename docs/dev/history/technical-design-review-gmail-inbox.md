# Gmail inbox — Review step (technical design)

Status: draft, 2026-09-20 — follows the Gmail-inbox-in-Review requirements
conversation; precedes implementation. Builds directly on 
docs/dev/history/technical-design-review-hub.md (the step registry/hub this slots into), 
docs/dev/history/technical-design-review-master-detail.md (the shared list/detail shell this reuses
unchanged) and the Google Calendar feature (storage/googleCalendarCache.ts,
ui/GoogleCalendarPanel.tsx) as the precedent for "read a low-trust external
mail source over a plaintext credential, explicit-tap-only."

## 1. Scope

v1 (this doc): list all INBOX mail inside a new Review Hub step; create one
or more Todo/Meeting items per email via the existing `QuickAddWidget`
(destination: Inbox, or a Project/Area via the existing `#tag` abbreviation
quick-file — no destination picker); save the mail body and/or attachments
as linked files sitting in that destination's own `Todos`/`Meetings`
subfolder; archive a message in Gmail with one manual tap, independent of
whether anything was created from it.

Explicitly out of scope for v1: creating or applying a Gmail label that
matches a Project/Area. That is a materially bigger feature (label
creation, name-mapping/escaping, rename-drift handling) and stays a
separate, later design — not something this pass scopes or blocks on
(see §11).

## 2. Settings & credentials

New `GtdParaSettings` fields (domain/settings.ts), following the exact
precedent `googleCalendarIcsUrl` already set — plaintext AsyncStorage, same
trust level as everything else in that file, flagged the same way in its own
doc comment:

```ts
gmailEmail: string;          // '' if not configured
gmailAppPassword: string;    // Google App Password, not the account password
gmailImapHost: string;       // default 'imap.gmail.com' — advanced/rarely edited
gmailHideHandled: boolean;   // mirrors hideDoneProjectTasks's default-false convention
```

Settings UI (screens/Settings.tsx): a new "Gmail" sub-tab beside the existing
Folders/Focus/Calendar/Templates tabs, styled exactly like the Calendar
tab's single `googleCalendarIcsUrl` field — two `TextInput`s (email,
app-password with `secureTextEntry`) plus a hint line ("Create an app
password at myaccount.google.com/apppasswords — your regular Gmail password
won't work here") and the same "first sync asks for network access" note
Calendar already shows. No "test connection" button, consistent with
Calendar's own minimalism — the first Refresh tap in the review step is the
test. See §10 for the settings-screen mockup.

## 3. Review Hub registry entry

New step id `gmailInbox` in `domain/reviewSteps.ts`'s `ReviewStepId` union,
inserted into `REVIEW_STEPS` immediately before `'inbox'` (Tilman: "I would
put this step before cleaning up the inbox, so anything going to inbox can
later be assigned manually"):

```ts
{id: 'gmailInbox', title: 'Gmail inbox', kind: 'backlog'},
```

`kind: 'backlog'` — an empty Gmail INBOX auto-counts as reviewed, same as
every other backlog step; this needs no special-casing since "empty" is
just `emails.length === 0` after fetch, exactly like `meetingsCloseOut`'s
count function.

Two new `ReviewSummaryCounts` fields (recap numbers only — deliberately
coarse, same "don't overcomplicate" bar the rest of that interface holds
itself to):

```ts
gmailItemsCreated: number; // Todos + Meetings created from an email this visit
gmailArchived: number;     // messages archived in Gmail this visit
```

(`archived` already exists on `ReviewSummaryCounts`, but it means "a
Project/Area archived" — a same-named-but-different concept, so it is not
reused here.)

`buildReviewStepCounts` (storage/reviewAggregate.ts) gets one more entry:
the live INBOX count from the Gmail cache (§4), same shape every other
step's count function already has.

## 4. IMAP transport & HTML-to-text: recommended implementation

Resolved. Gmail IMAP is a stateful TCP+TLS protocol, not a fetch() call —
a materially different shape from the Calendar feature's plain HTTPS GET
of an ICS file. Rather than reaching for a pure-JS IMAP package (raw
sockets in JS need `react-native-tcp-socket` underneath, and pure-JS IMAP
clients like `emailjs-imap-client` were built for browser/WebSocket
transports and are finicky to adapt to a raw RN socket, particularly
around STARTTLS timing), the recommended path uses the fact that this is
already an Android-native RN plugin host (sn-plugin-lib) with room for a
small additional native module, the same way PluginFileAPI/PluginNoteAPI
already bridge native capability to JS:

- **IMAP client: JavaMail's `gimap` provider**
  (`com.sun.mail:gimap` + `com.sun.mail:android-mail` +
  `com.sun.mail:android-activation`). This is a Gmail-specific IMAP
  provider built into JavaMail specifically for Gmail's extensions —
  `GmailFolder`/`GmailMessage` give direct access to `X-GM-LABELS`,
  `X-GM-MSGID`, `X-GM-THRID`, and moving a message out of `INBOX` (§6's
  archive) is a single `copyMessages`/label-removal call, not hand-rolled
  `STORE`/`MOVE` command strings. It's mature, well-documented, and
  handles TLS/OAuth/App-Password auth, `BODYSTRUCTURE` parsing and
  attachment streaming natively — all four capabilities this feature
  needs (list, fetch body, fetch attachments, archive) come from one
  well-trodden library instead of stitching several JS pieces together.
- A small new native module (e.g. `GmailImapModule`) exposes exactly four
  methods to JS: `listInboxMessages()`, `fetchMessageBody(uid)`,
  `fetchAttachment(uid, partId)`, `archiveMessage(uid)` — a narrow
  surface, mirroring the existing PluginFileAPI/PluginNoteAPI bridge
  pattern rather than exposing raw JavaMail objects to JS.
- **HTML-to-text: also native, via Jsoup** (`org.jsoup:jsoup`), rather
  than a separate JS npm library. Since the native module is already
  parsing the fetched MIME body, converting an HTML part to plain text is
  one `Jsoup.parse(html).text()` call (with block-element newline
  handling) done at the same layer, before the string ever crosses the
  JS bridge — one less moving part than shipping and maintaining a
  second, JS-side HTML parser (`html-to-text` et al.) for exactly the
  same job. `fetchMessageBody(uid)` returns already-converted plain text
  (or a `'unsupported'` sentinel — see §5's fallback) directly.

This closes both items that were previously open ("IMAP library choice",
"HTML-to-text library choice") with one coherent architecture decision,
and every mechanic §5/§6 describe below maps onto a JavaMail/gimap/Jsoup
call directly.

## 5. Fetching: cache, refresh, dedup

New `storage/gmailInboxCache.ts`, a thin JS-side cache in front of the
native module's four methods (§4) — modeled directly on
`storage/googleCalendarCache.ts`:

- Explicit-tap-only fetch — no auto-fetch on mount, exactly like
  `GoogleCalendarPanel`'s existing convention. Selecting a row shows
  whatever text/attachment list is already cached for it; a "Load text" /
  "Load attachments" affordance (or auto-load only for the row currently
  open) fetches on demand rather than eagerly for every row in a 7+ email
  list.
- **Permission before every IMAP call, and categorised failures
  (2026-09-21 bugfix).** The Supernote host enforces the plugin's INTERNET
  permission at socket level (`java.net.SocketException: Plugin [...] has no
  NETWORK permission for: <ip>:993`), so `storage/gmailImapNative.ts` routes
  every native call through one gate (`callNative`) that first awaits
  `ensureInternetPermission()` — same call, same timing (right before the
  network operation, never eagerly) as `googleCalendarCache.ts`. Any failure
  leaves that gate as an Error whose message starts with its category
  (`describeGmailFailure`): **No permission**, **Login failed** (bad
  address/app password), **No connection**, or **Gmail error: <raw>** for
  anything unrecognised.
- **Manual refresh only, error stays put (2026-09-21 bugfix).** The step used
  to fetch on step entry AND from an effect that re-fired whenever
  `gmailMessages` was still null — so every failure was retried immediately,
  in a loop, and each retry cleared the error text before it could be read.
  Both auto-fetches are gone. The step's button reads "Load Gmail inbox"
  (never loaded) / "Refreshing… Ns" / "🔄 Refresh (last HH:MM)", exactly like
  `GoogleCalendarPanel`; a failure shows its categorised reason on its own
  line under the button and leaves it there until the next tap.
- No Message-ID-based durable dedup is needed. Archiving (§7) is a real
  IMAP side effect — an archived message is, by definition, gone from
  INBOX and will not reappear on the next fetch — so there is nothing left
  to persistently deduplicate against. What remains is exactly the
  "created a task but haven't archived yet" case within one sitting, and
  that is already covered by `ReviewMasterDetail`'s own per-visit
  `actedOnKeys` (reused unmodified, same as every other step using that
  shell) — no new tracking structure.
- Cache shape: array of `{uid, from, subject, date, snippet, bodyText:
  string | 'unfetched' | 'unsupported', attachments: GmailAttachment[] |
  'unfetched'}`, keyed by IMAP UID (stable within a session; UIDs can be
  reused only after `UIDVALIDITY` changes, which a plain per-session cache
  doesn't need to defend against).

## 6. HTML-to-text fallback

Most inbox mail is HTML, not plain text. Conversion happens natively via
Jsoup (§4) before the body ever reaches JS — a real, lossy step (tables,
images and most formatting don't survive), not a detail to skip past.

Fallback: when a message has no usable plain-text part and conversion
fails or produces unusable output, `fetchMessageBody` returns the
`'unsupported'` sentinel (§5's cache shape), the email text panel shows
"Preview not available for this message" instead of body content, and
"Save email text as file" is disabled for that email specifically. This
does not block anything else — creating Todos/Meetings, saving
attachments, and archiving all work independently of whether the body
converted cleanly.

## 7. Archive — manual, per-row, in v1, no batch action

Resolved: archiving belongs in v1, and it is a manual per-email action,
not gated behind task creation and not automatic. Tilman: "some mails can
be archived right away and they should immediately disappear. Or the user
archives after tasks have been created" — both flows must work.

- UI: a small archive-icon button on each row in the left list (§10's
  mockup), alongside — not replacing — the existing tap-to-select
  behavior. Tapping it does not open the detail panel; it fires the
  archive action directly.
- Mechanics: `GmailImapModule.archiveMessage(uid)` (§4) — JavaMail's
  `gimap` provider removes the `\Inbox` label / moves the message out of
  `INBOX` in one call; no hand-rolled `STORE`/`MOVE` command strings.
- Behavior: optimistic removal from the cached row list the moment the tap
  fires (the row disappears immediately, matching "should immediately
  disappear"), with the native call running behind it; on failure the row
  reappears with a brief inline error rather than silently staying gone.
  No confirmation dialog — Gmail's own archive is trivially reversible
  from the Gmail side, so this follows the same low-friction bar the rest
  of Review's per-row actions already use (Skip, Reviewed).
- **Resolved: no batch action.** "Reviewed" on the whole step does not
  also archive everything handled — Tilman: "no batch archive right
  now." Per-row only, for v1 and until a future request says otherwise.

## 8. Component reuse, and one correction to the earlier mockup

Everything in this section is either "use the existing component
unchanged" or "reuse the existing component at a new call site" — no new
pagination, list-chrome, or add-widget code.

- **Left email list**: `ReviewMasterDetail` + its internal `PagedSection`,
  exactly like the other five converted review steps. This was already
  the plan; nothing changes here except that the archive button (§7) sits
  inside `renderRow`, next to the row content, so it participates in
  `PagedSection`'s existing row/height accounting for free.
- **"Created from this email" list**: a *second* `PagedSection` instance,
  nested inside `ReviewMasterDetail`'s `renderDetail`. This is a new call
  site of an existing component, not new code — but it does need an
  explicit `viewportHeight` (not `PagedSection`'s self-measuring mode),
  because it is one of several stacked siblings in the detail column
  (header, QuickAddWidget, this list, the save-as-file/attachments block,
  the email-text panel) rather than the sole flex:1 child of its parent —
  the same "fresh screen budget" hand-computed-height convention several
  existing `PagedSection` call sites already use.
- **Correction**: the earlier Claude Design mockup invented a "Page 1 of
  2" / "Page 1 of 1" footer caption under both lists. That is not how
  `PagedSection` actually presents itself — it shows a small "+N"
  hidden-count label plus ‹/› arrows, and *both are entirely absent* when
  everything already fits on one page ("if all rows fit the box on one
  page: no arrows appear anyway... these should be mostly not visible" —
  PagedSection's own module doc comment). The final mockup (§10) is
  corrected to match: no page-count text anywhere, arrows/count only when
  there is more to page through.
- **QuickAddWidget**: reused with `fixedDestination={Inbox}`, no new
  props. The already-shipped `#tag` abbreviation quick-file mechanism is
  the entire "type a tag to file into a Project or Area" requirement —
  Row 4 automatically relabels to "+ Add to <Name>" and files it there
  directly. Nothing Gmail-specific needs building here at all.

## 9. Linked files: note, attachments, and the "Link" picker

> **Update 2026-09-21:** the email text is no longer saved as a `.txt` (the
> device cannot open `.txt` via `openFile`, so the clip did nothing). It is
> now saved as a multi-page `.note` named `<date> <subject>.note` - see
> [technical-design-gmail-email-note.md](technical-design-gmail-email-note.md).
> The `saveGmailEmailAsFile` description below is historical; the attachment
> parts of this section are unchanged.

**Implemented as: Resources, not the destination's Todos/Meetings
subfolder.** The plan below originally called for the mail body/attachments
to land beside `project.txt`/`area.txt` via `createLinkedNote`
(storage/noteLinks.ts). Implementation instead uses a dedicated new module,
`storage/gmailAttachments.ts`, that writes into two new Resources
subfolders and hands back a plain `linkedFile` string via
`storage/linkedFiles.ts`'s existing `toLinkedFile` — no schema change, same
end result (a Task/Meeting's `linkedFile` points at the saved file), just a
different physical location:

- `saveGmailEmailAsFile(paths, subject, bodyText)` writes the converted
  plain-text body to `<Resources>/Gmail/<subject>.txt`
  (`GMAIL_EMAILS_SUBFOLDER`).
- `saveGmailAttachment(paths, subject, fileName, base64Content)` writes one
  attachment's raw bytes to `<Resources>/Gmail attachments/<subject>/
  <filename>` (`GMAIL_ATTACHMENTS_SUBFOLDER`), grouped by email subject so
  a multi-attachment email's files stay together instead of landing flat
  in Resources' root.

Reasoning for the change: the email's text/attachments aren't really a
Todos/Meetings-subfolder artifact the way a project/area's own note is —
they're a copy of something that lives in Gmail, saved here only because
the plugin has no other way back to it later (once archived/filed in
Gmail's own UI, the plugin can't refetch it). Resources is where the rest
of this plugin already keeps material that supports items without being
"owned" by one destination, so both new subfolders sit there instead. Both
saves are gated identically to the original plan — available only once at
least one Todo/Meeting exists for that email, since a save always happens
in the context of "link this to the item(s) created so far," never
speculatively.

Linking a saved file to a created item reuses `linkedFile` exactly as it
exists today — **no schema change**. `Task`/`Meeting.linkedFile` is a
single string path, and Tilman's own framing of the picker already matches
that: "select *either* the note or any of the attachments" is a one-of-N
choice, not a multi-select. Concretely: each created item's row (in the
"Created from this email" list) shows a small "Link" button instead of the
earlier checkbox design; tapping it opens a short inline picker listing
every file saved for this email so far (the note, if saved; each saved
attachment) plus "None", and picking one sets that item's `linkedFile` —
unchanged plumbing, since a linked file was always "just a pointer," so
several items can each point at the same or different saved files with no
new concept required.

**Resolved: no multiple files per item, for now.** Because `linkedFile` is
single-valued, an item can link the note *or* one attachment, never both
at once — Tilman: "no multiple files right now." No schema change is
planned; revisit only if a real case comes up where one item genuinely
needs both.

**Resolved: attachment MIME-type scope.** Only file types the Supernote
device can actually display are offered a "Save as file" action —
Tilman: "only allow pdf and epub and txt and doc/docx as only these are
supported on device." Concretely, an allow-list matched against the
attachment's MIME type / extension:

```ts
const SUPPORTED_ATTACHMENT_TYPES = [
  {mime: 'application/pdf', ext: '.pdf'},
  {mime: 'application/epub+zip', ext: '.epub'},
  {mime: 'text/plain', ext: '.txt'},
  {mime: 'application/msword', ext: '.doc'},
  {mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx'},
];
```

An attachment outside this list still appears in the Attachments section
(so the user can see the email had it), but its "Save as file" action is
replaced by a greyed, non-interactive "Not viewable on this device" label
— the same transparency-over-hiding convention §6's HTML-fallback already
uses, rather than silently omitting it.

## 10. Mockup

Three artboards updated/added in the existing Claude Design canvas
(`GtdPara Review — Gmail Inbox Step`): the empty-selection and
items-already-created detail states (now corrected per §8 and extended
with the Link picker, attachments and archive button from §7/§9), plus a
new Settings artboard for §2's Gmail credentials tab. A fourth,
genuinely-interactive artboard demonstrates the full flow end to end
(select → add → archive → link) as a clickable prototype, since the
interaction surface here is dense enough that static states undersell how
it behaves. The attachment mockup shows both a supported file (a working
"Save as file") and an unsupported one (greyed "Not viewable on this
device"), per §9's resolved MIME scope.

## 11. Status: nothing left blocking implementation

Every item that was open is now resolved:

- IMAP transport and HTML-to-text: JavaMail's `gimap` provider + Jsoup,
  behind a small native module (§4).
- Archive: manual, per-row, v1; no batch action (§7).
- Attachment MIME scope: pdf / epub / txt / doc / docx only; anything
  else shows as unsupported rather than being hidden (§9).
- `linkedFile` stays single-valued — no multiple files per item (§9).
- Gmail label-per-Project/Area stays explicitly out of scope for this
  pass (§1) — a separate, later design, not a v1 blocker.

Nothing here requires a further design decision before implementation
starts.
