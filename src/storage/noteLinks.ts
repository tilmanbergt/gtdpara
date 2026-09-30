/**
 * Creates and names the .note files linked to todos/meetings
 * (design-overview.md §3's "→ [[...]]" note-linking, now built for both
 * Tasks and Meetings). A linked note lives in a "Meetings" or "Todos"
 * subfolder of the Project/Area it belongs to - sibling to project.txt/
 * area.txt, not nested under wherever the user happens to be browsing in
 * the left-pane file tree.
 */
import {RESERVED_BARE_TAGS, setFlowStateTag, stripBareTags} from '../domain/flowState';
import {setDueTag} from '../domain/markdown';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {NoteContext, resolveNoteTemplate} from '../domain/noteTemplate';
import {joinNotePath, parseSharedNoteAnchor} from '../domain/sharedNotePages';
import {GtdParaSettings} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {createNote, ensureFolderExists, fileExists, MYSTYLE_FOLDER} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {collisionFreeName} from './fileNaming';

export const MEETINGS_SUBFOLDER = 'Meetings';
export const TODOS_SUBFOLDER = 'Todos';

/**
 * Supernote's built-in blank page, referenced by the exact name
 * PluginFileAPI.createNote expects - the fallback getNoteTemplate below uses
 * when no custom MyStyle template is picked. Matches the working pattern
 * from the textboxHelper project's import flow, which creates notes the
 * same way - a fixed name, not one picked at runtime from
 * getNoteSystemTemplates() (a vUri/hUri resource reference from that call is
 * what produced "Background template file does not exist" here before).
 */
const BLANK_TEMPLATE_NAME = 'style_white';

/**
 * The one remaining caller of this is `storage/standaloneNotes.ts`'s
 * `createStandaloneNote` (Project/Area standalone notes, Phase 4 - not
 * wired through `resolveNoteTemplate`/`NoteCreationDefinition` at all yet,
 * so they still just get a blank note). Used to also resolve a
 * settings-backed global `meetingNoteTemplate` filename (retired 2026-09-18,
 * Phase 3, docs/dev/technical-design-note-templates.md - see domain/settings.ts's
 * revision history for that field) - now a trivial constant, kept as its own
 * named function rather than inlined at the one call site so a future
 * per-context standalone-note background (flagged, not yet built - see
 * createStandaloneNote's own doc comment) has an obvious place to grow into.
 */
export function getNoteTemplate(): string {
  return BLANK_TEMPLATE_NAME;
}

/**
 * Resolves the MyStyle background a linked note (createLinkedNote below)
 * should use, the same way `storage/meetingNoteContent.ts` resolves that
 * note's *content*: `resolveNoteTemplate(context, tags, ...)`, using the
 * matched definition's own `template` field (`''` meaning blank/
 * `style_white`, same convention `NoteCreationDefinition.template`'s own doc
 * comment uses). Falls back to blank (`BLANK_TEMPLATE_NAME`) when
 * `resolveNoteTemplate` finds no matching/enabled definition for this
 * context+tags - mirrors `refreshMeetingNoteBlock`/`refreshTodoNoteBlock`
 * both simply doing nothing in that same "no definition" case on the
 * content side, so a context with zero definitions configured (every Todo
 * definition, until the user adds one - see domain/noteTemplate.ts's module
 * doc comment on why none is auto-seeded there) still just gets a blank
 * note, same as before this feature existed anywhere.
 *
 * Originally (2026-09-18) fell back to `getNoteTemplate(settings)` - the
 * global `meetingNoteTemplate` setting - instead of blank directly; that
 * field was retired the same day (Phase 3) once every context resolved its
 * background per-definition, so this fallback simplified to the same
 * `BLANK_TEMPLATE_NAME` `getNoteTemplate` itself now always returns.
 */
export function resolveNoteBackgroundTemplate(
  settings: GtdParaSettings,
  context: NoteContext,
  tags: string[],
): string {
  const definition = resolveNoteTemplate(context, tags, settings.noteCreationDefinitions);
  if (!definition) return BLANK_TEMPLATE_NAME;
  return definition.template ? `${MYSTYLE_FOLDER}/${definition.template}` : BLANK_TEMPLATE_NAME;
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|#]/g;

/**
 * Strips characters that can't live in a filename and collapses whitespace;
 * falls back to "Untitled" for an empty result.
 *
 * `#` was added 2026-09-23 ([[bugfix_shared_note_content_missing]], second
 * occurrence) - not filesystem-illegal, but reserved by
 * `domain/sharedNotePages.ts`'s anchor encoding
 * (`buildSharedNoteAnchor`/`parseSharedNoteAnchor`, `"relativePath#keyword"`)
 * to mark where a shared-note anchor's file path ends. `todoNoteBaseName`
 * below intentionally keeps context tags like `#daily` in a note's file
 * name (they're part of what the item *is*), which meant an ordinary
 * OWN-note notePath could legitimately contain a `#` - and
 * `resolveNotePath`/`resolveItemNoteAnchor` run every notePath through
 * `parseSharedNoteAnchor` unconditionally to check "is this a shared
 * anchor?", so that `#` got misread as the anchor separator, truncating the
 * path and producing the host's "File does not exist" on a plain single-note
 * Todo that was never a shared target at all - confirmed on-device
 * 2026-09-23. Stripping `#` here (the one function every note/attachment
 * filename in the app is built through) guarantees a filePath component can
 * never contain one, which is what makes splitting `parseSharedNoteAnchor`'s
 * anchor string on the first `#` unambiguous - the keyword half (after the
 * separator) is deliberately left untouched, so `#Daily` etc. still shows up
 * in the actual on-page Supernote keyword exactly as intended (confirmed
 * with Tilman as expected behavior, not a bug). Only affects *new* filenames
 * - an already-created file with a literal `#` in its name keeps that `#`
 * (and keeps tripping this) until it's renamed and its notePath corrected by
 * hand; see the scan script referenced from the same memory entry for
 * finding those.
 */
export function sanitizeFileNameComponent(input: string): string {
  const cleaned = input.replace(INVALID_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : 'Untitled';
}

/** "2026-09-03 - Kickoff Call" - matches design-overview.md §3's example naming exactly. */
export function meetingNoteBaseName(meeting: Pick<Meeting, 'date' | 'title'>): string {
  return `${meeting.date} - ${sanitizeFileNameComponent(meetingDisplayTitle(meeting))}`;
}

/**
 * Todos have no date, so the note is just named after the todo's text - with
 * the plugin's own functional tags stripped (flow state `#next`/
 * `#waiting-for[:x]`/`#someday`/`#maybe`, `#due:<date>`, and the bare
 * `#now`/`#prepped`/`#reviewed`): machine-managed state that changes over the
 * todo's life and doesn't belong in a file name. Free/context tags
 * (`#daily`, `#music`, ...) stay - they're part of what the todo *is*, and
 * are exactly the ones a Daily row shows in its text. Fixed 2026-09-21: the
 * raw `task.text` used to end up in the file name, flow-state tag included.
 *
 * Unlike ui/TaskBadges.tsx's `displayTaskText`, which strips a functional tag
 * only where a badge already conveys it, this strips them all unconditionally
 * - a file name has no badges. `RESERVED_BARE_TAGS` (domain/flowState.ts) is
 * the same list `isContextTag` uses to decide what is *not* a free tag, so
 * "functional" can't drift between the two.
 */
export function todoNoteBaseName(task: Pick<Task, 'text'>): string {
  const withoutDue = setDueTag(task.text, null);
  const withoutFlowState = setFlowStateTag(withoutDue, null); // also covers #waiting-for:<slug>
  return sanitizeFileNameComponent(stripBareTags(withoutFlowState, RESERVED_BARE_TAGS));
}

/**
 * Creates a linked note inside `<itemPath>/<subfolder>`, picking a
 * collision-free filename from `baseName` (appending " (2)", " (3)", ... if
 * one already exists), and returns the *relative* notePath to store on the
 * Task/Meeting (e.g. "Todos/Draft outreach email.note") - relative so the
 * link keeps working if the Project/Area folder itself is later renamed or
 * moved, since it's always resolved against the item's current path.
 *
 * `tags` (2026-09-18 bugfix, see `resolveNoteBackgroundTemplate`'s own doc
 * comment) is the new/Task's/Meeting's own tags at the moment of creation -
 * every call site already has the Task/Meeting object in hand here, so this
 * is always its `.tags`, never a separate lookup. `context` isn't a
 * separate parameter - derived from `subfolder`, since the two already move
 * in lockstep at every call site (MEETINGS_SUBFOLDER only ever pairs with a
 * Meeting, TODOS_SUBFOLDER only ever with a Task) and adding a second
 * parameter that has to agree with the first would just be one more way for
 * a call site to get it wrong.
 */
export async function createLinkedNote(
  itemPath: string,
  subfolder: typeof MEETINGS_SUBFOLDER | typeof TODOS_SUBFOLDER,
  baseName: string,
  settings: GtdParaSettings,
  tags: string[],
): Promise<string> {
  const folderPath = `${itemPath.replace(/\/+$/, '')}/${subfolder}`;
  await ensureFolderExists(folderPath);

  const fileName = await collisionFreeName(folderPath, baseName, '.note');

  const context: NoteContext = subfolder === MEETINGS_SUBFOLDER ? 'meeting' : 'todo';
  const absolutePath = `${folderPath}/${fileName}`;
  await createNote(absolutePath, resolveNoteBackgroundTemplate(settings, context, tags), true);

  const relativePath = `${subfolder}/${fileName}`;
  log('createLinkedNote: done', relativePath);
  return relativePath;
}

/**
 * Resolves a Task/Meeting's notePath against `itemPath`. Every notePath a
 * *linked note* creates via createLinkedNote above is relative (e.g.
 * "Todos/....note") since that note lives inside the item's own folder and
 * should keep working if the folder is later renamed/moved. The lasso
 * capture flow's "link to source note" option is different - it points back
 * at whatever note the user was lassoing from, which isn't necessarily
 * anywhere under the destination Project/Area (or under a Project/Area at
 * all, e.g. when the destination is Inbox), so relative-path math doesn't
 * make sense for it. Rather than force that case into the relative
 * convention, a notePath starting with '/' is treated as an absolute path
 * and used as-is; anything else resolves relative to itemPath exactly as
 * before. No existing notePath ever starts with '/', so this is a
 * backward-compatible extension, not a breaking change.
 *
 * A shared-note anchor (docs/dev/technical-design-shared-note-pages.md §2.2,
 * `"relativePath#keyword"` via `parseSharedNoteAnchor`) resolves by its
 * `filePath` half only - the keyword plays no part in *file* resolution,
 * only in finding the right *page* once the file is open (§4/§6, Slice 2/3
 * territory, not this function's job).
 *
 * Now VERIFIES that guess against the real filesystem before trusting it
 * (2026-09-23, [[bugfix_shared_note_content_missing]] round 3 - async since
 * this addition), rather than trusting `parseSharedNoteAnchor` returning
 * non-null on its own. Originally reasoned "returns null for every notePath
 * that isn't a shared-note anchor... so this is unconditionally safe" - true
 * of the STRING, false in practice: `todoNoteBaseName`/`meetingNoteBaseName`
 * kept context tags like `#daily` in a note's file name until
 * `sanitizeFileNameComponent` started stripping `#` (round 2, same
 * afternoon), so plenty of already-created own-note files legitimately
 * contain `#` - correctly linked, correctly named, just misread as an
 * anchor by this function on every single reopen (confirmed on-device
 * 2026-09-23: Tilman found several via the Integrity Check
 * [[feature_integrity_check]] - real files, notePath matching them exactly,
 * still failing to open). Since `parseSharedNoteAnchor`'s split gives a
 * filePath candidate that's cheap to check for real, there's no reason to
 * keep guessing: if the anchor's filePath resolves to an actual file, trust
 * it as a genuine shared anchor (unchanged behavior); if it doesn't, fall
 * back to treating the whole original string as a plain own-note path
 * instead of failing outright - this makes every one of those pre-existing
 * files work again with no manual rename needed, and closes this ambiguity
 * for good rather than requiring a fourth bugfix round for the next place
 * it turns up.
 */
export async function resolveNotePath(itemPath: string, notePath: string): Promise<string> {
  const anchor = parseSharedNoteAnchor(notePath);
  if (anchor) {
    const anchorTarget = joinNotePath(itemPath, anchor.filePath);
    if (await fileExists(anchorTarget)) return anchorTarget;
    // Anchor-shaped, but no real file there - fall through to the plain
    // own-note reading below instead of trusting the guess.
  }
  return joinNotePath(itemPath, notePath);
}
