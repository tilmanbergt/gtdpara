/**
 * Plugin-level settings: the base storage root plus the individual folder
 * names layered on top of it (Projects/Areas/Resources/Archive). Pure
 * domain logic - no RN imports, no I/O. Persistence lives in
 * storage/settingsStorage.ts.
 */
import {INBOX_FILE_NAME} from './types';
import {TagRule} from './tagRules';
import {ReviewStepsMap} from './reviewSteps';

export interface GtdParaSettings {
  baseRoot: string;
  projectsFolder: string;
  areasFolder: string;
  resourcesFolder: string;
  archiveFolder: string;
  /**
   * Name of the Inbox's own folder inside the Areas folder
   * (docs/dev/technical-design-inbox-as-area.md). Holds Inbox.txt and the
   * Inbox's Todos/Meetings note folders. Never treated as an Area.
   */
  inboxFolder: string;
  /**
   * Focus slot counts (see storage/focusSlots.ts): how many Projects/Areas
   * can be marked daily/weekly-focused at once, independently per
   * kind/scope. Weekly isn't consumed by any view yet (reserved for a
   * future week view) but is configurable and enforced the same way daily
   * is, so the data/UI is already in place when that view is built.
   */
  dailyFocusProjectCount: number;
  dailyFocusAreaCount: number;
  weeklyFocusProjectCount: number;
  weeklyFocusAreaCount: number;
  /** Monthly focus slots (docs/dev/technical-design-monthly-view.md) - default 2 projects + 3 areas. */
  monthlyFocusProjectCount: number;
  monthlyFocusAreaCount: number;
  /**
   * Per-step review tracking for the Weekly Review (docs/dev/technical-design-
   * review-hub.md). One record per step id: when "Reviewed" was last tapped on it, the recap
   * counts of its last recorded visit, and (backlog steps only) when the hub
   * last saw it empty. Plugin meta, not PARA content (same reasoning as the
   * focus counts above) - a passive marker only (domain/reviewSteps.ts's
   * isReviewOverdue drives the Review tab's badge), never an active
   * reminder/notification. Written only through storage/settingsStorage.ts's
   * updateReviewSteps.
   */
  reviewSteps: ReviewStepsMap;
  /**
   * "Hide done tasks" toggle state, remembered across visits (2026-09-03
   * Daily-cleanup pass) - independent per surface since a Project/Area's
   * Todos list and Daily's Inbox are different contexts (a long-lived
   * project accumulates done tasks fast; Inbox is meant to be triaged to
   * empty quickly, so there's rarely anything to hide there). Both default
   * to false (shown) - no behavior change until someone taps the toggle.
   */
  hideDoneProjectTasks: boolean;
  hideDoneInboxTasks: boolean;
  /**
   * The user's Google Calendar "secret address in iCal format" URL
   * (Settings → Calendar), or '' if not configured (storage/
   * googleCalendarCache.ts's refreshGoogleCalendar). Plugin meta, not PARA
   * content - same reasoning as every other field here. Read-only: this
   * plugin only ever fetches this URL, never writes to it. Like the rest of
   * this file it sits in plaintext AsyncStorage, same trust level as
   * everything else stored here today - but unlike a folder name, this
   * string is itself a bearer credential (anyone with the URL can read the
   * calendar), worth remembering if this file's storage mechanism ever
   * changes.
   */
  googleCalendarIcsUrl: string;
  /**
   * Whether Daily's focus mode is currently on (docs/dev/technical-design-now-
   * focus-mode.md §4) - the one piece of durable state focus mode needs.
   * "Sessions are held lightly": there is no session id, no start
   * timestamp, no membership list - just this flag plus whichever tasks
   * currently carry `#now`. Read once, in App.tsx's reorient(), to decide
   * whether reopening the plugin should land straight back on focus mode
   * instead of the normal enclosing-item lookup. Set true by Daily's "Focus
   * mode" entry action, set false by focus mode's own exit action - see
   * App.tsx's onEnterFocusMode/onExitFocusMode.
   */
  focusModeActive: boolean;
  /**
   * The user-editable catalog of note creation definitions (docs/technical-
   * design-note-templates.md) - context + optional tag match + background +
   * an ordered set of content pieces, resolved by domain/tagRules.ts's
   * resolveNoteTemplate. Plugin config, not PARA content, same reasoning as
   * every other field here. Phase 1 (2026-09-18) added this field, inert
   * until Phase 2 wired Meeting-note creation through it and Phase 3 (same
   * day) wired Todo-note creation through it too - both resolve against
   * this list at note-creation/refresh time now (storage/
   * meetingNoteContent.ts's refreshMeetingNoteBlock/refreshTodoNoteBlock).
   * Each definition's own `template` field also fully replaced the old
   * global `meetingNoteTemplate` setting in Phase 3 (removed from this
   * interface) - background selection is per-definition now, not global.
   */
  tagRules: TagRule[];
  /**
   * Simple incrementing counter used as the next `TagRule.id`
   * (domain/tagRules.ts's `createEmptyTagRule`) - chosen over a UUID
   * as the simpler option (Tilman, 2026-09-18: "id as counter is fine").
   * Definition export/import was flagged as a plausible future idea this
   * doesn't need to accommodate now.
   */
  nextTagRuleId: number;
  /**
   * Gmail inbox review step (docs/dev/technical-design-review-gmail-inbox.md
   * §2) - the account this plugin reads via IMAP. '' means "not configured",
   * same convention as googleCalendarIcsUrl above: the Gmail step then shows
   * a "set up in Settings" hint instead of trying to fetch. Plugin meta, not
   * PARA content, same reasoning as every other field here.
   */
  gmailEmail: string;
  /**
   * A Google "App Password" (myaccount.google.com/apppasswords), NOT the
   * account's regular password - Gmail's IMAP access requires this once
   * 2-step verification is on, and even without it a dedicated app password
   * is the safer thing to store here. Same plaintext-AsyncStorage trust
   * level as googleCalendarIcsUrl (see that field's own doc comment) - this
   * one is a credential rather than a read-only bearer URL, so it's worth
   * being even more deliberate if this file's storage mechanism ever
   * changes.
   */
  gmailAppPassword: string;
  /**
   * IMAP host, default 'imap.gmail.com'. Kept editable (Settings shows it
   * de-emphasized, "advanced") rather than hardcoded purely so a Google
   * Workspace domain with a different IMAP endpoint isn't a dead end - not
   * expected to be touched by most users.
   */
  gmailImapHost: string;
  /**
   * "Hide handled emails by default" - mirrors hideDoneProjectTasks/
   * hideDoneInboxTasks's default-false convention (see their own doc
   * comment above). "Handled" here means "has at least one Todo/Meeting
   * created from it" (storage/gmailInboxCache.ts) - independent of archive,
   * since an email can be fully handled without being archived yet (the
   * user reads mail elsewhere too) or archived without ever being handled
   * (some mail just gets read and archived with no follow-up).
   */
  gmailHideHandled: boolean;
  /**
   * Performance tracing on/off (docs/dev/technical-design-perf-tracing.md §6) -
   * when on, utils/perf.ts writes one small JSONL file per tab switch / cold
   * start / reopen to the debug log folder's perf/ subfolder. Default off;
   * a diagnostic switch, not a user feature.
   */
  perfTracing: boolean;
  /**
   * "Keep tabs in memory" (docs/dev/technical-design-keep-tabs-alive.md §3.1):
   * Daily, Week, Month, Current, Projects and Areas stay mounted (hidden)
   * after their first visit, so switching back needs no rebuild. Default
   * on; the switch is a safety net during the test phase.
   */
  keepTabsAlive: boolean;
  /**
   * Experimental switches (docs/dev/technical-design-about-debug-experimental.md
   * §3.1): the Google Calendar and Gmail integrations are only shown when on.
   * Off hides their entry points; their configuration above stays stored.
   * Read them through domain/features.ts's featuresOf.
   */
  experimentalGoogleCalendar: boolean;
  experimentalGmail: boolean;
  /** Debug logging: also append every log line to a rotating file in the debug folder (utils/logSink.ts). */
  debugLogging: boolean;
  /**
   * The last release version whose "Updated to x.y.z" notice the user
   * acknowledged (tapped What's new or ✕). '' = none yet.
   */
  lastSeenVersion: string;
  /**
   * Which profile is active (docs/dev/technical-design-profiles-demo-space.md) -
   * the file name of its JSON in EXPORT/gtdpara/profiles, without ".json".
   * Device-wide; 'production' is the default profile.
   */
  activeProfileId: string;
}

export const DEFAULT_SETTINGS: GtdParaSettings = {
  baseRoot: '/storage/emulated/0/Note',
  projectsFolder: '1 Projects',
  areasFolder: '2 Areas',
  resourcesFolder: '3 Resources',
  archiveFolder: '4 Archive',
  inboxFolder: '0 Inbox',
  dailyFocusProjectCount: 3,
  dailyFocusAreaCount: 2,
  weeklyFocusProjectCount: 5,
  weeklyFocusAreaCount: 3,
  monthlyFocusProjectCount: 2,
  monthlyFocusAreaCount: 3,
  reviewSteps: {},
  hideDoneProjectTasks: false,
  hideDoneInboxTasks: false,
  googleCalendarIcsUrl: '',
  focusModeActive: false,
  tagRules: [],
  nextTagRuleId: 1,
  gmailEmail: '',
  gmailAppPassword: '',
  gmailImapHost: 'imap.gmail.com',
  gmailHideHandled: false,
  perfTracing: false,
  keepTabsAlive: true,
  experimentalGoogleCalendar: false,
  experimentalGmail: false,
  debugLogging: false,
  lastSeenVersion: '',
  activeProfileId: 'production',
};

export interface ResolvedParaPaths {
  base: string;
  projects: string;
  areas: string;
  resources: string;
  archive: string;
  /**
   * The Inbox's own folder (`<areas>/<inboxFolder>`) - the Inbox's item path:
   * Inbox.txt and its Todos/Meetings note folders live here.
   */
  inboxFolder: string;
  /** The untriaged-capture file, `<inboxFolder>/Inbox.txt`. */
  inbox: string;
}

/** Keys Tag Rules were stored under up to 0.8 (as "note creation definitions"). */
const LEGACY_TAG_RULE_KEYS: Array<[legacy: string, current: 'tagRules' | 'nextTagRuleId']> = [
  ['noteCreationDefinitions', 'tagRules'],
  ['nextNoteDefinitionId', 'nextTagRuleId'],
];

/**
 * A stored settings blob or profile file with the Tag Rule keys of 0.8 and
 * earlier renamed to the current ones. A current key already present wins;
 * the legacy key is dropped either way. Returns the same object when there is
 * nothing to rename.
 */
export function renameLegacyTagRuleKeys(raw: Record<string, unknown>): Record<string, unknown> {
  if (!LEGACY_TAG_RULE_KEYS.some(([legacy]) => legacy in raw)) return raw;
  const next = {...raw};
  for (const [legacy, current] of LEGACY_TAG_RULE_KEYS) {
    if (!(legacy in next)) continue;
    if (!(current in next)) next[current] = next[legacy];
    delete next[legacy];
  }
  return next;
}

function joinPath(base: string, segment: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedSegment = segment.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedSegment}`;
}

/**
 * Turns the base root + per-folder names into the absolute paths the
 * native file module reads. Falls back field-by-field to DEFAULT_SETTINGS
 * for anything blank, so a partially-filled-in settings form still
 * resolves to something sensible.
 */
export function resolvePaths(settings: GtdParaSettings): ResolvedParaPaths {
  const base = (settings.baseRoot || DEFAULT_SETTINGS.baseRoot).replace(/\/+$/, '');
  const areas = joinPath(base, settings.areasFolder || DEFAULT_SETTINGS.areasFolder).replace(/\/+$/, '');
  const inboxFolder = joinPath(areas, (settings.inboxFolder || DEFAULT_SETTINGS.inboxFolder).trim()).replace(/\/+$/, '');
  return {
    base,
    projects: joinPath(base, settings.projectsFolder || DEFAULT_SETTINGS.projectsFolder),
    areas,
    resources: joinPath(base, settings.resourcesFolder || DEFAULT_SETTINGS.resourcesFolder),
    archive: joinPath(base, settings.archiveFolder || DEFAULT_SETTINGS.archiveFolder),
    inboxFolder,
    inbox: joinPath(inboxFolder, INBOX_FILE_NAME),
  };
}

/** Whether `folderPath` is the configured Inbox folder (exact match, trailing slashes ignored). Used to keep it out of every Area listing. */
export function isInboxFolder(paths: ResolvedParaPaths, folderPath: string): boolean {
  if (paths.inboxFolder === paths.base) return false; // legacy location: the base root is never an Area folder
  return folderPath.replace(/\/+$/, '') === paths.inboxFolder;
}

/** Whether `filePath` is the Inbox folder or anything inside it. */
export function isUnderInboxFolder(paths: ResolvedParaPaths, filePath: string): boolean {
  if (paths.inboxFolder === paths.base) return false; // legacy location: everything is under the base root
  return filePath === paths.inboxFolder || filePath.startsWith(`${paths.inboxFolder}/`);
}

/** Problem with a typed Inbox folder name, or null when it can be used. */
export function validateInboxFolderName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'The Inbox folder needs a name.';
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'The Inbox folder name cannot contain a slash.';
  if (trimmed.startsWith('.')) return 'The Inbox folder name cannot start with a dot.';
  if (trimmed.length > 60) return 'The Inbox folder name is too long (60 characters at most).';
  return null;
}

export interface EnclosingItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

/**
 * If `filePath` (the note that was open when the plugin launched) lives
 * anywhere under the Projects or Areas root - directly in a Project/Area's
 * own folder, or nested any number of levels deeper (e.g. its own
 * "Meetings"/"Todos" subfolder) - resolves the *top-level* Project/Area
 * folder that owns it. Returns null if `filePath` isn't under either root
 * at all (e.g. it's in Resources/Archive/Inbox, or outside the configured
 * base entirely).
 */
export function findEnclosingItem(
  paths: ResolvedParaPaths,
  filePath: string,
): EnclosingItem | null {
  const roots: Array<{kind: 'project' | 'area'; root: string}> = [
    {kind: 'project', root: paths.projects},
    {kind: 'area', root: paths.areas},
  ];
  // The Inbox folder sits inside Areas but is never an Area
  // (technical-design-inbox-as-area.md §3.1) - a note in it has no
  // enclosing Project/Area, the same as a note in the old root Inbox.
  if (isUnderInboxFolder(paths, filePath)) return null;
  for (const {kind, root} of roots) {
    const prefix = `${root.replace(/\/+$/, '')}/`;
    if (!filePath.startsWith(prefix)) continue;
    const rest = filePath.slice(prefix.length);
    const name = rest.split('/')[0];
    if (!name) continue;
    return {kind, name, path: `${prefix}${name}`};
  }
  return null;
}
