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
 * Archive folders aren't kind-tagged the way the Projects/Areas roots are
 * (archiveItem moves a Project OR an Area folder into the same flat
 * Archive/ root) - detectArchivedItemKind below tells them apart by which
 * data file (project.txt vs area.txt) is actually present.
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
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {AREA_FILE_NAME, GtdParaKind, PROJECT_FILE_NAME} from '../domain/types';
import {fileExists, folderExists, listFolderEntries, writeIntegrityCheckReport} from '../supernote/fileSystem';
import {ensureFileReadPermission} from '../supernote/pluginPermissions';
import {log, logError} from '../utils/log';
import {resolveLivePaths} from './dataCache';
import {hiddenAreaFolderFor} from './inboxMigration';
import {loadProjectFile} from './projectFile';

export interface IntegrityCheckSummary {
  itemsScanned: number;
  findings: IntegrityFinding[];
  reportFileName: string;
}

interface ScanTarget {
  kind: GtdParaKind;
  path: string;
  /** The item's own folder name - 'Inbox' for the one inbox target, which has no folder of its own (see its push below). Threaded into ScannedItemSummary for whole-run checks' human-readable messages. */
  name: string;
  /** Whether this target was found under Archive rather than live under Projects/Areas - threaded into ScannedItemSummary for checkDuplicateAbbrev's "live items only" rule. */
  inArchive: boolean;
}

/** Archive doesn't separate Projects from Areas by folder location (storage/archive.ts moves either kind into the same Archive/ root) - tell them apart by which data file is actually present. Returns null for an Archive entry that has neither (an unexpected/foreign folder) - skipped rather than guessed at. */
async function detectArchivedItemKind(folderPath: string): Promise<GtdParaKind | null> {
  const entries = await listFolderEntries(folderPath);
  if (entries.some(e => !e.isFolder && e.name === PROJECT_FILE_NAME)) return 'project';
  if (entries.some(e => !e.isFolder && e.name === AREA_FILE_NAME)) return 'area';
  return null;
}

export async function runIntegrityCheck(settings: GtdParaSettings): Promise<IntegrityCheckSummary> {
  const granted = await ensureFileReadPermission();
  if (!granted) {
    throw new Error('File read permission was not granted.');
  }

  // Live paths: the Inbox target is wherever the Inbox really is right now
  // (docs/dev/technical-design-inbox-as-area.md §3.6).
  const configuredPaths = resolvePaths(settings);
  const paths = await resolveLivePaths(settings);
  const hiddenAreaFolder = hiddenAreaFolderFor(configuredPaths);
  log('runIntegrityCheck: start');

  // The device capabilities the domain-layer checks need (see
  // domain/integrityCheck.ts's IntegrityCheckIO doc comment) - constructed
  // once here, from this file's own device-aware fileExists/folderExists,
  // and threaded into every per-item check run below.
  const io: IntegrityCheckIO = {fileExists, folderExists};

  const [projectEntries, areaEntries, archiveEntries, rootEntries] = await Promise.all([
    listFolderEntries(paths.projects),
    listFolderEntries(paths.areas),
    listFolderEntries(paths.archive),
    listFolderEntries(paths.base),
  ]);

  const targets: ScanTarget[] = [
    ...projectEntries.filter(e => e.isFolder).map(e => ({kind: 'project' as const, path: e.path, name: e.name, inArchive: false})),
    ...areaEntries
      // The Inbox folder lives under Areas but is never an Area (scanned below as the Inbox).
      .filter(e => e.isFolder && e.path.replace(/\/+$/, '') !== hiddenAreaFolder)
      .map(e => ({kind: 'area' as const, path: e.path, name: e.name, inArchive: false})),
  ];

  const archiveFolders = archiveEntries.filter(e => e.isFolder);
  const archiveKinds = await Promise.all(archiveFolders.map(entry => detectArchivedItemKind(entry.path)));
  archiveFolders.forEach((entry, index) => {
    const kind = archiveKinds[index];
    if (kind) targets.push({kind, path: entry.path, name: entry.name, inArchive: true});
  });

  // The Inbox at its effective location: its folder under Areas, or the base root while an old Inbox hasn't moved.
  targets.push({kind: 'inbox', path: paths.inboxFolder, name: 'Inbox', inArchive: false});

  const perTargetResults = await Promise.all(
    targets.map(async (target): Promise<{findings: IntegrityFinding[]; summary: ScannedItemSummary | null}> => {
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
        return {findings, summary};
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
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
    configuredPaths.inboxFolder,
  );
  const findings = [...perItemFindings, ...wholeRunFindings, ...leftoverFindings];

  const report = formatIntegrityReport(findings, targets.length, new Date());
  const reportFileName = await writeIntegrityCheckReport(report);

  log('runIntegrityCheck: done', `${targets.length} items scanned`, `${findings.length} findings`);
  return {itemsScanned: targets.length, findings, reportFileName};
}
