# Technical Design: Shared Note Pages (Tag Rule option to file Todo/Meeting notes as pages in one shared note)

Status: **requirements settled 2026-09-22** (chat, see [[feature_shared_note_pages]]). Not yet implemented. This is a new, MVP-scoped mechanism - Tilman's own framing is that it needs real usage to be learned from, so §11 deliberately keeps v1 small and lists the natural v2 extensions separately rather than building them speculatively.

## 1. Goals and motivation

Today every Todo/Meeting that gets a linked note gets its **own** `.note` file (`storage/noteLinks.ts`'s `createLinkedNote`, one file per item, named from the meeting's date+title or the todo's text). For frequent, similar items (a recurring "Daily" meeting, say) this produces many small files.

New Tag Rule option: instead of a fresh file per item, certain rules write their note content as a new **page** inside **one shared `.note` file per Project/Area**, and locate that page later via the Supernote host's per-page keyword index (`PluginFileAPI.getKeyWords`/`insertKeyWord`/`deleteKeyWord`) rather than a filename. This cuts file count and lets the user page through a shared note to see e.g. what happened in yesterday's Daily.

Confirmed in chat (2026-09-21/22):
- Keywords are pure metadata, not rendered on the page; several keywords per page are fine.
- The shared file still splits **per Project/Area** (one "Daily.note" per Project, not one global file) - keeps archiving/moving simple and keeps a Project/Area's information together. Rolling by date is a deliberately deferred v2 option (§11), not built now.
- Return-to-origin (`feature_return_to_origin`) only cares about the **file**, not the page - no change needed there beyond what already works.
- Existing notes are never migrated; the shared-note target only applies to notes created after a rule is switched to it.

## 2. Data model

### 2.1 `NoteCreationDefinition` (domain/noteTemplate.ts) gains a note-target block, Meeting/Todo contexts only (Project/Area definitions are untouched - shared targets don't apply there):

```ts
export type NoteTarget = 'own' | 'shared';
export type SharedNoteFolder = 'subfolder' | 'root'; // subfolder = existing Meetings/Todos subfolder; root = Project/Area root

// on NoteCreationDefinition:
noteTarget: NoteTarget;            // default 'own' - existing behavior, no migration needed
sharedFileName?: string;           // e.g. "Daily"; blank => falls back to the rule's own name
sharedFileFolder?: SharedNoteFolder; // default 'subfolder'
```

`sharedFileName`/`sharedFileFolder` are only read when `noteTarget === 'shared'`. Resolution mirrors the folder math `createLinkedNote` already does: `subfolder` → `<itemPath>/Meetings|Todos/<fileName>.note` (context picks Meetings vs Todos, same as today); `root` → `<itemPath>/<fileName>.note`.

### 2.2 Anchor encoding - reusing `Task.notePath`/`Meeting.notePath`, no schema change

`notePath` is already an opaque string (`domain/markdown.ts`'s `extractNoteLink`/`appendNoteLink`, `→ [[...]]` on the line). For a shared-target note it stores **both** the relative file path and the keyword that locates this item's page, joined by `#`:

```
Meetings/Daily.note#2026-09-21 Daily
```

New pure helpers in `domain/noteTemplate.ts` (or a small new `domain/sharedNotePages.ts` - final placement is an implementation-time call, not a requirements decision):

```ts
export interface SharedNoteAnchor { filePath: string /* relative, as stored today */; keyword: string }
export function parseSharedNoteAnchor(notePath: string): SharedNoteAnchor | null; // split on the LAST '#' - see §8 risk on '#' in titles
export function buildSharedNoteAnchor(filePath: string, keyword: string): string;
```

`resolveNotePath` (storage/noteLinks.ts) gains one line: if the value contains a shared-note anchor, resolve against `anchor.filePath`, not the raw string. Every other `notePath` consumer that only cares about "does a note exist / open it" (Files-pane-style existence checks, if any) needs the same one-line unwrap - flagged as a call-site audit item for implementation, not spelled out further here since it's mechanical.

Own-target notes are completely unaffected - no `#`, `parseSharedNoteAnchor` returns `null`, everything behaves exactly as today.

## 3. Keyword derivation (pure, domain-level)

- **Meeting:** `` `${meeting.date} ${meetingDisplayTitle(meeting)}` `` - reuses `meetingDisplayTitle` (already strips `#prepped`/`#reviewed`/flow tags, same function `meetingNoteBaseName` uses today) so state tags never leak into the keyword. Date first, so the leading `YYYY-MM-DD` is parseable for chronological insertion (§4).
- **Todo:** the same stripped title `todoNoteBaseName` already computes (flow-state/due/reserved tags removed, free tags kept) - no date. Two todos with the same resulting title in the same rule/file intentionally resolve to the **same keyword and the same page** (confirmed: "probably they are related anyway").
- Meetings with the same date+title are the documented "usually a duplicate" case and will also collide onto one page - accepted, not guarded against.

No filename-style sanitization is applied to keywords (they're not filenames) - open risk about `#`, very long titles, emoji, etc. is a device-verification item (§10), not resolved here.

## 4. Page engine - `storage/sharedNotePages.ts` (new)

```ts
export async function ensureSharedNoteFile(folderPath: string, fileName: string, background: string): Promise<string>; // absolute path; ensureFolderExists + createNote if missing (mirrors createLinkedNote's own folder/create logic), else returns the existing path untouched

export async function findKeywordPage(filePath: string, keyword: string): Promise<number | null>;
// getNoteTotalPageNum(filePath) -> build [0..n-1] -> ONE getKeyWords(filePath, allPages) call -> first exact match

export async function insertChronologicalPage(filePath: string, keyword: string, template: string, isDated: boolean): Promise<number>;
// isDated=true (meetings): read all keywords once, parse each one's leading YYYY-MM-DD, find the first page whose date is later than the new keyword's date, insert there (ties -> after existing same-date pages, i.e. append within the day)
// isDated=false (todos): always insert at the end (getNoteTotalPageNum as the index)
// then insertNotePage({notePath: filePath, page: index, template}) + insertKeyWord(filePath, index, keyword)
// returns the inserted index

export async function renameKeywordAt(filePath: string, page: number, oldKeyword: string, newKeyword: string): Promise<void>;
// getKeyWords for just [page], find the KeyWord.index matching oldKeyword, deleteKeyWord then insertKeyWord
```

Every call is logged (attempt + success/failure + timing) into the same on-device debug-log mechanism `bugfix_createnote_blocked` already built for `createNote` - this feature's first device run doubles as the outstanding API spike (no separate throwaway spike branch, per Tilman's request to go straight to an MVP).

## 5. Content population - `page` becomes a real parameter

`storage/meetingNoteContent.ts`'s `populateNoteFromDefinition`, `populateMeetingNoteBlockFallback`, `refreshMeetingNoteBlock`, `refreshTodoNoteBlock` all currently hardcode `page: 0` (element `pageNum`, `getElements(0, notePath)`, `insertElements(notePath, 0, ...)`). Each gains a `page: number` parameter threaded through to those three call sites. Behavior for existing own-note callers is unchanged (they keep passing `0`); shared-note callers pass the resolved page from §4/§6.

## 6. Open-or-create: one new entry point, reused by all 5 screens

Today each of DailyView/ProjectDataPanel/WeekView/InboxScreen/ReviewScreen has its own note-icon tap handler that either calls `createLinkedNote` (first tap, no `notePath` yet) or `openPath(resolveNotePath(...))` (subsequent taps) - the same pattern `feature_note_templates`' Phase 3 wiring already touched at 8 call sites. This feature adds one shared branch, `storage/noteLinks.ts`'s new `openOrCreateItemNote(item, itemPath, kind, settings)`:

1. Resolve the definition (`resolveNoteTemplate`, as today). If `definition.noteTarget !== 'shared'`, delegate to exactly today's own-note logic - no behavior change.
2. Otherwise resolve `folderPath`/`fileName` (§2.1) and `ensureSharedNoteFile`.
3. Compute `currentKeyword` (§3) from the item's live title/date.
4. Parse the item's stored `notePath` via `parseSharedNoteAnchor`:
   - **No anchor yet** (first-ever open for this item): `findKeywordPage` for the current keyword FIRST (hardening added 2026-09-22, `bugfix_shared_note_content_missing` - see that doc for why: "no anchor yet" isn't a reliable signal that no page exists, since anything failing between here and this function returning loses the anchor without undoing the page it already created, and the next attempt would otherwise see "no anchor" again and insert yet another duplicate). Found → treat like a reopen of that page (respecting freeze rules, not forced content). Not found → `insertChronologicalPage`, write the new anchor back onto the item (persisted through the item's existing save path - the same `findCachedItem`/`saveTasks`/`saveMeetings` write-through `feature_meeting_tracking` already uses for its own tag mutations, not a new mechanism), then populate + `openFile`.
   - **Anchor present, `anchor.keyword === currentKeyword`:** `findKeywordPage`. Found → populate (respecting the existing auto-update freeze rules, unchanged) + `openFile`. Not found → **recreate** (§7).
   - **Anchor present, keyword changed** (title/date edited since last open - lazy rename, confirmed acceptable): `findKeywordPage(filePath, anchor.keyword)` (the *old* keyword). Found → `renameKeywordAt` in place, update the stored anchor, populate + `openFile`. Not found → recreate (§7), which also naturally picks up the new keyword.
5. Every branch that changes `notePath` persists the item before returning - this is the one real behavioral difference from own-note notes, which never write back on open. Flagged clearly since it means "open" becomes a possible write for shared targets.

## 7. Page-not-found → recreate

`insertChronologicalPage` with the *current* keyword, then one extra static text line written onto the fresh page ("Recreated 2026-09-22: page keyword not found") - reuses the same piece-writing path as any other static content, just appended after the definition's own pieces, not tracked by `isNoteTemplateManagedElement` so a later refresh never strips it. Only triggered when `getKeyWords`/`findKeywordPage` succeeded and returned no match - a failed API call is a hard error surfaced normally (existing error-handling convention), never treated as "not found".

## 8. Collision guard on rename

`renameKeywordAt` only runs `deleteKeyWord` on the page also carrying content this same item owns. Before deleting the old keyword, check whether another cached item (task/meeting) in the same Project/Area still derives that exact old keyword (e.g. two todos that had the identical title and have now diverged) - if so, skip the delete and only add the new keyword, so the shared page keeps being findable under both. This is a narrow guard, not a general multi-owner page model - out of scope beyond this one check.

## 9. Interaction with existing features

- **Return-to-origin:** unchanged. The return record is file-path-only already (`feature_return_to_origin` D-series decisions), and a shared file's path is stable across every item that shares it - "resume" will trigger for the file regardless of which item's page was last opened, which matches Tilman's "just about whether it is the same file" framing.
- **`relatedItemsFor`** (storage/meetingNoteAggregate.ts) currently excludes an item's own note by `notePath` equality so a note doesn't list itself as "related". With shared files, several items share one `notePath`'s file component - this must compare by **keyword**, not raw `notePath`, or every item sharing a file would wrongly exclude every other item on that file from its own "related items" list. Needs a small signature widen (`excludeKeyword` alongside/instead of `excludeNotePath`).
- **Auto-update freeze rules** (`meetingAutoUpdateCutoffMs`/`isTodoAutoUpdateFrozen`): unchanged, still evaluated before populate, regardless of target.
- **Inbox items:** excluded from shared targets - Inbox items have no Project/Area, so there is no natural single shared file to put them in. Definitions with `noteTarget: 'shared'` simply aren't offered/matched for Inbox-filed items; they keep today's own-note behavior there (or none, if no definition matches Inbox at all - unchanged).

## 10. Open risks / device-verification items (first real run doubles as the spike)

| # | Risk | What to check |
|---|---|---|
| 1 | `insertNotePage` may share `createNote`'s NOTE-vs-DOC launch-context restriction (`bugfix_createnote_blocked`) | Try it from both launch contexts; log the result either way. |
| 2 | Keyword content limits - `#`, umlauts, long titles, emoji | Insert a few realistic keywords, read them back, check the device's own keyword-list UI shows them sanely. |
| 3 | `getKeyWords` cost over a large page count | Time a `getKeyWords(filePath, [0..n-1])` call once a shared file has ~50-100 pages; a "last known page, check it first" shortcut is an easy follow-up if needed. |
| 4 | Editing the file (creating/renaming a page) while that exact file is the one currently open on screen | Needs `saveCurrentNote()` before the write and `reloadFile()`/`jumpToPage` after - same pattern other note-mutation code already uses; confirm no data loss on the currently-open page. |
| 5 | `#` inside a meeting/todo title colliding with the anchor's own `#` separator | **FOUND on the very first real device test (2026-09-22), FIXED same day - see `bugfix_shared_note_content_missing`.** Originally shipped splitting `parseSharedNoteAnchor` on the *last* `#`, reasoned to "degrade gracefully" if the keyword itself contained one. That was backwards, and not a rare case: a Tag Rule matching on `#Daily` normally matches items whose title *also* carries `#Daily`, so the keyword contains `#` on essentially every real use of a tag-driven shared-note rule - not the edge case this row originally implied. Splitting on the last `#` instead found the `#` *inside* the keyword, corrupting both the recovered file path and keyword; every downstream device call then failed with the host's own "File does not exist" error, on every single tap, since the same corrupted anchor got rebuilt identically each time - and because nothing ever succeeded, the anchor was never persisted either, so each tap piled up another duplicate page under the same keyword. Fixed by splitting on the **first** `#` instead (`filePath` is sanitized and never contains one in practice; `keyword` routinely does) - see `parseSharedNoteAnchor`'s own doc comment (`domain/sharedNotePages.ts`) for the full account. |

## 11. Explicitly out of scope for v1 (natural v2 extensions, not built now)

- **Rolling files** (e.g. `Daily-{yyyy}.note` or `Daily-{yyyy-MM}.note`). Fits later without a redesign: the *resolved* file name is already what's stored in each item's anchor, so a date token in `sharedFileName` only changes what `ensureSharedNoteFile` resolves to at creation time; lookup/rename logic is untouched. A date change that crosses a rollover boundary leaves the page in its original file (pages never move), consistent with the rest of this design.
- Moving a page to fix chronological order after a date edit (no "move page" API exists; would mean copying elements including handwriting to a new page and deleting the old one).
- A second, date-only keyword per page (for coarser "any meeting today" lookups) alongside the per-item one.
- Eager keyword rename (on save, instead of lazily on next open).
- Project/Area standalone notes as shared-note targets (Phase 4 of `feature_note_templates`, untouched here).
- Any workaround for the DOC-context `createNote`/`insertNotePage` restriction beyond logging it.

## 12. MVP implementation slices

1. **Data + pure logic** - `NoteCreationDefinition` fields (§2.1), anchor helpers (§2.2), keyword derivation (§3). Verified with the usual standalone-node script, zero RN/SDK involved.
2. **Page engine** - `storage/sharedNotePages.ts` (§4), plus threading `page` through the population functions (§5).
3. **Wiring** - `openOrCreateItemNote` (§6-§8) and the Tag Rules UI addition (target radio + file name/folder fields, same form idiom as the rest of that tab); `relatedItemsFor` keyword-based exclusion (§9).
4. **Diagnostics** - the on-device logging in §4, so the first real device run is also the verification pass for §10.

Each slice gets its own `tsc --noEmit --strict` pass and, where applicable, a standalone-node test script, per this project's standing convention - no slice is considered done without that, same as every other feature in this codebase.
