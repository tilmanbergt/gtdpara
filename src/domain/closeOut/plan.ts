/**
 * The close-out plan - a project's in-progress close-out decisions,
 * persisted as a human-readable `## Close-out` section in its project.txt
 * (docs/dev/technical-design-project-close-out.md §4.2). Pure: parse, serialize
 * and small immutable edits; storage/closeOut/planStore.ts does the I/O.
 *
 * Only DEVIATIONS from the defaults are stored (a file added after a
 * decision still gets its default treatment). Example:
 *
 *   ## Close-out
 *   - step: outcomes
 *   - exclude: Todos/Order wood.note
 *   - move: Sketches.note => area:Workbench
 *   - move: werkplan-basteltisch.pdf => resources:Woodworking/Plans
 *   - moved-todo: Return leftover screws => area:Home & Workshop
 *   - moved-meeting: 2026-10-08 Follow-up call => inbox
 *   - pdf: Workbench build.pdf | 2026-09-28T10:02 | 34 | checked
 *   - journal: move-outcomes done 2026-09-28T10:15
 *
 * Lines this parser doesn't understand are kept verbatim (extraLines).
 */
import {readSectionLines, removeSection, writeSectionLines} from '../markdown';

export const CLOSE_OUT_HEADING = '## Close-out';

export type CloseOutStep = 'checklist' | 'contents' | 'outcomes' | 'pdf' | 'archive';
export const CLOSE_OUT_STEPS: CloseOutStep[] = ['checklist', 'contents', 'outcomes', 'pdf', 'archive'];

export type CloseOutMode = 'full' | 'quick';

/** Where an outcome file goes: the project's Area folder or the Resources root, plus a sub-path ('' = directly in it). */
export interface OutcomeDest {
  root: 'area' | 'resources';
  subPath: string;
}

export interface OutcomeMove {
  /** Path relative to the project folder. */
  path: string;
  dest: OutcomeDest;
}

/** A todo/meeting the checklist moved out of the project - kept so the archive PDF can still list it ("→ moved to ..."). */
export interface MovedItem {
  kind: 'todo' | 'meeting';
  /** Todo text, or "YYYY-MM-DD title" for a meeting. */
  label: string;
  /** Human-readable target: "inbox", "area:<name>" or "project:<name>". */
  to: string;
}

export interface PdfRecord {
  fileName: string;
  /** ISO local date-time, minutes precision. */
  createdAt: string;
  pages: number;
  checked: boolean;
}

export interface JournalEntry {
  op: string;
  state: 'started' | 'done';
  at: string;
}

export interface CloseOutPlan {
  step: CloseOutStep;
  mode: CloseOutMode;
  /** Relative paths excluded from the PDF although included by default. */
  exclude: string[];
  /** Relative paths included although excluded by default (reserved - v1 includes nothing extra). */
  include: string[];
  moves: OutcomeMove[];
  moved: MovedItem[];
  pdf: PdfRecord | null;
  journal: JournalEntry[];
  extraLines: string[];
}

export const EMPTY_PLAN: CloseOutPlan = {
  step: 'checklist',
  mode: 'full',
  exclude: [],
  include: [],
  moves: [],
  moved: [],
  pdf: null,
  journal: [],
  extraLines: [],
};

const LINE_RE = /^-\s*([a-z-]+):\s?(.*)$/;
const ARROW = ' => ';

function splitArrow(value: string): [string, string] | null {
  const i = value.lastIndexOf(ARROW);
  if (i <= 0) return null;
  return [value.slice(0, i).trim(), value.slice(i + ARROW.length).trim()];
}

export function parseOutcomeDest(value: string): OutcomeDest | null {
  const m = /^(area|resources):(.*)$/.exec(value.trim());
  if (!m) return null;
  return {root: m[1] as OutcomeDest['root'], subPath: m[2].trim().replace(/^\/+|\/+$/g, '')};
}

export function formatOutcomeDest(dest: OutcomeDest): string {
  return `${dest.root}:${dest.subPath}`;
}

/** Parses the `## Close-out` section; EMPTY_PLAN (with found=false) if the section is absent. */
export function parsePlan(content: string): {plan: CloseOutPlan; found: boolean} {
  const {lines, found} = readSectionLines(content, CLOSE_OUT_HEADING);
  const plan: CloseOutPlan = {...EMPTY_PLAN, exclude: [], include: [], moves: [], moved: [], journal: [], extraLines: []};
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const m = LINE_RE.exec(line.trim());
    if (!m) {
      plan.extraLines.push(line);
      continue;
    }
    const [, key, raw] = m;
    const value = raw.trim();
    switch (key) {
      case 'step':
        if ((CLOSE_OUT_STEPS as string[]).includes(value)) plan.step = value as CloseOutStep;
        else plan.extraLines.push(line);
        continue;
      case 'mode':
        if (value === 'full' || value === 'quick') plan.mode = value;
        else plan.extraLines.push(line);
        continue;
      case 'exclude':
        if (value) plan.exclude.push(value);
        continue;
      case 'include':
        if (value) plan.include.push(value);
        continue;
      case 'move': {
        const parts = splitArrow(value);
        const dest = parts ? parseOutcomeDest(parts[1]) : null;
        if (parts && dest) plan.moves.push({path: parts[0], dest});
        else plan.extraLines.push(line);
        continue;
      }
      case 'moved-todo':
      case 'moved-meeting': {
        const parts = splitArrow(value);
        if (parts) plan.moved.push({kind: key === 'moved-todo' ? 'todo' : 'meeting', label: parts[0], to: parts[1]});
        else plan.extraLines.push(line);
        continue;
      }
      case 'pdf': {
        const f = value.split('|').map(x => x.trim());
        if (f.length >= 4 && f[0]) {
          plan.pdf = {fileName: f[0], createdAt: f[1], pages: Number(f[2]) || 0, checked: f[3] === 'checked'};
        } else {
          plan.extraLines.push(line);
        }
        continue;
      }
      case 'journal': {
        const jm = /^(\S+)\s+(started|done)\s+(\S+)$/.exec(value);
        if (jm) plan.journal.push({op: jm[1], state: jm[2] as JournalEntry['state'], at: jm[3]});
        else plan.extraLines.push(line);
        continue;
      }
      default:
        plan.extraLines.push(line);
    }
  }
  return {plan, found};
}

export function serializePlan(plan: CloseOutPlan): string[] {
  const out: string[] = [`- step: ${plan.step}`];
  if (plan.mode !== 'full') out.push(`- mode: ${plan.mode}`);
  for (const p of plan.exclude) out.push(`- exclude: ${p}`);
  for (const p of plan.include) out.push(`- include: ${p}`);
  for (const m of plan.moves) out.push(`- move: ${m.path}${ARROW}${formatOutcomeDest(m.dest)}`);
  for (const m of plan.moved) out.push(`- moved-${m.kind}: ${m.label}${ARROW}${m.to}`);
  if (plan.pdf) {
    const p = plan.pdf;
    out.push(`- pdf: ${p.fileName} | ${p.createdAt} | ${p.pages} | ${p.checked ? 'checked' : 'unchecked'}`);
  }
  for (const j of plan.journal) out.push(`- journal: ${j.op} ${j.state} ${j.at}`);
  return [...out, ...plan.extraLines];
}

export function writePlanIntoContent(content: string, plan: CloseOutPlan): string {
  return writeSectionLines(content, CLOSE_OUT_HEADING, serializePlan(plan));
}

/** Removes the whole section ("Start over"). */
export function removePlanFromContent(content: string): string {
  return removeSection(content, CLOSE_OUT_HEADING);
}

// ---- small immutable edits (each one also invalidates a PDF check where the PDF's content changes) ----

/** Contents or outcomes changed: an existing PDF no longer matches, so it must be checked (or recreated) again. */
function uncheck(plan: CloseOutPlan): CloseOutPlan {
  return plan.pdf && plan.pdf.checked ? {...plan, pdf: {...plan.pdf, checked: false}} : plan;
}

export function withStep(plan: CloseOutPlan, step: CloseOutStep): CloseOutPlan {
  return {...plan, step};
}

/** Sets whether `path` goes into the PDF, storing only a deviation from `includedByDefault`. */
export function withInclusion(plan: CloseOutPlan, path: string, included: boolean, includedByDefault: boolean): CloseOutPlan {
  const exclude = plan.exclude.filter(p => p !== path);
  const include = plan.include.filter(p => p !== path);
  if (included && !includedByDefault) include.push(path);
  if (!included && includedByDefault) exclude.push(path);
  return uncheck({...plan, exclude, include});
}

/** Sets (or with null clears) the outcome destination of `path`. */
export function withMove(plan: CloseOutPlan, path: string, dest: OutcomeDest | null): CloseOutPlan {
  const moves = plan.moves.filter(m => m.path !== path);
  if (dest) moves.push({path, dest});
  return uncheck({...plan, moves});
}

export function withMovedItem(plan: CloseOutPlan, item: MovedItem): CloseOutPlan {
  return uncheck({...plan, moved: [...plan.moved, item]});
}

export function withPdf(plan: CloseOutPlan, pdf: PdfRecord | null): CloseOutPlan {
  return {...plan, pdf};
}

export function withJournal(plan: CloseOutPlan, entry: JournalEntry): CloseOutPlan {
  return {...plan, journal: [...plan.journal, entry]};
}

/** True if op `op` has a `done` journal entry. */
export function isJournalDone(plan: CloseOutPlan, op: string): boolean {
  return plan.journal.some(j => j.op === op && j.state === 'done');
}

/** Whether an archive run started (any journal entry) - an unfinished one is resumable. */
export function archiveStarted(plan: CloseOutPlan): boolean {
  return plan.journal.length > 0;
}

const STEP_NUMBER: Record<CloseOutStep, number> = {checklist: 1, contents: 2, outcomes: 3, pdf: 4, archive: 5};

/** One-line close-out status for lists (Review's Done step): "not started", "step 3 of 5 · Outcomes", "archive interrupted - resume". */
export function planStatusLabel(content: string): string {
  const {plan, found} = parsePlan(content);
  if (!found) return 'Close-out not started';
  if (archiveStarted(plan)) return 'Archive interrupted - continue the close-out to resume';
  if (plan.mode === 'quick') return 'Quick archive in progress';
  const n = STEP_NUMBER[plan.step];
  const label = plan.step.charAt(0).toUpperCase() + plan.step.slice(1);
  return `Close-out in progress: step ${n} of 5 · ${label}${plan.pdf ? (plan.pdf.checked ? ' · PDF checked' : ' · PDF created') : ''}`;
}
