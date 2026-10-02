# Technical Design: Split shared notes by nested tag (file-name placeholders + confirm before creating a note)

Status: **requirements decided 2026-10-02** (chat). Design for review - not yet implemented.

## 1. Requirements as decided

Use case: several coaching clients, all in **one Area**. Each client's session notes should be collected in one
shared `.note` per client (optionally per year/quarter/month), without one Tag Rule per client.

1. **Nested tags.** Sessions are tagged `#coaching/sabina`. One Tag Rule on `coaching` matches every
   `#coaching/<anything>`; the part after the slash (the *subtag*) picks the file. Obsidian treats the same
   syntax as a nested tag.
2. **File-name placeholders.** The rule's existing "Shared file name" field becomes a template with
   `{subtag}`, `{year}`, `{quarter}`, `{month}` - e.g. `Coaching {subtag} {year}` -> `Coaching sabina 2026.note`.
   There is no separate "split by tag" switch. Tapping a placeholder chip under the field inserts it at the cursor.
3. **No subtag** (`#coaching` alone): `{subtag}` resolves to empty, so the item lands in `Coaching 2026.note`.
   No special case.
4. **Confirm before creating.** When a Todo/Meeting has no note yet, tapping its note icon no longer creates
   one immediately. The status slot first says what will happen ("Rule Coaching: new file Meetings/Coaching
   sabina 2026.note" or "... new page in ..."), with a confirm button and the usual ✕. Confirm creates and
   opens the note as today; ✕ creates nothing, so the user can fix the tag first. When a note already
   exists, the icon opens it directly, as today.
5. **Once created, it stays.** A page stays in the file it was created in, even if the tag, the date or the
   rule changes later. The Integrity Check does not report this (it may become a candidate later).

## 2. Current state (relevant code)

- **Tag parsing**: `domain/markdown.ts` `TAG_RE = /#([a-z0-9][\w-]*(?::[\w-]+)?)/gi`. **`/` is not part of a
  tag today**: `#coaching/sabina` parses as tag `coaching` plus plain text `/sabina`. `extractTags`,
  `splitTextWithTags`, `stripAllTags`, `extractContextTags` and the Quick Add recent-tag chips all build on
  `TAG_RE`.
- **Rule matching**: `domain/noteTemplate.ts` `resolveNoteTemplate` - exact, case-insensitive tag equality,
  first enabled rule in list order wins, else the context's default rule. It is the only rule-matching function
  (also used for backgrounds in `storage/noteLinks.ts` and for content population in
  `storage/meetingNoteContent.ts`).
- **Shared file name**: `resolvedSharedFileName(definition)` (rule field or rule name) ->
  `sanitizeFileNameComponent` (strips `\/:*?"<>|#`) in `resolveItemNoteAnchor` (`storage/meetingNoteContent.ts`).
- **`resolveItemNoteAnchor`** (7 branches, see its doc comment): for a shared target it **recomputes the file
  from the current rule on every open** and calls `ensureSharedNoteFile` (which creates the file if missing)
  *before* looking at the stored anchor. Consequences today: renaming a rule's file name orphans earlier pages
  (they get "recreated" in the new file), and the first tap creates the file with no confirmation.
- **Call sites** of `openOrCreateMeetingNote` / `openOrCreateTodoNote` (9): `DailyView.tsx` (2),
  `ProjectDataPanel.tsx` (2), `InboxScreen.tsx` (2, `forceOwnTarget`), `ReviewScreen.tsx` (2 Inbox-to-zero,
  `forceOwnTarget`), `usePlanningScreen.ts` (1, serves Week/Month). All run inside a `run…Action` try/catch
  and persist `notePath` when `changed`.
- **Status slot** (`ui/status/`): `kind: 'confirm'` with one primary action and `onCancel` (✕) exists; the
  `new Promise(resolve => statusApi.show(...))` pattern is already used (`ReviewScreen.handleArchiveItem`).
  User-facing file-change texts belong in `domain/fileChangeText.ts` (policy §3).

## 3. Design

### 3.1 Nested tags (domain/markdown.ts, domain/flowState.ts)

```ts
// one or more "/segment" parts before the optional ":value"
const TAG_RE = /#([a-z0-9][\w-]*(?:\/[\w-]+)*(?::[\w-]+)?)/gi;
```

- `#coaching/sabina` -> one tag `coaching/sabina` (lowercased like every tag). Deeper nesting
  (`#coaching/sabina/2026`) is allowed and parses as one tag.
- A trailing slash (`#coaching/`) stays tag `coaching` + text `/` (a segment needs at least one character).
- **Whole-tag guards** must also treat `/` as "the tag continues":
  - `flowState.ts` `bareTagRe`: lookahead becomes `(?![\w/-]|:[\w-])`, so `#now/x` is not `#now`.
  - `markdown.ts` `removeTagFromText`: replace the trailing `\b` with `(?![\w/:-])`. Otherwise removing the
    chip `#coaching` in Quick Add would also cut `#coaching` out of `#coaching/sabina` and leave `/sabina`.
- `isContextTag`: unchanged - `coaching/sabina` is a context tag. It shows as one chip in Quick Add's
  recent tags (one tap inserts the full nested tag) and as one tappable tag in rows (Daily filter on exactly
  that tag).
- Not changed: `FLOW_STATE_TAG_RE` / `DUE_TAG_ANY_RE` (reserved words nobody nests).

**Upgrade effect**: text already containing `#foo/bar` used to carry tag `foo`; it now carries `foo/bar`.
Tag Rules still match (prefix rule, §3.2); a Daily context filter on `foo` no longer includes those items.
This goes into the CHANGELOG as an Upgrade note.

### 3.2 Rule matching with prefix (domain/noteTemplate.ts)

```ts
/** True when itemTag is ruleTag itself or nested under it (ruleTag/...). Both already lowercased. */
export function tagMatchesRuleTag(itemTag: string, ruleTag: string): boolean;
// itemTag === ruleTag || itemTag.startsWith(ruleTag + '/')
```

`resolveNoteTemplate` uses it instead of `includes`. `coachingx` does not match `coaching`; `coaching` does
not match a rule on `coaching/sabina` (matching only goes from parent to child). List order and the default
rule are unchanged.

```ts
/** The first item tag nested under any of the rule's tags, with the rule-tag prefix removed ("sabina"), or "" if none. */
export function ruleSubtag(itemTags: string[], ruleTags: string[]): string;
```

- Item tags are scanned in text order; the first nested match wins (`#coaching/sabina #coaching/tom` -> `sabina`).
- Deeper nesting keeps the rest: `coaching/sabina/2026` -> `sabina/2026` (the `/` becomes a space in the file name
  through `sanitizeFileNameComponent`).
- The subtag is used **lowercased**, like every tag (deterministic, so `#coaching/Sabina` and `#coaching/sabina`
  can never produce two files that differ only in case).

### 3.3 File-name template (domain/sharedNotePages.ts, pure)

```ts
export interface SharedFileNameInput {
  template: string;      // resolvedSharedFileName(definition): field, or rule name if blank
  ruleName: string;      // fallback when the result is empty
  subtag: string;        // ruleSubtag(...), "" if none
  date: string;          // YYYY-MM-DD - meeting.date for meetings, today for todos
}
export function renderSharedFileName(input: SharedFileNameInput): string;
```

| Placeholder | Value | Example (2026-10-02) |
|---|---|---|
| `{subtag}` | subtag, lowercased | `sabina` |
| `{year}` | 4-digit year | `2026` |
| `{quarter}` | `Q1`-`Q4` | `Q4` |
| `{month}` | 2-digit month | `10` |

- Placeholders are case-insensitive (`{Year}` works). Unknown `{…}` text is left as typed.
- After substitution: `sanitizeFileNameComponent` (storage side, as today) + whitespace collapse + trim. So
  `Coaching {subtag} {year}` with no subtag -> `Coaching 2026`.
- Empty result -> rule name. Example: the field is just `{subtag}` and the item has `#coaching` with no subtag;
  without this the file would be called `.note`.
- The date for a **meeting** is its own date (a December session prepared in January goes into the December
  year/quarter). A **todo** has no date, so it uses the day the note is created.

`resolveItemNoteAnchor` gets two new params, `fileDate` and the item's `tags` (already passed), and computes the
file name through `renderSharedFileName` instead of `resolvedSharedFileName` directly.

### 3.4 Reopening uses the stored file (decision 5)

The relative file path is already stored in every item's anchor (`Meetings/Coaching sabina 2026.note#<keyword>`).
New rule in `resolveItemNoteAnchor`:

- **The item already has a shared anchor** -> use **`anchor.filePath`**, never the file the rule would pick now.
  This applies even if the rule no longer matches, is now an own-target rule, or was renamed. Branches 4-7
  (open, recreate, lazy keyword rename) work on that file as they do today.
- **No anchor yet** -> the rule decides (own or shared, file via §3.3), as today.

Detecting "has a shared anchor" reuses the existence-verified logic `resolveNotePath` already has (round 3 of
the `#` bugfix): if the literal `notePath` exists as a file, it is an own note (old file names with `#`);
otherwise, if `parseSharedNoteAnchor` returns an anchor, it is shared. This logic is pulled into one helper,
`classifyNotePath(itemPath, notePath) -> {kind: 'none'} | {kind: 'own'} | {kind: 'shared', anchor}`, in
`storage/noteLinks.ts`, used by both `resolveNotePath` and `resolveItemNoteAnchor`.

Side benefit: renaming a rule's "Shared file name" no longer orphans earlier pages.

### 3.5 Confirm before creating (plan, then create)

`resolveItemNoteAnchor` is split into **plan** (reads only) and **create** (writes):

```ts
type NoteCreationPlan =
  | {kind: 'open'}                                    // has a note: no confirm (branches 2, 4-7)
  | {kind: 'link-page'; file: string}                 // shared file has a page with this keyword already (branch 3 hardening): no confirm, nothing is created
  | {kind: 'new-own-file'; file: string; ruleName: string | null}   // branch 1
  | {kind: 'new-page'; file: string; ruleName: string}              // branch 3, file exists
  | {kind: 'new-shared-file'; file: string; ruleName: string};      // branch 3, file missing
// file = path relative to the Project/Area, e.g. "Meetings/Coaching sabina 2026.note"
```

- The planning step for a shared target uses `fileExists` and, if the file exists, `findKeywordPage`. It does
  **not** call `ensureSharedNoteFile` any more; that moves into the create step.
- For own notes, planning computes the final name with `collisionFreeName` (as `createLinkedNote` does), so the
  text shows the real name. `createLinkedNote` gets an optional precomputed file name.
- `openOrCreateMeetingNote` / `openOrCreateTodoNote` get `options.confirmCreate?: (plan) => Promise<boolean>`.
  It is called only for the three `new-*` kinds. `false` -> return `{changed: false, cancelled: true}`: nothing
  created, nothing persisted, nothing opened. Without `confirmCreate` (no caller after this change, but keeps the
  function usable from non-UI code) it behaves as today.
- Recreate branches (5, 7: the user deleted the page) stay **without** a confirm, as today. They only re-create
  what this item already had.

**Texts** (`domain/fileChangeText.ts`, pure):

| Plan | Slot line | Button |
|---|---|---|
| `new-shared-file` | `Rule Coaching: new file Meetings/Coaching sabina 2026.note` | `Create` |
| `new-page` | `Rule Coaching: new page in Meetings/Coaching sabina 2026.note` | `Add page` |
| `new-own-file` with rule | `Rule Coaching: new note Todos/Call Sabina.note` | `Create` |
| `new-own-file`, no rule | `New note Todos/Call Sabina.note` | `Create` |

The slot line is tail-truncated; the tap-to-expand `detail` gives the full path including the Project/Area
(`displayPath`).

**UI**: one small hook, `ui/useNoteCreateConfirm.ts`:

```ts
export function useNoteCreateConfirm(id: string): (plan: NoteCreationPlan) => Promise<boolean>;
```

It wraps `statusApi.show(id, {kind: 'confirm', …})` in a promise (same pattern as `handleArchiveItem`). If a
second note icon is tapped while a confirm is still showing, the earlier promise resolves `false` first, so
nothing is left hanging and only the latest request is shown. When the tab is hidden, the slot calls `onCancel`,
which also resolves `false`.

All 9 call sites pass `{confirmCreate}` from the hook. Their `run…Action` wrapper and the `if (changed)`
persistence stay as they are. Inbox call sites (`forceOwnTarget`) get the confirm too (own-note texts).

**Logging** (policy §5): `log('openOrCreate…Note: plan', plan.kind)` and `…: cancelled` / `…: created`, with no
file names (they contain client names).

### 3.6 Settings - Tag Rules form (screens/Settings.tsx)

Under "Shared file name", add one row of tappable placeholder chips and one preview line:

- **Chips** `{subtag}` `{year}` `{quarter}` `{month}` (same chip look as Quick Add's tag chips). Tapping a chip
  inserts the placeholder **at the cursor** of the "Shared file name" field (end of the text if the field was
  never focused), adding a space on whichever side needs one - the same rule `insertTagAtPosition` uses for
  tags. The cursor is placed right after the inserted placeholder.
- **Preview** `e.g. Meetings/Coaching client 2026.note` - rendered with `renderSharedFileName` for subtag
  `client` and today's date, location as chosen; it updates as the field changes.

Cursor insertion: `ui/ClipboardTextInput.tsx` already tracks the field's last selection (`lastSelectionRef`) and
splices pasted text in with `spliceAtSelection` (`domain/clipboardText.ts`). It gets an optional imperative
handle (`forwardRef`) with `insertAtCursor(text)`, which runs the same splice path as Paste. No new text logic.

There is no new setting and no stored-data migration: `sharedFileName` already exists and is per profile.
Existing rules (no placeholders) resolve exactly as before. The chip row and preview line need to fit the A5 X
budget of the left column (design-device-rendering §5-6); check this on the device.

## 4. Edge cases

| Case | Behavior |
|---|---|
| `#coaching` only, template `Coaching {subtag} {year}` | `Coaching 2026.note` |
| `#coaching/sabina #coaching/tom` | first one wins -> `sabina` |
| `#Coaching/Sabina` | tag lowercased -> `Coaching sabina …` |
| Typo `#coaching/sabine` | confirm shows "new file … sabine …" -> ✕, fix tag, tap again |
| Tag, date or rule changed after the note exists | page stays in its file (§3.4); keyword lazily renamed in place, as today |
| Meeting date moved across a year/quarter boundary | stays in the original file (§3.4) |
| Note already created, then the user deleted its page or the whole shared file in Supernote | next tap on the note icon: a fresh page (and the file, if it's gone) is recreated under the item's stored link, with the "Recreated <date>: page keyword not found" line; the deleted handwriting is gone; no confirm (as today) |
| Inbox item | always own note (`forceOwnTarget`, unchanged); stays an own note after filing (decision 5). A coaching session's note should therefore be created after filing it to the Area |
| Two rules match (`coaching` and another rule on `sabina`) | first enabled rule in list order wins (unchanged) |
| Old text `#foo/bar` | now tag `foo/bar`; Daily filter on `foo` no longer includes it (Upgrade note) |
| File name field is just `{subtag}` (no fixed text) and the item has `#coaching` only | the name would be empty, so the rule name is used: `Coaching.note` |
| `#coaching/` | tag `coaching` + text `/` -> no subtag |
| Note icon tapped again while confirm open | earlier confirm resolves "no", the new one shows |

## 5. Files

| File | Change |
|---|---|
| `src/domain/markdown.ts` | `TAG_RE` with `/` segments; `removeTagFromText` lookahead |
| `src/domain/flowState.ts` | `bareTagRe` lookahead |
| `src/domain/noteTemplate.ts` | `tagMatchesRuleTag`, `ruleSubtag`; `resolveNoteTemplate` uses prefix match |
| `src/domain/sharedNotePages.ts` | `renderSharedFileName` |
| `src/domain/fileChangeText.ts` | `NoteCreationPlan` texts |
| `src/storage/noteLinks.ts` | `classifyNotePath`; `resolveNotePath` uses it; `createLinkedNote` optional precomputed name |
| `src/storage/meetingNoteContent.ts` | plan/create split, anchor file on reopen, `fileDate`, `confirmCreate`, `cancelled` |
| `src/ui/useNoteCreateConfirm.ts` (new) | confirm hook |
| `src/screens/{DailyView,ProjectDataPanel,InboxScreen,ReviewScreen}.tsx`, `src/screens/usePlanningScreen.ts` | pass `confirmCreate` (9 call sites) |
| `src/screens/Settings.tsx` | placeholder chips + preview |
| `src/ui/ClipboardTextInput.tsx` | optional `insertAtCursor` handle (forwardRef) |
| `__tests__/…` | see §6 |
| `docs/user/tags.md`, `docs/user/note-templates.md`, `CHANGELOG.md`, `docs/dev/design-overview.md` | §6 of the policy |

## 6. Test plan

**Automated (Jest, `__tests__/`)**
- Tags: `extractTags` / `splitTextWithTags` / `extractContextTags` with `#a/b`, `#a/b/c`, `#a/`, `#a/b:c`;
  `removeTagFromText('x #coaching/sabina', 'coaching')` leaves the text unchanged; `setBareTag` / `stripBareTags`
  do not touch `#now/x`.
- `tagMatchesRuleTag`, `resolveNoteTemplate` with nested tags (parent matches child, not `coachingx`, not
  child -> parent), `ruleSubtag` (first wins, deeper nesting, none).
- `renderSharedFileName`: every placeholder, case-insensitive, unknown token kept, empty subtag, empty result ->
  rule name, quarter boundaries (03-31 / 04-01, 12-31).
- `fileChangeText` texts for all four plan kinds.
- Existing tests stay green (`npx tsc --noEmit`, `npm test`, `npm run test:scripts` for the docs).

**On the device (demo space)**
1. Rule "Coaching": Meeting, tag `coaching`, Shared file. Type `Coaching `, tap the `{subtag}` chip, then the
   `{year}` chip -> field reads `Coaching {subtag} {year}`. Put the cursor after `Coaching`, tap `{month}` ->
   inserted there, not at the end. Preview line shows `Meetings/Coaching client 2026.note` (for the first version).
2. Meeting `Session #coaching/sabina` in the Coaching Area -> note icon -> slot: "new file …Coaching sabina
   2026.note" -> Create -> note opens on page 1.
3. Second Sabina meeting -> slot: "new page in …" -> Add page -> opens on the new page, chronological order.
4. Meeting `#coaching/sabine` -> slot shows "sabine" -> ✕ -> no file, no notePath. Fix the tag -> "new page in …sabina…".
5. Meeting `#coaching` only -> `Coaching 2026.note`.
6. Reopen any of them -> opens directly, no slot message.
7. Change the rule's file name to `Coaching {subtag}` -> reopening old meetings still opens their 2026 file.
8. Own-note todo with no rule -> "New note Todos/….note" -> Create.
9. Quick Add: recent chips show `#coaching/sabina` as one chip; removing the `#coaching` chip does not damage
   `#coaching/sabina`.
10. Week/Month and Review Inbox-to-zero note icons show the confirm too.

## 7. Implementation plan (each step ends with tsc + Jest passing)

1. **Nested tags**: §3.1 + §3.2 (`TAG_RE`, guards, `tagMatchesRuleTag`, `ruleSubtag`, `resolveNoteTemplate`) +
   tests. Small and independent; changes how existing text parses, so it gets its own commit and Upgrade note.
2. **File-name template + anchor file on reopen**: `renderSharedFileName`, `classifyNotePath`, the
   `resolveItemNoteAnchor` changes of §3.3/§3.4, Settings placeholder chips + preview (incl. `ClipboardTextInput.insertAtCursor`), tests.
3. **Confirm before creating**: plan/create split (§3.5), `fileChangeText` texts, `useNoteCreateConfirm`, 9 call
   sites, logging.
4. **Docs + device test**: help pages (tags: nested tags; note templates: placeholders and the confirm step),
   CHANGELOG (New: nested tags, file-name placeholders; Changed: note icon asks before creating; Upgrade note:
   `#a/b` parsing), design-overview §2/§5; device checklist §6; "As built" section.

## 8. Out of scope

- Integrity Check finding "page is in a file the rule would not pick any more" (decision 5: possible later).
- Daily filter on a parent tag (`#coaching`) also showing children (`#coaching/*`) - goes to the backlog.
- Moving a page to another file (no API, as in the shared-pages design).
- Subtags for own-note file names or folders.
