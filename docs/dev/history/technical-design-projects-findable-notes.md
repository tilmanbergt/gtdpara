# Technical design: 0.13.0 "Projects and findable notes"

Status: **approved** (2026-10-08). The single design for 0.13.0. It merges two drafts: the
findable-notes draft written in an earlier session (a separate 0.13 findable-notes design,
merged into this one; its host-API research, writing order and keyword planning are kept) and the decisions taken on 2026-10-08, which win where the two differed
(§2.1). Decisions are in §4; §5 lists what the first alpha checks on the device.
`nextVersion` is 0.13.0; branch `feature/projects-notes`.

0.13.0 is a mixed release with two independent parts:

| Part | Content |
|---|---|
| 1. Projects at a glance | The Area page's "Project Files" tab becomes **Projects**: one row per assigned Project with its signals |
| 2. Findable notes | A **Heading** switch on Tag Rule pieces that writes a Supernote title element, a combined **Date & title** piece; ISO **date keywords**; the item's tags as keywords on shared pages too |

Each part can be built and tested on its own; part 1 first (small, reuses 0.12.0).

**Terminology.** Supernote uses *title*, *header* and *heading* for the same thing: a title
element (type 100) attached to handwriting or a textbox. Supernote builds the note's table of
contents from these elements by itself; gtdpara only writes the title elements. In gtdpara's UI
the switch on a piece is called **Heading**.

## 1. Part 1: Projects at a glance

### 1.1 Requirements (decided)

- On an **Area** page the Files area's tabs become **Threads | Projects | Area Files | Resources**;
  Threads stays first and preselected (as on the Project page since 0.12.0).
- **Projects** lists the Projects assigned to this Area (`area:` frontmatter), Active first
  (alphabetically), then a folded row "n on hold ▸". Done and archived Projects are not listed.
- Row, two lines, like a counterpart row on the Threads tab:

```
Garden renovation                                    ›
last 30.9. · next 14.10.        7 open · 2 next · w/f 12d
```

  - line 1: name (plus "on hold" in the folded group);
  - line 2 left: the Project's latest past and next meeting; "next —" when none is planned;
  - line 2 right: open todos, how many are `#next`, oldest Waiting For age; "no next action"
    instead of the `#next` count when the Project is stalled (the Review's definition:
    `isActionableOpenTask`, storage/reviewAggregate.ts). No other hints, no colours, no ranking.
- Tap a row → opens the Project page (same navigation as the Areas/Projects tabs).
- While a file is being **linked**, the slot shows the Projects' folders as today (the
  "Project Files" root with its `entryFilter`); while refiling or assigning an Area it shows
  Browse as today (D4 of the threads design). Outside arming, project folders are not browsed
  from the Area page (opening the Project gives its files).
- The Project page is unchanged: Threads | Project Files | Resources | Area Files.

### 1.2 Design

- `storage/projectGlance.ts` (pure over the warm cache, the `threadAggregate.ts` posture):
  `buildProjectGlance(areaName, items, today, now): ProjectGlanceRow[]` with
  `{item, status, lastMeeting, nextMeeting, open, next, stalled, oldestWaitingDays}`. Meetings:
  not cancelled; past = ended (`meetingEndMs <= now`, as the overview). Open todos: not done,
  not cancelled. `next`: open with flow state `next`. Oldest Waiting For: the same age the
  threads overview shows (today − `created`); Waiting Fors without a created date give no age.
- `screens/area/ProjectsTab.tsx`: `PagedSection` of 57 dp two-line rows (the Threads tab's row
  component, extracted to a shared `ui/TwoLineRow.tsx` if it is not shared yet), folded on-hold
  group, empty state "No Projects in this Area yet".
- `ItemDetail.tsx`: on an Area, the `projectFiles` root is no longer a visible tab; it becomes the
  **arming view** of the new `projects` extra tab (link-arming switches the slot to it, the arm's
  end switches back). Mechanism: `FileBrowserPane` gets an `armingRoot` on an extra tab (the
  extra tab is replaced by that root while a link arm is active), mirroring how `alternate`
  already swaps Project Files for Browse. Tab order: Threads, Projects, then the roots — reuse
  whatever 0.12.0 introduced to put Threads first.
- Navigation: the row tap calls the same `onOpenItem` the Areas tab uses.
- `ItemDetail.tsx` is not in the baseline but close to 1,000 lines with 0.12.0: the tab assembly
  moves into `screens/itemDetailTabs.ts` (no behaviour change) if needed.

## 2. Part 2: Findable notes

### 2.1 Requirements (decided)

- **R1 Heading switch per piece.** Every text piece of a Tag Rule (Title, Date & title, Date,
  Time, a static text, Related items, Since last time) has a **Heading** switch. A piece with the
  switch on is written as a textbox plus a Supernote **title element**; the heading text is
  whatever the piece shows. Linked file has no switch (a link element can't be a title). Works
  the same on notes of their own and on pages of shared notes. Applies to Meeting and Todo
  rules; Project/Area rules have no switch.
- **R2 Date & title piece** (`dateTitle`, Meeting rules only): `30.9.2026 · Retro demand` — the
  date always with the year (`d.M.yyyy`), a middle dot, the display title with its **tags as words** (`#` removed, nested tags keep their `/`; gtdpara's own tags such as `#next` dropped). Its
  Heading switch is **on by default**.
- **R3 Defaults and existing rules.** Absent switch = the piece type's default: on for
  `dateTitle`, off for everything else. So **existing rules don't change** (they have no
  `dateTitle`, and their Title stays without heading until the user switches it on). New rules
  start with: meeting — Date & title (heading on), Time, Linked file (the seeded "Meeting
  (default)" rule plus Related, as today); todo — Title with the switch **set on explicitly**,
  Linked file. Todos have no date, so their heading is the Title (todo text, tags as words). The Title piece of meetings and todos renders the same way.
- **R4 Title style** is a **global setting** (Settings → Tag Rules, "Heading style"), default
  **3 = dark grey**; the other SDK values are offered too: 1 black background, 2 light grey,
  4 shadow (`Title.style` in sn-plugin-lib; 0 means "remove" and is not offered).
- **Existing notes.** No backfill. A note that is still being regenerated on open (not frozen
  per `isMeetingAutoUpdateFrozen` / `isTodoAutoUpdateFrozen`) gets a title on its next open once
  a piece of its rule has the switch on — ordinary regeneration. Frozen notes stay as they are.
- **R5 ISO date keyword** (`2026-10-08`), for Supernote's keyword search (which matches part of
  a keyword):
  - meetings: the meeting date — on notes of their own (page 1) and on shared pages (there in
    addition to the anchor keyword, which already starts with the date);
  - todos: the creation date (`[created::]`) if set, else none (not the due date: it moves
    often, the creation date never does).
  Standalone notes (Quick Add's Note tab) are not covered.
- **R6 Tags as keywords on shared pages too**: the item's free/context tags (`contextTagsOf`),
  as notes of their own already get them on page 1.
- **R7 Keywords follow lazily.** A changed meeting date (in gtdpara or outside it) is brought
  into the keywords the next time gtdpara opens the note — no extra device calls after a save.
- Changed against the earlier draft: the switch defaults on only for the new Date & title piece
  (not for Title, so existing rules stay as they are); the style is a setting, not fixed; the
  todo keyword is the creation date only.

### 2.2 What a page looks like

Own meeting note, rule with Heading, Time, Linked file, Related:

```
┃ 30.9.2026 · Retro demand              ← Date & title piece, Heading on: textbox + title element
  10:00–11:00                           ← Time piece
  Link: board.pdf                       ← Linked file piece
  Relevant Todos:                       ← Related piece
  - Prepare velocity chart
  (handwriting area)
keywords: retro/demand · 2026-09-30     ← context tags (as today) + date keyword (new)
```

Shared note "Retro demand 2026.note", one page per meeting; the table of contents Supernote
builds from the titles:

```
30.9.2026 · Retro demand      p. 1
14.10.2026 · Retro demand     p. 2
```

Page keywords: the anchor `2026-09-30 Retro …` (as today) + `2026-09-30` + the tags.

Todo note (new rule): `┃ Collect client feedback form` (Title piece, Heading on); keywords:
context tags + `2026-10-02` (created).

### 2.3 Host API (confirmed by Ratta)

Ratta's official answer on r/Supernote_dev ("Suggestion to enable creating headings pages beyond
the current", reply by Dunn-sn): titles can be inserted directly into any note, including notes
that are not open:

1. `PluginFileAPI.getElements` for the page; find the target textbox; take its `numInPage`.
2. `PluginCommAPI.createElement(100)` — a title element.
3. Put the textbox's `numInPage` into the title's `controlTrailNums`.
4. `PluginFileAPI.insertElements` with the title element on that page.

sn-plugin-lib (`src/model/Element.ts`, checked 2026-10-08): `Element.TYPE_TITLE = 100`;
`Element.title: Title | null` ("present only for title elements"); `Title { X, Y, width, height,
page, style, controlTrailNums }` with style 0 = remove, 1 = black background, 2 = light grey,
3 = dark grey, 4 = shadow; `Title.controlTrailNums` "values start from 1". The style and
`controlTrailNums` therefore go on **`element.title`**, not on the element itself. The
`contoursSrc` comment says contours are "required for titles"; Ratta's flow doesn't mention them
(§5).

Sister projects: noteDraft promotes a textbox with `lassoElements` + `setLassoTitle` (only on the
open page — not usable here, gtdpara writes closed files). textboxHelper's `createElement(100)`
path is never called (`isHeading` is never set) and sets the style on the element instead of
`element.title` — not a reference.

### 2.4 Current state (0.12.0)

- `storage/meetingNoteContent.ts` `populateNoteFromRule(notePath, definition, pieceContent,
  linkedFileAbsolutePath, page)`: deletes every element carrying a gtdpara marker
  (`isNoteTemplateManagedElement`), then inserts one textbox per non-empty piece (marker
  `notePieceUserData(index)`) and an optional link element, in one `insertElements` call. Called
  by `refreshMeetingNoteBlock` / `refreshTodoNoteBlock`, which gate re-population on the freeze
  rules unless `isInitialPopulation`.
- The `title` piece renders the meeting's display title **with** its tags
  (`meetingDisplayTitle`), or the todo text without tags; `date` renders "Tue 30.9.".
- Keywords: notes of their own get `contextTagsOf(tags)` on page 1 at creation
  (`createLinkedNote` → `insertNoteKeywords`); shared pages get one anchor keyword
  (`meetingPageKeyword` = `YYYY-MM-DD <title>`, `todoPageKeyword`), written by
  `insertChronologicalPage`, renamed lazily by `renameKeywordAt`.
- `chronologicalInsertIndex` orders new meeting pages by the first keyword per page that starts
  with a date (`parseKeywordLeadingDate`).
- `supernote/fileSystem.ts` is at its code-health baseline (may only shrink): no new code there.

### 2.5 Data model and settings

- `domain/tagRules.ts`:
  - `PieceType` gets `'dateTitle'`; `PIECE_CONTEXTS.dateTitle = ['meeting']`;
    `DEFAULT_PIECE_TYPES` meeting `['dateTitle', 'time', 'link']`, todo `['title', 'link']` (the
    todo Title seeded with `heading: true`). `PieceRenderContext.dateTitle` (built by the meeting
    caller: `formatHeadingDate(date) + ' · ' + stripAllTags(meetingDisplayTitle(meeting))`);
    `renderPieceText` returns it.
  - `NotePiece` gains `heading?: boolean` — absent = the type's default (on for `dateTitle`, off
    otherwise); read through `pieceIsHeading(piece)` (always `false` for `link`), never directly.
    `setPieceHeading(definition, index, on)`: pure update, used by the editor.
    `hasUntouchedDefaultPieces` ignores the field where it equals the default.
- `domain/dateFormat.ts`: `formatHeadingDate` (`d.M.yyyy`, always with the year).
- `domain/settings.ts`: `noteHeadingStyle: 1 | 2 | 3 | 4`, default 3; absent reads as 3 (no
  migration step). Profiles: part of the settings already classified per profile.
- No settings migration and no change to existing rules (absent = default); no upgrade note
  (CHANGELOG: New).

### 2.6 Headings

**New files**

- `supernote/noteTitles.ts` (SDK layer, small): `ELEMENT_TYPE_TITLE = 100`; an `ElementTitle`
  type and `ElementWithTitle extends Element` (`title?: ElementTitle | null`), so
  `fileSystem.ts`'s `Element` stays unchanged; `buildTitleElement({page, textBoxNum, rect,
  style})`: `createElement(100)`, sets `pageNum`, `layerNum = 0`, `userData =
  NOTE_HEADING_USERDATA`, and on `element.title`: `controlTrailNums = [textBoxNum]`, `style`,
  `page`, `X/Y/width/height` from the textbox's `textRect`.
- `domain/noteFindability.ts` (pure, tested): `staleManagedNums`, `itemDateKeyword`,
  `isBareDateKeyword`, `planPageKeywords`.
- `storage/noteFindability.ts` (I/O): `applyPieceHeadings`, `syncPageKeywords`.

`NOTE_HEADING_USERDATA = 'gtdpara:note-heading:v1'` lives in `domain/meetingNoteBlock.ts` next
to the other markers; `isNoteTemplateManagedElement` recognises it.

**Writing order inside `populateNoteFromRule`**

1. **Read** the page (`getElements`, as today).
2. **Plan the delete** (pure `staleManagedNums(elements)`): every gtdpara-managed textbox/link
   (as today) **plus** every title element (`type === 100`) whose `userData` is our heading
   marker **or** whose `controlTrailNums` point only at managed textboxes. A title the user put
   on one of our textboxes by hand goes with that textbox, so no title is left pointing at
   nothing. Titles on the user's own strokes/textboxes are never touched.
3. **Delete** them in one `deleteElements` call (as today).
4. **Insert** the fresh textboxes and link in one `insertElements` call (unchanged).
5. **Headings** (`applyPieceHeadings`), only when at least one piece with `pieceIsHeading` has
   non-empty text: `getElements` again; for each such piece index `i`, find the textbox whose
   `userData === notePieceUserData(i)`; take its `numInPage` and `textRect`; build one title
   element per textbox with `settings.noteHeadingStyle` and insert all of them in **one**
   `insertElements` call. A missing textbox (should not happen) is logged and skipped. A failing
   title insert is logged (`logWarn`) and does **not** fail the note: content first, headings
   second.

Title elements are recycled after the insert (`supernote/sdkElements.ts` `recycleElements`).

### 2.7 Keywords

**What a page should carry** (`domain/noteFindability.ts`, pure):

- `itemDateKeyword(meeting)` = `meeting.date`; `itemDateKeyword(task)` = `task.fields.created ??
  null`. Only a valid `YYYY-MM-DD` is returned.
- `isBareDateKeyword(k)`: `/^\d{4}-\d{2}-\d{2}$/`.
- `planPageKeywords({onPage, date, tags})` → `{add, deleteIndexes}`:
  - add `date` when it is set and not on the page;
  - delete every **bare date** keyword on the page that differs from `date` (a moved meeting).
    Bare ISO dates on a page gtdpara wrote for an item are gtdpara's; the help page says so;
  - add each tag that is not on the page; never delete tag keywords (removed tags stay, as on
    notes of their own today; the user may also have added keywords by hand);
  - the anchor keyword of a shared page is never touched here (it has text after the date).

**Where it runs.** `syncPageKeywords(notePath, page, {date, tags})` (storage): one
`getKeyWords(path, [page])`, then `deleteKeyWord` (highest index first, since indexes are
positions) and `insertKeyWord` per the plan; failures are logged and skipped. Called from
`refreshMeetingNoteBlock` / `refreshTodoNoteBlock` right after `populateNoteFromRule`, with
`page` (0 for notes of their own) — so at creation and on every non-frozen refresh, on notes of
their own and shared pages alike (this is the lazy follow of R7; the shared anchor keyword is
renamed by the existing `renameKeywordAt` on the same open). It runs even when no rule matches
(keywords don't depend on a rule): the refresh functions call it before their `if (!definition)
return`. `createLinkedNote` keeps writing the tags at creation; the sync then finds them
present.

**Ordering of shared pages.** `chronologicalInsertIndex` skips bare date keywords when it finds
a page's date, so todo pages that now carry a date keyword stay unordered (appended) as today,
and meeting pages are still ordered by their anchor keyword. Test added.

**Collisions.** `findExactKeywordPage` matches anchors exactly. A todo whose whole text equals
one of its tags or a bare date would now match another page's tag/date keyword. Accepted (such a
todo would already collide with a same-text todo); listed under risks.

### 2.8 Settings UI

- Settings → Tag Rules, top of the list: **Heading style** with the four values (labels "Black",
  "Light grey", "Dark grey", "Shadow"), default Dark grey. A change affects titles written from
  then on (new notes, regenerated pages); existing titles are not rewritten.
- Tag Rule editor (`screens/settings/tagRules/TagRuleEditor.tsx`, `useTagRuleDraft.ts`): below
  the `NudgePad` for the selected piece, a `CheckToggle` **Heading** (hidden for Linked file and
  in Project/Area rules) calling `setPieceHeading`. **Date & title** appears in the Add-piece page
  of Meeting rules. Budget: one toggle row (~40 dp) in the right column, which has a spacer above
  Background — no layout change.
- `ui/NoteTemplatePreview.tsx`: a heading piece's label gets a light grey backing (grayscale,
  readable on e-ink), so the preview shows which pieces become titles.

### 2.9 Logging, docs

- Logging: `noteFindability: heading` (found, inserted), failures with `errorMessage(e)`;
  `noteFindability: keywords` with counts added/deleted. No titles or keyword texts in logs
  (they carry client names).
- Help: `docs/user/note-templates.md` — the Heading switch, the Date & title piece, the style
  setting, the table of contents; a short "Finding notes again" section (date keyword, tags on shared pages, bare dates
  are managed by gtdpara); any other page mentioning keywords is checked.
- CHANGELOG `[Unreleased]`: New (Projects tab, Heading switch, Date & title piece, date
  keywords, tags on shared pages). README "Features at a glance": one line. design-overview: as built.

### 2.10 Edge cases and risks

- Empty heading text: no textbox, no title ("omit rather than show empty").
- Several pieces with the switch on: each becomes its own title (one TOC entry each). A rule
  with Date & title **and** Title writes both; only the switched-on one becomes a title.
- A Title piece with the switch on in a meeting rule shows the meeting title **with** its tags
  (as today); Date & title is the clean form for meetings.
- A meeting moved to another year: the shared page stays in its year's file (as today); its
  keyword and heading follow on the next open.
- A shared page claimed by two items with different dates (two todos with the same text): their
  date keywords replace each other on each open. Rare; accepted.
- Heading data shape not exactly as assumed (index base, contours): the §5 checkpoint with
  ordered fallbacks; Ratta offered help.
- A refresh makes two more host calls (second `getElements`, `getKeyWords`) plus the inserts — a
  few hundred ms on open; measured with the existing debug log timings.

## 3. Files

**Part 1** — New: `storage/projectGlance.ts`, `screens/area/ProjectsTab.tsx` (+ a shared two-line
row if needed); tests for `buildProjectGlance`. Changed: `screens/ItemDetail.tsx`,
`ui/FileBrowserPane.tsx` (`armingRoot` on an extra tab). Docs: help "Projects and Areas",
design-overview, CHANGELOG.

**Part 2**

| File | Change |
| --- | --- |
| `src/domain/tagRules.ts` | `dateTitle` piece type, contexts, defaults; `heading?`, `pieceIsHeading`, `setPieceHeading` |
| `src/domain/dateFormat.ts` | `formatHeadingDate` |
| `src/domain/settings.ts` | `noteHeadingStyle` (default 3) |
| `src/domain/meetingNoteBlock.ts` | `NOTE_HEADING_USERDATA`, recognised as managed |
| `src/domain/noteFindability.ts` (new) | `staleManagedNums`, `itemDateKeyword`, `isBareDateKeyword`, `planPageKeywords` |
| `src/domain/sharedNotePages.ts` | `chronologicalInsertIndex` skips bare dates |
| `src/supernote/noteTitles.ts` (new) | title element type and builder |
| `src/storage/noteFindability.ts` (new) | `applyPieceHeadings`, `syncPageKeywords` |
| `src/storage/meetingNoteContent.ts` | delete plan via `staleManagedNums`, headings after insert, keyword sync in both refresh functions, date & title text in the render context |
| Settings → Tag Rules (screen, `TagRuleEditor.tsx`, `useTagRuleDraft.ts`), `ui/NoteTemplatePreview.tsx` | Heading style setting, Heading toggle, Date & title in Add piece, preview backing |
| tests | see §6 |
| `docs/user/note-templates.md`, `CHANGELOG.md`, `README.md`, `docs/dev/design-overview.md` | §2.9 |

`meetingNoteContent.ts` (~880 lines) stays under 1,000 because the new logic lives in the new
files.

## 4. Decisions

| # | Decision | Status |
|---|---|---|
| P1 | Area page tabs Threads \| Projects \| Area Files \| Resources, Threads preselected | decided |
| P2 | Row tap opens the Project | decided |
| P3 | Signals: last/next meeting, open, next (or "no next action"), oldest Waiting For | decided |
| P4 | No project-folder browsing outside link-arming | decided |
| N1 | Heading switch on every text piece (Meeting/Todo rules), not on Linked file | decided |
| N2 | New Date & title piece (meeting), switch on by default; new meeting rules start with it instead of Title + Date; new todo rules start with Title, switch on; absent switch = off for all other pieces, so existing rules don't change | decided |
| N3 | Date & title text `30.9.2026 · Title tag/words` (tags as words, no `#`); todo heading = the Title (text, tags as words) | decided (revised after the S1 device test) |
| N4 | Headings on notes of their own and shared pages; not Project/Area notes | decided |
| N5 | Heading style: global setting, default 3 (dark grey) | decided (revised after the S1 device test) |
| N6 | Date keywords: meeting date, todo created date; standalone notes not covered | decided |
| N7 | Tags as keywords on shared pages too | decided (earlier draft) |
| N8 | Keywords follow a moved meeting lazily, on the next note open | decided |
| N9 | gtdpara manages bare `YYYY-MM-DD` keywords on its pages (deletes outdated ones) | decided (earlier draft O1) |
| N10 | No backfill; non-frozen notes get the heading on regeneration | decided |

## 5. Device checkpoint (first step of part 2, not a spike)

Step S1 builds §2.6 for the Date & title piece (switch on) and checks on the device:

- the title shows in the set style and appears in the note's table of contents — on a note of
  its own and on a shared page of a **closed** note;
- reopening the item (refresh) leaves exactly one title, no orphan; a title made by hand on the
  page survives;
- an older, not frozen note gets its title on open once a piece of its rule has the switch on; a frozen
  one doesn't change.

If the bare version shows no title, try in this order, one build each: (a) without the rect
fields, i.e. exactly Ratta's flow; (b) `numInPage - 1` (`numInPage` is 1-based for
`deleteElements`; `controlTrailNums` might not be); (c) contours from the rect via `contoursSrc`;
(d) ask Dunn-sn, who offered to confirm the data structures. Whatever works is recorded in
"As built".

## 6. Test plan

Jest (pure):

- `buildProjectGlance`: last/next, counts, stalled, on hold, done/archived excluded.
- Heading: `pieceIsHeading` (dateTitle default on, others default off, explicit on/off, link
  always off); `PIECE_CONTEXTS`/defaults (new todo Title seeded on); Date & title text (tags
  as words, year always); settings default 3.
- `staleManagedNums`: managed textboxes; our title marker; a title over a managed box
  (user-made); a title over a user's own box is kept; mixed `controlTrailNums` is kept.
- `itemDateKeyword`: meeting; todo with created; todo without; malformed date.
- `planPageKeywords`: nothing to do; add date; replace a changed date; keep the anchor; add
  missing tags only; never delete tags; delete indexes high to low.
- `chronologicalInsertIndex`: a todo page with a bare date stays unordered; meeting order
  unchanged with an extra bare date.

Device (demo space, build labelled 0.13.0):

1. Area page opens on Threads; Projects rows and signals; on-hold fold; tap opens the Project;
   linking a file shows the Projects' folders; refile shows Browse.
2. New rule with Heading → new meeting with its own note: title in the TOC in the set style;
   keywords tags + meeting date.
3. Shared-target rule, closed note: new page → its title in the TOC; page keywords anchor + date
   + tags.
4. Reopen both: exactly one title, no orphan, no duplicate keywords; a hand-made title survives.
5. Move the meeting to another day, reopen: date keyword replaced, anchor renamed.
6. Todo note: title = text; keyword = created date.
7. Rule editor: switch Heading off on Date & title → next open writes no title and removes the
   old one; on a static text → that text becomes a title; the preview shows the backing.
8. Change the Heading style → the next new note uses it; existing titles unchanged.
9. Supernote keyword search for the date finds the meeting's note and pages.
10. Install over 0.12.0: settings and rules kept; old rules write no title until edited.

## 7. Steps

- **P** Part 1: `projectGlance`, ProjectsTab, ItemDetail/FileBrowserPane arming.
- **S1** `noteTitles.ts`, `staleManagedNums`, `dateTitle` piece + render, `heading` field with
  `pieceIsHeading`, titles after insert; device checkpoint §5.
- **S2** Heading toggle in the editor, Heading style setting, Date & title in Add piece, preview
  backing, new-rule defaults.
- **S3** Keywords: planning + sync, `chronologicalInsertIndex`.
- **S4** Docs, CHANGELOG, README, design-overview; `npm run check`; device test §6; release.

## As built

Built on `feature/projects-notes` in the steps of §7. Device-tested: Part 1 and the S1
checkpoint (the bare version of §2.6 worked - none of the §5 fallbacks was needed). S2-S4 were
built in one go after that; their device test is §6.

Decided after the S1 device test (§4 N3 and N5 are updated above):

- Title and Date & title write the item's **tags as words**: `#` removed, a nested tag keeps
  its `/`, gtdpara's own tags (`#next`, `#wf/…`, everything `isContextTag` rejects) are left
  out (`domain/markdown.ts`'s `tagsAsWords`). This also changes the Title piece of existing
  rules (meetings showed `#tag`, todos dropped tags); CHANGELOG "Changed" says so.
- Heading style default **3 (dark grey)**.

Details chosen while building:

- Part 1: the Projects tab has its own 57 dp two-line row; the Threads tab's active row is
  built inline with its toggles and actions, so no shared `ui/TwoLineRow.tsx` was extracted.
  The Waiting For age reads `w/f 12 d`, as on the Threads tab. "no next action" also shows for
  on-hold Projects. `FileBrowserExtraTab.armingRoot` is the mechanism of §1.2; an arm that ends
  on an arming root returns to the extra tab holding it.
- `dateTitleText(date, title)` is a pure helper in `domain/tagRules.ts`; the meeting caller
  passes `tagsAsWords(meetingDisplayTitle(meeting))`.
- The todo default heading is seeded by `withDefaultPieces` (`DEFAULT_HEADING_PIECES`), so
  `createDefaultMeetingRule` and the editor's context switch get the same defaults.
- `applyPieceHeadings` reads the page again after the insert and builds titles from each
  heading textbox's `numInPage` and `textRect`, exactly the §2.6 data (rect fields included).
- `syncPageKeywords` runs before the rule is resolved (so also without a rule) and before the
  page is populated; order does not matter for keywords.
- Heading style is saved at once when tapped, like the Tag Rules themselves. A change applies
  to every title written from then on, including the titles of non-frozen pages rewritten on
  their next open (§6 item 8 "existing titles unchanged" holds for frozen pages only).
- The temporary `S1-DIAG` title log of the checkpoint was removed in S4.
