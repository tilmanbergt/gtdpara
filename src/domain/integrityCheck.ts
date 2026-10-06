/**
 * Integrity Check (docs/dev/history/technical-design-integrity-check.md) - domain layer
 * for a Settings > Folders action that scans every Project/Area/Archive/
 * Inbox data file for known problems and reports what it finds. Built as a
 * small registry (INTEGRITY_CHECKS) so adding a check means writing one more
 * function and registering it. Report-only by design, no auto-fix.
 *
 * Two check shapes:
 * - `IntegrityCheck` - runs once per scanned item (Project/Area/Archive
 *   entry/Inbox), given that item's parsed Tasks/Meetings plus enough of its
 *   raw file/frontmatter state to check structure and cross-references
 *   (`IntegrityCheckInput`).
 * - `WholeRunCheck` - runs ONCE per scan, given every scanned item's summary
 *   at once (`ScannedItemSummary[]`), for checks that are inherently
 *   cross-item (does this Project's `area:` field match any real Area? do two
 *   items share the same `abbrev`?). Pure/synchronous - by the time a
 *   WholeRunCheck runs, every item has already been read.
 *
 * A per-item check MAY need device I/O - `hashNotePath`/`linkedFileMissing`/
 * `defaultResourceFolderMissing` below do, since telling a genuine problem
 * apart from a false alarm means checking whether something real exists on
 * disk. To keep this file's "zero RN/SDK imports" convention
 * (design-overview.md §3, matches domain/sharedNotePages.ts and friends),
 * every `IntegrityCheck` takes a small `IntegrityCheckIO` capability instead
 * of importing supernote/fileSystem.ts. The real implementation (using
 * `fileExists`/`folderExists`) lives in storage/integrityCheck.ts, so the
 * decision logic here stays testable with a fake `io`.
 */
import {closeOutInterrupted, parsePlan} from './closeOut/plan';
import {joinNotePath, parsePageAnchor, parseSharedNoteAnchor, stripPageAnchor} from './sharedNotePages';
import {GtdParaKind, INBOX_FILE_NAME, Meeting, Task} from './types';
import {parseMarksSpan} from './markdown';
import {resolveMarkPath} from './marks';

export interface IntegrityFinding {
  checkId: string;
  itemKind: GtdParaKind;
  itemPath: string;
  /** 'item' for a whole-file-level finding (the data file itself, its frontmatter, or a cross-item comparison) rather than one specific Task/Meeting row. */
  entityKind: 'task' | 'meeting' | 'item';
  /** The Task's text, Meeting's title, or a fixed label/item name for an 'item'-level finding - for a human to recognize which row this is, never itself part of any check's logic. */
  entityLabel: string;
  /** The offending notePath, when this finding is about one - '' for findings that aren't (structural, linkedFile, defaultResourceFolder, or whole-run findings). */
  notePath: string;
  message: string;
}

export interface IntegrityCheckInput {
  itemKind: GtdParaKind;
  itemPath: string;
  tasks: Task[];
  meetings: Meeting[];
  /** The data file's full raw text (ProjectFileState.rawContent) - needed by structural checks (duplicateHeadings) that look at the file shape itself, not just the already-parsed Tasks/Meetings. */
  rawContent: string;
  /** ResolvedParaPaths.base - needed to resolve a base-root-relative `linkedFile` (storage/linkedFiles.ts's own convention: always base-relative, never item-relative like notePath). */
  basePath: string;
  /** ResolvedParaPaths.resources - needed to resolve this item's `defaultResourceFolder` (also base-relative, specifically under Resources). */
  resourcesPath: string;
  /** This item's frontmatter `defaultResourceFolder:` value (ProjectFileState.defaultResourceFolder), or null if never set. */
  defaultResourceFolder: string | null;
}

/** The device capabilities a check may need - kept to exactly what's used so a check can't reach further into the filesystem than "does this exact file/folder exist". */
export interface IntegrityCheckIO {
  fileExists(absolutePath: string): Promise<boolean>;
  folderExists(absolutePath: string): Promise<boolean>;
}

export type IntegrityCheck = (input: IntegrityCheckInput, io: IntegrityCheckIO) => Promise<IntegrityFinding[]>;

/**
 * Flags a notePath containing '#' that resolves to nothing. Such a path is
 * either a genuine shared anchor (verify: does `parseSharedNoteAnchor`'s
 * `filePath` half resolve to a real file?), an older own-note file that
 * legitimately has a tag in its name (verify: does the WHOLE string, taken
 * literally, resolve to a real file?), or - if NEITHER does - a broken link
 * (the note was deleted or moved outside the app, or the notePath is
 * otherwise stale) that needs a person to re-link or clear it by hand.
 * `storage/noteLinks.ts`'s `resolveNotePath` makes the same distinction (see
 * its doc comment).
 *
 * Deliberately does NOT flag the second case: `resolveNotePath`'s fallback
 * already opens it correctly, so flagging it would only cause manual-rename
 * busywork. Only the third case - which `resolveNotePath` cannot recover
 * from on its own - is worth a person's attention.
 */
export async function checkHashNotePath(input: IntegrityCheckInput, io: IntegrityCheckIO): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];

  const inspect = async (entityKind: 'task' | 'meeting', notePath: string, entityLabel: string) => {
    if (!notePath.includes('#')) return;
    // A page link (lasso 0.8): only its file part has to exist.
    const pageAnchor = parsePageAnchor(notePath);
    if (pageAnchor) {
      const target = joinNotePath(input.itemPath, pageAnchor.filePath);
      if (await io.fileExists(target)) return;
      findings.push({
        checkId: 'hashNotePath',
        itemKind: input.itemKind,
        itemPath: input.itemPath,
        entityKind,
        entityLabel,
        notePath,
        message: `The linked note "${target}" was not found - it may have been deleted or moved. Re-link or clear this note reference by hand.`,
      });
      return;
    }

    const anchor = parseSharedNoteAnchor(notePath);
    const anchorCandidate = anchor ? joinNotePath(input.itemPath, anchor.filePath) : null;
    const ownCandidate = joinNotePath(input.itemPath, notePath);

    if (anchorCandidate && (await io.fileExists(anchorCandidate))) return; // genuine shared anchor
    if (await io.fileExists(ownCandidate)) return; // older own-note file with '#' in its name - resolveNotePath's fallback handles it


    findings.push({
      checkId: 'hashNotePath',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind,
      entityLabel,
      notePath,
      message:
        `notePath contains '#' but neither reading resolves to a real file (checked "${ownCandidate}"` +
        `${anchorCandidate ? ` and "${anchorCandidate}"` : ''}) - the linked note may have been ` +
        'deleted, renamed outside the app, or never actually created. Re-link or clear this note ' +
        'reference by hand.',
    });
  };

  for (const task of input.tasks) await inspect('task', task.notePath, task.text);
  for (const meeting of input.meetings) await inspect('meeting', meeting.notePath, meeting.title);

  return findings;
}

/**
 * The recognized section headings domain/markdown.ts's `getSpan` looks for
 * (Scope/Tasks/Meetings/Weekly Goals/Monthly Goals) - kept in one place here rather than
 * importing markdown.ts's own private heading constants, since this list is
 * about what to LOOK FOR in a suspect file, not about writing one.
 */
const RECOGNIZED_HEADINGS = ['## Scope', '## Tasks', '## Meetings', '## Weekly Goals', '## Monthly Goals', '## Marks'];

/**
 * File-structure soundness. Two things, both derived from exactly how
 * domain/markdown.ts's `getSpan`/`getFrontMatterSpan` read a file - not a
 * generic "looks odd" heuristic:
 *
 * 1. **Duplicate section heading.** `getSpan(content, heading)` finds the
 *    FIRST line that exactly matches `heading` and stops at the next line
 *    starting with "## " (or EOF) - it has no idea a second, identical
 *    heading exists further down. So a second "## Tasks" (say) isn't a
 *    parse error - the file loads fine - but everything under that second
 *    heading is invisible to the app: never parsed, never shown, never
 *    editable, and preserved byte-for-byte untouched by every future save
 *    (`setSpan`'s `after` starts exactly at that second heading). A person
 *    could have real tasks or meetings sitting there, permanently hidden,
 *    with nothing in the UI ever hinting they exist. Manual editing can
 *    produce this.
 * 2. **Missing/malformed frontmatter block.** `getFrontMatterSpan` requires
 *    the file's very first line to be exactly "---" and a later line to
 *    close it with another exact "---" - if either isn't true,
 *    `parseFrontMatter` silently falls back to `status: 'active'` and every
 *    other frontmatter field defaulting to unset, the same way it
 *    tolerates a hand-edited file with unrecognized field values (never
 *    throws). That's the right behavior for the app to keep running, but it
 *    also means a corrupted/missing frontmatter block is otherwise
 *    invisible - nothing else would ever tell a person their Project's
 *    status/dailyFocus/weeklyFocus/area/abbrev just silently reset.
 *
 * Skips entirely for an empty file (`rawContent.trim() === ''`) - that's
 * the normal, expected state for an item that's never had anything saved to
 * it yet (loadProjectFile's own "a missing file just parses as empty"
 * contract), not a corruption.
 */
function checkDuplicateHeadings(input: IntegrityCheckInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const trimmedContent = input.rawContent.trim();
  if (trimmedContent.length === 0) return findings;

  const lines = input.rawContent.split('\n').map(line => line.trim());

  for (const heading of RECOGNIZED_HEADINGS) {
    const count = lines.filter(line => line === heading).length;
    if (count > 1) {
      findings.push({
        checkId: 'duplicateHeadings',
        itemKind: input.itemKind,
        itemPath: input.itemPath,
        entityKind: 'item',
        entityLabel: '(the data file itself)',
        notePath: '',
        message:
          `"${heading}" appears ${count} times in this file. Only the FIRST one is ever read by the ` +
          'app - anything under a later occurrence is invisible in the app (never shown, never ' +
          'editable) and stays frozen in place on every future save. Merge the sections by hand: move ' +
          `any real content up into the first "${heading}", then delete the duplicate heading line.`,
      });
    }
  }

  if (lines[0] !== '---') {
    findings.push({
      checkId: 'duplicateHeadings',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind: 'item',
      entityLabel: '(the data file itself)',
      notePath: '',
      message:
        'This file doesn\'t open with a "---" frontmatter line. The app tolerates this by silently ' +
        'falling back to default status/focus/area/abbrev values, but that means anything actually ' +
        'set there (status, daily/weekly focus, Area assignment, abbrev) is being ignored. Check the ' +
        'top of the file by hand.',
    });
  } else if (!lines.slice(1).includes('---')) {
    findings.push({
      checkId: 'duplicateHeadings',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind: 'item',
      entityLabel: '(the data file itself)',
      notePath: '',
      message:
        'This file\'s frontmatter block opens with "---" but never closes with a second "---" line. ' +
        'The app tolerates this by silently falling back to default status/focus/area/abbrev values - ' +
        'check the top of the file by hand and add the closing "---".',
    });
  }

  return findings;
}

/**
 * Wraps the sync `checkDuplicateHeadings` in the async `IntegrityCheck`
 * shape - needs no `io` (pure text inspection), but stays consistent with
 * every other registered check so `runRegisteredChecks` can treat them
 * uniformly.
 */
async function checkDuplicateHeadingsAsync(input: IntegrityCheckInput): Promise<IntegrityFinding[]> {
  return checkDuplicateHeadings(input);
}

/**
 * A linked *existing* file (Task.linkedFile/Meeting.linkedFile,
 * technical-design-linked-files.md) that is missing on disk - the same idea
 * as `hashNotePath`, but for "point at an existing file" links rather than
 * "create/open a new .note" links, and much simpler: no anchor-parsing
 * ambiguity to untangle, just "does this file exist?".
 * `linkedFile` is always stored base-root-relative (storage/linkedFiles.ts's
 * own doc comment), never item-relative, so it resolves against
 * `input.basePath` rather than `input.itemPath`.
 */
export async function checkLinkedFileMissing(input: IntegrityCheckInput, io: IntegrityCheckIO): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];

  const inspect = async (entityKind: 'task' | 'meeting', linkedFile: string, entityLabel: string) => {
    if (!linkedFile) return;
    // linkedFile is ALWAYS base-relative (storage/linkedFiles.ts's own doc
    // comment: "no absolute-vs-relative branch to handle here"), unlike
    // notePath - so joinNotePath's `target.startsWith('/')` absolute-path
    // branch must never fire here. Deliberately NOT reusing joinNotePath's
    // leading-slash convention; a forced leading slash would make it return
    // the target as-is and silently drop basePath entirely.
    // A lasso source link (0.8) can be absolute and carry `#page=<n>`.
    const file = stripPageAnchor(linkedFile);
    const absolutePath = file.startsWith('/') ? file : `${input.basePath.replace(/\/+$/, '')}/${file}`;
    if (await io.fileExists(absolutePath)) return;
    findings.push({
      checkId: 'linkedFileMissing',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind,
      entityLabel,
      notePath: '',
      message:
        `linkedFile "${linkedFile}" doesn't exist (checked "${absolutePath}") - the linked file may have ` +
        'been moved, renamed, or deleted outside the app. Re-link it, or clear the reference by hand.',
    });
  };

  for (const task of input.tasks) await inspect('task', task.linkedFile, task.text);
  for (const meeting of input.meetings) await inspect('meeting', meeting.linkedFile, meeting.title);

  return findings;
}

/**
 * A Project/Area's `defaultResourceFolder:` (technical-design-linked-
 * files.md §3.1) naming a Resources subfolder that is missing - same idea
 * as `linkedFileMissing`, but for a FOLDER under Resources rather than a
 * file, so it uses `io.folderExists` instead of `io.fileExists`, and
 * resolves against `input.resourcesPath` (the field is documented as
 * "relative to paths.resources", domain/markdown.ts's ParsedFrontMatter).
 */
export async function checkDefaultResourceFolderMissing(input: IntegrityCheckInput, io: IntegrityCheckIO): Promise<IntegrityFinding[]> {
  if (!input.defaultResourceFolder) return [];
  // Same reasoning as checkLinkedFileMissing above: defaultResourceFolder is
  // always resources-relative, never absolute, so a plain concatenation is
  // used rather than joinNotePath's absolute-path-aware join.
  const absolutePath = `${input.resourcesPath.replace(/\/+$/, '')}/${input.defaultResourceFolder}`;
  if (await io.folderExists(absolutePath)) return [];
  return [
    {
      checkId: 'defaultResourceFolderMissing',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind: 'item',
      entityLabel: '(the item itself)',
      notePath: '',
      message:
        `defaultResourceFolder "${input.defaultResourceFolder}" doesn't exist under Resources (checked ` +
        `"${absolutePath}") - it may have been renamed or deleted outside the app. Re-set it from the ` +
        'Files pane, or clear the "defaultResourceFolder:" line by hand.',
    },
  ];
}

/**
 * A project whose close-out archive run started but didn't finish
 * (domain/closeOut/plan.ts's closeOutInterrupted) - found in Projects (folder
 * not moved yet) or in Archive (moved, but not stamped). No disk I/O needed:
 * the plan lives in the project file itself.
 */
export async function checkCloseOutInterrupted(input: IntegrityCheckInput): Promise<IntegrityFinding[]> {
  if (input.itemKind !== 'project') return [];
  const {plan, found} = parsePlan(input.rawContent);
  if (!found || !closeOutInterrupted(plan)) return [];
  const name = input.itemPath.replace(/\/+$/, '').split('/').pop() ?? input.itemPath;
  return [
    {
      checkId: 'closeOutInterrupted',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind: 'item',
      entityLabel: name,
      notePath: '',
      message: `The close-out of "${name}" was interrupted - open its close-out (Review → Done projects) to finish it.`,
    },
  ];
}

/**
 * A "Mark for later" line (lasso 0.8, `## Marks`) whose note or PDF is
 * missing - the mark can't be opened or processed against its page.
 * Relative paths resolve against the item folder (the Inbox's are absolute).
 */
export async function checkMarkNoteMissing(input: IntegrityCheckInput, io: IntegrityCheckIO): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  for (const mark of parseMarksSpan(input.rawContent).marks) {
    const absolutePath = resolveMarkPath(input.itemPath, mark.notePath);
    if (await io.fileExists(absolutePath)) continue;
    findings.push({
      checkId: 'markNoteMissing',
      itemKind: input.itemKind,
      itemPath: input.itemPath,
      entityKind: 'item',
      entityLabel: `mark ${mark.id}`,
      notePath: mark.notePath,
      message:
        `The note of mark ${mark.id} (p${mark.page + 1}) doesn't exist (checked "${absolutePath}") - it may have been ` +
        'moved, renamed or deleted outside the app. Process or discard the mark in the marks screen, or delete its ' +
        'line under "## Marks" by hand.',
    });
  }
  return findings;
}

export const INTEGRITY_CHECKS: Record<string, IntegrityCheck> = {
  hashNotePath: checkHashNotePath,
  duplicateHeadings: checkDuplicateHeadingsAsync,
  linkedFileMissing: checkLinkedFileMissing,
  defaultResourceFolderMissing: checkDefaultResourceFolderMissing,
  closeOutInterrupted: checkCloseOutInterrupted,
  markNoteMissing: checkMarkNoteMissing,
};

/** Runs every registered per-item check against one item's already-parsed state. */
export async function runRegisteredChecks(input: IntegrityCheckInput, io: IntegrityCheckIO): Promise<IntegrityFinding[]> {
  const results = await Promise.all(Object.values(INTEGRITY_CHECKS).map(check => check(input, io)));
  return results.flat();
}

/**
 * What a WholeRunCheck needs to know about one scanned item - deliberately
 * NOT the same shape as IntegrityCheckInput (no tasks/meetings/rawContent):
 * a whole-run check compares items to each other, not to their own
 * contents, so it only needs the handful of frontmatter-level fields that
 * matter for cross-item comparison.
 */
export interface ScannedItemSummary {
  itemKind: GtdParaKind;
  itemPath: string;
  /** The item's own folder name (e.g. "Demand Planning") - what area:/abbrev: collisions are reported against, since itemPath alone isn't meaningful to a person reading the report. */
  itemName: string;
  /** Whether this item was found under Archive rather than live under Projects/Areas - see checkDuplicateAbbrev's doc comment for why this matters. */
  inArchive: boolean;
  /** This Project's `area:` frontmatter field (bare Area folder name), or null - always null for Areas/Inbox. */
  area: string | null;
  /** This item's `abbrev:` frontmatter field, or null - always null for Inbox. */
  abbrev: string | null;
}

export type WholeRunCheck = (items: ScannedItemSummary[]) => IntegrityFinding[];

/**
 * A Project's `area:` field naming an Area that exists nowhere
 * (technical-design-project-area-assignment.md §2) - checked against every
 * Area-kind item this SAME scan found, under EITHER Areas or Archive.
 * Archive deliberately counts as "valid": archiving an Area cascade-archives
 * its Done Projects alongside it (storage/archive.ts) without clearing their
 * `area:` field, so a Done Project in Archive still pointing at its
 * (also-archived) Area is normal, expected state, not corruption - only a
 * name matching NEITHER live Areas NOR Archive means the Area folder is
 * genuinely gone (renamed or deleted outside the app).
 */
function checkOrphanedAreaAssignment(items: ScannedItemSummary[]): IntegrityFinding[] {
  const areaNames = new Set(items.filter(item => item.itemKind === 'area').map(item => item.itemName));
  const findings: IntegrityFinding[] = [];
  for (const item of items) {
    if (item.itemKind !== 'project' || !item.area) continue;
    if (areaNames.has(item.area)) continue;
    findings.push({
      checkId: 'orphanedAreaAssignment',
      itemKind: item.itemKind,
      itemPath: item.itemPath,
      entityKind: 'item',
      entityLabel: item.itemName,
      notePath: '',
      message:
        `This Project's area: "${item.area}" doesn't match any Area folder currently under Areas or ` +
        'Archive - it may have been renamed or deleted outside the app. Re-set or clear the Project\'s ' +
        'Area assignment by hand (the "area:" frontmatter line).',
    });
  }
  return findings;
}

/**
 * Two different LIVE Projects/Areas sharing the exact same `abbrev:` value
 * (case-insensitively) - the same uniqueness rule domain/abbrev.ts's
 * `validateAbbrev` enforces when saving through the app's own UI, checked
 * here for anything hand-edited directly (e.g. in Obsidian), where nothing
 * enforces it. Archive is deliberately EXCLUDED - an archived item's abbrev
 * is not shown or used anywhere, so a collision there isn't worth surfacing.
 */
function checkDuplicateAbbrev(items: ScannedItemSummary[]): IntegrityFinding[] {
  const byNormalizedAbbrev = new Map<string, ScannedItemSummary[]>();
  for (const item of items) {
    if (item.inArchive || !item.abbrev) continue;
    const key = item.abbrev.trim().toLowerCase();
    if (!key) continue;
    const bucket = byNormalizedAbbrev.get(key);
    if (bucket) bucket.push(item);
    else byNormalizedAbbrev.set(key, [item]);
  }

  const findings: IntegrityFinding[] = [];
  for (const bucket of byNormalizedAbbrev.values()) {
    if (bucket.length < 2) continue;
    for (const item of bucket) {
      const others = bucket.filter(other => other !== item).map(other => other.itemName).join(', ');
      findings.push({
        checkId: 'duplicateAbbrev',
        itemKind: item.itemKind,
        itemPath: item.itemPath,
        entityKind: 'item',
        entityLabel: item.itemName,
        notePath: '',
        message: `abbrev "${item.abbrev}" is also used by: ${others}. Abbreviations must be unique - edit one of these (by hand, or through the app) to resolve the collision.`,
      });
    }
  }
  return findings;
}

export const WHOLE_RUN_CHECKS: Record<string, WholeRunCheck> = {
  orphanedAreaAssignment: checkOrphanedAreaAssignment,
  duplicateAbbrev: checkDuplicateAbbrev,
};

/** Runs every registered whole-run check once, given every scanned item's summary. */
export function runWholeRunChecks(items: ScannedItemSummary[]): IntegrityFinding[] {
  return Object.values(WHOLE_RUN_CHECKS).flatMap(check => check(items));
}

/** Just what the leftovers check needs from a folder listing - domain stays free of supernote/ types. */
export interface ListedEntry {
  name: string;
  isFolder: boolean;
}

/** The Inbox's note folders. */
const INBOX_NOTE_FOLDERS = ['Todos', 'Meetings'] as const;

/** Names left at the base root from where the Inbox lived up to 0.1.0. */
export function legacyInboxLeftovers(rootEntries: ListedEntry[]): string[] {
  const has = (name: string, isFolder: boolean) => rootEntries.some(e => e.name === name && e.isFolder === isFolder);
  const found: string[] = [];
  if (has(INBOX_FILE_NAME, false)) found.push(INBOX_FILE_NAME);
  for (const folder of INBOX_NOTE_FOLDERS) {
    if (has(folder, true)) found.push(`${folder}/`);
  }
  return found;
}

/**
 * Whole-scan finding for anything at the base root from where the Inbox lived
 * up to 0.1.0: Inbox.txt, Todos/ or Meetings/. gtdpara does not move these
 * itself (direct upgrades from 0.1.0 are not supported); the finding tells the
 * user to move them by hand.
 */
export function checkLegacyInboxLeftovers(rootEntries: ListedEntry[], base: string, inboxFolder: string): IntegrityFinding[] {
  const leftovers = legacyInboxLeftovers(rootEntries);
  if (leftovers.length === 0) return [];
  return [
    {
      checkId: 'legacyInboxLeftovers',
      itemKind: 'inbox',
      itemPath: base,
      entityKind: 'item',
      entityLabel: leftovers.join(', '),
      notePath: '',
      message:
        `Left in the base folder from where the Inbox lived up to gtdpara 0.1.0: ${leftovers.join(', ')}. ` +
        `Move Inbox.txt and the Todos and Meetings folders into "${inboxFolder}" by hand (merge with what is ` +
        'already there), or delete them in the file manager if they are empty.',
    },
  ];
}

/** Formats a full run's findings into the single report file storage/integrityCheck.ts writes - kept pure/testable, separate from the actual file write. */
export function formatIntegrityReport(findings: IntegrityFinding[], itemsScanned: number, scannedAt: Date): string {
  const lines: string[] = [
    'Integrity Check',
    `Run at: ${scannedAt.toISOString()}`,
    `Items scanned (Projects/Areas/Archive/Inbox): ${itemsScanned}`,
    `Findings: ${findings.length}`,
    '',
  ];
  if (findings.length === 0) {
    lines.push('No issues found.');
  } else {
    findings.forEach((finding, index) => {
      lines.push(`${index + 1}. [${finding.checkId}] ${finding.itemKind} ${finding.itemPath}`, `   ${finding.entityKind}: "${finding.entityLabel}"`);
      if (finding.notePath) lines.push(`   notePath: ${finding.notePath}`);
      lines.push(`   ${finding.message}`, '');
    });
  }
  return lines.join('\n');
}
