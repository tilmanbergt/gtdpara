# Technical design: Meeting note auto-block

Status: DECIDED (chat clarification, 2026-09-18). **Phases 1-4 built and
committed; only Phase 5 (docs/dev/design-overview.md update + this status line's
final DONE flip) remains.**

**Phase 1** (on-device spike) - all four checks passed: custom-PNG template
via `createNote`, file-level `insertElements`/`getElements` round-trip
against a closed note while the gtdpara plugin itself was on screen (the
single biggest unverified assumption in this whole design), the same for a
`link` element, and `userData` round-tripping exactly. One real bug found
and fixed along the way (`Rect` is `{left,top,right,bottom}`, not
`{x,y,width,height}` - see `supernote/fileSystem.ts`'s `Rect`/`toRect` doc
comment) and one misleading skip-message bug in the spike's own gating
logic, also fixed (`storage/meetingNoteSpike.ts`'s doc comment on
`noteCreated`).

**Phase 2** (domain/storage layer) - built `domain/meetingNoteBlock.ts`,
`storage/meetingNoteAggregate.ts`, `storage/meetingNoteContent.ts`
(`populateMeetingNoteBlock`/`refreshMeetingNoteBlock`), plus - pulled
forward from Phase 3 - the `meetingNoteBlockTopX`/`TopY`/`MaxWidth` fields
Phase 2 needed to type-check.

**Phase 3** (Settings UI) - added `domain/settings.ts`'s
`meetingNoteTemplate` field (the one deliberately NOT pulled into Phase 2)
and a new "Meeting Note" tab in `Settings.tsx`: a plain-list `.png` template
picker over `MYSTYLE_FOLDER` plus the three block-position number fields.
Incidental bugfix found while touching `Settings.tsx`'s `handleSave`, not
otherwise part of this feature: its `cleaned: GtdParaSettings` object
literal only ever listed the Folders/Focus/Calendar fields by name, so
every field added to the settings type since (`hideDoneProjectTasks`/
`hideDoneInboxTasks`/`lastReviewCompletedAt`/`lastReviewSummary`/
`focusModeActive`) was silently reset to its default on every tap of Save -
fixed by spreading `...values` first. `parseFocusCount` was renamed to
`parseNonNegativeInt` since the Meeting Note tab's number fields now share
it.

**Phase 4** (wiring) - `storage/noteLinks.ts`'s `getNoteTemplate` took its
planned breaking signature change (now settings-backed); its two callers
(`createLinkedNote`, `storage/standaloneNotes.ts`'s `createStandaloneNote`)
both gained the `settings` param that ripples from it, updated at all 9
call sites (8 `createLinkedNote` calls - Todos + Meetings, across the 4
screens - plus `ProjectDataPanel.tsx`'s standalone-note quick-add handler).
All 8 Meeting `handleCreateNote`/`handleOpenNote` pairs (§6's table) now
also call `refreshMeetingNoteBlock`.

Two small deviations from this doc's exact text, flagged in the new files'
own doc comments rather than silently resolved: `refreshMeetingNoteBlock`
takes an explicit optional 4th `inbox` param (§6's own code sample shows a
3-arg call, but its surrounding prose says the four call sites pass
different `inbox` arguments, which only makes sense if the function has
one); and §3.4's "reuse `storage/linkedFiles.ts`'s fileName-splitting
helper" isn't done literally, since that helper (`relativeLocation`) isn't
exported - `meetingNoteContent.ts` has its own tiny local `fileNameOf`.

Phase 1's temporary spike code (`storage/meetingNoteSpike.ts`, Settings.tsx's
"Spike" tab) has NOT been removed yet - still explicitly pending cleanup,
see that file's own doc comment; nothing built in Phases 2-4 depends on it
any more.

## 0. What it is

Extends the existing per-meeting linked-note mechanism (`Meeting.notePath`,
`storage/noteLinks.ts`'s `createLinkedNote`, `ui/MeetingRow.tsx`'s
📓/+📓 icon) so that the note's first page carries one auto-generated,
auto-refreshed block: meeting title, date/time, a tappable link to the
meeting's linked file (`Meeting.linkedFile`, if any), and a list of every
open todo anywhere in the vault that shares a tag with the meeting. The
block is a real Supernote textbox (+ a real Supernote link element)
identified by a fixed `userData` marker, so it can be found and replaced on
every regeneration without touching anything else the user has drawn or
written on that page.

No new trigger, no new gesture: the existing `+📓`/`📓` tap (create /
open) on a Meeting row is what fires this, on all four screens that render
`MeetingRow` with note actions. See §6 for why "double-tap" from the
original ask becomes "the existing single tap, on both actions" here.

Decided in chat (2026-09-18), recapped inline per-section below; nothing
in this doc reopens those decisions.

## 1. Data model

### 1.1 `domain/settings.ts` - `GtdParaSettings` additions

```ts
/** Filename only (e.g. "meeting-a5x.png"), resolved against MYSTYLE_FOLDER
 *  (supernote/fileSystem.ts) - NOT a path the user types free-form, picked
 *  from a listing of that folder. '' = no custom template picked yet, falls
 *  back to storage/noteLinks.ts's BLANK_TEMPLATE_NAME (unchanged default for
 *  every note this plugin creates when this is empty). */
meetingNoteTemplate: string;
/** Position/size of the one auto-generated block, in device px (design-
 *  device-rendering.md's coordinate space - 1 RN dp = 1 device px, A5X
 *  1404x1872). Height is never configured - see §3.3, it's computed from
 *  content every time the block is (re)built. */
meetingNoteBlockTopX: number;
meetingNoteBlockTopY: number;
meetingNoteBlockMaxWidth: number;
```

Defaults (`DEFAULT_SETTINGS`): `meetingNoteTemplate: ''`,
`meetingNoteBlockTopX: 60`, `meetingNoteBlockTopY: 60`,
`meetingNoteBlockMaxWidth: 1280` - centered-ish margins on the 1404px-wide
A5X page (60px left/right-ish margin at max width), picked the same
"reasonable starting point, retune from a real screenshot" way every other
hand-tuned constant in this codebase is (`ui/pagination.ts`'s `PAGE_SIZE`s,
`ui/textLineEstimator.ts`'s safety margin) - not claimed to be measured.

No new settings needed for *which* page (always page 0/first page - a
linked meeting note is created fresh with exactly one page, and this
feature never adds a second box per §7's "out of scope"), and no per-
Project/Area override (global setting, per the chat decision).

### 1.2 `supernote/fileSystem.ts` - `MYSTYLE_FOLDER` constant

```ts
/** Fixed OS path plugins are deployed to/read shared resources from -
 *  not a setting (unlike baseRoot): this is where the Supernote's own
 *  MyStyle assets (and this device's installed .snplg files) already
 *  live, confirmed via the existing deploy step
 *  (`adb push build/outputs/*.snplg /storage/emulated/0/MyStyle/`). */
export const MYSTYLE_FOLDER = '/storage/emulated/0/MyStyle';
```

Listing it for the template picker reuses the existing
`listFolderEntries(folderPath)` wrapper unchanged (it already accepts any
absolute path, not just PARA roots - `storage/folderIndex.ts`,
`storage/linkedFiles.ts`'s `linkedFileStatus` already call it against
arbitrary folders). Filter the result to `.png` (case-insensitive,
`!isFolder`) client-side; no new native call needed.

## 2. Why the template question resolved the way it did

`storage/noteLinks.ts`'s `getNoteTemplate()` already documents the exact
failure this feature has to avoid repeating: passing a *resource
reference* (`vUri`/`hUri` from `PluginCommAPI.getNoteSystemTemplates()`) to
`PluginFileAPI.createNote`'s `template` param fails with "Background
template file does not exist," which is why every note this plugin creates
today is hard-coded to `style_white`.

Tilman's clarification: the templates he means are plain PNG files that
already sit in the device's `MyStyle` folder - i.e. exactly the "custom
template image file path" branch `createNote`'s own documented signature
describes, as opposed to the `getNoteSystemTemplates()` resource-URI branch
that's already confirmed broken here. So `getNoteTemplate()` gets a real
settings-backed body for the first time:

```ts
// storage/noteLinks.ts
export function getNoteTemplate(settings: GtdParaSettings): string {
  if (!settings.meetingNoteTemplate) return BLANK_TEMPLATE_NAME;
  return `${MYSTYLE_FOLDER}/${settings.meetingNoteTemplate}`;
}
```

This is a **breaking signature change** (today it's called with zero
args, from both `createLinkedNote` and `storage/standaloneNotes.ts`'s
`createStandaloneNote`) - both call sites gain a `settings` param they
don't currently take, which ripples to their own callers (every
`handleCreateNote` in §6, plus `ProjectDataPanel.tsx`'s note-mini-tab
handler for standalone notes). Confirmed acceptable: standalone notes and
todo-linked notes get the *same* global template as meeting notes for free
this way, rather than needing their own setting - matches "one global
template" as decided, extended to every note this plugin creates, not only
meeting notes (nothing in the chat decision restricted it to meetings
specifically, and having todo/standalone notes suddenly diverge from
meeting notes in template would be a stranger outcome than sharing it).

**Open technical risk, not yet verified on real hardware:** whether
`createNote`'s `template` param genuinely accepts an arbitrary filesystem
path (as the docs describe) rather than requiring the file to be inside
some Supernote-internal template registry first. Phase 1 (§8) spikes this
specifically, with the plugin's own `style_white` fallback staying the safe
default the whole rest of the feature works against if it doesn't pan out.

## 3. The block's content and the userData marker

### 3.1 Marker

```ts
// domain/meetingNoteBlock.ts (new, pure)
export const MEETING_NOTE_BLOCK_USERDATA = 'gtdpara:meeting-note-block:v1';
export const MEETING_NOTE_LINK_USERDATA = 'gtdpara:meeting-note-link:v1';
```

Two separate markers, not one, even though both live in "one box" per the
chat decision (§ layout) - because they're two different `Element.type`s
(`textBox` vs `link`) and the SDK's own element model has no notion of
grouping unrelated element types under one identity. "One box" therefore
means: one visually contiguous block, built from exactly one `textBox`
element (title/date/"Relevant Todos:"/todo list, and, when there's no
link, that's the whole block) plus, only when `Meeting.linkedFile` is set,
one `link` element positioned to look like the next line of the same
block (see §3.4 for how its rect is derived from the textbox's own
measured height, so the two visually read as one unit even though they're
two elements).

### 3.2 Text content (`domain/meetingNoteBlock.ts`)

```ts
export interface MeetingNoteTodo {
  text: string;         // Task.text, tags left inline (matches every other row's convention)
}

export function buildMeetingNoteText(
  meeting: Pick<Meeting, 'title' | 'date' | 'time'>,
  todos: MeetingNoteTodo[],
): string
```

Pure string builder, no I/O, unit-testable the same way
`domain/markdown.ts`'s builders are. Output shape (blank line separators
matching the user's own rough outline exactly):

```
<title>
<formatted date>[ · <time>]

Relevant Todos:
- <todo 1 text>
- <todo 2 text>
...
```

`formatFullDate` (`domain/meetingTime.ts`, already exists) formats the
date; `time` appended only when non-`''` (`Meeting.time` is `''` for a
date-only meeting, per its own doc comment). The "Link:" line is
deliberately **not** part of this string - it's a separate `link` element
placed right under the textbox (§3.4), because a real tappable link can't
be embedded inside a plain textbox's string content; when there's no
`linkedFile`, nothing is reserved for it - the todos start one line
earlier, not with a gap.

No "Relevant Todos:" heading or list at all when `todos` is empty (not
"Relevant Todos: (none)") - matches this codebase's general convention of
omitting empty sections rather than labelling their absence
(`Meeting.linkedFile`'s own "if applicable" already established this for
the Link line).

### 3.3 Height (never configured - computed every time)

Settings gives `topX`/`topY`/`maxWidth` only; height is derived, reusing
`ui/textLineEstimator.ts`'s `activeLineEstimator.estimateLines(text,
availableWidthPx, fontSizePx)` per logical line of `buildMeetingNoteText`'s
output (title line, date line, each todo line - blank lines count as 1),
summed and multiplied by an assumed line-height-per-font-size, the same
~1.2x estimate `design-device-rendering.md` §5 already flags as this
codebase's standing approximation for on-device line height. This is a
known-imprecise reuse - `textLineEstimator` was built/calibrated for this
plugin's *own* React Native row rendering, not for predicting how the NOTE
app's native text-box renderer wraps text, so treat its output here as a
rough starting rect, over-provisioning being the safe failure mode exactly
as that module's own doc comment argues, and flag for recalibration once
Phase 1 gets a real on-device screenshot of an actual inserted textbox
element to compare against. The "no cap, let it grow" decision means this
estimate only has to be *roughly enough* height to avoid obvious clipping,
not exact - there's no hard ceiling this needs to respect.

### 3.4 The link element's placement

Rect: `{x: topX, y: topY + textBoxHeight, width: maxWidth, height: <one
line's worth, from the same estimator>}` - i.e. it's placed exactly where
the next line after the textbox would fall, so the two elements read as
one continuous block. `linkType`/`destPath` chosen from `linkedFile`'s
extension:

| extension | `linkType` | notes |
|---|---|---|
| `.note` | 1 (other note file) | |
| `.pdf` (or other DOC-recognized) | 2 (document, with page nav) | `destPage` omitted/0 - no stored page to jump to |
| image extensions (`.png`/`.jpg`/...) | 3 (image file) | |
| anything else | 1 (fallback: treat as a plain file link) | flagged as a real gap, not silently "no link" - see §8 |

`destPath` is the **absolute** path (`storage/linkedFiles.ts`'s
`resolveLinkedFilePath(paths, meeting.linkedFile)` - `linkedFile` is always
base-root-relative, this module already has the exact function for this).
`showText`: the linked file's bare name (`fileName` half of
`storage/linkedFiles.ts`'s own path-splitting helper, reused rather than
re-derived) prefixed `"Link: "` - matches the user's own rough-outline
wording exactly. `fullText` same as `showText` (no separate "hover" text
concept exists in this UI). `fontSize`: same constant the textbox uses, so
the two lines look uniform.

## 4. Which todos are "relevant" (new pure aggregate)

New file `storage/meetingNoteAggregate.ts` (deliberately not folded into
`dailyAggregate.ts` - the matching rule here is genuinely different, see
below, and that file's own doc comment is already dense with Daily-
specific exceptions this would only add noise to):

```ts
export interface MeetingRelevantTodo {
  item: {kind: GtdParaKind; name: string; path: string}; // same shape as DailyItemRef, not importing it to avoid a Daily-specific dependency
  task: Task;
}

export function relevantTodosForMeeting(
  items: CachedItem[],
  inbox: {tasks: Task[]} | null,
  meeting: Pick<Meeting, 'tags'>,
): MeetingRelevantTodo[]
```

Rule (chat-decided): **tag match only**, no Project/Area membership
check, no `resolveAbbrevPath` union like `dailyAggregate.ts`'s
`contextTag` has - deliberately simpler than that file's rule. A task
qualifies when `!task.done && !task.cancelled && task.tags.some(t =>
meeting.tags.includes(t))`, **regardless of `flowState`** - Waiting
For/Someday/Maybe all included (unlike `dailyAggregate.ts`, which always
excludes Maybe even on a tag match) - "independent of flow-state" was the
user's own phrase for this. Scans every `CachedItem` in `items` (Projects
+ Areas, from `storage/dataCache.ts`'s warm cache - no filesystem I/O here,
same "pure transform over what's already loaded" posture as
`dailyAggregate.ts`) plus the synthetic Inbox source when `inbox` is
non-null, mirroring that file's own Inbox-folding pattern minus the
`DailyItemRef`/`INBOX_ITEM` machinery this doesn't need (no grouping, no
"jump to Project/Area" UI - the note block just prints `task.text` lines).
No pagination, no cap - printed in whatever order the cache iterates items
in (not sorted; not asked for, and this box doesn't have a stable "which
order" expectation the way a UI list would).

A meeting with `tags: []` naturally produces `[]` here - not special-
cased, falls out of `.some()` on an empty array.

## 5. Building and writing the block (new storage function)

New file `storage/meetingNoteContent.ts`:

```ts
export async function populateMeetingNoteBlock(
  notePath: string,        // absolute, already resolved via storage/noteLinks.ts's resolveNotePath
  meeting: Meeting,
  linkedFileAbsolutePath: string | null, // already resolved, or null when meeting.linkedFile === ''
  todos: MeetingRelevantTodo[],
  settings: GtdParaSettings,
): Promise<void>
```

Steps (page is always `0`, main layer `layerNum: 0` - required for the
`link` element per the SDK's layer restriction that titles/links/five-
stars are main-layer-only, so the textbox is kept on layer 0 too rather
than splitting the two elements across layers for no reason):

1. `getElements(0, notePath)` (new wrapper, §5.1) - fetch every existing
   element on page 0.
2. Filter to ones whose `userData` is `MEETING_NOTE_BLOCK_USERDATA` or
   `MEETING_NOTE_LINK_USERDATA`; if any exist, `deleteElements(notePath, 0,
   [...their numInPage values])` (new wrapper, §5.1) - this is the
   "always regenerate, discard edits" decision: no diffing, no merge,
   whatever was there is gone.
3. Build the textbox element: `PluginCommAPI.createElement(<textBox type
   constant>)` (per the SDK's own "always call createElement before
   inserting new elements" rule) → set `.userData =
   MEETING_NOTE_BLOCK_USERDATA`, `.pageNum = 0`, `.layerNum = 0`,
   `.textBox = {textContentFull: buildMeetingNoteText(...), textRect: {x:
   settings.meetingNoteBlockTopX, y: settings.meetingNoteBlockTopY, width:
   settings.meetingNoteBlockMaxWidth, height: <estimated, §3.3>},
   textEditable: 1, ...}` - `textEditable: 1` specifically, so the box
   stays a normal editable Supernote textbox afterward (the user can tap
   into it), not a locked/baked-in element.
4. When `linkedFileAbsolutePath` is non-null: build the link element the
   same `createElement`-then-populate way, `.userData =
   MEETING_NOTE_LINK_USERDATA`, `.link = {...}` per §3.4.
5. `insertElements(notePath, 0, [textboxElement, ...(linkElement ? [linkElement] : [])])`
   (new wrapper, §5.1) - both in one call, so a failure partway can't
   leave the link without its textbox or vice versa.
6. `element.recycle()` on every `Element` object touched in steps 1-4 (the
   SDK's own memory-management rule) - straightforward here since nothing
   in this function loops over a large page.

Errors propagate (no swallowing) - every existing `handleCreateNote`/
`handleOpenNote` call site already wraps its work in a `runAction`/
`runTaskAction`-style try/catch that surfaces a screen-level error line
(§6), so this function stays a plain throw-on-failure async function
consistent with `createLinkedNote`/`openPath`/every other storage function
it sits alongside.

### 5.1 New `supernote/fileSystem.ts` wrappers

Same shape/conventions as every existing wrapper in that file (permission
check via `ensureFileWritePermission`/`ensureFileReadPermission`,
`log`/`logError`, `APIResponse` unwrap, throw on `!success`):

```ts
export async function getElements(page: number, filePath: string): Promise<Element[]>
export async function deleteElements(filePath: string, page: number, numInPageList: number[]): Promise<void>
export async function insertElements(filePath: string, page: number, elements: Element[]): Promise<void>
export async function createElement(type: number): Promise<Element> // wraps PluginCommAPI.createElement
```

**Not** using `PluginNoteAPI.insertText`/`insertTextLink` for this, even
though they're the higher-level, seemingly-simpler calls - two reasons,
both worth stating plainly since they're a real departure from the
"simplest API that does the job" instinct:

1. `insertText`'s documented param shape has no `userData` field at all -
   there is no way to tag a box inserted this way, which is the one
   property this whole feature is built around (§3.1).
2. Neither `insertText` nor `insertTextLink`'s documented signature takes
   a `filePath`/page - unlike every `PluginFileAPI` call this codebase
   already relies on (`createNote`, `insertKeyWord`, `getElements`/
   `insertElements`/`deleteElements` all take an explicit path). That
   strongly suggests `PluginNoteAPI` operates on whichever note is
   *currently open in the NOTE app*, not an arbitrary file - and this
   feature's trigger (tapping a note icon inside the gtdpara plugin's own
   full-screen UI) is **not** "the NOTE app has that note open," it's
   "the gtdpara plugin is what's currently on screen." `PluginFileAPI`'s
   calls are plain file-level I/O with no such requirement (this is
   exactly how `createNote`/`insertKeyWord`/`openPath` already work
   today, against notes nobody has open). Building both the textbox and
   the link as plain `Element`s via `insertElements` sidesteps this
   entirely, consistent with everything else this codebase already does
   at the file level. **This is the single biggest unverified assumption
   in this design - see §8's Phase 1.**

## 6. Wiring into the four screens

Every `handleCreateNote(index|entry)` / `handleOpenNote(index|entry)` pair
that already calls `createLinkedNote`/`openPath` for a **meeting**
(deliberately not touched for Todos - this feature is Meeting-only, per
the chat decision) gains one call, right after the existing
`createLinkedNote`/`openPath` succeeds and (for create) the meeting's
`notePath` is saved:

| Screen | Existing handlers (meetings) |
|---|---|
| `screens/ProjectDataPanel.tsx` (`MeetingsSection`) | `handleCreateNote`/`handleOpenNote`, ~L1082/L1093 |
| `screens/DailyView.tsx` | `handleCreateMeetingNote`/`handleOpenMeetingNote`, ~L1058/nearby |
| `screens/ReviewScreen.tsx` (Inbox-to-zero step) | `handleInboxCreateMeetingNote`/`handleInboxOpenMeetingNote`, ~L1493/nearby |
| `screens/InboxScreen.tsx` | `handleCreateMeetingNote`/`handleOpenMeetingNote`, ~L625/nearby |

Each becomes, in shape (using `ProjectDataPanel.tsx`'s as the concrete
example):

```ts
const handleCreateNote = (index: number) => {
  Keyboard.dismiss();
  runAction(async () => {
    const baseName = meetingNoteBaseName(meetings[index]);
    const settings = await loadSettings(); // already imported in every one of these 4 files
    const notePath = await createLinkedNote(itemPath, MEETINGS_SUBFOLDER, baseName, settings); // settings param added, §2
    const next = meetings.slice();
    next[index] = {...next[index], notePath};
    await onSave(next);
    await refreshMeetingNoteBlock(next[index], itemPath, settings); // new, see below
  });
};

const handleOpenNote = (index: number) => {
  Keyboard.dismiss();
  runAction(async () => {
    const settings = await loadSettings();
    await refreshMeetingNoteBlock(meetings[index], itemPath, settings);
    await openPath(resolveNotePath(itemPath, meetings[index].notePath));
  });
};
```

`refreshMeetingNoteBlock(meeting, itemPath, settings)` (new, in
`storage/meetingNoteContent.ts` alongside `populateMeetingNoteBlock` - the
per-screen-callable wrapper that does the resolving
`populateMeetingNoteBlock` itself doesn't do): resolves the absolute
`notePath` (`resolveNotePath`), resolves `linkedFile` when set
(`storage/linkedFiles.ts`'s `resolveLinkedFilePath`), reads
`storage/dataCache.ts`'s `getCachedData()?.items ?? []` plus (for the
non-Inbox screens) `null` for `inbox`, or, on `InboxScreen.tsx`/
`ReviewScreen.tsx`'s Inbox-to-zero step, the actual loaded `Inbox.txt`
tasks already in scope there - runs `relevantTodosForMeeting`, then calls
`populateMeetingNoteBlock`. One function, four call sites each pass
slightly different `inbox` arguments depending on what that screen
already has loaded - no new data-loading path, this only ever reads what
each screen's own `load()` already fetched.

On open, this runs **before** `openPath` (not after) so the note the
NOTE app opens already shows the refreshed block, rather than the user
seeing stale content for a moment. Both handlers now do meaningfully more
I/O than before (one extra `getElements`/`deleteElements`/`insertElements`
round trip) - acceptable per the "always regenerate" decision, but worth
watching on a real device for how noticeable that delay is before/after
`openPath`; if it's bad, `openPath` could fire first with
`refreshMeetingNoteBlock` racing it un-awaited, since opening a note and
writing to its file are different subsystems anyway - not built this way
by default because "the user sees it update qafter opening" is a strictly
worse experience than "a half-second pause before it opens," not because
racing them is technically wrong.

**Duplication acknowledged, not fixed here**: this adds one more near-
identical pair of lines to four already-near-identical
`handleCreateNote`/`handleOpenNote` implementations -
`technical_debt.md`'s existing item #4 already tracks that these four
screens hand-roll the same note-create/open shape independently, and nothes
new about this feature makes that worse in kind, just in degree by one
more line each. Not folding this feature into a shared helper as a side
quest - same "out of scope for the feature that surfaced it" call that
item already made.

### 6.1 "Double-tap" reinterpreted

The original ask described double-tapping an *existing* note's icon as the
regenerate trigger. This codebase's actual `MeetingRow.tsx` has no
double-tap gesture anywhere, and its single-tap-per-icon-state convention
(`+📓` when no note exists → create; `📓` when one does → open) is used
consistently across every row type. Introducing a double-tap purely for
this one icon would be new interaction vocabulary this app doesn't have
elsewhere. Resolution (stated here, not re-asked): **the existing single
tap on `📓` (open) now also refreshes the block**, alongside the already-
obvious refresh-on-create. This satisfies the same underlying want
("reopening a meeting's note re-syncs it") without a new gesture. Flagging
this explicitly in case a real double-tap was actually wanted and this
reinterpretation isn't acceptable - straightforward to swap for a
`onLongPress`-based "refresh" affordance instead if so, but that would be
new interaction vocabulary, not a refinement of existing vocabulary, so it
seemed worth deciding explicitly here rather than silently picking one.

## 7. Explicitly out of scope for v1

- Recurring meetings - `Meeting.recurrence`/`occurrences` exist in
  `domain/types.ts` but nothing in this codebase creates a recurring
  meeting yet (confirmed against the repo, not just memory, during this
  design). This feature only ever deals with one linked note per one-off
  meeting; a shared-notebook-with-appended-pages design is deferred until
  recurring meetings themselves exist.
- A second independently-positioned box (title+date separate from
  link+todos) - one box, one position/width setting, per the chat
  decision; the marker/element design in §3.1 doesn't prevent adding a
  second box+setting pair later, but nothing here builds toward it
  speculatively.
- The "gpt data" second sidebar button - the user's own stated v2 idea.
- Any Task-linked-note equivalent of this block - Meeting-only, matches
  the chat decision (todos are the payload, not the subject, of this
  feature).
- Live/partial refresh, diffing, or preserving hand-edits inside the
  block - "always regenerate, discard edits" was explicit.
- A template picker with live PNG thumbnail previews - v1 lists MyStyle's
  `.png` filenames as plain text choices (Settings already has this
  general shape for folder-name fields); a preview could reuse
  `PluginFileAPI.generateNoteTemplatePng`-adjacent ideas later but nothing
  here needs it to ship.

## 8. Verification / implementation phases

Following this project's usual "spike the risky unknown first" posture
(see `gtdpara_project.md`'s own tsc/App.tsx and revert-pattern lessons):

**Phase 0 - domain layer (no device needed).** `domain/meetingNoteBlock.ts`
(`buildMeetingNoteText`, the two `userData` constants) and
`storage/meetingNoteAggregate.ts`'s `relevantTodosForMeeting` are pure
functions - write and unit-test them (this project's standalone-Node
convention, `design-overview.md` §3) against hand-built `Meeting`/`Task`/
`CachedItem` fixtures before touching any SDK call at all. Cheapest place
to get the text-building and tag-matching logic right.

**Phase 1 - DONE (2026-09-18), all four checks passed** - the real spike,
on-device, before building anything else on top of it. Confirmed, on real
hardware, in this order (stop and re-plan §2/§5 if any of these come back
negative rather than pushing forward):
1. Does `createNote({..., template: '<MyStyle-absolute-path>.png'})`
   actually succeed and produce a note with that PNG as its background -
   or does it fail the same "Background template file does not exist"
   way the resource-URI path already does? (§2's open risk.)
2. Can `insertElements`/`getElements`/`deleteElements` target an
   arbitrary `.note` file's page 0 while the *gtdpara plugin itself* (not
   the NOTE app) is what's on screen - i.e. does file-level element I/O
   really work without that note being "open" anywhere? (§5.1's open
   risk - this one is the load-bearing assumption for the entire feature;
   if it turns out `insertElements` also needs the note "open," this
   whole design needs a different trigger shape, likely routing through
   `openPath` first and a lasso/toolbar-button context second.)
3. Does a `link`-type `Element` inserted this way actually render as a
   tappable link when the note is opened normally (not just accepted by
   `insertElements` without error), and does tapping it do the navigation
   `linkType` implies?
4. Round-trip `userData`: insert an element with it set, `getElements`
   the same page back, confirm the field survives exactly.

**Phase 2 - DONE (2026-09-18)** - built `domain/meetingNoteBlock.ts`
(`buildMeetingNoteText`, the two `userData` constants,
`estimateMeetingNoteBlockHeight`/`meetingNoteLinkLineHeight`,
`linkTypeForExtension`), `storage/meetingNoteAggregate.ts`
(`relevantTodosForMeeting`), and `storage/meetingNoteContent.ts`
(`populateMeetingNoteBlock`/`refreshMeetingNoteBlock`), on top of the
`supernote/fileSystem.ts` wrappers Phase 1 already built and verified. No
unit tests added yet for the pure functions (Phase 0's own "write and
unit-test them" wasn't done as a separate step - folded into this phase
instead, untested beyond the syntax check every phase here runs) - worth
doing before Phase 4 wires real call sites into these, not blocking Phase 2
itself. See this doc's top-of-file status line for the two small
deviations from the text below that this phase's actual code took.

**Phase 3 - DONE (2026-09-18) - settings additions** (§1.1's
`meetingNoteTemplate` field, §1.2's MyStyle listing/picker, now a
"Meeting Note" tab in `Settings.tsx`). Found and fixed one incidental,
unrelated bug while touching `Settings.tsx`'s `handleSave` - see the
top-of-file status line.

**Phase 4 - DONE (2026-09-18) - wired the call sites** (§6), updated
`getNoteTemplate`'s signature and its two existing callers (§2's breaking
change), all 9 ripple call sites across the 4 screens plus
`ProjectDataPanel.tsx`'s standalone-note handler.

**Phase 5 - `docs/dev/design-overview.md` update** (new §2.x, per this
project's standing convention of folding every shipped feature's as-built
summary in there) + this file's own status line flipped to DONE.

Verification posture matches recent features here: a scratch `tsc
--noEmit` pass across every touched/new file (this sandbox's now-standard
substitute for a real `node_modules`), plus the mandatory post-commit
re-stage+diff (`gtdpara_project.md`'s standing rule) given this touches
`ProjectDataPanel.tsx`/`DailyView.tsx`/`ReviewScreen.tsx` - three of the
four files that project's own revert-pattern history flags as previously
affected. No amount of `tsc`/unit-testing substitutes for Phase 1's actual
on-device checks though - those are hard SDK-behavior questions, not type
questions.

## Related

[[feature_linked_files]] for `notePath`/`createLinkedNote`/`MeetingRow`'s
icon convention this extends. [[feature_context_tags]] for the tag-match
convention `relevantTodosForMeeting` borrows from (deliberately
simplified - no abbrev-union, no flow-state exclusion). [[feature_tags]]
for `FlowState`/why "independent of flow-state" is a real, stated
departure from `dailyAggregate.ts`'s own rule. [[feature_standalone_note_
quickadd]] for `getNoteTemplate`'s existing seam and the
`insertKeyWord`-not-yet-device-verified precedent this design's Phase 1
follows. [[design_device_rendering]] for the px coordinate space/line-
height-estimate conventions §1.1/§3.3 reuse. [[technical_debt]] item #4
for the per-screen handler duplication this adds one more line to, by
design, not by oversight.
