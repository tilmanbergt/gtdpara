/**
 * The ordered list of operations the archive step performs
 * (docs/dev/history/technical-design-project-close-out.md §5.5/§7). Pure: the same list
 * is SHOWN in step 5 ("what happens when you tap Archive") and RUN by
 * storage/closeOut/execute.ts - what the user sees is what runs.
 *
 * Order: outcome files move out (each followed by its link rewrite), then
 * the project PDF, then open marks to the Inbox (lasso 0.8), then the project folder, then the status stamp in the
 * file at its new place. Moving the folder before stamping (as archiveItem
 * has always done) means an interruption can never leave an item marked
 * archived while it still sits in Projects/. Every op has a stable id the
 * executor journals, so a re-run skips what is already done.
 */
import {CloseOutMode, CloseOutPlan, OutcomeDest} from './plan';

export type ArchiveOp =
  | {id: string; kind: 'moveOutcome'; from: string; to: string; relPath: string}
  | {id: string; kind: 'rewriteLinks'; fromLinked: string; toLinked: string; relPath: string}
  | {id: string; kind: 'movePdf'; from: string; to: string}
  | {id: string; kind: 'moveMarks'; from: string; to: string; count: number}
  | {id: string; kind: 'moveFolder'; from: string; to: string}
  | {id: string; kind: 'stampArchived'; folder: string};

export interface ArchiveOpsInput {
  mode: CloseOutMode;
  projectPath: string;
  plan: CloseOutPlan;
  /** From archiveTargetsFor (storage/archive.ts). */
  targetFolder: string;
  targetPdf: string | null;
  /** Absolute folder of the project's Area (null if none) and the Resources root. */
  areaFolder: string | null;
  resourcesRoot: string;
  /** Converts an absolute path to the base-root-relative form todos/meetings store in linkedFile. */
  toLinked: (absPath: string) => string;
  /** Open marks in the project's `## Marks` (lasso 0.8) - moved to the Inbox before the folder. */
  openMarkCount?: number;
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(p => p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Absolute destination folder of an outcome, or null when it names the Area but the project has none. */
export function outcomeFolder(dest: OutcomeDest, areaFolder: string | null, resourcesRoot: string): string | null {
  if (dest.root === 'area') return areaFolder ? joinPath(areaFolder, dest.subPath) : null;
  return joinPath(resourcesRoot, dest.subPath);
}

export function planArchiveOps(input: ArchiveOpsInput): ArchiveOp[] {
  const ops: ArchiveOp[] = [];
  const project = input.projectPath.replace(/\/+$/, '');
  if (input.mode === 'full') {
    for (const move of input.plan.moves) {
      const folder = outcomeFolder(move.dest, input.areaFolder, input.resourcesRoot);
      if (!folder) continue; // Area destination but no Area (the wizard prevents this; skip rather than guess)
      const from = joinPath(project, move.path);
      const to = joinPath(folder, baseName(move.path));
      ops.push({id: `move-outcome:${move.path}`, kind: 'moveOutcome', from, to, relPath: move.path});
      ops.push({id: `links:${move.path}`, kind: 'rewriteLinks', fromLinked: input.toLinked(from), toLinked: input.toLinked(to), relPath: move.path});
    }
    if (input.plan.pdf && input.targetPdf) {
      ops.push({id: 'move-pdf', kind: 'movePdf', from: joinPath(project, input.plan.pdf.fileName), to: input.targetPdf});
    }
  }
  if ((input.openMarkCount ?? 0) > 0) {
    ops.push({id: 'move-marks', kind: 'moveMarks', from: project, to: input.targetFolder, count: input.openMarkCount ?? 0});
  }
  ops.push({id: 'move-folder', kind: 'moveFolder', from: project, to: input.targetFolder});
  ops.push({id: 'stamp', kind: 'stampArchived', folder: input.targetFolder});
  return ops;
}

/** One-line description of an op for the Archive step and its result view. */
export function describeOp(op: ArchiveOp, display: (absPath: string) => string): string {
  switch (op.kind) {
    case 'moveOutcome':
      return `${op.relPath} → ${display(op.to.slice(0, op.to.lastIndexOf('/')))}/`;
    case 'rewriteLinks':
      return `Update links to ${op.relPath}`;
    case 'movePdf':
      return `Project PDF → ${display(op.to)}`;
    case 'moveMarks':
      return `${op.count} open mark${op.count === 1 ? '' : 's'} → Inbox`;
    case 'moveFolder':
      return `Project folder → ${display(op.to)}/`;
    case 'stampArchived':
      return 'Mark as Archived (leaves lists, focus and pickers)';
  }
}
