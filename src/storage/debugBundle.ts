/**
 * "Export debug bundle" (Settings → About;
 * docs/dev/history/technical-design-about-debug-experimental.md §3.4): one .txt in
 * the debug folder with what a bug report needs - version and build,
 * device, a settings summary made of yes/no facts and counts (never names),
 * data counts, recent errors and the recent log - run through
 * domain/redact.ts so passwords, calendar links and e-mail addresses never
 * leave the device.
 */
import {cachedContentsCount} from './notebookContents';
import {listOpenMarks} from './marks';
import {listMarkDataIds, readPendingIconChanges} from './markData';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../domain/settings';
import {featuresOf} from '../domain/features';
import {redactText} from '../domain/redact';
import {BUILD_INFO} from '../generated/buildInfo';
import {getRememberedLaunchNotePath, writeDebugBundleFile} from '../supernote/fileSystem';
import {getRuntimeDiagnostics} from '../supernote/pluginRuntime';
import {getRecentErrors, getRecentLogLines, isFileLoggingOn, LOG_FILE_NAME} from '../utils/logSink';
import {collectPerfStats} from './perfStats';
import {counterpartScopes} from '../domain/counterparts';
import {getCachedData} from './dataCache';
import {errorMessage} from '../utils/errorMessage';
import {getTouchEntries, isAppWideTouchLog} from '../utils/touchDiagStore';
import {didNoteSetupMigrationFail} from './noteSetupMigrationState';
import {getSettingsUnreadable} from './settingsUnreadable';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fileStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function utcOffset(d: Date): string {
  const minutes = -d.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function onOff(v: boolean): string {
  return v ? 'ON' : 'OFF';
}

function extensionOf(path: string | null | undefined): string {
  if (!path) {return 'none (Home)';}
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? `.${m[1].toLowerCase()}` : 'unknown';
}

/** Pure part: the settings summary line(s). Exported for tests. */
export function summarizeSettings(s: GtdParaSettings): string[] {
  const folderKeys = ['baseRoot', 'projectsFolder', 'areasFolder', 'resourcesFolder', 'archiveFolder', 'inboxFolder'] as const;
  const customFolders = folderKeys.some(k => (s[k] ?? '') !== DEFAULT_SETTINGS[k]);
  const f = featuresOf(s);
  const focus = [
    `${s.dailyFocusProjectCount}/${s.dailyFocusAreaCount}`,
    `${s.weeklyFocusProjectCount}/${s.weeklyFocusAreaCount}`,
    `${s.monthlyFocusProjectCount}/${s.monthlyFocusAreaCount}`,
  ].join(' ');
  return [
    `settings: profile ${s.activeProfileId} · folders ${customFolders ? 'custom' : 'default'} · focus d/w/m ${focus} · focusMode ${onOff(s.focusModeActive)} · engage current todo ${s.engageCurrent ? 'yes' : 'no'}`,
    `          calendar ${s.googleCalendarIcsUrl.trim() ? 'configured' : 'not configured'}, ${onOff(f.googleCalendar)}` +
      ` · gmail ${s.gmailEmail.trim() ? 'configured' : 'not configured'}, ${onOff(f.gmail)}`,
    `          keepTabs ${onOff(s.keepTabsAlive)} · perfTracing ${onOff(s.perfTracing)} · debugLogging ${onOff(s.debugLogging)}` +
      ` · reviewSteps recorded ${Object.keys(s.reviewSteps ?? {}).length}`,
    noteSetupsLine(s, didNoteSetupMigrationFail()),
    `          homeNotebooks ${onOff(!!s.noteSetupDefaults?.notebook)} · contents ${onOff(s.notebookContentsEnabled)} · cached ${cachedContentsCount()}`,
  ];
}

/**
 * "note setups: thread 3 · loop 1 · off 1 · notebook 2 · default pages 2 · default notebook no · migrated yes"
 * (docs/dev/history/technical-design-note-setups.md §8) - counts only, never names or tags.
 * `migrated`: yes when the setups came from Tag Rules, no for a fresh start, failed when
 * the migration failed in this session.
 */
export function noteSetupsLine(s: GtdParaSettings, migrationFailed: boolean): string {
  const setups = s.noteSetups ?? [];
  const on = setups.filter(x => x.enabled);
  const migrated = migrationFailed ? 'failed' : s.noteSetupsMigrated && (s.tagRules ?? []).length > 0 ? 'yes' : 'no';
  return (
    `note setups: thread ${on.filter(x => x.kind === 'thread').length} · loop ${on.filter(x => x.kind === 'loop').length}` +
    ` · off ${setups.length - on.length} · notebook ${on.filter(x => x.kind === 'thread' && x.notebook).length}` +
    ` · default pages ${Object.keys(s.noteSetupDefaults?.pages ?? {}).length} · default notebook ${s.noteSetupDefaults?.notebook ? 'yes' : 'no'}` +
    ` · migrated ${migrated}`
  );
}

export async function buildDebugInfo(settings: GtdParaSettings, now: Date = new Date()): Promise<string[]> {
  const b = BUILD_INFO;
  const d = await getRuntimeDiagnostics();
  const launch = getRememberedLaunchNotePath();
  const lines: string[] = [];
  lines.push(
    `Kept GTD ${b.label} (build ${b.versionCode || 'dev'}) commit ${b.commit}${b.dirty ? ' (uncommitted changes)' : ''}` +
      `  built ${b.builtAt}  ${b.release ? 'release' : 'development build'}`,
  );
  lines.push(
    `sn-plugin-lib ${b.snPluginLib} · device ${[d?.manufacturer, d?.model].filter(Boolean).join(' ') || 'unknown'}` +
      ` · Android ${d?.androidRelease || '?'} · display ${d?.display || '?'}`,
  );
  lines.push(
    d
      ? `host build ${d.buildId} · versionCode ${d.versionCode} · process age ${Math.round(d.processAgeMs / 60000)} min` +
          ` · stale builds ${d.staleBuilds.length}`
      : 'host diagnostics: not available',
  );
  lines.push(`time ${now.toISOString()} (${utcOffset(now)}) · launched from ${extensionOf(launch?.path)}`);
  lines.push(...summarizeSettings(settings));
  lines.push(`settings readable: ${getSettingsUnreadable() === null ? 'yes' : 'no - running on defaults, saving none'}`);
  let data = 'not available';
  try {
    data = JSON.stringify(collectPerfStats());
  } catch {
    // silent: the bundle says 'not available'
  }
  lines.push(`data: ${data}`);
  lines.push(await marksLine());
  lines.push(counterpartsLine());
  lines.push(loopsLine());
  lines.push(`log file: ${isFileLoggingOn() ? `ON (${LOG_FILE_NAME})` : 'OFF'}`);
  lines.push(`touch test: log touches everywhere ${isAppWideTouchLog() ? 'ON' : 'OFF'} · records ${getTouchEntries().length}`);
  const errors = getRecentErrors(10);
  lines.push(`recent errors (${errors.length}):`);
  errors.forEach(e => lines.push(`  ${e}`));
  return lines;
}

/** "counterparts: active 4 · inactive 1 (2 scopes with a ## Threads section)" (tending threads §3.9.1) - counts of status lines only, never names. */
function counterpartsLine(): string {
  const items = getCachedData()?.items;
  if (!items) return 'counterparts: not available (no cache)';
  let active = 0;
  let inactive = 0;
  let withSection = 0;
  for (const scope of counterpartScopes(items)) {
    const lines = scope.members.flatMap(member => member.threads);
    if (lines.length > 0) withSection += 1;
    const status = new Map<string, string>();
    for (const line of lines) if (!status.has(line.leaf)) status.set(line.leaf, line.status);
    for (const value of status.values()) {
      if (value === 'active') active += 1;
      else inactive += 1;
    }
  }
  return `counterparts: active ${active} · inactive ${inactive} (${withSection} scopes with a ## Threads section)`;
}

/** "loops: active 4 · done 2 · dropped 1" (docs/dev/history/technical-design-loops.md §5) - counts only, never names or tags; the Loop setups are counted on the note setups line. */
function loopsLine(): string {
  const items = getCachedData()?.items;
  if (!items) return 'loops: lines not available (no cache)';
  const count = (status: string) => items.reduce((sum, item) => sum + item.loops.filter(l => l.status === status).length, 0);
  return `loops: active ${count('active')} · done ${count('done')} · dropped ${count('dropped')}`;
}

/** "marks: open 3 (inbox 1 · items 2) · data 3 · pending icons 0" (lasso 0.8 §3.10) - counts only. */
async function marksLine(): Promise<string> {
  try {
    const open = listOpenMarks({type: 'all'});
    const inbox = open.filter(m => m.owner.type === 'inbox').length;
    const data = (await listMarkDataIds()).length;
    const pending = (await readPendingIconChanges()).length;
    return `marks: open ${open.length} (inbox ${inbox} · items ${open.length - inbox}) · data ${data} · pending icons ${pending}`;
  } catch (e) {
    return `marks: not available (${errorMessage(e)})`;
  }
}

/** Writes the bundle and returns its full path. Throws on failure. */
export async function exportDebugBundle(settings: GtdParaSettings): Promise<string> {
  const now = new Date();
  const info = await buildDebugInfo(settings, now);
  const log = getRecentLogLines();
  const text = [
    '=== Kept GTD debug bundle ===',
    'Please look through this file before sharing it. File paths are included.',
    '',
    ...info,
    '',
    `=== recent log (${log.length} lines, oldest first) ===`,
    ...log,
    '',
  ].join('\n');
  const redacted = redactText(text, {
    gmailEmail: settings.gmailEmail,
    gmailAppPassword: settings.gmailAppPassword,
    googleCalendarIcsUrl: settings.googleCalendarIcsUrl,
  });
  return writeDebugBundleFile(`kept-gtd-debug-${fileStamp(now)}.txt`, redacted);
}
