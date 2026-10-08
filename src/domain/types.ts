/**
 * Core domain types for the GtdPara plugin.
 *
 * Mirrors the data model in design-overview.md §3. Deliberately zero RN/SDK
 * imports here — everything in domain/ stays plain-TS and unit-testable
 * without a device or plugin build.
 */

export type GtdParaKind = 'project' | 'area' | 'inbox';

/**
 * A task's GTD flow-state (technical-design-tags.md §1) - `null` means no
 * flow-state tag at all (the "Other" bucket in Project/Area grouping, no
 * badge on Daily). Exclusive by UI convention going forward (the chip row
 * clears any other flow-state tag before applying a new one) but the
 * *parser* stays permissive about what it reads, same posture as
 * `ItemStatus` - a hand-edited file carrying more than one flow tag doesn't
 * throw, `deriveFlowState` (domain/flowState.ts) just picks one by a fixed
 * priority order.
 */
export type FlowState = 'next' | 'waiting-for' | 'someday' | 'maybe' | null;

/**
 * A Project/Area's lifecycle state (technical-design-status-archive.md §1).
 * One type for both kinds - the UI restricts which values each kind's
 * status picker *offers* (Projects: active/on-hold/done; Areas:
 * active/on-hold - no "done", an Area doesn't complete), but the parser
 * stays permissive about what it *reads* regardless of kind, same as every
 * other parsing rule in markdown.ts (never invent structure, never clobber
 * what's there).
 *
 * `'archived'` is a real value here and `markdown.ts`'s parser recognizes
 * it, but nothing reaches it through the plain status-picker/write path -
 * it's written only by `storage/archive.ts`'s `archiveItem`, together with
 * the physical folder move, never as a standalone frontmatter edit. See
 * that module's doc comment for why the two are kept coupled.
 */
export type ItemStatus = 'active' | 'on-hold' | 'done' | 'archived';

/**
 * `kind`/`status`/`sortOrder` here describe the frontmatter block's shape,
 * but nothing actually parses that block back into this type yet - today
 * it's only ever written literally, by `markdown.ts`'s `ensureSkeleton`.
 * The daily/weekly focus flags and `status` (`markdown.ts`'s
 * `parseFrontMatter`/`writeFrontMatterIntoContent`) are the first things
 * that read this block back - see `ParsedFrontMatter` there. They're kept
 * as flat fields on `ProjectFileState`/`CachedItem` (`status`, `dailyFocus`,
 * `weeklyFocus`, `frontMatterExtraLines`) rather than nested under a
 * `FrontMatter` object, the same way `Task`/`Meeting` extra-lines are
 * already flat fields there - this type is left as-is rather than
 * retrofitted to match. `defaultResourceFolder` (technical-design-linked-
 * files.md §3.1) and `area` (technical-design-project-area-assignment.md
 * §2) - a Project's optional assigned Area, by bare folder name - are the
 * two most recent additions to that same flat-field set on
 * `ProjectFileState`/`CachedItem`, both nullable strings using the same
 * "omit the line when null" write convention.
 */
export interface FrontMatter {
  kind: GtdParaKind;
  status?: ItemStatus;
  sortOrder?: number;
}

/**
 * A single task line, e.g. "- [ ] Draft outreach email #next".
 * Tags carry both GTD flow-state (#next/#waiting/#someday) and real-world
 * context (#calls, a person like #alice, a meeting like #team-jf) - one
 * mechanism, no separate status field (design-overview.md §3, "One tag
 * mechanism"). `tags` is extracted from `text` on every parse (any `#word`
 * or `#word:value` token, lowercased) - `text` itself is never rewritten,
 * so a task's `#tags` still live inline in it exactly as typed, same as
 * typing them by hand; `tags` is just a derived read of that same text.
 *
 * `dueDate` is likewise derived, never set on its own: it is `fields.due`
 * (the trailing `[due:: YYYY-MM-DD]` field) when that is a date, else a
 * `#due:YYYY-MM-DD` tag in `text` (the older form, still read), else `null`.
 * If more than one `#due:` tag is present, the first one found wins.
 *
 * `fields` are the trailing Dataview inline fields gtdpara records about the
 * todo (docs/dev/history/technical-design-tending-threads.md §3.1.1); they
 * are never part of `text`. Change a Task only through domain/taskEdit.ts.
 *
 * `cancelled` (- [-] in the file, Obsidian's own "cancelled" checkbox
 * state) is a soft-delete: cancelled tasks stay in the file and are just
 * filtered out of the normal view, rather than being removed outright -
 * nothing in this plugin ever deletes a task line. Showing cancelled items
 * again is a later feature; for now cancelling just hides one.
 *
 * `notePath` mirrors Meeting.notePath - a relative path (from this
 * Project/Area's own folder) to a linked .note file, stored inline as a
 * trailing "→ [[Todos/....note]]" on the line (design-overview.md §3's
 * note-linking syntax, extended to todos). Empty until a note is created
 * for this todo.
 *
 * `flowState`/`waitingOn` (technical-design-tags.md §1) are derived the same
 * way `tags`/`dueDate` are - never a separate source of truth. `flowState`
 * reads `#next`/`#wf`/`#someday`/`#maybe` out of `tags`;
 * `waitingOn` reads the counterpart out of a `#wf/<slug>` tag (or the older
 * `#waiting-for:<slug>`) when `flowState === 'waiting-for'`, or `null`
 * otherwise. See domain/flowState.ts.
 */
export interface Task {
  text: string;
  done: boolean;
  cancelled: boolean;
  tags: string[];
  /** YYYY-MM-DD from `fields.due` or a legacy `#due:` tag, or null - see the doc above. */
  dueDate: string | null;
  /** GTD flow-state derived from tags, or null - see the tags doc above. */
  flowState: FlowState;
  /** Slug from a `#wf/<slug>` (or `#waiting-for:<slug>`) tag, or null - only meaningful when flowState === 'waiting-for'. */
  waitingOn: string | null;
  /**
   * Whether this task carries `#now` (docs/dev/history/technical-design-now-focus-mode.md
   * §2) - "what I'm actually on the hook for right now", inside a focus-mode
   * session. Layered on top of flowState, never a replacement for it: `#now`
   * is deliberately not exclusive with `#next` (or with anything else),
   * which is exactly why it's its own boolean field rather than a fifth
   * FlowState value. Derived from a bare `#now` tag the same way
   * dueDate/flowState/waitingOn are derived from other tags - see
   * domain/flowState.ts's deriveNow/setNowTag. Never a second source of
   * truth: domain/markdown.ts's parser and domain/taskEdit.ts (the only
   * code that builds or changes a Task) derive it with the other fields.
   */
  now: boolean;
  notePath: string;
  /** Base-root-relative path to a linked existing file (technical-design-linked-files.md §3), or '' if none - see domain/markdown.ts's extractLinkedFile/appendLinkedFile. */
  linkedFile: string;
  /** The trailing `[key:: value]` fields - see TaskFields. */
  fields: TaskFields;
}

/**
 * The trailing Dataview inline fields of a task line
 * (`... → [[note]] +[[file]] [meeting:: …] [created:: …] [due:: …] [completion:: …]`,
 * docs/dev/history/technical-design-tending-threads.md §3.1.1). Written in
 * that order, then `extra`. Known keys hold their value as found (a
 * YYYY-MM-DD date when gtdpara wrote it).
 */
export interface TaskFields {
  /** YYYY-MM-DD the todo is due (for Waiting For: the follow-up date). */
  due: string | null;
  /** YYYY-MM-DD the todo was created; never invented for older todos. */
  created: string | null;
  /** YYYY-MM-DD the todo was checked done; cleared when it is reopened. */
  completion: string | null;
  /** The meeting the todo was agreed in (`<date> <title>`), read and kept as found. */
  meeting: string | null;
  /** Unknown `[key:: value]` tokens, verbatim, in file order (fields added in Obsidian survive). */
  extra: string[];
}

/**
 * A one-off meeting - recurring meetings are out of scope by decision
 * (design-philosophy: every entry is a conscious choice). A hand-written
 * series line, and its indented occurrence lines, are not parsed; they are
 * kept as unknown lines (domain/markdown.ts's `extraLines`) and survive every
 * save untouched. `cancelled` works the same soft-delete way as
 * Task.cancelled: hidden from the normal view, never removed from the file.
 */
export interface Meeting {
  title: string;
  /** YYYY-MM-DD. Required for the one-off meetings v1 creates. */
  date: string;
  /** HH:mm, 24h, zero-padded. '' means no time was given - a date-only meeting. */
  time: string;
  /**
   * HH:mm end of a timed meeting, or '' when no end was given (1 h is
   * assumed wherever an end is needed). Always '' for a date-only meeting
   * (docs/dev/history/technical-design-monthly-view.md §2.3).
   */
  endTime: string;
  /**
   * Whole days a date-only meeting covers, >= 1 (`- 2026-10-07 3d Offsite`).
   * Always 1 for a timed meeting.
   */
  days: number;
  tags: string[];
  cancelled: boolean;
  /** Relative path (from this Project/Area's own folder) to a linked .note file, e.g. "Meetings/2026-09-03 - Kickoff Call.note". Empty until a note is created for this meeting. */
  notePath: string;
  /** Base-root-relative path to a linked existing file, or '' if none - see Task.linkedFile's doc comment for why this is being added here now. */
  linkedFile: string;
}

/**
 * One Project/Area's stated intent for a single ISO week (
 * docs/dev/history/technical-design-weekly-goals.md, V2 of the Week view) - a short free-text line, not
 * a task (no done/cancelled state). One entry per `weekKey` at most; setting
 * a new goal for a week that already has one replaces it (domain/
 * markdown.ts's `setGoalForWeek`). Lives in a `## Weekly Goals` content
 * section of project.txt/area.txt (never frontmatter, never Inbox.txt -
 * Inbox can't be weekly-focused at all), parsed/written the same
 * `getSpan`/`setSpan` way `## Tasks`/`## Meetings` already are.
 */
export interface WeeklyGoal {
  /** ISO week key, e.g. "2026-W37" - domain/weekDate.ts's isoWeekKey(). */
  weekKey: string;
  text: string;
}

/**
 * One open "Mark for later" (docs/dev/history/technical-design-lasso-0.8.md §3.1):
 * a lasso selection stored for later processing. Lives as one line in the
 * `## Marks` section of the project.txt / area.txt / Inbox.txt that owns
 * the note (domain/marks.ts `markOwner`). The picture and stroke data live
 * in gtdpara's private folder, keyed by `id` (storage/markData.ts).
 */
export interface Mark {
  /** 'm-20261005-104212-351' - also the Obsidian block id at the end of the line. */
  id: string;
  /** 'YYYY-MM-DD HH:mm', local time of the mark. */
  createdAt: string;
  /** The note as written in the line: relative to the owner's folder, or absolute. */
  notePath: string;
  /** 0-based page index (the line shows page + 1). */
  page: number;
  /** Text known at mark time (text boxes); null for handwriting. */
  text: string | null;
}

/**
 * One Project/Area's goal for a single calendar month (docs/dev/technical-design-
 * monthly-view.md §2.2) - the monthly twin of `WeeklyGoal`, stored in a
 * `## Monthly Goals` span as `- YYYY-MM: text`. One entry per month at most.
 */
export interface MonthlyGoal {
  /** "YYYY-MM", e.g. "2026-10" - domain/period.ts's monthKeyOf(). */
  monthKey: string;
  text: string;
}

/**
 * A parsed project.txt / area.txt / Inbox.txt. `rawContent` is kept
 * alongside the parsed model so write-through can target only the
 * Tasks/Meetings span and leave any hand-added content untouched
 * (design-overview.md §2.2, "Write-through must not clobber hand-added content").
 */
export interface GtdParaFile {
  kind: GtdParaKind;
  frontMatter: FrontMatter;
  tasks: Task[];
  meetings: Meeting[];
  rawContent: string;
}

/** Identity = the folder itself; no synthetic IDs (design-overview.md §3). */
export interface Project {
  name: string;
  path: string;
  file: GtdParaFile;
}

export interface Area {
  name: string;
  path: string;
  file: GtdParaFile;
}

/**
 * Storage-root settings (base root + individual Projects/Areas/Resources/
 * Archive folder names) now live in domain/settings.ts, persisted via
 * storage/settingsStorage.ts and editable from the Settings screen -
 * see resolvePaths() there for turning them into absolute paths.
 */

/**
 * Data file names inside each Project/Area folder. `.txt` rather than `.md`
 * by deliberate choice - see design-overview.md §3 for the Obsidian
 * interoperability trade-off this implies (a plain rename to `.md` restores
 * it later if that ends up mattering).
 */
export const PROJECT_FILE_NAME = 'project.txt';
export const AREA_FILE_NAME = 'area.txt';
/** Sits directly under the base root (see domain/settings.ts's resolvePaths), not inside a Project/Area folder - the one GtdParaFile that isn't per-item. */
export const INBOX_FILE_NAME = 'Inbox.txt';
