/**
 * Close-out readiness checklist (docs/dev/technical-design-project-close-out.md
 * §5.3, severities in §11). Pure: every input is plain
 * data, so the same rules run in the wizard, in the Done step's row status
 * and in tests.
 *
 * Blockers stop only the archive step (full close-out step 5 / quick
 * archive); everything else can be prepared while they are open.
 */
import {Meeting, Task} from '../types';
import {TagRule} from '../tagRules';
import {meetingDisplayTitle, resolveMeetingTracking} from '../meetingTracking';
import {CloseOutPlan} from './plan';

export type Severity = 'blocker' | 'warning' | 'notice' | 'ok';

export type FindingId =
  | 'openTodos'
  | 'futureMeetings'
  | 'meetingsCloseOut'
  | 'periodRefs'
  | 'incomingLinks'
  | 'targetCollision'
  | 'unreadableNotes'
  | 'openFromHere'
  | 'openMarks';

export interface FindingItem {
  /** For openTodos/futureMeetings: index into the project's tasks/meetings array. */
  index?: number;
  label: string;
}

export interface Finding {
  id: FindingId;
  severity: Severity;
  label: string;
  caption: string;
  items: FindingItem[];
}

export interface OtherItemLinks {
  name: string;
  kind: 'project' | 'area' | 'inbox';
  tasks: Pick<Task, 'text' | 'linkedFile'>[];
  meetings: Pick<Meeting, 'title' | 'linkedFile'>[];
}

export interface ReadinessInput {
  mode: 'full' | 'quick';
  projectPath: string;
  tasks: Task[];
  meetings: Meeting[];
  /** Goal keys that exist on this project, e.g. ["2026-W40"] / ["2026-09"]. */
  weeklyGoalKeys: string[];
  monthlyGoalKeys: string[];
  currentWeekKey: string;
  currentMonthKey: string;
  /** YYYY-MM-DD. */
  today: string;
  now: Date;
  tagRules: TagRule[];
  /** Every OTHER project/area (and the Inbox) - for links into this folder. */
  others: OtherItemLinks[];
  /** Base-root-relative path of the project folder, as linkedFile values spell it. */
  projectLinkedPrefix: string;
  plan: CloseOutPlan;
  targetFolderExists: boolean;
  /** null in quick mode (no PDF). */
  targetPdfExists: boolean | null;
  /** Human-readable targets for the collision caption. */
  targetFolderLabel: string;
  targetPdfLabel: string | null;
  unreadableNoteNames: string[];
  launchPath: string | null;
  /** Open "Mark for later" marks of this project (lasso 0.8), as list labels. Optional for older callers. */
  openMarks?: string[];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function evaluateReadiness(input: ReadinessInput): Finding[] {
  const out: Finding[] = [];

  const openTodos = input.tasks.map((t, index) => ({t, index})).filter(({t}) => !t.done && !t.cancelled);
  out.push(
    openTodos.length > 0
      ? {id: 'openTodos', severity: 'blocker', label: plural(openTodos.length, 'open todo'), caption: 'blocks archiving', items: openTodos.map(({t, index}) => ({index, label: t.text}))}
      : {id: 'openTodos', severity: 'ok', label: 'No open todos', caption: '', items: []},
  );

  const future = input.meetings.map((m, index) => ({m, index})).filter(({m}) => !m.cancelled && m.date >= input.today);
  out.push(
    future.length > 0
      ? {
          id: 'futureMeetings',
          severity: 'blocker',
          label: plural(future.length, 'future meeting'),
          caption: 'blocks archiving',
          items: future.map(({m, index}) => ({index, label: `${m.date}${m.time ? ` ${m.time}` : ''} · ${meetingDisplayTitle(m)}`})),
        }
      : {id: 'futureMeetings', severity: 'ok', label: 'No future meetings', caption: '', items: []},
  );

  // Past meetings whose review checkpoint (per Tag Rule) is still open - no lookback window: closing a project should see all of them.
  const toCloseOut = input.meetings
    .map((m, index) => ({m, index}))
    .filter(({m}) => m.date < input.today)
    .filter(({m}) => {
      const state = resolveMeetingTracking(m, input.tagRules, input.now);
      return state !== null && !state.done;
    });
  out.push(
    toCloseOut.length > 0
      ? {id: 'meetingsCloseOut', severity: 'warning', label: `${plural(toCloseOut.length, 'meeting')} not closed out`, caption: 'prep/review not ticked', items: toCloseOut.map(({m, index}) => ({index, label: `${m.date} · ${meetingDisplayTitle(m)}`}))}
      : {id: 'meetingsCloseOut', severity: 'ok', label: 'Meetings to close out', caption: 'all prepped and reviewed', items: []},
  );

  const periodItems: FindingItem[] = [];
  if (input.weeklyGoalKeys.includes(input.currentWeekKey)) periodItems.push({label: `Goal for this week (${input.currentWeekKey})`});
  if (input.monthlyGoalKeys.includes(input.currentMonthKey)) periodItems.push({label: `Goal for this month (${input.currentMonthKey})`});
  out.push(
    periodItems.length > 0
      ? {id: 'periodRefs', severity: 'warning', label: 'Current goals will leave the Week/Month views', caption: 'warning', items: periodItems}
      : {id: 'periodRefs', severity: 'ok', label: 'Goals, focus and month highlights', caption: 'nothing current points to this project', items: []},
  );

  const prefix = `${input.projectLinkedPrefix.replace(/\/+$/, '')}/`;
  const movedRel = new Set(input.plan.moves.map(m => m.path));
  const incoming: FindingItem[] = [];
  for (const other of input.others) {
    const check = (linked: string, label: string) => {
      if (!linked || !linked.startsWith(prefix)) return;
      if (movedRel.has(linked.slice(prefix.length))) return; // its link is rewritten when the file moves
      incoming.push({label: `${other.kind === 'inbox' ? 'Inbox' : `${other.kind === 'area' ? 'Area' : 'Project'} "${other.name}"`}: "${label}" links ${linked.slice(prefix.length)}`});
    };
    other.tasks.forEach(t => check(t.linkedFile, t.text));
    other.meetings.forEach(m => check(m.linkedFile, m.title));
  }
  out.push(
    incoming.length > 0
      ? {id: 'incomingLinks', severity: 'warning', label: `${plural(incoming.length, 'link')} from outside into this folder`, caption: 'move the file in Outcomes, or it will point into the archive', items: incoming}
      : {id: 'incomingLinks', severity: 'ok', label: 'No links from outside', caption: '', items: []},
  );

  const collisions: FindingItem[] = [];
  if (input.targetFolderExists) collisions.push({label: `Already exists: ${input.targetFolderLabel}`});
  if (input.targetPdfExists && input.targetPdfLabel) collisions.push({label: `Already exists: ${input.targetPdfLabel}`});
  out.push(
    collisions.length > 0
      ? {id: 'targetCollision', severity: 'blocker', label: 'Name is taken at the target', caption: 'rename one of them by hand', items: collisions}
      : {id: 'targetCollision', severity: 'ok', label: 'Name is free at the target', caption: '', items: []},
  );

  if (input.unreadableNoteNames.length > 0) {
    out.push({
      id: 'unreadableNotes',
      severity: 'notice',
      label: `${plural(input.unreadableNoteNames.length, 'note')} could not be read`,
      caption: 'locked or damaged - listed, not in the PDF',
      items: input.unreadableNoteNames.map(label => ({label})),
    });
  }

  // Open marks (lasso 0.8 §3.10): a warning - archiving moves them to the Inbox.
  const marks = input.openMarks ?? [];
  out.push(
    marks.length > 0
      ? {id: 'openMarks', severity: 'warning', label: `${plural(marks.length, 'open mark')}`, caption: 'process them, or they move to the Inbox on archive', items: marks.map(label => ({label}))}
      : {id: 'openMarks', severity: 'ok', label: 'No open marks', caption: '', items: []},
  );

  if (input.launchPath && input.launchPath.startsWith(`${input.projectPath.replace(/\/+$/, '')}/`)) {
    const name = input.launchPath.slice(input.projectPath.replace(/\/+$/, '').length + 1);
    out.push({id: 'openFromHere', severity: 'notice', label: `You opened gtdpara from ${name}`, caption: 'it will close when archiving', items: []});
  }

  return out;
}

export function blockers(findings: Finding[]): Finding[] {
  return findings.filter(f => f.severity === 'blocker');
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = {blocker: 0, warning: 0, notice: 0, ok: 0};
  findings.forEach(f => c[f.severity]++);
  return c;
}

/** "2 blockers · 1 warning" style summary; "all clear" when nothing needs attention. */
export function readinessSummary(findings: Finding[]): string {
  const c = countBySeverity(findings);
  const parts = [
    c.blocker ? plural(c.blocker, 'blocker') : '',
    c.warning ? plural(c.warning, 'warning') : '',
    c.notice ? plural(c.notice, 'notice') : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'all clear';
}
