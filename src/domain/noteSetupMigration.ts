/**
 * Tag Rules -> Note setups, once (docs/dev/history/technical-design-note-setups.md §5).
 * Principle: every item keeps the note it has (note links are never touched);
 * new notes go where the merged setup says. The stored Tag Rules stay as they
 * are (backup, downgrade to 0.14) - only this file reads them. Pure.
 */
import {
  createNoteSetup,
  LOOP_NOTE_NAME_DEFAULT,
  MeetingTracking,
  NoteSetup,
  NoteSetupDefaults,
  normalizeSetupTag,
  seedNoteSetupDefaults,
} from './noteSetups';
import {NotePiece, NoteTextItem, PageKind, PageLayout} from './pageLayout';
import {
  migrationConflictText,
  migrationDefaultRemovedText,
  migrationIntoNotebookText,
  migrationLoopKindTagText,
  migrationLoopOwnText,
  migrationMergedText,
  migrationNeverAppliedText,
  migrationNotebookChangedText,
  migrationNoTagsText,
  migrationOffCollisionText,
  migrationUnmatchedSharedText,
} from './fileChangeText';
import type {GtdParaSettings} from './settings';

/** The Tag Rule contexts of 0.14. `loop`: the rule's tags are loop kinds, its pieces the loop note's first page. */
export type LegacyNoteContext = 'project' | 'area' | 'todo' | 'meeting' | 'loop';

/** A Tag Rule as 0.14 stored it (settings key `tagRules`). Read here only. */
export interface LegacyTagRule extends PageLayout {
  id: string;
  name: string;
  context: LegacyNoteContext;
  /** Empty = never matched by tag; only reachable via isDefault. */
  tags: string[];
  isDefault: boolean;
  enabled: boolean;
  template: string;
  pieces: NotePiece[];
  texts?: NoteTextItem[];
  trackPrep?: boolean;
  trackReview?: boolean;
  /** Absent = 'own'. */
  noteTarget?: 'own' | 'shared';
  /** Blank/absent = the rule's name (a Loop rule: LOOP_NOTE_NAME_DEFAULT). */
  sharedFileName?: string;
  /** Absent = 'subfolder' (Meetings/ or Todos/ by context). */
  sharedFileFolder?: 'subfolder' | 'root';
}

export type MigrationChange = 'merged' | 'intoNotebook' | 'notebookChanged' | 'conflict' | 'removed';

/** One line of the migration notice: which setup (or rule, for removed ones), what changed, and the text shown. */
export interface MigrationReportEntry {
  setup: string;
  change: MigrationChange;
  detail: string;
}

export type MigrationReport = MigrationReportEntry[];

export interface TagRuleMigration {
  setups: NoteSetup[];
  defaults: NoteSetupDefaults;
  nextId: number;
  report: MigrationReport;
}

/** A rule cleaned for grouping: normalized tags, and its position in the stored list. */
interface Member {
  rule: LegacyTagRule;
  index: number;
  tags: string[];
}

function tagsOf(rule: LegacyTagRule): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(rule.tags) ? rule.tags : []) {
    const tag = typeof raw === 'string' ? normalizeSetupTag(raw) : '';
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function layoutOf(rule: LegacyTagRule): PageLayout {
  return {
    template: typeof rule.template === 'string' ? rule.template : '',
    pieces: Array.isArray(rule.pieces) ? rule.pieces : [],
    ...(Array.isArray(rule.texts) && rule.texts.length > 0 ? {texts: rule.texts} : {}),
  };
}

function isShared(rule: LegacyTagRule): boolean {
  return rule.noteTarget === 'shared';
}

function ruleLabel(rule: LegacyTagRule): string {
  return rule.name?.trim() || tagsOf(rule).map(t => `#${t}`).join(' ') || 'Unnamed rule';
}

/** The notebook a shared Meeting/Todo rule wrote to: its file name template and the folder it used. */
function notebookOfRule(rule: LegacyTagRule): {name: string; folder: string} {
  const field = rule.sharedFileName?.trim();
  const folder = rule.sharedFileFolder === 'root' ? '' : rule.context === 'todo' ? 'Todos' : 'Meetings';
  return {name: field ? field : rule.name, folder};
}

const PAGE_OF_CONTEXT: Partial<Record<LegacyNoteContext, PageKind>> = {meeting: 'meeting', todo: 'todo', loop: 'first'};

/** Union-find over tags: members sharing a tag end up in one component, components in order of their first member. */
function components(members: readonly Member[]): Member[][] {
  const parent = members.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  members.forEach((m, i) => {
    for (const tag of m.tags) {
      const j = owner.get(tag);
      if (j === undefined) owner.set(tag, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Member[]>();
  members.forEach((m, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), m]);
  });
  return [...groups.values()].sort((a, b) => a[0].index - b[0].index);
}

/**
 * Loop kinds (the tags of the Loop rules among `members`) win their tags: a
 * Meeting/Todo rule whose tags are all kinds of one Loop rule stays as it is
 * (it joins that loop's setup); any other rule loses its loop-kind tags.
 */
function separateLoopKinds(members: readonly Member[], report: MigrationReport): Member[] {
  const loops = members.filter(m => m.rule.context === 'loop');
  const kinds = new Set(loops.flatMap(m => m.tags));
  const out: Member[] = [];
  for (const m of members) {
    if (m.rule.context === 'loop' || !m.tags.some(t => kinds.has(t))) {
      out.push(m);
      continue;
    }
    if (loops.some(loop => m.tags.every(t => loop.tags.includes(t)))) {
      out.push(m);
      continue;
    }
    const removed = m.tags.filter(t => kinds.has(t));
    const kept = m.tags.filter(t => !kinds.has(t));
    report.push({setup: ruleLabel(m.rule), change: 'removed', detail: migrationLoopKindTagText(removed)});
    if (kept.length > 0) out.push({...m, tags: kept});
  }
  return out;
}

function trackingOf(members: readonly Member[]): MeetingTracking {
  const meetings = members.filter(m => m.rule.context === 'meeting');
  return {
    trackPrep: meetings.some(m => m.rule.trackPrep === true),
    trackReview: meetings.some(m => m.rule.trackReview === true),
  };
}

/** One setup from one component (§5 rules 3-9). */
function setupOf(group: readonly Member[], id: string, enabled: boolean, report: MigrationReport): NoteSetup {
  const loopMember = group.find(m => m.rule.context === 'loop');
  const meetingMember = group.find(m => m.rule.context === 'meeting');
  const tags: string[] = [];
  for (const m of group) for (const t of m.tags) if (!tags.includes(t)) tags.push(t);
  const name = (loopMember ?? meetingMember ?? group[0]).rule.name?.trim() || `#${tags[0]}`;
  const setup: NoteSetup = {...createNoteSetup(id, loopMember ? 'loop' : 'thread'), name, tags, enabled};

  if (group.length > 1) report.push({setup: name, change: 'merged', detail: migrationMergedText(group.map(m => ruleLabel(m.rule)))});

  // Pages: the first member of each context wins (it matched first in 0.14).
  for (const m of group) {
    const kind = PAGE_OF_CONTEXT[m.rule.context];
    if (!kind) continue;
    if (setup.pages[kind]) {
      report.push({setup: name, change: 'conflict', detail: migrationConflictText(ruleLabel(m.rule), kind)});
      continue;
    }
    setup.pages[kind] = layoutOf(m.rule);
  }

  setup.tracking = trackingOf(group);

  if (loopMember) {
    const field = loopMember.rule.sharedFileName?.trim();
    setup.notebook = {name: field ? field : LOOP_NOTE_NAME_DEFAULT, folder: ''};
    // Outside an active loop, a shared Meeting/Todo rule on the kind wrote to its own notebook in 0.14.
    for (const m of group) {
      if (m.rule.context !== 'loop' && isShared(m.rule)) {
        report.push({setup: name, change: 'notebookChanged', detail: migrationLoopOwnText(m.rule.context)});
      }
    }
    return setup;
  }

  const shared = group.filter(m => isShared(m.rule));
  const preferred = [...shared.filter(m => m.rule.enabled), ...shared.filter(m => !m.rule.enabled)];
  const chosen = preferred.find(m => m.rule.context === 'meeting') ?? preferred[0];
  if (!chosen) return setup;
  setup.notebook = notebookOfRule(chosen.rule);
  for (const m of group) {
    if (m === chosen) continue;
    if (!isShared(m.rule)) {
      report.push({setup: name, change: 'intoNotebook', detail: migrationIntoNotebookText(m.rule.context, tags, setup.notebook.name)});
      continue;
    }
    const own = notebookOfRule(m.rule);
    if (own.name !== setup.notebook.name || own.folder !== setup.notebook.folder) {
      report.push({
        setup: name,
        change: 'notebookChanged',
        detail: migrationNotebookChangedText(m.rule.context, setup.notebook.folder, setup.notebook.name),
      });
    }
  }
  return setup;
}

/**
 * Turns 0.14's Tag Rules into Note setups and the Default (§5). `nextId` is
 * the first free setup id; the result's `nextId` the next free one after it.
 */
export function migrateTagRules(rules: readonly LegacyTagRule[], nextId: number): TagRuleMigration {
  const report: MigrationReport = [];
  const seeded = seedNoteSetupDefaults();
  const defaults: NoteSetupDefaults = {pages: {first: seeded.pages.first}, tracking: {trackPrep: false, trackReview: false}};
  const grouped: Member[] = [];

  rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object') return;
    const context = rule.context;
    // Rule 1: Project/Area rules were never applied.
    if (context !== 'meeting' && context !== 'todo' && context !== 'loop') {
      report.push({setup: ruleLabel(rule), change: 'removed', detail: migrationNeverAppliedText()});
      return;
    }
    // Rule 2: the first enabled Default per context becomes the Default page.
    if (rule.isDefault && context !== 'loop') {
      if (rule.enabled && !defaults.pages[context]) {
        defaults.pages[context] = layoutOf(rule);
        if (context === 'meeting') defaults.tracking = {trackPrep: rule.trackPrep === true, trackReview: rule.trackReview === true};
        if (isShared(rule)) report.push({setup: ruleLabel(rule), change: 'notebookChanged', detail: migrationUnmatchedSharedText(context)});
      } else {
        report.push({setup: ruleLabel(rule), change: 'removed', detail: migrationDefaultRemovedText()});
      }
      return;
    }
    const tags = tagsOf(rule);
    if (tags.length === 0) {
      report.push({setup: ruleLabel(rule), change: 'removed', detail: migrationNoTagsText()});
      return;
    }
    grouped.push({rule, index, tags});
  });

  // Rules 3 and 8: enabled rules first; disabled ones only where no enabled setup holds their tags.
  const enabledGroups = components(separateLoopKinds(grouped.filter(m => m.rule.enabled), report));
  const taken = new Set(enabledGroups.flatMap(g => g.flatMap(m => m.tags)));
  const disabled: Member[] = [];
  for (const m of grouped.filter(g => !g.rule.enabled)) {
    if (m.tags.some(t => taken.has(t))) report.push({setup: ruleLabel(m.rule), change: 'removed', detail: migrationOffCollisionText()});
    else disabled.push(m);
  }
  const disabledGroups = components(separateLoopKinds(disabled, report));

  const ordered = [
    ...enabledGroups.map(group => ({group, enabled: true})),
    ...disabledGroups.map(group => ({group, enabled: false})),
  ].sort((a, b) => a.group[0].index - b.group[0].index);

  let id = nextId;
  const setups = ordered.map(({group, enabled}) => setupOf(group, String(id++), enabled, report));
  return {setups, defaults, nextId: id, report};
}

/**
 * The load-time step (storage/settingsStorage.ts): runs once per settings
 * blob or profile, when `noteSetupsMigrated` is not set. With Tag Rules it
 * migrates them and keeps the report for the notice; without (a fresh
 * install) it seeds the Default. `tagRules`/`nextTagRuleId` are left as
 * they are. Returns the same object when there is nothing to do.
 */
export function migrateNoteSetupSettings(settings: GtdParaSettings): GtdParaSettings {
  if (settings.noteSetupsMigrated) return settings;
  const rules = Array.isArray(settings.tagRules) ? settings.tagRules : [];
  if (rules.length === 0) {
    return {...settings, noteSetups: [], noteSetupDefaults: seedNoteSetupDefaults(), noteSetupsNotice: null, noteSetupsMigrated: true};
  }
  const result = migrateTagRules(rules, settings.nextNoteSetupId);
  return {
    ...settings,
    noteSetups: result.setups,
    noteSetupDefaults: result.defaults,
    nextNoteSetupId: result.nextId,
    noteSetupsNotice: result.report,
    noteSetupsMigrated: true,
  };
}

/** Counts for the migration log line - kinds and numbers only, never names or tags (DEVELOPMENT-POLICY §5). */
export function migrationCounts(settings: Pick<GtdParaSettings, 'noteSetups' | 'noteSetupsNotice'>): Record<string, number> {
  const report = settings.noteSetupsNotice ?? [];
  const count = (change: MigrationChange) => report.filter(e => e.change === change).length;
  return {
    setups: settings.noteSetups.length,
    merged: count('merged'),
    removed: count('removed'),
    intoNotebook: count('intoNotebook'),
    notebookChanged: count('notebookChanged'),
    conflict: count('conflict'),
  };
}
