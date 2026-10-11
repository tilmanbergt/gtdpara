# Technical design: Loops

Status: **approved** (2026-10-10), implementation started. Release: **0.14.0**, branch
`feature/loops`. Requirements and their history: claude.ai project doc `claude/feature-loops.md`.
UX: canvas "gtdpara Loops — UX draft".

This design builds on:

- the tending-threads design (`docs/dev/history/technical-design-tending-threads.md`, D1–D20)
- 0.13.0 (`docs/dev/history/technical-design-projects-findable-notes.md`: Projects tab,
  headings)

The aim is to reuse what threads, Quick Add, the shared-note engine and the Projects tab
already do, keep the new code small, and leave the large files no larger than they are (§8).

## 1. Requirements (decided)

### 1.1 What a loop is

- A **loop** is a todo that needed more than one step: a small project inside an Area or a
  Project, without a folder of its own. Threads you tend, loops you close.
- A loop is named by the tag `#<kind>/<name>` (`#workshop/teamoffsite`). Only the full tag
  counts; there is no plain-leaf matching.
- A **kind** is declared by a Tag Rule with the new context **Loop** (D-L1).
- **Owner:** exactly one file (Area or Project). The Inbox never owns loops.
- **Storage:** a `## Loops` section in the owner file: status, main date, linked file.

### 1.2 The loop note

- There is one note per loop, from start to end, in the owner's folder.
- Its name comes from the Loop rule's note name with placeholders `{tag}` (the kind),
  `{subtag}` (the name), `{year}`, `{month}`, `{day}`. The date placeholders take the **main
  date** and disappear, with the separator between them, when there is none.
  - Default: `{year}-{month} {tag} {subtag}`, giving `2026-11 workshop teamoffsite` or
    `workshop teamoffsite`.
- Meetings and todos of the loop become pages in it. When several rules match, the first rule
  that defines a note wins, thread rules first.
- Prep/review tracking applies if any matching rule asks for it.

### 1.3 Starting a loop and editing it

- **Starting happens in Quick Add only:**
  - A todo that is only a loop tag (plus an optional date and linked file), without
    `#someday`/`#maybe`, saves as a loop. `#next` doesn't prevent it. The button reads
    "+ Add loop".
  - A bare tag with someday/maybe stays a todo (a "loop idea"). Taking the flag off, wherever
    that happens, turns it into a loop.
  - Text plus a loop tag is a todo of that loop. If no loop line exists and the todo is active
    (next/now/due, or a meeting), the loop is offered under Projects › New.
  - There are no hints inside Quick Add. The status slot reports what happened after the tap.
- **Todo → loop:** in edit mode, replacing the text by a loop tag turns Save into "Make loop".
  - The due date becomes the main date.
  - The created date, linked file and own note carry over.
  - The todo line is replaced by the loop line.
- **Editing a loop** happens in Quick Add:
  - The overview's Edit loads the loop: tag, main date, linked file.
  - There is no Refile and no file linking there.
  - Rename questions come in the status slot.
- **Edge cases:**
  - The bare tag of an existing loop: Add is disabled and the status slot says "exists · Open".
  - In the Inbox: the line stays a todo and becomes a loop when filed.

### 1.4 Showing and closing

- **Where loops show:**
  - Projects tab: Projects, then loops by main date, marked ○, with note and file one tap
    each. Folded rows: "Someday · n loop ideas", "n closed", New.
  - The page's todos are grouped by loop.
  - An Area page shows only a loop count on each Project row (D-L7).
- **Review** gets two steps (D-L4):
  - "Tending threads" stays as it is.
  - A new step **"Open loops"** lists loops per scope ("no next action"; "was <date> · close?").
- **Closing** (D-L3): Done or Dropped, **only when the loop has no open todos and no upcoming
  meetings**. Otherwise the status slot says what is still open and offers to show it. The user
  moves items out (refile, remove the tag, finish or cancel them).
- **No deleting** a loop: Close › Dropped is the way out (D-L6).

## 2. Current state (what is reused)

| Need | Exists |
|---|---|
| Nested-tag matching | `domain/threads.ts` `threadOf`, `belongsToThread` |
| A status section in the owner file | `domain/threadsSection.ts`, `projectFile.saveThreads`, `CachedItem.threads` |
| Rules with context, tags, pieces, background, tracking, a note name with placeholders | `domain/tagRules.ts`, `domain/sharedNotePages.ts` `renderSharedFileName` + `SHARED_FILE_NAME_PLACEHOLDERS`, the Tag Rule edit page (`screens/settings/tagRules/TagRuleEditor.tsx`, `useTagRuleDraft.ts`) |
| Pages in one `.note`, located by keyword | `storage/sharedNotePages.ts`; `planItemNote` in `storage/meetingNoteContent.ts` |
| Overlay with Ahead / Looking back and Quick Add | `screens/thread/*`, `ui/threadOverlayStore.ts`, `storage/threadAggregate.ts` |
| Relabelling Quick Add's button | abbreviation quick-file ("+ Add to <Name>") |
| Messages and confirmations | status slot, `useStatusConfirm` |
| Two-line rows with signals | `screens/area/ProjectsTab.tsx`, `screens/thread/ThreadsTab.tsx` (each draws its own row today), `storage/projectGlance.ts` |
| Review master-detail | `ui/ReviewMasterDetail.tsx`, `domain/reviewSteps.ts` |
| Moving/renaming a file | `supernote/fileSystem.ts` `moveFile`; note anchors `domain/noteRelocation.ts` |

## 3. Data

### 3.1 Tag Rule context `loop` (D-L1)

- `NoteContext` gains `'loop'`.
- A Loop rule's **tags** are its kinds: one rule can declare several, like `reading` and
  `study`.
- Its **pieces and background** make the loop note's **first page**. `PIECE_CONTEXTS`:
  - `title` (the loop name, `kind/name` as words)
  - `text` (static texts)
  - `link` (the loop's linked file)
  - `dateTitle` (main date + name; plain name without a date)
- **Note name:** `sharedFileName` (D-L8). For a Loop rule this field is the loop note's name
  template; a loop note is a shared note by nature, since meetings and todos add pages to it.
  - Default: `{year}-{month} {tag} {subtag}`.
  - Folder: always the owner's root folder (no folder choice).
  - `noteTarget`, tracking and "Default for this context" don't apply.
- `loopKindsOf(rules)` (domain/loops.ts) returns the tags of enabled Loop rules.
- `ruleTypesOf` (domain/counterparts.ts) leaves loop kinds out, so `#workshop/teamoffsite` is
  never a counterpart.
- `{day}` joins the placeholder list for every rule (shared notes too).
- `renderSharedFileName` drops date placeholders together with their joining `-`, `.` or `_`
  when there is no date. For example, `{year}-{month} {tag}` without a date becomes `{tag}`.
- Settings: no new setting. A Loop rule is an entry in `tagRules`, already classified per
  profile.

### 3.2 `## Loops` section

```
## Loops
- workshop/teamoffsite: active, 2026-11-14, [[Offsite brief.pdf]]
- study/psm2: done, 2026-10-03
- buy/ebike: dropped
```

- The status is `active | done | dropped`. Columns follow the `## Threads` comma convention:
  main date (ISO), then linked file (wiki link); both optional. Extra columns are kept verbatim.
  A line nobody changed is written back as read. Non-status lines are kept.
- **No duplication.** `domain/statusSection.ts` (new, about 90 lines) takes the generic part
  of threadsSection.ts:
  - parse `- <key>: <status>[, rest]` for a given status set
  - serialize as read
  - write the section

  `threadsSection.ts` and `loopsSection.ts` become thin wrappers. `## Threads` behaviour is
  unchanged (its tests keep passing unchanged).
- Cache and save: `CachedItem.loops: LoopLine[]` and `projectFile.saveLoops`, as for threads.
- File format: a new section is a format change. The parser + serializer + round-trip test,
  and an **Upgrade note** ("area/project files may get a `## Loops` section; older versions
  keep it untouched").

### 3.3 Pure helpers (`domain/loops.ts`, new, about 200 lines)

- `loopOf(tag, kinds)`: `{kind, name, tag}` or null.
- `bareLoopTag(text, kinds)`: the loop tag when the text, without tags and fields, is empty
  and there is exactly one loop tag.
- `saveAsLoop({text, flowState, destination}, kinds)`: `bareLoopTag` is set, the flow state
  is not someday/maybe, and the destination is an item.
- `loopMembers(item, loopTag)`: the item's todos and meetings belonging to the loop (via
  `belongsToThread`).
- `closeBlockers(item, loopTag, now)`: open todos and upcoming meetings (D-L3).
- `loopsInUse(item, kinds)`: New candidates. `loopIdeas(item, kinds)`: someday/maybe bare tags.
- `loopChange(old, next)`: what a save changes: line, tag rename (lines to rewrite), note
  rename (old → new name), or nothing.
- `renameTagInLines(lines, oldTag, newTag)` and `renameNoteAnchors(lines, oldFile, newFile)`:
  pure rewrites, both through the existing span helpers.

## 4. Behaviour

### 4.1 Quick Add

| Situation | Button | On tap |
|---|---|---|
| Create, `saveAsLoop`, no line for the tag | "+ Add loop" | `createLoop`; status "Loop workshop/teamoffsite started in Atruvia" |
| Create, `saveAsLoop`, line exists | "+ Add" disabled | status info "Loop workshop/teamoffsite exists", action "Open" |
| Create in the Inbox | "+ Add" | plain todo |
| Edit todo, `saveAsLoop` | "Make loop" | `convertTodoToLoop`; status "Todo became loop buy/ebike" |
| Edit loop | "Save" | `updateLoop`; status-slot questions (§4.6), then "Loop saved" |

- **Loop edit target:** `editingLoop`, next to `editingTask`/`editingMeeting`, reusing the
  task fields:
  - text = tag
  - date labelled "Main date"
  - attachment = linked file (shown and removable; linking happens on the Area page)

  There are no flow chips, and no Refile, because the overview passes no `onRefile`.
- **All loop logic sits outside the widget** (§8):
  - `ui/quickAdd/useLoopMode.ts` derives the label, the disabled state and the submit handler
    from `saveAsLoop` and the cache.
  - `ui/quickAdd/LoopEditFields.tsx` draws R3 for a loop.
  - The widget only calls them.

### 4.2 Storage operations (`storage/loops.ts`, new, about 250 lines)

All operations follow the existing write path: load the owner file → pure edit → save →
`notifyCacheChanged()`. The file-changed-elsewhere checks (0.6.0) therefore apply unchanged.

- **`createLoop(ownerPath, tag, mainDate, linkedFile)`**: writes the line.
- **`convertTodoToLoop(itemPath, taskIndex)`**: writes the line and removes the todo line in
  one save. It carries over:
  - due → main date
  - linked file → the loop's file
  - the todo's own note → moved with `moveFile` to the loop note name in the owner root
    (status names the new file and folder, policy §3)

  A shared-page note stays where it is (logged as a kind).
- **`updateLoop(ownerPath, old, next)`**: applies `loopChange`. Rewrites tags and anchors in the
  owner file, then `moveFile` for the note.
- **`setLoopStatus(ownerPath, tag, 'done' | 'dropped')`**: refuses while `closeBlockers` is
  non-empty.
- **`ensureLoopNote(ownerPath, tag)`**: page 1 (§4.4).

### 4.3 Someday → loop, everywhere

The todo save path in `storage/itemMutations.ts` (edit and flow-state change, which Review's
Someday step uses too) checks `saveAsLoop` on the result. When true, it calls
`convertTodoToLoop` instead of writing the todo. Refile from the Inbox into an item goes
through `entryMove.moveTask` and does the same after the move. There is one rule and one place,
so no screen knows about it.

### 4.4 The loop note

- **Page 1** is created on demand (the row's note icon, or "Note ›" in the overview):
  - `ensureSharedNoteFile` in the owner root, named from the Loop rule;
  - the first page populated with the Loop rule's pieces (`populateNoteFromRule`, context
    `loop`);
  - page keyword `loop <kind>/<name>`.

  Page 1 stays first; later pages are inserted by date after it.
- **Pages of meetings/todos.** `planItemNote` asks `loopNoteTarget(tags, owner, rules)` (new,
  in `storage/loopNotes.ts`) before the own/shared decision:

  ```
  rule = resolveNoteTemplate(context, tags, rules)
  rule matched by a tag that is not a loop kind → as today (thread rules first)
  item carries a loop tag with an active line in its owner → page in that loop note
  otherwise → as today
  ```

  The page itself then goes through the existing shared-page path unchanged (anchor,
  `insertChronologicalPage`, lazy keyword rename, recreate). Page pieces come from the
  meeting/todo rule (a `#workshop` meeting rule, or the default).
- **Tracking:** `meetingTracking.ts` takes the OR of the resolved meeting rule and the loop's
  meeting rule.

### 4.5 Overview

- **The store becomes generic.** `ui/threadOverlayStore.ts` becomes `ui/overviewStore.ts` with
  requests `{kind: 'thread' | 'loop', …}`. Tags of a loop kind open a loop request; everything
  else is unchanged. `useAppOverlays` renders the matching component.
- **`screens/loop/LoopOverview.tsx`** (new, about 230 lines): header (main date and days to go,
  Note ›, File ›, Edit, Close loop), left `AheadSection` + `LookingBackSection`, right Quick Add
  (new todos get the loop tag and go to the owner; Edit loads the loop).
  `ThreadOverview.tsx` is not branched.
- **`storage/loopAggregate.ts`** (new, about 150 lines): `buildLoopOverview(items, tag,
  ownerPath, now)`. It is owner-only and reuses `threadAggregate`'s entry types and row
  builders, which are exported where needed.

### 4.6 Main date and renames

`updateLoop` computes `loopChange` first, then asks through `useStatusConfirm`, one question at
a time:

- **Tag rename** ("Rename loop teamoffsite → offsite on 6 lines?"): rewrites lines, the loop
  line and the note name.
- **Note rename when the rendered name changes** (for the default template: the year-month):
  shown before (old → new) and reported after, as policy §3 requires for file changes.
  Everything else saves without asking.

### 4.7 Area / Project page

- **Projects tab** (`ProjectsTab.tsx` stays the container). `ui/LoopRows.tsx` (new) draws:
  - loop rows: `TwoLineRow` (extracted in step 0 from the rows that ProjectsTab and ThreadsTab
    each draw today) plus note and clip icon buttons;
  - New (Track / Not);
  - folded "Someday · n loop ideas" and "n closed".

  `projectGlance.ts`'s `glanceOf` is generalized to `(tasks, meetings)`, and
  `buildLoopGlance` reuses it. Project rows on an Area page get "· n loops".
- **Clip icon on a loop row:** arms the Files pane exactly as linking a file to a todo does
  (`useEditTarget` arm state). The pick writes the line's file column.
- **Todos grouped by loop:** `TodosSection.tsx` sorts by loop (main date), then the rest, and
  inserts header rows. The pure grouping (`groupTodosByLoop`) lives in domain/loops.ts. Header
  rows count in the paged-height budget.

### 4.8 Review

- **New step `openLoops`** ("Open loops", kind `backlog`), placed after "Stalled projects":
  - `screens/review/steps/OpenLoopsStep.tsx` (new, about 220 lines) with `ReviewMasterDetail`;
  - left: loops per scope (Area with its Projects, Project without an Area), each with main
    date · next meeting and open · next · w/f;
  - right: `LoopSummary` (no next action / open / meetings), "+ Next action" (Quick Add with
    the tag and `#next`), "Open overview ›", "Close loop".
- **"Tending threads"** stays unchanged.
- **Data:** `storage/loopRoster.ts` (new, small), built like `tendingRoster.ts`, reusing
  `counterpartScopes` for the grouping.

### 4.9 Closing

"Close loop" (overview header, Review) checks `closeBlockers`:

- **Something is still open:** the status slot says "2 open todos, 1 upcoming meeting — move,
  retag or finish them first", with an action "Show" that opens the overview.
- **Nothing is open:** it asks "Close loop psm2: Done / Dropped / Cancel" in the status slot,
  then `setLoopStatus`. The note stays in place. Closed loops stay readable: the tag opens the
  overview with "closed" in the header, and the Projects tab lists them folded.

No close-out list is needed; `CounterpartCloseOut` is not reused.

## 5. Logging, diagnostics, docs

- **Logging** (policy §5): kinds and counts only, never loop names or tags. Examples:
  `Loops: create`, `Loops: convert todo (note: own|shared|none)`,
  `Loops: rename (tag|note)`, `Loops: close blocked (n todos, m meetings)`,
  `LoopNotes: plan <kind>`. Every caught error goes to `logError` with its operation.
- **Debug bundle:** loop rules count; loops per status (counts).
- **Docs in the same change:**
  - New help page `docs/user/loops.md` (device-safe subset), linked from `index.md`; review and
    tag-rules pages updated.
  - `design-overview.md`: §2 as built, §3 reusable blocks (`statusSection`, `overviewStore`).
  - CHANGELOG New + Upgrade note; README feature list.
  - PRIVACY: unchanged (no new storage place or network).

## 6. Decisions

- **D-L1:** Loop kind = Tag Rule context `loop`. *Decided.*
- **D-L2:** Line format with commas, as `## Threads`; no stored start date ("since start" =
  the earliest created date of a member). *Decided.*
- **D-L3:** A loop closes only without open todos and upcoming meetings. *Decided.*
- **D-L4:** Review: a separate step "Open loops"; "Tending threads" stays. *Decided.* (This
  replaces the rename to "Tending".)
- **D-L5:** Phase 2: the note page list from headings in the overview; the "meeting on the
  main date moved" prompt; "Again from last". *Decided, to try.*
- **D-L6:** No deleting a loop. *Decided.*
- **D-L7:** A Project's loops show only as a count on the Area page. *Decided.*
- **D-L8:** A Loop rule's note name lives in `sharedFileName`; `{day}` added for all rules;
  date placeholders vanish without a main date. *Decided.*

## 7. Test plan

**Jest (pure):**

- `statusSection` round trip, plus the existing threadsSection tests unchanged
- `loopsSection`: columns, unknown lines, as-read writing
- `renderSharedFileName` with `{day}`, and dropping date placeholders with their separators
- `bareLoopTag` / `saveAsLoop`: someday, maybe, next, w/f, Inbox, two loop tags, an
  abbreviation tag, fields only
- `loopChange`, `renameTagInLines`, `renameNoteAnchors`
- `closeBlockers`
- `groupTodosByLoop`
- `ruleTypesOf` without loop kinds
- `loopNoteTarget` precedence: thread rule wins; loop beats the default; no line means no loop
  page
- `buildLoopGlance` and `buildLoopOverview` counts
- smoke render of `LoopOverview` and `OpenLoopsStep`

**Device (demo space):**

1. Create a Loop rule `#workshop`.
2. Quick Add `#workshop/teamoffsite` with a date gives "+ Add loop" and the status message.
3. Add a todo of the loop; it is grouped under the loop.
4. The row's note icon creates page 1 from the rule.
5. A meeting of the loop gets page 2.
6. A `#jf/demand` meeting with the loop tag goes to the jf note and still shows in the
   overview.
7. A someday idea with the chip taken off becomes a loop.
8. A todo with its own note → Make loop: the note is moved and renamed.
9. Edit in the overview: main date in the same month asks nothing; a month change asks for the
   rename; a tag rename asks.
10. Close with an open todo is blocked with "Show"; after retag/refile, Close › Dropped works.
11. The Open loops step.
12. An existing install upgraded: threads unchanged, the new section is readable in Obsidian.

## 8. Code health and file sizes

Limits (policy §3): new files ≤ 1,000 lines; baseline files may only shrink.

| File | Lines now | Plan |
|---|---|---|
| `ui/QuickAddWidget.tsx` | 2,373 (baseline 2,374) | **Must not grow.** Step 0 first extracts R4 (`ui/quickAdd/ActionRow.tsx`) and the edit-field seeding (`ui/quickAdd/useEditFieldSeed.ts`), so the widget shrinks by more than the loop wiring adds. All loop logic lives in `useLoopMode.ts` / `LoopEditFields.tsx`. Lower the baseline afterwards. |
| `storage/meetingNoteContent.ts` | 905 | Step 0 moves `planItemNote` and its helpers (about 180 lines) to `storage/itemNotePlan.ts`. The loop branch is one call into `storage/loopNotes.ts`. |
| `storage/dataCache.ts` | 798 | +10 (parse `loops`) — fine. |
| `screens/ItemDetail.tsx` | 795 | No loop code; the Projects tab content stays in `screens/area/`. |
| `screens/ProjectDataPanel.tsx` | 724 | No change beyond passing kinds; grouping in `TodosSection` + domain. |
| `domain/tagRules.ts` | 671 | +20 (context, piece contexts). Loop logic in `domain/loops.ts`. |
| `storage/threadAggregate.ts` | 356 | Export shared builders only; loop logic in `loopAggregate.ts`. |
| `screens/thread/ThreadOverview.tsx` | 240 | Unchanged; the loop overview is its own component. |
| `domain/threadsSection.ts` | 101 | Shrinks: generic part moves to `statusSection.ts`. |

Other rules kept:

- domain stays pure
- one way to build a todo (`taskEdit`)
- moves through `entryMove`
- dates through `dateFormat`
- errors through `errorMessage`
- messages only in the status slot
- no `Alert`
- grayscale; the ○ mark is a glyph, not a color
- every list paged

## 9. Steps

Each step ends with `npm run check` green and is committed on its own.

0. **Make room** (no behaviour change):
   - QuickAddWidget extractions (ActionRow, useEditFieldSeed) and a lower baseline
   - `itemNotePlan.ts` out of meetingNoteContent
   - `statusSection.ts` under threadsSection
   - `overviewStore.ts` (rename of threadOverlayStore with the `kind` field)
   - `ui/TwoLineRow.tsx`, shared by ProjectsTab and ThreadsTab, whose rows are drawn twice today
1. **Foundation:** context `loop` + Tag Rule edit page options (note name field with
   placeholders, preview), `{day}` + date-dropping, `loopsSection`, cache, `saveLoops`,
   `domain/loops.ts`, `ruleTypesOf`, tests.
2. **Quick Add:** Add loop, Make loop, the someday hook, Inbox refile, status texts.
3. **Projects tab:** loop rows, New, ideas, closed, clip arming; todo grouping; Project row
   counts.
4. **Loop overview** and loop edit in Quick Add, with renames.
5. **Loop note:** page 1 from the Loop rule, meeting/todo pages, tracking OR.
6. **Review:** Open loops step; closing with blockers.
7. **Docs, help, CHANGELOG, debug bundle;** device test; beta.

## 10. As built (steps 0–3)

Where the code differs from the plan above:

- **Conversion is central.** The loop itself becomes its `## Loops` line in one place: a hook
  after every write of an Area's or Project's todos (`storage/dataCache.ts`
  `setTasksWrittenHook`, installed by `storage/loops.ts`). Quick Add's "+ Add loop" and
  "Make loop" only relabel the buttons and save a todo; the someday → loop path, the chips, the
  Review and filing from the Inbox need no code of their own. The note move is reported after
  the conversion (status slot), not asked before.
- **Refactors moved to the step that needs them:** `itemNotePlan.ts` to step 5,
  `overviewStore.ts` to step 4. `ui/TwoLineRow.tsx` is used by ProjectsTab only; ThreadsTab is
  unchanged. The File-to chips moved to `ui/quickAdd/fileToChips.ts`, the edit fields to
  `ui/quickAdd/editFields.ts`, the action rows to `ui/quickAdd/ActionRow.tsx`
  (QuickAddWidget 2373 → 2213 lines).
- **Loop kinds** are readable synchronously (`storage/loopKinds.ts`), set on a Tag Rules save
  and loaded once at start.
- **Projects tab:** "New" has Track only (no "Not"). A row tap does nothing until the overview
  (step 4); the note icon on loop rows comes with step 5. A Project page gets a **Loops** tab
  (same component) for its own loops.
- **Todo grouping:** the loop tag stays visible inside its group.
- No "Refile as loop" label: refiling a bare loop tag converts through the hook.

File sizes over 500 lines touched by steps 0–3 (before → after): App.tsx 968 → 971,
domain/tagRules.ts 671 → 684, screens/ItemDetail.tsx 800 → 799, screens/ProjectDataPanel.tsx
724 → 725, storage/dataCache.ts 798 → 828, ui/QuickAddWidget.tsx 2373 → 2213 (baseline 2214).
