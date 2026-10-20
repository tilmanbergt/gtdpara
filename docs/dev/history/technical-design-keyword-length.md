# Technical design: keywords within the Supernote's length limit (bugfix)

Bugfix for release 0.18.1. Host fact recorded in `docs/dev/supernote-host-facts.md` §1.

## 1. Failure

- Device log 2026-10-19 14:13: Engage → "note new" for the todo
  `WIP Concept entwickeln für #owe/Demand (outcome #retro/demand)` in *Lab demand 2026.note*.
- `insertItemPage` → `insertNotePage` succeeded (page 4 inserted), then `insertKeyWord` failed:
  *"The keyword exceeds the maximum length limit. Cannot call the related API!"*
- Result: the todo got no note link, and a blank page without a keyword stays in the notebook
  (gtdpara can never find it again; the user deletes it by hand).

## 2. Root cause

- The firmware limits a keyword to **43 characters**, measured on the device: typing
  `1234567890` ×6 keeps 43; `123456789ä` repeated keeps 43 characters with 4 "ä". So it counts
  characters (UTF-16 units, = JS `.length`), not bytes. The Supernote UI shortens silently; the
  plugin API rejects with an error. sn-plugin-lib neither documents nor checks the limit.
- gtdpara builds keywords from the item's text with no length limit: `todoPageKeyword` (todo
  text minus functional tags), `meetingPageKeyword` (`YYYY-MM-DD title`), `loopPageKeyword`
  (`loop <tag>`), tag keywords (`contextTagsOf`) in `syncPageKeywords`, `insertNoteKeywords` and
  standalone notes.
- `insertItemPage` inserts the page before the keyword, so a rejected keyword leaves a page
  behind.
- Same class of bug, not yet hit: `renameKeywordAt` deleted the old keyword *before* inserting
  the new one. A rejected new keyword (a todo edited to more than 43 characters) would leave the
  page with no anchor at all, and the next tap would make a "Recreated" page.

## 3. Requirements as decided

- R1: Every keyword gtdpara writes is at most 43 characters.
- R2: **Deterministic**: the keyword is a pure function of the item's text. The same text always
  gives the same keyword, on every device and run, so the todo's page is always found again.
  (Tilman: "the important thing is that it will be deterministic and we still find the right page
  for a todo afterwards.")
- R3: Keywords of 43 or fewer characters stay **exactly** as they are. No migration, existing
  pages keep matching.
- R4: Over 43: first remove the `#tags` (they are written as keywords of their own). If still
  over: cut at a word boundary and end with `…` (whole keyword ≤ 43).
- R5: No hash suffix. Two long todos that come out with the same keyword share a page, as two
  todos with identical text already do (shared-note design §3); the existing "link to existing
  page" confirmation shows it.
- R6: A keyword that is too long never leaves a page without a keyword behind.

## 4. Design

### 4.1 `domain/keywordLength.ts` (new, pure)

`KEYWORD_MAX_LENGTH = 43`, `keywordFits(k)`, `fitKeyword(k)`:

1. `k.length <= 43` → return `k` **unchanged** (R3; no trimming or tidying either).
2. Remove tags (every match of `domain/markdown.ts`'s `TAG_RE`, so "what a tag is" stays defined
   once). Then tidy: remove empty `()`/`[]`, no space after `(`/`[` or before `) ] , . ; : ! ?`,
   collapse whitespace, trim. If the result is empty (a keyword made only of tags), continue
   with the tidied `k`.
3. Result `<= 43` → return it.
4. Cut: take the first 42 characters (one fewer if the 42nd is a high surrogate, so an emoji is
   never split). If the next character isn't a space and the head has a space at position ≥ 21,
   cut back to that last space (no half words; a single very long word is hard-cut). Strip
   trailing spaces and `, . ; : ! ? ( [ - –`. Append `…` (U+2026, 1 character) → ≤ 43.

Properties: output ≤ 43; `fitKeyword(fitKeyword(k)) === fitKeyword(k)`; inputs ≤ 43 pass
through unchanged; a leading `YYYY-MM-DD ` survives, so `parseKeywordLeadingDate` and the page
order keep working for meetings.

Examples:

- `WIP Concept entwickeln für #owe/Demand (outcome #retro/demand)` (62) →
  `WIP Concept entwickeln für (outcome)` (36)
- `WIP Concept entwickeln für #owe/Demand` (38) → unchanged
- `2026-10-19 Refine & Replenish mit allen Teamleads und PO #replenishment/demand` →
  `2026-10-19 Refine & Replenish mit allen…`
- `Entscheidungsvorlage für Lenkungskreis vorbereiten und mit Bereichsleitung abstimmen` →
  `Entscheidungsvorlage für Lenkungskreis…`

### 4.2 Every keyword builder fits (the one choke point)

- `domain/sharedNotePages.ts`: `todoPageKeyword` and `meetingPageKeyword` return
  `fitKeyword(<what they built before>)`.
- `storage/loopNotes.ts` `loopPageKeyword`: `fitKeyword(\`loop ${tag}\`)` (the `loop ` prefix
  survives the cut, so `startsWith(LOOP_PAGE_KEYWORD_PREFIX)` keeps working in `pageOrder.ts`
  and `notebookContents.ts`).
- Tag keywords: `planPageKeywords` maps `tags` through `fitKeyword` **before** the `present`
  check, so a fitted tag already on the page is not added again. `insertNoteKeywords` fits its
  keywords the same way.
- `HOME_PAGE_KEYWORD` (`home`) and bare dates are short and stay as they are.

**Why the right page is still found**: every place that writes, stores or compares a page
keyword gets it from these builders, so they all see the same fitted string:

- writing: `insertItemPage(…, currentKeyword)`, `renameKeywordAt(…, currentKeyword)`;
- storing: the note link `file#keyword` (`buildSharedNoteAnchor(…, currentKeyword)`);
- finding: `findKeywordPage(anchor.keyword)` (exact match against the stored, fitted keyword);
- the keyword-changed check `anchor.keyword !== currentKeyword` (fitted vs. fitted, so no false
  renames); a long todo whose *end* is edited keeps its keyword, so fewer renames;
- collision guard `todoKeywordStillUsed`/`meetingKeywordStillUsed`, Contents
  (`notebookContents.ts`), Engage (`notePageEntry.ts`), close-out inventory.

Nothing needs migrating: no keyword over 43 can be on a page (the API refused every one), and
every stored link with a keyword of 43 or less is unchanged by R3. Should a page carry a longer
keyword from somewhere else, the lazy rename covers it: the stored keyword is found, differs from
the fitted one, and is renamed in place on the next open.

### 4.3 Guard before writing (R6)

- `insertItemPage` checks `keywordFits` before `readAllKeywords`/`insertNotePage`, so nothing is
  written. With §4.2 this never fires; it turns a future builder mistake into a clean error
  instead of an orphan page. It does **not** cut (the written keyword would then differ from the
  stored link).
- `renameKeywordAt`: the same guard, and **insert new, then delete old** (read the page's
  keywords after the insert to get the old keyword's index). A failing insert leaves the old
  keyword, and the link still works.
- If `insertKeyWord` fails for another reason after the page was inserted, the page stays (no
  automatic page delete, per the deletion policy); `insertItemPage` logs it with the page index
  so the debug bundle shows which page to remove.

### 4.4 Logging

`insertItemPage`/`renameKeywordAt` debug entries add `keywordLength`.

## 5. Tests

Jest: ≤ 43 unchanged (odd spacing and `()` included); the failing todo from the log; tags
removed is enough / not enough; only tags; one long word; emoji at the cut; meeting date kept;
`loop ` prefix kept; ≤ 43 and idempotent over a generated set; `planPageKeywords` with a long
tag adds it once. Storage: guard writes nothing, rename inserts before it deletes, a failing
insert never deletes.

Device (demo space):

1. A todo with the text from the log, in an Area with a notebook setup → Engage/note icon → page
   created; Supernote's keyword list shows `WIP Concept entwickeln für (outcome)`, plus
   `owe/demand`, `retro/demand` and the date.
2. Tap the note icon again → same page opens (no new page, no "Recreated").
3. Change the end of the text (still over 43, same first part) → same page opens, no rename in
   the log.
4. A short todo (≤ 43) linked before the update → still opens its page.
5. A short linked todo edited to a long text → keyword renamed in place to the fitted form, the
   page opens, the old keyword is gone.
6. A long meeting title in a shared meeting notebook → page created, date first, page in the
   right place on the timeline.

## 6. Open points

None. Not in scope: a short hash for long keywords with the same start (R5).

## 7. As built

Branch `fix/keyword-length` from the 0.18.0 release (`main`), for release 0.18.1. Decided by
Tilman: the fix goes onto the current release first; feature branches merge it from `main`.

- `src/domain/keywordLength.ts`: `KEYWORD_MAX_LENGTH`, `keywordFits`, `fitKeyword` as in §4.1.
  Tags are removed with `stripTagsFromText`, new in `domain/markdown.ts` next to `TAG_RE`.
- Builders fitted as in §4.2, plus one writer the design missed:
  `storage/standaloneNotes.ts` (Quick Add's **Note** tab writes its title's tags as keywords).
  `storage/homeNotebooks.ts` writes the constant `home` and needs nothing.
- `storage/sharedNotePages.ts`: `assertKeywordFits` before any write in `insertItemPage` and
  `renameKeywordAt`; the rename adds the new keyword first, then reads the page's keywords and
  deletes the old one by its current index (also filtered by page); a failed keyword after the
  page insert is logged with `logError('insertItemPage: keyword failed, page left without
  keyword', …)`; debug entries carry `keywordLength`.
- Tests: `__tests__/domain/keywordLength.test.ts` (rules, builders, tag keywords, a generated
  set for "≤ 43 and idempotent"), `__tests__/storage/sharedNotePagesKeywords.test.ts` (guard,
  rename order, failing insert keeps the old keyword).
- Docs: new living document `docs/dev/supernote-host-facts.md` (collects host behavior the SDK
  documentation doesn't state, starting with this limit), listed in `docs/dev/README.md` and
  `DEVELOPMENT-POLICY.md` §6 and linked from `design-overview.md` §2.13 and
  `design-device-rendering.md`; help page `docs/user/note-setups.md` "Finding notes again";
  CHANGELOG `[Unreleased]` Fixed.
- Device test (§6) still open.
