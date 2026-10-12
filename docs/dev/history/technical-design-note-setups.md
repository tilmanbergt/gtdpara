# Technical design: Note setups

Status: **draft for approval** (2026-10-12, revised after the UX draft). Release: **0.15.0**, branch `feature/note-setups`.
Requirements and their history: claude.ai project doc `claude/feature-tag-rule-model.md`.
UX: canvas "gtdpara Note setups — UX draft" (setup page, page layout with Pieces · Add · Background).

This design replaces Tag Rules (one rule per context) with **Note setups** (one setup per
thing, with a page per item kind). It builds on:

- note templates (`docs/dev/history/technical-design-note-templates.md`): pieces, texts,
  background, the piece editor
- shared note pages and split by tag (`docs/dev/history/technical-design-shared-note-pages.md`,
  `docs/dev/history/technical-design-split-by-tag.md`): notebooks, anchors, plan-then-confirm
- meeting tracking (`docs/dev/history/technical-design-meeting-tracking.md`)
- tending threads and loops (`docs/dev/history/technical-design-tending-threads.md`,
  `docs/dev/history/technical-design-loops.md`)

The aim: the same outcomes with a simpler model, the existing engines (pieces, shared pages,
plan-then-confirm, loop notes) reused unchanged, and `domain/tagRules.ts` split by
responsibility instead of growing.

## 1. Requirements (decided)

### 1.1 The model

- A **Note setup** is one thing you track: a name, **one or more tags** (`#sparring`,
  `#retro`), a **kind**, where its notes go, tracking, and a **page per item kind**.
- **Kinds:** **Thread** and **Loop** only.
  - Thread: the tag's first part is a counterpart type (`#sparring/peter`): Threads tab, thread
    overview, "Tending threads", the "Since last time" piece.
  - Loop: `#kind/name` is one loop: `## Loops` line, Projects tab, "Open loops", closing.
- **Where notes go** is set once per setup:
  - **One notebook**: name template (`{tag} {subtag} {year} {quarter} {month} {day}`) and
    folder. **Shared means shared**: all the setup's meetings and todos get pages in it.
  - **Folder** is free text: empty = the Project/Area root, else a subfolder name inside the
    Project/Area (existing or new; created when the first note needs it).
  - **Own note per item** (Thread only): each meeting/todo gets its own note.
  - A Loop setup's notebook is always the loop note (name template, owner's folder).
- **Pages:** Meeting page and Todo page for every setup; a Loop setup also has First page.
  Each page's **Layout** is either
  - **Default layout**: a live link to the Default page for that kind, or
  - **Own layout**: its own pieces, texts and background, starting as a copy of the Default
    page and independent afterwards.
- **Tracking** (Prepare before / Review after) is a setting of the setup (behaviour, not
  layout), on the setup page.
- **Default**: one entry, pinned at the top of the list: the default Meeting page, Todo page
  and **First page** (for loops), plus the default tracking. No tags, no kind, no notebook.
  Items no setup matches use it.
- **Two levels in the editor** (UX draft): the setup page says what the setup does and lists
  its pages; a page's layout is edited on its own page (preview left; Pieces · Add · Background
  right). Most setups keep Default layout and never open it.
- **One tag, one setup**: a tag can be in only one setup. Tags are picked from tags in use or
  typed new.
- **Projects and Areas** are not part of Note setups (their Tag Rules were never applied: the
  only Project/Area note creation, `storage/standaloneNotes.ts`, never resolves a rule).
- **Inbox** items: always their own note, as today.
- Name in the app: **Note setups** (Settings tab and help page).

### 1.2 When several setups match

- Default target: **Thread for meetings, Loop for todos** (a meeting is part of the
  relationship, a todo is work toward the loop). Among setups of the same kind: list order.
- When more than one setup matches and they lead to different notes, the first-time confirm in
  the status slot offers the alternatives; one tap picks another. The choice is stored in the
  item's note link, so it is asked once per item.
- Once a note exists, its link decides (as today, split-by-tag decision 5).

### 1.3 Migration

- Automatic, once, on the first start of 0.15.0. Principle: **every item keeps the note it
  has; new notes go where the merged setup says.**
- Nothing on disk is moved or renamed; existing note links keep working.
- The old Tag Rules stay stored unchanged (going back to 0.14 still works).
- A one-time notice lists what was merged, changed and dropped.
- Deliberate behaviour change (shared means shared): in a setup with a notebook, todos (or
  meetings) that used to get their own note get pages in the notebook from now on.

### 1.4 Open for later (not in this release)

More page kinds per setup: meeting **prep** and **review/reflection** pages (added on demand,
e.g. long press on the P/R icon), an **agreement** page per agreement in a thread's notebook.
The data model and editor must make these "one more page row" (§3.1, §6.7).

## 2. Current state (what is reused)

| Need | Exists |
|---|---|
| Pieces, texts, background, piece operations, rendering | `domain/tagRules.ts` (684 lines): `NotePiece`, `NoteTextItem`, `addPieceToRule` … `renderPieceText`, `PIECE_CONTEXTS`, `DEFAULT_PIECE_TYPES` |
| Tag matching, `{tag}`/`{subtag}` | `tagMatchesRuleTag`, `ruleSubtag`, `ruleTypeTag` in `domain/tagRules.ts` |
| Notebook names | `domain/sharedNotePages.ts` `renderSharedFileName`, `SHARED_FILE_NAME_PLACEHOLDERS` |
| Plan, confirm, execute a note tap | `storage/itemNotePlan.ts` `planItemNote`/`resolveItemNote`, `domain/noteCreationPlan.ts`, `ui/useNoteCreateConfirm.ts`, texts in `domain/fileChangeText.ts` |
| Pages in a notebook, anchors | `storage/sharedNotePages.ts`, `domain/sharedNotePages.ts` |
| Filling a page | `storage/meetingNoteContent.ts` `refreshMeetingNoteBlock`/`refreshTodoNoteBlock`/`populateLoopNotePage`/`populateNoteFromRule` |
| Loop note target, loop kinds | `storage/loopNotes.ts`, `storage/loopKinds.ts`, `domain/loops.ts` `loopKindsOf` |
| Thread types | `domain/counterparts.ts` `ruleTypesOf` |
| Tracking | `domain/meetingTracking.ts` (OR over matching meeting rules, else the default) |
| Settings load migrations | `storage/settingsStorage.ts` (`renameLegacyTagRuleKeys`, `migrateTagRuleDefaults`, `migrateExperimentalFlags`) |
| Settings UI | `screens/settings/tagRules/*` (list, two-column editor, background picker, Add-piece page, `NoteNameField`, `useTagRuleDraft`) |
| Tags in use | `storage/tagUsage.ts`, `ui/TagChipGrid.tsx` |

Consumers of `settings.tagRules` / `TagRule` today (to be switched, §7): `itemNotePlan`,
`meetingNoteContent`, `noteLinks` (background), `noteFindability` (headings), `loopNotes`,
`loopKinds`, `loops` (note name), `meetingTracking`, `counterparts`, `reviewAggregate`,
`closeOut/context` (readiness), `debugBundle`, `demoSpace`, `settingsStorage`, `MeetingRow`
and the screens that pass `rules` to it (DailyView, InboxScreen, usePlanningScreen, InboxStep,
MeetingsCloseOutStep, TendingThreadsStep, useThreadActions), `NoteTemplatePreview`, Settings.
The implementation step starts with a fresh `grep` for `tagRules|TagRule|resolveNoteTemplate`
including `__tests__/`; that list is authoritative.

## 3. Data

### 3.1 Types

`domain/pageLayout.ts` (new, split out of `domain/tagRules.ts`, about 420 lines): everything
about one page's content, unchanged in behaviour.

```ts
/** The kinds of page a setup can describe. Later: 'prep' | 'review' | 'agreement' (§1.4). */
export type PageKind = 'meeting' | 'todo' | 'first';

export interface PageLayout {
  /** '' = blank (style_white), else a MyStyle file name - as TagRule.template today. */
  template: string;
  pieces: NotePiece[];
  texts?: NoteTextItem[];
}
```

- `NotePiece`, `NoteTextItem`, `PieceType`, the page-size constants, `pieceMaxWidthPx`,
  `pieceIsHeading`, `renderPieceText`, `dateTitleText`, `linkPieceText` move here unchanged.
- Every piece operation (`addPieceToRule` → `addPiece`, `removePiece`, `nudgePieceAt`,
  `setPieceFontSize`, `setPieceStep`, `setPieceMaxWidth`, `setPieceHeading`, the text-item
  functions, `migrateLegacyTextPieces`) becomes generic over the layout:
  `function addPiece<T extends PageLayout>(layout: T, type: PieceType, kind: PageKind): T`.
  They only ever touched `pieces`/`texts`/`template`, so the bodies stay as they are.
- `PIECE_CONTEXTS` becomes `PIECE_PAGES: Record<PieceType, PageKind[]>` (`'loop'` → `'first'`;
  project/area entries go). `DEFAULT_PIECE_TYPES` and the default headings are keyed by
  `PageKind`. `withDefaultPieces(layout, kind)`.

`domain/noteSetups.ts` (new, about 300 lines): the setup model and every decision about it.

```ts
export type SetupKind = 'thread' | 'loop';

export interface Notebook {
  /** Name template; placeholders as SHARED_FILE_NAME_PLACEHOLDERS. */
  name: string;
  /**
   * Folder inside the Project/Area: '' = its root, else a relative path ('Meetings',
   * 'Sparring', 'Coaching/2026'); created on first use. Validated by validateNotebookFolder.
   * Ignored for loops (the loop note lives in the owner's folder).
   */
  folder: string;
}

export interface MeetingTracking {
  trackPrep: boolean;
  trackReview: boolean;
}

export interface NoteSetup {
  id: string;
  name: string;
  kind: SetupKind;
  /** Lowercase, without '#'. Each tag belongs to one setup only (validateSetupTags). */
  tags: string[];
  enabled: boolean;
  /** null = own note per item (Thread only). A Loop setup always has one: the loop note. */
  notebook: Notebook | null;
  /** Own layouts. A missing entry = Default layout (the Default page for that kind). */
  pages: Partial<Record<PageKind, PageLayout>>;
  tracking: MeetingTracking;
}

export interface NoteSetupDefaults {
  /** The Default page per kind; a missing entry = a blank page with no pieces. */
  pages: Partial<Record<PageKind, PageLayout>>;
  tracking: MeetingTracking;
}
```

- `pages` as a map keyed by `PageKind` is what keeps §1.4 open: a new kind is a new key, a new
  page row and a new place that adds the page; nothing else changes shape.
- `pageKindsOf(kind: SetupKind): PageKind[]`: `['meeting','todo']`, plus `'first'` for Loop.
  The setup page builds its page rows from it.

### 3.2 Settings

| Key | Type | Default | Profile class |
|---|---|---|---|
| `noteSetups` | `NoteSetup[]` | `[]` (then migrated or seeded, §5) | per profile (as `tagRules`) |
| `noteSetupDefaults` | `NoteSetupDefaults` | seeded: Meeting page = today's "Meeting (default)" pieces (`createDefaultMeetingPage`), First page = today's new-Loop-rule pieces (`withDefaultPieces(…, 'first')`) | per profile |
| `nextNoteSetupId` | number | 1 | per profile |
| `noteSetupsNotice` | `MigrationReport \| null` | null | per profile |
| `tagRules`, `nextTagRuleId` | legacy | kept as stored, never written | per profile |

- `tagRules` stays in the stored blob untouched: it is the backup and keeps 0.14 working after
  a downgrade. Nothing reads it except the migration. A later release removes it.
- `noteSetupsNotice` holds the migration report until the user dismisses it (§6.6).
- The profiles test requires the new keys' classification (`domain/profiles.ts`).

## 4. Behaviour

### 4.1 Matching and the note's destination (`domain/noteSetups.ts`)

```ts
/** Enabled setups one of whose tags matches one of `tags` (tagMatchesRuleTag), in list order. */
export function matchingSetups(tags: readonly string[], setups: readonly NoteSetup[]): NoteSetup[];

export interface NoteCandidate {
  setup: NoteSetup | null;        // null = Default
  target: 'own' | 'notebook' | 'loop';
  loop?: LoopRef;                 // target 'loop'
}

/**
 * The places a first note of this item can go, best first (§1.2):
 * meeting: Thread setups, then Loop setups; todo: Loop setups, then Thread setups;
 * list order within a kind. A Loop setup counts as 'loop' only when the item's tag names an
 * active loop of its file (activeLoops); otherwise it is an 'own' candidate with its layout.
 * No match: one candidate, the Default, 'own'. Inbox (forceOwn): the first candidate, 'own'.
 */
export function noteCandidates(input: {
  pageKind: 'meeting' | 'todo';
  tags: readonly string[];
  setups: readonly NoteSetup[];
  activeLoops: readonly LoopRef[];
  forceOwn: boolean;
}): NoteCandidate[];

/** The layout a page of `pageKind` uses under `setup` (null = Default): own layout, else the Default page, else null (blank). */
export function layoutFor(setup: NoteSetup | null, pageKind: PageKind, defaults: NoteSetupDefaults): PageLayout | null;

/** Which candidate an existing note link belongs to: the one whose resolved file equals the link's file; else the first. */
export function candidateForLink(candidates: readonly NoteCandidate[], linkFile: string, fileOf: (c: NoteCandidate) => string): NoteCandidate;
```

- `noteCandidates` replaces `resolveNoteTemplate` plus `loopNoteTarget`'s
  `matchedThroughOtherTag` rule; precedence lives in one pure, tested function.
- `candidateForLink` makes refreshes use the layout of the setup the user chose: the link's
  file identifies it, so no new stored field is needed.
- Candidates that lead to the same file are merged (only distinct targets are offered).

### 4.2 Tracking (`domain/meetingTracking.ts`)

Same rule as today: tracked when **any** matching setup's tracking asks for it; when none
matches, the Default's tracking. `resolveMeetingTracking(meeting, config, now)` takes a
`NoteSetupConfig = {setups, defaults}` instead of `TagRule[]`. `trackingSummary(setup)` reads
`setup.tracking`.

### 4.3 Thread types and loop kinds

- `loopKindsOf` and `ruleTypesOf` take `{enabled, kind, tags}` (`LoopKindRule.context` →
  `kind`). Same results: loop kinds = tags of enabled Loop setups; thread types = first segment
  of enabled Thread setups' tags, minus loop kinds, plus `wf`/`owe`.
- `storage/loopKinds.ts` indexes Loop setups by kind (`rules` → `setups`).

### 4.4 Planning, confirming and filling a note

`storage/itemNotePlan.ts`:

- `ItemNoteParams` loses `context` and gains `pageKind: 'meeting' | 'todo'`.
- Existing link: unchanged (the link decides; own/shared/recreate as today). The background for
  a recreate comes from `layoutFor(candidateForLink(...))`.
- No link yet: `planItemNote` computes `noteCandidates`, then plans each distinct candidate
  (reads only: `fileExists`, `findKeywordPage`; at most a handful). The first is the plan;
  the others become `alternatives`.
  - `'own'` → `new-own-file` in `Meetings/`/`Todos/` as today.
  - `'notebook'` → file from `setup.notebook` (`renderSharedFileName` with `ruleTypeTag`/
    `ruleSubtag` over `setup.tags`, folder from `notebook.folder`) → `new-shared-file` /
    `link-page` / `new-page` as today.
  - `'loop'` → the loop note as today (`ensureLoopNoteFile`, first page filled).
- `NoteCreationPlan` gains `setupName` (replaces `ruleName`) and
  `alternatives?: NoteCreationPlan[]`.
- `resolveItemNote(params, confirmCreate)`: `confirmCreate(plan)` resolves to the chosen
  plan's index (`0` = the default, `n` = alternative n) or `null` (✕); the chosen plan's
  `execute` runs.

`ui/useNoteCreateConfirm.ts`: the status slot already carries up to two action buttons on a
confirm (Close loop's Done / Dropped, `ui/status/types.ts`). `useStatusConfirm` gets a sibling,
`useStatusChoice(name): (text, labels: string[]) => Promise<number | null>` (same one-at-a-time
and hide/unmount rules; `useStatusConfirm` becomes a thin wrapper over it, so there is one
implementation). The note confirm shows:

- text: the default plan as today (`noteCreationConfirmText`), e.g. "Sparring: new page in
  sparring peter 2026.note";
- buttons: the default action ("Add page") and **"In <setup name>"** for the best alternative
  (the slot is one line, so labels stay short);
- detail (tap to expand): every candidate with its file, built in `domain/fileChangeText.ts`.

At most one alternative button; with three or more distinct targets (rare: two thread tags plus
a loop) the detail lists them and the button offers the next best.

`storage/meetingNoteContent.ts`:

- `refreshMeetingNoteBlock`/`refreshTodoNoteBlock` get the layout through
  `layoutFor(candidateForLink(...), pageKind, defaults)` instead of `resolveNoteTemplate`.
  `populateNoteFromRule` is renamed `populatePage` and takes a `PageLayout`.
- `populateLoopNotePage` takes the Loop setup's `'first'` layout.
- `noteLinks.resolveNoteBackgroundTemplate(settings, context, tags)` becomes
  `backgroundOf(layout)`; callers already have the layout.
- `noteFindability.headingPieceIndexes` takes a `PageLayout`.

### 4.5 Validation (`domain/noteSetups.ts`)

- `normalizeSetupTag(raw)`: trim, strip `#`, lowercase; empty is dropped.
- `validateSetupTags(setup, all)`: returns the first tag that another setup already has, with
  that setup's name; saving is refused with a status-slot message ("#retro is already in
  Sparring."). Checked across enabled and disabled setups.
- Loop setups: a tag with `/` is refused ("A loop kind is one word, like workshop.").
- `validateNotebookFolder(text)`: trimmed, `\` read as `/`, leading/trailing `/` dropped;
  refused when a segment is empty, `.`/`..`, starts with a dot, or contains characters a file
  name can't (same rule as `domain/fileName.ts`); at most 3 segments and 60 characters. `''` is
  valid (the root). Message in the status slot, like the Inbox folder name
  (`validateInboxFolderName`).
- Folder creation: `planItemNote` plans `new-shared-file` with the folder in the shown path
  ("Sparring/sparring peter 2026.note"), so the confirm already names a new folder;
  `ensureSharedNoteFile` → `ensureFolderExists` creates it on execute (as `Meetings/` today).

## 5. Migration (`domain/noteSetupMigration.ts`, new, about 280 lines)

Pure: `migrateTagRules(rules: LegacyTagRule[], nextId: number): {setups, defaults, nextId, report}`.
`LegacyTagRule` is today's `TagRule` type, moved here and used nowhere else.

Run from `storage/settingsStorage.ts` at load when `noteSetups` is absent and `tagRules` is
present (fresh installs: no `tagRules` → seed `noteSetupDefaults` only). It also runs on a
profile switch or import that brings an old profile file (`storage/profiles.ts` re-reads
through `loadSettings`). Idempotent: once `noteSetups` exists it never runs again.

1. **Project/Area rules** → dropped; report `removed` (never applied).
2. **Default rules** (`isDefault`): the first enabled one per context → `defaults.pages[ctx]`;
   the Default Meeting rule's tracking → `defaults.tracking`. Others → report `removed`.
   `defaults.pages.first` is seeded with the standard First page pieces (Tag Rules had no
   default Loop page). Every migrated Loop setup keeps its own First page (Own layout), so
   nothing looks different.
3. **Group the remaining rules** (meeting, todo, loop) into connected components by shared
   tags (union-find over normalized tags), so the result satisfies "one tag, one setup".
   - A component with a Loop rule → **Loop setup** with that rule's tags; a meeting/todo rule
     joins it only when all its tags are kinds of that Loop rule. Otherwise that rule keeps
     its other tags in its own component, and the loop-kind tags are removed from it (report).
   - Otherwise → **Thread setup** with the union of the members' tags.
4. **Pages:** each member becomes the page of its context (Own layout: template, pieces,
   texts). Two members of the same context: the first in list order wins (it is the one that
   matched first today); report `conflict`. A Loop rule's pieces → `'first'`.
5. **Notebook** (Thread): from the first enabled member with `noteTarget: 'shared'`, Meeting
   member preferred: name = `resolvedSharedFileName` (rule name when the field was blank),
   folder = `'Meetings'`/`'Todos'` by that member's context for `subfolder`, `''` for `root`
   (plain text now, so the user can change it later).
   No shared member → `null` (own note per item). Loop: the Loop rule's note name.
6. **Behaviour change report:** a member with Own note in a setup that has a notebook → report
   `intoNotebook` ("todos with #sparring now get pages in {name}"). A shared member whose
   name/folder differs from the chosen notebook → report `notebookChanged`.
7. **Tracking:** OR of the Meeting members' flags (same as today's OR at match time).
8. **Enabled:** a setup is enabled when any member was; disabled members whose tags collide
   with an enabled component are dropped (report `removed`); a fully disabled component stays
   a disabled setup.
9. **Name:** the Meeting member's name, else the first member's. **Order:** position of the
   component's first member.
10. Existing note links are untouched; every old note still opens (§4.4: the link decides).

The report is a list of `{setup: string; change: 'merged'|'intoNotebook'|'notebookChanged'|'conflict'|'removed'; detail: string}`;
texts are built in `domain/fileChangeText.ts` like every other change notice.

## 6. UI (Settings › Note setups)

The tab keeps its place; its label becomes **Note setups**. Folder
`screens/settings/tagRules/` → `screens/settings/noteSetups/`. Paging as today (PagedSection,
cards, Save/Cancel on the page, no global Save). Reference: the UX draft canvas.

Three levels, each with one job:

1. **List** - which setups exist.
2. **Setup page** - what a setup does, and a summary row per page.
3. **Page layout** - how one page looks (only when a page has, or gets, its own layout).

### 6.1 List (`NoteSetupsList.tsx`, from `TagRulesList.tsx`)

```
 Heading style  [Black] Light grey  Dark grey  Shadow
 + New note setup
┌────────────────────────────────────────────────────────┐
│ Default              Meeting page · Todo page · First page│
├────────────────────────────────────────────────────────┤
│ Sparring                                     Thread    │
│   #sparring #retro · notebook {tag} {subtag} {year}    │
├────────────────────────────────────────────────────────┤
│ Workshop                                     Loop      │
│   #workshop · loop note {year}-{month} {tag} {subtag}  │
└────────────────────────────────────────────────────────┘
```

- Default pinned first, not deletable. Rows: name + kind; tags + where notes go; "(off)" when
  disabled; "tracks prep + review" as today. Delete stays immediate (as today).
- The migration notice (§6.6) sits above the list until dismissed.

### 6.2 Setup page (`NoteSetupEditor.tsx` with `SetupFields.tsx` and `PageRows.tsx`)

UX draft board 1. Header: "‹ Note setups", the setup's name, **Save** and Cancel (top right,
upper third). Inputs stay in the upper two thirds.

```
 Name        [ Sparring                              ]
 Tags        (#sparring ✕) (#retro ✕)   [ + tag ]
 Kind        [ Thread ]  Loop          tended with someone: #sparring/peter
 Notes       Own note per item   [ One notebook ]          (Thread only)
   Name      [ {tag} {subtag} {year} ]  {tag} {subtag} {year} {quarter} {month} {day}
             → sparring peter 2026.note · retro demand 2026.note
   Folder    [ Meetings                ]   empty = Area/Project root
 Tracking    [✓] Prepare before  [✓] Review after          (meetings)
 [✓] Enabled

 Pages
 ┌ [thumb] Meeting page   Default layout · 4 pieces · blank          [ Customize › ]
 └ [thumb] Todo page      Own layout · 2 pieces · Reflection lines   [ Edit › ] Use default
```

- **Tags**: "+ tag" opens the tag picker page (`SetupTagPicker.tsx`): `TagChipGrid` over the
  tags in use (`storage/tagUsage.ts`, types first), tags already in another setup left out,
  plus a field for a new tag.
- **Notebook name**: `NoteNameField` (placeholder chips insert at the cursor, as today). The
  preview line uses the setup's real tags (`{tag}` = each tag, `{subtag}` = a sample) and shows
  the folder: `Sparring/sparring peter 2026.note`.
- **Folder**: a `ClipboardTextInput`, empty = root; checked by `validateNotebookFolder` on
  Save; the preview shows "(new folder)" when it doesn't exist yet in any Project/Area that has
  items with these tags - informational only.
- Loop: Notes shows only the loop note name (`LOOP_NOTE_NAME_DEFAULT` when blank); no folder.
- **Page rows** (`PageRows.tsx`), one per `pageKindsOf(kind)`:
  - thumbnail: `NoteTemplatePreview` at row size, pieces only (no MyStyle image: full-page
    PNGs in list rows cost too much; the row text names the background);
  - text: "Default layout" or "Own layout", piece count, background name;
  - Default layout → **Customize ›** (copies the Default page, opens the layout page);
  - Own layout → **Edit ›** and **Use default** (status-slot confirm: "Use the Default page?
    Your own layout for this page is removed.").
- **The Default** opens the same page with only Tracking and the page rows (each row: Edit ›).

### 6.3 Page layout (`PageLayoutEditor.tsx` + three panels)

UX draft boards 2-4. Header: "‹ <setup name>", the page name, "Own layout · Use default",
**Done** (back to the setup page; the draft is kept until the setup page's Save or Cancel).

- **Left**: the page preview (`NoteTemplatePreview`) at real page proportions, half the
  width, with the MyStyle background behind the pieces (as on today's edit page). Tapping a
  piece selects it.
- **Right**: `MiniTabs` **Pieces · Add · Background**; the preview stays visible for all three,
  so there are no more sub-pages.
  - **Pieces** (`PiecesPanel.tsx`): the paged piece list (✕ removes), then for the selected
    piece the `NudgePad` (arrows, step 5/25, size, width) and the Heading switch.
  - **Add** (`AddPiecePanel.tsx`, from `PieceEditor.tsx`): predefined pieces for this page
    kind (`PIECE_PAGES`) as tap rows - ✓ = on the page, tap again removes; below, the setup's
    own texts (tap places/removes, edit) and the composer for a new text.
  - **Background** (`BackgroundPanel.tsx`, from `TemplateEditor.tsx`): the MyStyle files,
    paged; a tap sets the background and the preview shows it at once.
- Every change acts on the active page's layout through `updateActiveLayout` (§6.4).

### 6.4 State (`useNoteSetupDraft.ts`, from `useTagRuleDraft.ts`)

- `view`: `'list' | 'setup' | 'tags' | 'layout'`; `activePage: PageKind`; `layoutPanel:
  'pieces' | 'add' | 'background'`; the draft (`NoteSetup`, or the Default).
- Every piece, text and background handler goes through one helper,
  `updateActiveLayout(fn: (l: PageLayout) => PageLayout)`, which applies the generic
  `domain/pageLayout.ts` operations to the draft's `pages[activePage]` (or the Default's). This
  removes the per-handler rule plumbing.
- `customizePage(kind)` copies `layoutFor(null, kind, defaults)` into `draft.pages[kind]`;
  `useDefaultPage(kind)` deletes it.
- Save: `validateSetupTags`, `validateNotebookFolder`, then persist `noteSetups` /
  `noteSetupDefaults` at once (as today's `persistTagRules`), then `setLoopSetups`.
- If the hook passes 450 lines, the layout handlers move to `useLayoutDraft.ts`.

### 6.5 Sizes

`TagRuleEditor.tsx` (385), `PieceEditor.tsx` (270) and `TemplateEditor.tsx` (127) become
`NoteSetupEditor.tsx` (~110), `SetupFields.tsx` (~200), `PageRows.tsx` (~120),
`SetupTagPicker.tsx` (~120), `PageLayoutEditor.tsx` (~120), `PiecesPanel.tsx` (~160),
`AddPiecePanel.tsx` (~220), `BackgroundPanel.tsx` (~110). All new files ≤ 1,000 lines; each
screen budgeted against design-device-rendering §5-6 (the right column is half the width
today's edit page gives it).

### 6.6 Migration notice

A card above the list while `noteSetupsNotice` is set: "Tag Rules are now Note setups." plus
the report lines (paged if long) and **OK** (clears it). On the first start after the update,
the status slot says once: "Tag Rules are now Note setups · Show" (opens the tab).

### 6.7 Later page kinds

A new `PageKind` adds: a key in `PIECE_PAGES`/`DEFAULT_PIECE_TYPES`, an entry in
`pageKindsOf` (one more page row), a keyword suffix for a second page of the same item
(`<item keyword> · review`, the main page's keyword unchanged so links still resolve), and the
place in the app that adds the page. The setup page, layout page, layout operations and
population code need no change.

## 7. Files

| File | Change |
|---|---|
| `src/domain/pageLayout.ts` | new: page layout types, piece/text operations, rendering (moved from tagRules.ts) |
| `src/domain/noteSetups.ts` | new: setup types, matching, candidates, layout, validation, defaults seeding |
| `src/domain/noteSetupMigration.ts` | new: `LegacyTagRule`, `migrateTagRules`, report |
| `src/domain/tagRules.ts` | removed (contents moved) |
| `src/domain/settings.ts` | new keys, legacy keys kept, `renameLegacyTagRuleKeys` unchanged |
| `src/domain/profiles.ts` | classify new keys |
| `src/domain/meetingTracking.ts`, `counterparts.ts`, `loops.ts`, `sharedNotePages.ts`, `demoSpace.ts`, `fileChangeText.ts`, `noteCreationPlan.ts` | switch to setups (§4) |
| `src/storage/itemNotePlan.ts`, `meetingNoteContent.ts`, `noteLinks.ts`, `noteFindability.ts`, `loopNotes.ts`, `loopKinds.ts`, `loops.ts`, `reviewAggregate.ts`, `closeOut/context.ts`, `debugBundle.ts`, `settingsStorage.ts` | switch to setups (§4, §5, §8) |
| `src/ui/useNoteCreateConfirm.ts`, `useStatusConfirm.ts` (if needed), `MeetingRow.tsx`, `NoteTemplatePreview.tsx` | alternatives; `setups` prop instead of `rules` |
| screens passing `rules` (DailyView, InboxScreen, usePlanningScreen, InboxStep, MeetingsCloseOutStep, TendingThreadsStep, useThreadActions) | pass `noteSetupConfig(settings)` |
| `src/screens/settings/noteSetups/*` | replaces `tagRules/`: list, setup page, tag picker, page rows, layout page and its three panels, draft hook (§6) |
| `__tests__/` | moved/renamed tests; new tests (§9) |
| `docs/user/` | the Tag Rules help page becomes "Note setups" |
| `docs/dev/design-overview.md`, `CHANGELOG.md`, `README.md` | current state, Upgrade note, feature list |

`MeetingRow`'s `rules: TagRule[]` prop becomes `setups: NoteSetupConfig`; the seven screens
change one line each.

## 8. Logging, diagnostics, docs

- `NoteSetupMigration: migrated` with counts (`setups`, `merged`, `removed`, `intoNotebook`),
  never names or tags. Failure: `logError` with the message; settings keep `tagRules` and the
  app runs with empty setups plus seeded defaults, and the status slot says the update failed.
- Plan log: `<tag>: plan <kind> (alternatives n)`; the chosen index is logged on execute.
- Debug bundle: `note setups: thread 3 · loop 1 · notebook 2 · default pages 2 · migrated yes`
  (replaces the `tagRules n` count and the loop rules count).
- Help page "Note setups" (device-safe markdown): what a setup is, kinds, notebook vs own note,
  pages and Default layout vs own layout, the layout page, one tag one setup, the choice when several match.
- CHANGELOG `[Unreleased]`: Changed (Tag Rules → Note setups), Upgrade note (automatic
  migration, what changes for todos in a notebook setup, old rules kept for a downgrade),
  Removed (Project/Area rules, which never had an effect).
- design-overview: §2 as built (Note setups), §5 decision entry.

## 9. Test plan

### 9.1 Jest (domain)

- `pageLayout`: the moved tests keep passing (renamed imports only).
- `noteSetups`:
  - `matchingSetups`: nested tags, disabled setups, list order.
  - `noteCandidates`: meeting thread-first, todo loop-first; inactive loop → own candidate;
    no match → Default; forceOwn; duplicate targets merged.
  - `layoutFor`: own, default, blank.
  - `candidateForLink`: picks the setup whose file equals the link; falls back to the first.
  - `validateSetupTags`: collision across enabled/disabled; loop tag with `/`.
  - `validateNotebookFolder`: '', nested, `\`, `..`, leading dot, illegal characters, length.
- `noteSetupMigration` (fixtures):
  - one meeting rule shared → Thread setup with notebook, Todo page Default layout.
  - meeting shared + todo own, same tag → one setup, report `intoNotebook`.
  - meeting shared + todo shared, different names → meeting's notebook, `notebookChanged`.
  - overlapping tags `[sparring, retro]` + `[sparring]` → one component.
  - loop rule + todo rule on the loop kind → Loop setup with Todo page.
  - loop rule + rule with `[workshop, jf]` → split, report.
  - defaults per context; disabled duplicates; Project/Area dropped; tracking OR.
  - idempotence (`noteSetups` present → nothing).
  - Tilman's real rules from a profile export, kept as a local fixture outside the repository
    (client names), plus an anonymized copy in `__tests__`.
- `meetingTracking`, `counterparts`, `loops`: existing tests ported to setups, same results.

### 9.2 Device (demo space first, then own profile)

- [ ] Update from 0.14: notice shows; Sparring setup has the notebook; no note moved.
- [ ] Old meeting note (shared page) and old todo note (own file) open as before.
- [ ] New todo `#sparring/peter` → confirm names `sparring peter 2026.note` → page added.
- [ ] Todo of an active loop also tagged `#sparring/peter` → default loop note, alternative
      offered; pick the alternative → page in the sparring notebook; reopening doesn't ask.
- [ ] Meeting with both tags → default the sparring notebook.
- [ ] Setup page: page rows for Meeting/Todo (+ First page for Loop); Customize › copies the
      Default and opens the layout page; Use default asks, then removes the own layout.
- [ ] Layout page: Pieces · Add · Background with the preview always visible; tap a piece in
      the preview selects it; a new background shows at once; Done keeps the draft, Cancel on
      the setup page drops it.
- [ ] Tag picker hides tags of other setups; saving a duplicate tag is refused with a message.
- [ ] Folder: empty → root; `Sparring` (new) → confirm shows `Sparring/…`, folder created;
      `../x` refused with a message.
- [ ] Default page edit changes every setup on Default layout, including a Loop's First page.
- [ ] Tracking icons and "Meetings to close out" unchanged.
- [ ] Threads tab types and loop kinds unchanged.
- [ ] Profile switch to a profile saved with 0.14 → migrated on switch.
- [ ] Downgrade test (optional): install 0.14 over it → old Tag Rules still there.

## 10. Steps

Each step ends with `npm run check` green and a commit on `feature/note-setups`.

0. **Split** `domain/tagRules.ts` into `pageLayout.ts` (generic layout operations) and a
   temporary `tagRules.ts` remainder; no behaviour change.
1. **Model**: `domain/noteSetups.ts` with types, matching, candidates, layout, validation +
   tests. Not wired yet.
2. **Migration**: `domain/noteSetupMigration.ts` + fixtures/tests; `settingsStorage` runs it;
   new settings keys, profiles classification.
3. **Wiring**: tracking, counterparts, loop kinds, item note plan, page filling, loop notes,
   review/close-out, debug bundle, demo space; remove `domain/tagRules.ts`.
   *Checkpoint: device test of notes and tracking with the migrated setups (old UI hidden).*
4. **Alternatives** in plan + confirm.
5. **Settings UI** (§6) and the migration notice: list and setup page first, then the layout
   page and its panels (moving today's piece editor and background picker into panels).
6. **Docs**: help page, CHANGELOG, README, design-overview; "As built".
   *Checkpoint: full device checklist (§9.2), then beta.*

## 11. Open points

- Checked: the status slot supports two actions on a confirm (§4.4); a profile switch re-reads
  through `loadSettings`, so the migration runs there too (§5).
- Decided after the UX draft: the Default has a First page too; tracking lives on the setup
  page; the folder is free text; page layout is its own page with Pieces · Add · Background.
- Base branch: `feature/note-setups` starts from `main` after 0.14.0 is released and merged
  (it rewires loop code that is still in beta).
- Deleting a setup or changing its notebook name/folder: existing pages and their links stay
  where they are (the link decides); only new notes follow the new setting. Pages whose setup
  is gone refresh with the Default layout.

## 12. As built

Built in the steps of §10, one commit each (`note-setups: step N - …`). Steps 0-3 are done;
this section lists where the code differs from the design above, and why.

### Decided after the step-3 checkpoint

- **The Default has an optional notebook** (`NoteSetupDefaults.notebook`, null = own note
  per item), reversing §1.1's "no notebook" for the Default. Real 0.14 profiles use shared
  Default rules; without it, new untagged meetings and todos would have stopped landing in
  their notebook. `noteCandidates` puts items no setup matches into it (`defaultNotebook`),
  except Inbox items. The migration fills it from the shared Default rules (the Meeting
  rule's first; the Todo rule is reported when its items change place, as in rule 6). The
  Default's page gets a Notes row (Thread-style: own note or one notebook).
- **"Untitled" setups are named after their tags** (`#tango`): a blank rule name or the old
  editor's "Untitled".
- Settings already migrated by an earlier 0.15 build lack the Default's notebook key; the
  load step completes them once from the kept Tag Rules (`completeMigratedSettings`) and
  renames their "Untitled" setups.

### Model and layout (steps 0-1)

- `addPiece(layout, type, text?, textId?)` has no `kind` parameter: where a piece starts
  does not depend on the page kind; `PIECE_PAGES` only decides what the Add panel offers.
  `addTextItem` returns `{layout, id}`.
- `hasUntouchedDefaultPieces` is gone: only the old editor's context switch used it.
- Matching is named after setups: `tagMatchesSetupTag`, `setupSubtag`, `setupTypeTag`;
  `ruleTypesOf` is `threadTypesOf`, `LoopKindRule` is `SetupTagSource`, and
  `SharedFileNameInput.ruleName` is `fallbackName`.
- `noteCandidates` merges the candidates it can tell apart itself (every own note of an
  item is the same file, one loop has one note); `distinctCandidates(candidates, fileOf)`
  merges the rest once storage knows the files.

### Migration (step 2)

- Trigger: a new per-profile key `noteSetupsMigrated` (false in `DEFAULT_SETTINGS`)
  instead of "`noteSetups` absent". A profile switch fills every key a profile file lacks
  from `DEFAULT_SETTINGS` and saves the result, so `noteSetups` is never absent after a
  switch; the flag is false for every blob and profile file written by 0.14, so they
  migrate once, on load or after a switch.
- Tracking: a setup without a Meeting member takes the Default's tracking. 0.14 tracked
  those meetings through the Default Meeting rule; OR over no Meeting members would have
  switched their tracking off.
- Name: a Loop setup is named after its Loop rule (rule 9 would take a Meeting member's
  name first).
- More report cases than §5 lists, all with existing `change` values: a shared Default
  rule (`notebookChanged`: items without a setup get their own note now), a shared
  Meeting/Todo rule on a loop kind (`notebookChanged`: outside an active loop its items get
  their own note), a rule without tags (`removed`).
- A Loop rule marked Default is migrated like any other Loop rule (0.14 used its tags as
  loop kinds either way).
- The anonymized copy of real rules in `__tests__` is a representative fixture written
  for the test; the real export stays local (`NOTE_SETUPS_FIXTURE`).

### Wiring (step 3)

- `storage/noteTargets.ts` (new) places the candidates in the file system
  (`placeNoteCandidates`: notebook file, loop note, own note) and finds the layout of an
  existing link (`layoutForLink`). Both the planner (`storage/itemNotePlan.ts`) and the
  page refresh (`storage/meetingNoteContent.ts`) need it, so it is not inside the planner.
- `layoutForLink` finds a notebook page's setup by its rendered file name. A todo's name
  is rendered with today's date, so a page in a notebook of an earlier year falls back to
  the best candidate - in practice the same setup.
- Backgrounds: `storage/noteLinks.ts`'s `backgroundOf(layout)`; `createLinkedNote` takes
  the background instead of settings and tags.
- `ui/MeetingRow.tsx` exports `trackingSetups(settings)`, so the screens that pass
  `tracking` change one line each and `DailyView.tsx` does not grow.
- The debug bundle line also counts switched-off setups (`off n`).
- The old Tag Rules editor is removed in step 3, not step 5: it is built on `TagRule`,
  which step 3 removes. Until step 5 the tab shows the heading style and a placeholder;
  `NoteNameField.tsx` and `useMyStylePngs.ts` moved to `screens/settings/noteSetups/`.
  Step 5 rebuilds the Add and Background panels from `PieceEditor.tsx` and
  `TemplateEditor.tsx` as they are in git history.
- The status-slot messages of §6.6 and §8 (migration notice, migration failed) come with
  the Settings UI in step 5; until then a failure is logged and shows in the debug bundle
  (`migrated failed`).
