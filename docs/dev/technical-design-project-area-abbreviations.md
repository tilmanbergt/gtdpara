# Technical Design: Project/Area Abbreviations

2026-09-14. Chat-approved end to end ("this looks good. so we can move to
implementation.") before this document was written up - implementation and
this write-up happened in the same pass, per the project's usual bugfix
workflow but adapted for a feature: requirements were clarified in chat
first (see §1), then this design, then the code.

## 1. What this is

Every Project and Area can carry a short, user-editable, case-insensitive-
unique abbreviation ("AT" for Atruvia, "AoT" for Art of Transformation).
Typing `#AT` into a Task or Meeting's text is a **soft reference** to that
Project/Area - v1 does not auto-refile anything based on it, and nothing
parses `#AT` differently from any other tag at the text level (domain/
markdown.ts's `extractTags`/`TAG_RE` - the "one tag mechanism" already
shared by flow-state, context, and due-date tags). The abbreviation also
appears as a compact trailing badge on meeting rows (Daily/Weekly), and
resolves the Daily context-tag filter to "everything belonging to this
Project/Area" when it matches one.

Default abbreviations are generated from the item's name and are always
user-editable, inline, from the item's own header.

## 2. Storage

`abbrev: string | null` - a new flat frontmatter field, alongside `area`/
`defaultResourceFolder` (never nested; "omit the line when null" convention,
domain/markdown.ts). Threaded exactly like `area` was:

- `domain/markdown.ts`: `ParsedFrontMatter.abbrev`, `ABBREV_LINE_RE`,
  `parseFrontMatter`/`writeFrontMatterIntoContent` (trailing optional param,
  default `null`).
- `storage/projectFile.ts`: `ProjectFileState.abbrev`, `saveFrontMatter`'s
  trailing `abbrev` param.
- `storage/dataCache.ts`: `CachedItem.abbrev`, `updateItemFrontMatter`'s
  trailing `abbrev` param.
- Every mid-level mutation function that round-trips an item's frontmatter
  (`setItemStatus`, `setItemFocus`, `assignProjectToArea`/`unassignProject`,
  `archiveItem`) takes `abbrev` into its own `Pick<CachedItem, ...>` input
  type and passes it straight through on every write - same "must never
  silently clobber a previously-set field" discipline `area` already
  established, and every one of these Pick types now *requires* `abbrev`
  (no default), so a call site that reconstructs the object literal by hand
  rather than spreading a `CachedItem` fails to compile if it forgets the
  field, rather than silently writing `null` over an existing value.

`domain/types.ts` is untouched - `abbrev` is a flat storage field like
`area`, not part of `FrontMatter`/`Task`/`Meeting`.

## 3. domain/abbrev.ts

Pure, zero RN/SDK imports (same convention as `domain/flowState.ts`),
covering three independent jobs:

- **`generateDefaultAbbrev(name, existingAbbrevs)`** - the default-
  generation algorithm (Tilman, chat): 3+ words -> initials of the first
  three words, uppercased; exactly 2 words -> initials of both, uppercased;
  1 word -> first three letters, uppercased. On a collision (with a reserved
  flow-state word or another item's abbrev), widens by appending one extra
  letter at a time from the same source word(s), then falls back to a
  trailing number. "Does not have to be perfect" (Tilman) - it is a
  starting point, always user-editable afterward.
- **`validateAbbrev(candidate, existingAbbrevs)`** - the same two checks a
  save must pass: not a reserved flow-state word (reuses `domain/
  flowState.ts`'s `isContextTag`, so `next`/`someday`/`maybe`/`now`/
  `waiting-for`/`due` and their `:value` forms can never be claimed as an
  abbreviation), and not already used by another item, case-insensitively.
  Returns a typed reason (`empty` | `reserved` | `duplicate`) so callers can
  show a specific message.
- **`resolveAbbrevPath(tag, items)`** - case-insensitive lookup from a tag
  string to the Project/Area whose `abbrev` matches it, or `null`. Used by
  the Daily context-tag filter (§6) and nowhere else.

Uniqueness scope is global across Projects and Areas together (Tilman:
"Uniqueness should be across projects and areas").

## 4. Assigning a default

Two paths, both idempotent and both using the same generate-then-save
shape:

1. **Existing items, one-time migration** - `storage/dataCache.ts`'s
   `migrateMissingAbbrevs(items)`, called once at the end of every full
   `rebuildCache()` (which already runs automatically on every plugin
   open/foreground). Fills in `abbrev` for every item that doesn't have one
   yet, processing in folder-scan order and reserving each freshly
   generated value immediately so two items migrated in the same pass can
   never collide with each other. Tilman: "perhaps one time pass is better,
   then we can remove that again" - once every real Project/Area has picked
   one up, delete this function and its one call site; the `abbrev` field
   itself stays.
2. **Newly created items** - `storage/createItem.ts` calls a single-item
   counterpart, `assignDefaultAbbrevIfMissing(item)`, right after creating
   the item, rather than leaving it for the next full rebuild to notice (a
   freshly created Project/Area's own ItemDetail screen is typically opened
   immediately, and a rebuild is only triggered on app open/foreground or an
   explicit 🔄).

Both are best-effort: a failed write logs and leaves `abbrev` at `null`,
picked up again by the next full rebuild's migration pass.

## 5. Editing (ItemDetail header)

A trailing `#tag` pill in `ItemDetail`'s header row, **after** the existing
kind label ("Project"/"Area") - always last (Tilman: "please put the tag
always at the end"). Tap to edit inline, mirroring the established
tap-to-edit pattern (`ui/ItemFocusPanel.tsx`'s `ItemScopeRow`: a draft
state, a single-line `ClipboardTextInput`, Save/Cancel text buttons).

Validates live against `domain/abbrev.ts`'s `validateAbbrev`, snapshotting
the current cache's other abbrevs fresh each time editing starts (not at
mount) so the check reflects other items that may have changed since. Save
is disabled while the draft is invalid.

**One conditional error line, not two** (Tilman, final round: "We don't
need the reserved line for flow states in addition to the already used,
just show that line if the user enters exactly a flow state (but then not
in gray)"): earlier drafts had a permanently-visible dim hint plus a
separate duplicate-error line. The shipped version has neither - a single
line, styled with the app's existing `common.error` (already full-contrast,
no opacity dimming - confirmed against `ui/commonStyles.ts`), appears only
while the current draft is actually invalid, covering both the reserved-
word and duplicate cases the same way.

## 6. Meeting rows: trailing badge, not a reserved second line

`ui/MeetingRow.tsx`'s `showSource` prop used to render "jump to that item"
as a second, always-reserved subtext line under the title (`common.
rowSource`, blank when absent, kept so "every row is the same height
regardless of caller" for pagination's fixed-row-budget math). Replaced
with a trailing `#abbrev` badge on the *same* line as the title - the
abbreviation feature's whole point for meeting lists (original request:
"can also be used in meeting lists on daily and weekly page to show the
corresponding area / project in line with the meeting title thereby
reducing vertical space needed").

`showSource`'s shape changed from `{name, onPress}` to `{abbrev, onPress}`.
Every caller (`DailyView.tsx`, `WeekView.tsx`) now passes
`entry.item.abbrev ?? entry.item.name` - the `?? name` fallback only ever
matters for the synthetic Inbox pseudo-item, which is not a real Project/
Area and so has no abbreviation of its own (`inboxItemRef`, `storage/
dailyAggregate.ts`).

Since there's no longer a reserved second line to keep every caller
consistent with, the row height shrank uniformly for *every* caller
(Daily, Weekly, the Current tab's own Todos/Meetings, Inbox-to-zero) -
`row.minHeight` dropped from 56 to 34, `rowCompact.minHeight` (WeekView's
tighter per-day-column rows) from 38 to 26.

`DailyItemRef` (`storage/dailyAggregate.ts`, reused by `storage/
weeklyAggregate.ts`) gained an `abbrev: string | null` field, carried
through every construction site alongside the existing `dailyFocus`/
`weeklyFocus` fields; always `null` for the synthetic Inbox item.

## 7. Daily context-tag filter becomes Project/Area-aware

Original context-tag filter (`technical-design-context-tags.md` §6):
`contextTag` set -> only tasks/meetings whose own `tags` include it show,
full stop. Tilman's final-round feedback: "if the daily tag filter is used:
it should identify if a tag refers to an area or project and then show all
tasks and meetings of that project / area (independent of the actual tag
being present)."

`storage/dailyAggregate.ts`'s `buildDailyAggregate` now resolves
`contextTag` against `items`' own abbrevs first (`resolveAbbrevPath`,
case-insensitive). When it resolves to a Project/Area, the tag-match
condition becomes a **union**, not a replacement: a task/meeting counts if
it carries the literal tag OR belongs to that resolved item - so every task
and meeting under a Project/Area's `#AT` filter shows even if none of them
happen to be individually tagged `#AT`. When `contextTag` matches no item's
abbrev (an ordinary flow-state/context tag, or simply no match), this
degrades to the original tag-only behavior, unchanged. Never reaches the
synthetic Inbox item - Inbox has no abbrev, so the resolved path can never
equal Inbox's own `basePath`.

This is my own reading of "independent of the actual tag being present" as
a union rather than, say, replacing the tag match outright for a resolved
item (which would have hidden any task in that Project/Area that carries a
*different* explicit tag but not `#AT`) - flagged here since it wasn't
confirmed word-for-word.

## 8. Vertical space: raised meeting page sizes

Shorter meeting rows (§6) freed vertical space Tilman asked to put back to
use ("please consider moderately increasing number of meetings shown per
day on the weekly and daily view... move from 3 to 4, this sounds good").
`ui/pagination.ts`'s `PAGE_SIZE`:

- `dailyCalendarMeetings`: 7 -> 9
- `weeklyDayMeetings`: 3 -> 4 (Tilman's literal example)
- `weeklyWeekendMeetings`: 1 -> 2 (kept proportionally smaller than the
  weekday budget, same 3-vs-1 split ratio as before)

`projectMeetings`/`inboxMeetings` and the Google Calendar page-size
constants are deliberately untouched - out of scope ("weekly and daily
view" only).

## 9. Explicitly out of scope (v1)

- Auto-refiling a task/meeting into the tagged Project/Area (soft reference
  only, Tilman's own call).
- A dedicated "abbreviation conflicts" report/list - collisions are caught
  at edit time only (`validateAbbrev`), not audited proactively.
- Any change to `domain/types.ts`'s `Task`/`Meeting`/`FrontMatter` shapes -
  `#AT` is parsed as an ordinary tag, nothing more.

## 10. Verification

`domain/abbrev.ts`'s three functions were unit-tested standalone (ts-node,
no RN/device dependency - this project's usual verification path for pure
`domain/` code) and type-checked in isolation (`tsc --noEmit --strict`).
The wider storage/UI threading was checked with an isolated `tsc --noEmit`
pass per touched file, filtering the expected "cannot find module
react-native/etc." noise a sandbox without the project's real
`node_modules` always produces - this catches real syntax/type mistakes
(and did catch a handful of call sites elsewhere in the app - `screens/
ReviewScreen.tsx`, `screens/WeekView.tsx` - that constructed a
`setItemFocus`/`MeetingRow` object literal by hand and would otherwise have
failed to compile or silently dropped `abbrev` on save) but is not a
substitute for a real on-device build/run, which this pass could not do.
