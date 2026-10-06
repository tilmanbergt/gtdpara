/**
 * Integrity Check (docs/dev/technical-design-integrity-check.md) - orchestration
 * for Settings > Folders' "Run Integrity Check" action: walks every
 * Project/Area/Archive folder plus the single root Inbox file, reuses
 * loadProjectFile (storage/projectFile.ts) for the exact same parsing the
 * app already trusts, runs every registered domain/integrityCheck.ts check
 * against each item, and writes one summary report to the debug log folder.
 * Report-only (Tilman, 2026-09-23) - no auto-fix.
 *
 * Archive is included deliberately, unlike storage/dataCache.ts's cache
 * (which explicitly skips Resources/Archive, "hidden from Home for now") -
 * once something's archived, "there's no restore/browse-Archive UI...
 * nothing in the app reads the item back" (storage/archive.ts's own doc
 * comment), so it's the one place a stale corrupted notePath could
 * otherwise sit forever with no other way to find it. Resources is NOT
 * scanned - it holds linked/attached files only, no Task/Meeting/notePath
 * data structurally.
 *
 * Archived items sit at several depths under Archive (flat, or under a year
 * and Area folder after a close-out); domain/closeOut/archiveScan.ts finds
 * them and tells Projects from Areas by their data file.
 *
 * Deliberately no SCAN_TIMEOUT_MS wrapper the way dataCache.ts's rebuild
 * has - that one runs automatically on every app open/foreground and needs
 * to fail fast; this is a manual, on-demand action, so letting a slow scan
 * simply take longer is an acceptable trade rather than added complexity.
 * A single item's load failure doesn't abort the whole run - it becomes its
 * own finding instead, since a file that can't even be read is itself
 * exactly the kind of thing an integrity check should surface.
 */
import {
  checkLegacyInboxLeftovers,
  formatIntegrityReport,
  IntegrityCheckIO,
  IntegrityFinding,
  runRegisteredChecks,
  runWholeRunChecks,
  ScannedItemSummary,
} from '../domain/integrityCheck';
import {FileFix, NoteRef, planFileNameFixes, unsafeFolderNames} from '../domain/fileNameFix';
import {invalidFileNameChars} from '../domain/fileName';
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {GtdParaKind, Meeting, Task} from '../domain/types';
import {collectArchivedItems} from '../domain/closeOut/archiveScan';
import {fileExists, folderExists, listFolderEntries, writeIntegrityCheckReport} from '../supernote/fileSystem';
import {ensureFileReadPermission} from '../supernote/pluginPermissions';
import {log, logError} from '../utils/log';
import {stripPageAnchor} from '../domain/sharedNotePages';
import {classifyNotePath} from './noteLinks';
import {loadProjectFile} from './projectFile';
import {errorMessage} from '../utils/errorMessage';

export interface IntegrityCheckSummary {
  itemsScanned: number;
  findings: IntegrityFinding[];
  reportFileName: string;
  /** Note files with names unsafe for Obsidian that "Fix file names" can rename (docs/dev/technical-design-files-0.6.md §3.5). */
  fileNameFixes: FileFix[];
}

interface LoadedEntries {
  target: ScanTarget;
  tasks: Task[];
  meetings: Meeting[];
}

/** The last path segment of a notePath (an anchor's keyword included - it is only a cheap pre-filter). */
function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Every note link whose file name may be unsafe, resolved against the disk
 * (own note or shared page; missing files are left to the other checks).
 */
async function collectUnsafeNoteRefs(loaded: LoadedEntries[]): Promise<NoteRef[]> {
  const refs: NoteRef[] = [];
  for (const {target, tasks, meetings} of loaded) {
    const entries: Array<{entityKind: 'task' | 'meeting'; notePath: string; label: string}> = [
      ...tasks.map(t => ({entityKind: 'task' as const, notePath: t.notePath, label: t.text})),
      ...meetings.map(m => ({entityKind: 'meeting' as const, notePath: m.notePath, label: `${m.date} ${m.title}`})),
    ];
    for (const entry of entries) {
      if (!entry.notePath || invalidFileNameChars(lastSegment(stripPageAnchor(entry.notePath))).length === 0) continue;
      const note = await classifyNotePath(target.path, entry.notePath);
      if (note.kind === 'none' || !note.exists) continue;
      refs.push({
        itemKind: target.kind,
        itemPath: target.path,
        inArchive: target.inArchive,
        entityKind: entry.entityKind,
        entityLabel: entry.label,
        notePath: entry.notePath,
        file: note.absolutePath,
        keyword: note.kind === 'shared' ? note.anchor.keyword : null,
      });
    }
  }
  return refs;
}

/** Findings for unsafe note file and folder names (checkId `unsafeFileName`). */
function fileNameFindings(
  fixes: FileFix[],
  reportOnly: ReturnType<typeof planFileNameFixes>['reportOnly'],
  folders: ReturnType<typeof unsafeFolderNames>,
): IntegrityFinding[] {
  const chars = (list: string[]) => list.map(c => `"${c}"`).join(', ');
  return [
    ...fixes.flatMap(fix =>
      fix.refs.map(({ref}) => ({
        checkId: 'unsafeFileName',
        itemKind: ref.itemKind,
        itemPath: ref.itemPath,
        entityKind: ref.entityKind,
        entityLabel: ref.entityLabel,
        notePath: ref.notePath,
        message: `The note "${fix.oldName}" has ${chars(fix.chars)} in its name, which breaks links in Obsidian. "Fix file names" in Settings → Advanced renames it to "${fix.newStem}${fix.ext}" and updates this link.`,
      })),
    ),
    ...reportOnly.flatMap(item =>
      item.refs.map(ref => ({
        checkId: 'unsafeFileName',
        itemKind: ref.itemKind,
        itemPath: ref.itemPath,
        entityKind: ref.entityKind,
        entityLabel: ref.entityLabel,
        notePath: ref.notePath,
        message: `The note "${lastSegment(item.file)}" has ${chars(item.chars)} in its name, which breaks links in Obsidian. Not renamed: ${item.reason}.`,
      })),
    ),
    ...folders.map(folder => ({
      checkId: 'unsafeFileName',
      itemKind: folder.itemKind,
      itemPath: folder.itemPath,
      entityKind: 'item' as const,
      entityLabel: folder.name,
      notePath: '',
      message: `The folder name "${folder.name}" has ${chars(folder.chars)} in it, which breaks links in Obsidian. gtdpara doesn't rename project or area folders (their name is how other items refer to them) - rename it by hand if needed.`,
    })),
  ];
}

interface ScanTarget {
  kind: GtdParaKind;
  path: string;
  /** The item's own folder name - 'Inbox' for the one inbox target, which has no folder of its own (see its push below). Threaded into ScannedItemSummary for whole-run checks' human-readable messages. */
  name: string;
  /** Whether this target was found under Archive rather than live under Projects/Areas - threaded into ScannedItemSummary for checkDuplicateAbbrev's "live items only" rule. */
  inArchive: boolean;
}

export async function runIntegrityCheck(settings: GtdParaSettings): Promise<IntegrityCheckSummary> {
  const granted = await ensureFileReadPermission();
  if (!granted) {
    throw new Error('File read permission was not granted.');
  }

  const paths = resolvePaths(settings);
  log('runIntegrityCheck: start');

  // The device capabilities the domain-layer checks need (see
  // domain/integrityCheck.ts's IntegrityCheckIO doc comment) - constructed
  // once here, from this file's own device-aware fileExists/folderExists,
  // and threaded into every per-item check run below.
  const io: IntegrityCheckIO = {fileExists, folderExists};

  const [projectEntries, areaEntries, rootEntries] = await Promise.all([
    listFolderEntries(paths.projects),
    listFolderEntries(paths.areas),
    listFolderEntries(paths.base),
  ]);

  const targets: ScanTarget[] = [
    ...projectEntries.filter(e => e.isFolder).map(e => ({kind: 'project' as const, path: e.path, name: e.name, inArchive: false})),
    ...areaEntries
      // The Inbox folder lives under Areas but is never an Area (scanned below as the Inbox).
      .filter(e => e.isFolder && e.path.replace(/\/+$/, '') !== paths.inboxFolder)
      .map(e => ({kind: 'area' as const, path: e.path, name: e.name, inArchive: false})),
  ];

  const archived = await collectArchivedItems(listFolderEntries, paths.archive);
  for (const item of archived) targets.push({kind: item.kind, path: item.path, name: item.name, inArchive: true});

  targets.push({kind: 'inbox', path: paths.inboxFolder, name: 'Inbox', inArchive: false});

  const perTargetResults = await Promise.all(
    targets.map(async (target): Promise<{findings: IntegrityFinding[]; summary: ScannedItemSummary | null; loaded: LoadedEntries | null}> => {
      try {
        const file = await loadProjectFile(target.kind, target.path);
        const findings = await runRegisteredChecks(
          {
            itemKind: target.kind,
            itemPath: target.path,
            tasks: file.tasks,
            meetings: file.meetings,
            rawContent: file.rawContent,
            basePath: paths.base,
            resourcesPath: paths.resources,
            defaultResourceFolder: file.defaultResourceFolder,
          },
          io,
        );
        const summary: ScannedItemSummary = {
          itemKind: target.kind,
          itemPath: target.path,
          itemName: target.name,
          inArchive: target.inArchive,
          area: file.area,
          abbrev: file.abbrev,
        };
        return {findings, summary, loaded: {target, tasks: file.tasks, meetings: file.meetings}};
      } catch (e) {
        const message = errorMessage(e);
        logError('runIntegrityCheck: item load failed', target.path, message);
        return {
          findings: [
            {
              checkId: 'loadError',
              itemKind: target.kind,
              itemPath: target.path,
              entityKind: 'item',
              entityLabel: '(the data file itself)',
              notePath: '',
              message: `Could not read this item's data file: ${message}`,
            },
          ],
          // No summary for a target whose file couldn't even be read - it
          // has no area/abbrev worth comparing against everything else, and
          // its loadError finding above already surfaces the real problem.
          summary: null,
          loaded: null,
        };
      }
    }),
  );

  const perItemFindings = perTargetResults.flatMap(result => result.findings);
  const summaries = perTargetResults
    .map(result => result.summary)
    .filter((summary): summary is ScannedItemSummary => summary !== null);
  const wholeRunFindings = runWholeRunChecks(summaries);
  const leftoverFindings = checkLegacyInboxLeftovers(
    rootEntries.map(e => ({name: e.name, isFolder: e.isFolder})),
    paths.base,
    paths.inboxFolder,
  );
  // Unsafe file names (docs/dev/technical-design-files-0.6.md §3.5).
  const loaded = perTargetResults.map(result => result.loaded).filter((l): l is LoadedEntries => l !== null);
  const {fixes, reportOnly} = planFileNameFixes(await collectUnsafeNoteRefs(loaded));
  const folders = unsafeFolderNames(
    loaded.filter(l => !l.target.inArchive).map(l => ({itemKind: l.target.kind, itemPath: l.target.path, name: l.target.name})),
  );
  const findings = [...perItemFindings, ...wholeRunFindings, ...leftoverFindings, ...fileNameFindings(fixes, reportOnly, folders)];

  const report = formatIntegrityReport(findings, targets.length, new Date());
  const reportFileName = await writeIntegrityCheckReport(report);

  log('runIntegrityCheck: done', `${targets.length} items scanned`, `${findings.length} findings`);
  return {itemsScanned: targets.length, findings, reportFileName, fileNameFixes: fixes};
}
