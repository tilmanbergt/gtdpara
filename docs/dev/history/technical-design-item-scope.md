# Technical design: Scope on the Project/Area detail page

2026-09-14 (revised same day: `## Scope` is scaffolded into every new
Project/Area from creation, not lazily appended — see "Section placement
in the file" below). New feature — no existing data model to extend, but follows
the same span-scoped content pattern `## Weekly Goals`
(`docs/dev/history/technical-design-weekly-goals.md`) already established, and sits
directly above `ui/ItemFocusPanel.tsx`'s existing Focus/goal block
(`docs/dev/history/technical-design-item-goal-display.md`, 2026-09-13).

## Requirement (clarified in chat, 2026-09-14)

A short free-text field on every Project and Area: an "overall scope
definition", typically 1-3 sentences — what this Project/Area is about,
as a standing reference while working in it. Decided:

1. **Where it shows**: only on the Project/Area detail page itself
   (`screens/ItemDetail.tsx`, the "Current" tab) — never in the
   Projects/Areas list, never on Daily/Week/Review.
2. **Placement**: top-left, above the Focus checkboxes, the weekly-goal
   line, and Files — i.e. the very top of the left column.
3. **Label**: shown under a small "Scope" heading, same visual weight as
   the existing "Focus"/"Files" section titles.
4. **Editing**: tap-to-edit inline — tapping the text opens an editable
   box with Save/Cancel, no separate edit-mode toggle elsewhere. Same
   interaction family as `ItemFocusPanel.tsx`'s `ItemGoalRow`, but see
   "Editing widget" below for why the input itself differs.
5. **Status gating**: always visible and editable, regardless of
   Active/On Hold/Done — unlike the Focus checkboxes, Scope is
   descriptive metadata, not an actionable pick, so it's never greyed
   out.
6. **Empty state**: a dim, tappable placeholder — "+ Add a scope" — same
   pattern as the goal row's "+ Add a goal for this week".
7. **No length limit enforced.** The "1-3 sentences" framing is guidance
   (reflected in the edit box's placeholder text), not a hard cap — same
   posture as the weekly goal field, which also has no length check.

## Data model

New `## Scope` content section in `project.txt`/`area.txt`, holding
exactly one free-text value per item (no per-week keying, no list of
entries — unlike `## Weekly Goals`, which is genuinely one-entry-per-week
history). Follows the mandatory span-scoped pattern
(`docs/dev/design-overview.md` §3: "Any new content added to
`project.txt`/`area.txt` beyond Tasks/Meetings must follow the same
span-scoped `getSpan`/`setSpan` pattern in `markdown.ts` — never
parse-and-regenerate the whole file").

Unlike Tasks/Meetings/Weekly Goals, there's no per-line grammar to parse
— the whole span *is* the value, verbatim. So there's no `extraLines`
concept here (nothing to classify as "recognized" vs "unrecognized" per
line), and no risk of the §2.2 reordering caveat, since there's only ever
one thing in this span. A hand-edited multi-paragraph Scope (blank line
between two sentences, say) round-trips untouched — `parseScopeSpan`
just joins the span's lines back with `\n`.

`domain/markdown.ts` additions:

```ts
const SCOPE_HEADING = '## Scope';

/** Parses the `## Scope` span - the whole span's lines joined back with
 * '\n' and trimmed, or '' if the heading is absent or empty. Unlike
 * Tasks/Meetings/Weekly Goals there's no per-line grammar - the span IS
 * the value, so a hand-written multi-line/multi-paragraph Scope
 * round-trips exactly as typed. */
export function parseScopeSpan(content: string): string {
  const {lines} = getSpan(content, SCOPE_HEADING);
  return lines.join('\n').trim();
}

/** Rebuilds only the Scope span; everything else in `content` is
 * untouched. An empty `scope` keeps the heading with no lines beneath it
 * (same convention as an empty Tasks/Meetings span), rather than removing
 * the heading outright. */
export function writeScopeIntoContent(content: string, scope: string): string {
  const trimmed = scope.trim();
  const lines = trimmed.length > 0 ? trimmed.split('\n') : [];
  return setSpan(content, SCOPE_HEADING, lines);
}
```

`domain/types.ts`: no new interface needed — `scope` is carried as a
flat `string` field on `ProjectFileState`/`CachedItem`, same as
`defaultResourceFolder`/`area` are flat strings rather than nested under
`FrontMatter` (this one isn't frontmatter at all, but the "flat field,
not a wrapper type" convention still applies for a single scalar).

**Section placement in the file — scaffolded, not lazy (revised
2026-09-14)**: unlike `## Weekly Goals`, `## Scope` *is* scaffolded by
`ensureSkeleton`, so every newly-created Project/Area gets an empty
`## Scope` heading from the moment it exists — before the app's own UI
ever touches it. Decided this way specifically so the section is already
sitting there to type into from Obsidian directly, with no dependency on
opening the item in the app first. Placed right after the frontmatter
block, before `## Tasks`/`## Meetings` — matching its "overview first"
position at the top of the detail page's left column:

```ts
export function ensureSkeleton(content: string, kind: GtdParaKind): string {
  if (content.trim().length > 0) return content;
  return `---\nkind: ${kind}\nstatus: active\n---\n\n${SCOPE_HEADING}\n\n${TASKS_HEADING}\n\n${MEETINGS_HEADING}\n`;
}
```

This only affects *brand-new* files (`ensureSkeleton` no-ops the instant
`content` is non-empty, same as always) — so it only actually lands via
`storage/createItem.ts`'s "Create Project"/"Create Area" flow (the one
call site that invokes `ensureSkeleton('', kind)` directly) and via any
of the `save*` functions the very first time they're called against a
truly empty file. An already-existing Project/Area (created before this
change, or hand-created in Obsidian without going through the app) gets
`## Scope` the same lazy way as before — appended at the end the first
time a scope is actually set through the app, or wherever the user adds
the heading by hand — so no migration is needed for existing files.

`storage/createItem.ts`'s own module doc comment ("scaffolded exactly
like any other fresh project.txt/area.txt … `status: active`, empty
Tasks/Meetings sections, no further fields") needs a one-word update to
mention the new empty Scope section too, alongside Tasks/Meetings —
otherwise no behavior change there, since it already just calls
`ensureSkeleton('', kind)` and lets that function decide the template.

## Storage layer

`storage/projectFile.ts`:

```ts
export async function saveScope(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  scope: string,
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeScopeIntoContent(base, scope);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}
```

`loadProjectFile` gains `scope: parseScopeSpan(rawContent)` in its
returned `ProjectFileState`, same shape every other span follows.

`storage/dataCache.ts`: `CachedItem` gains `scope: string`; the
`loadOneItem` error-fallback branch defaults it to `''`; new
write-through function mirroring `updateItemWeeklyGoals`:

```ts
export function updateItemScope(path: string, rawContent: string, scope: string): void {
  const item = cached?.items.find(i => i.path === path);
  if (!item) return;
  item.rawContent = rawContent;
  item.scope = scope;
  item.loadError = undefined;
}
```

## UI

**Where the code lives**: extended into `ui/ItemFocusPanel.tsx` rather
than a new standalone component. `ItemFocusPanel` was itself split out of
`ItemStatusPanel` specifically because Focus needed a *different screen
position* (top of the column vs. bottom, next to Status/Archive) — see
that file's own module doc comment. Scope has no such positional
conflict: it needs to sit immediately *above* Focus, in the same top
block of the same column, so it becomes a second section inside the same
component and the same `ensureItemCached` load, rather than a fourth
independently-loaded panel on this screen duplicating the same
load/error-state boilerplate for no positional reason. (If this changes
— e.g. Scope later needs to appear somewhere Focus doesn't — splitting it
out then is the same one-file extraction `ItemFocusPanel` itself already
demonstrates.)

`FocusPanelState` gains one field:

```ts
interface FocusPanelState {
  rawContent: string;
  scope: string;
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  weeklyGoals: WeeklyGoal[];
  weeklyGoalsExtraLines: string[];
  frontMatterExtraLines: string[];
  defaultResourceFolder: string | null;
  area: string | null;
}
```

`load()` reads `item.scope` alongside everything else it already reads.

New handler, save-only (Scope never touches frontmatter or any other
span, so — unlike `toggleFocus` — there's no `focusBlockedReason`/settings
check to run first):

```ts
const handleSaveScope = useCallback(
  async (text: string) => {
    if (!state) return;
    const nextRaw = await saveScope(kind, path, state.rawContent, text);
    updateItemScope(path, nextRaw, text);
    setState(prev => (prev ? {...prev, rawContent: nextRaw, scope: text} : prev));
  },
  [state, kind, path],
);
```

Render order inside the component's root `View`, top to bottom:

1. **New**: "Scope" heading + `ItemScopeRow` (below).
2. Existing: "Focus" heading + the two checkboxes + disabled-hint (now
   only ever shown when a *toggle* action itself fails validation, not
   for Scope) + `ItemGoalRow`.

**`ItemScopeRow`** (new sub-component in the same file, sibling to
`ItemGoalRow`): not-editing state shows the scope text plain (no
`numberOfLines` truncation — deliberately unclamped, unlike the
goal row's `numberOfLines={2}`, since Scope is meant to hold the fuller
1-3 sentence description rather than a short phrase) or, when empty, the
dim "+ Add a scope" prompt. Both tappable to enter edit mode — never
disabled by status (per the chat decision above), so there's no
`disabled` prop threaded into this row at all, unlike `ItemGoalRow`'s.
Editing shows a multiline text box (see below) plus Save/Cancel, mirroring
`ItemGoalRow`'s editing layout exactly otherwise (`useState` for
draft/saving/error, save-then-collapse-on-success).

**Editing widget**: `ItemGoalRow` reuses `ClipboardTextInput`, which is
single-line only today (a plain `TextInput` with no `multiline` prop —
fine for a short goal phrase, but a 1-3 sentence Scope reads and edits
better in a wrapping multi-line box rather than one long horizontally-
scrolling line). Proposed: extend `ClipboardTextInput` itself with an
optional multiline mode, rather than hand-rolling a second copy/paste-
enabled text field:

```ts
interface Props {
  ...
  /** Default false (single line, current behavior). true renders a
   * taller, top-aligned, wrapping box - e.g. for Scope's 1-3 sentence
   * text - while keeping the same Select All/Copy/Cut/Paste overlay. */
  multiline?: boolean;
}
```

```tsx
<TextInput
  ...
  multiline={multiline}
  textAlignVertical={multiline ? 'top' : 'center'}
  style={[styles.input, multiline && styles.inputMultiline, {color: textColor, borderColor}]}
/>
```

with `inputMultiline` adding a `minHeight` (enough for ~3-4 wrapped
lines) instead of the single-line implicit height. The existing overlay
(`bottom: '100%'`, right-aligned) sits above the box either way, so it
needs no change. This is a small, additive change to a shared component
— every existing call site (task text, meeting title, project/area name)
passes no `multiline` prop and keeps its current single-line behavior
unchanged.

`ItemScopeRow`'s edit box: `multiline`, placeholder text along the lines
of "What is this project/area about? (1-3 sentences)" to carry the
guidance into the UI without enforcing it in code.

**`ItemDetail.tsx`**: no changes needed beyond what already renders
`ItemFocusPanel` at the top of `leftPane` — Scope arrives "for free" as
part of that same component, already positioned above Files and
`ItemStatusPanel`. The module doc comment's placement note gets a short
addition mentioning Scope now lives at the very top of that same panel.

## Files touched

- `domain/markdown.ts` — `parseScopeSpan`/`writeScopeIntoContent` (new,
  ~10 lines total); `ensureSkeleton`'s template string gains the
  `## Scope` heading (one-line change, see "Section placement" above).
- `storage/createItem.ts` — module doc comment updated to mention the
  new empty Scope section alongside Tasks/Meetings (no code change — it
  already delegates the actual template to `ensureSkeleton`).
- `storage/projectFile.ts` — `ProjectFileState` gains `scope`,
  `loadProjectFile` parses it, new `saveScope`.
- `storage/dataCache.ts` — `CachedItem` gains `scope`, error-fallback
  default, new `updateItemScope`.
- `ui/ClipboardTextInput.tsx` — new optional `multiline` prop (additive,
  no existing call site changes behavior).
- `ui/ItemFocusPanel.tsx` — `FocusPanelState` gains `scope`, `load()`
  reads it, new `handleSaveScope`, new `ItemScopeRow` sub-component +
  styles, rendered above the existing "Focus" section; module doc comment
  updated.

No changes to `domain/types.ts`, `screens/ItemDetail.tsx`,
`ui/ItemStatusPanel.tsx`, or anything cross-item (Daily/Week/Review) —
matches requirement #1 (detail page only).

## Out of scope

- No Scope on the Projects/Areas list, Daily, Week, or Review — the
  requirement is explicit that this is a detail-page-only field.
- No history of past Scope text (it's a standing description, not a
  per-period entry like Weekly Goals) — always exactly one current
  value, overwritten in place.
- No character-count UI or enforced limit.

## Verification plan (per this project's standing convention)

- A `tsc --noEmit` pass against the scratch project (per
  `gtdpara_project.md`) covering the four touched/new files.
- A small standalone-Node round-trip check for
  `parseScopeSpan`/`writeScopeIntoContent`: fresh `ensureSkeleton('',
  kind)` output parses back to `scope === ''` (heading present, no
  lines); set scope → parse it back; multi-line/multi-paragraph scope
  round-trips exactly; saving Scope leaves an existing file's
  Tasks/Meetings/Weekly Goals/frontmatter byte-identical apart from the
  new `## Scope` span (the same kind of check `verify-markdown.ts`
  already does for other spans).
- A second check specifically for the scaffolding change: an
  already-existing project.txt/area.txt (pre-dating this feature, no
  `## Scope` heading at all) still parses fine (`scope === ''`, same as
  today) and round-trips byte-identical until a scope is actually set on
  it — confirms the "no migration needed" claim above rather than just
  asserting it.
- On-device smoke test once built: create a brand-new Project/Area and
  confirm `## Scope` is already there (via the Files pane opening the
  raw file, or by checking in Obsidian) even before typing anything;
  hand-type a scope into that heading from Obsidian and confirm the app
  picks it up on next refresh; add a Scope through the app to an
  existing pre-feature Project/Area; confirm placement above
  Focus/goal/Files; confirm the empty-state prompt; confirm status
  On Hold/Done doesn't grey it out; confirm a long (multi-sentence, or
  deliberately very long) Scope wraps sensibly rather than overflowing
  the column.
