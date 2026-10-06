// Lasso 0.8 §3.10: open marks in close-out, archive and the integrity check.
import {describeOp, planArchiveOps} from '../../src/domain/closeOut/archiveOps';
import {EMPTY_PLAN} from '../../src/domain/closeOut/plan';
import {evaluateReadiness, ReadinessInput} from '../../src/domain/closeOut/readiness';
import {checkMarkNoteMissing} from '../../src/domain/integrityCheck';

const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  mode: 'quick',
  projectPath: '/P/Garden',
  tasks: [],
  meetings: [],
  weeklyGoalKeys: [],
  monthlyGoalKeys: [],
  currentWeekKey: '2026-W41',
  currentMonthKey: '2026-10',
  today: '2026-10-06',
  now: new Date(2026, 9, 6),
  noteDefinitions: [],
  others: [],
  projectLinkedPrefix: '1 Projects/Garden',
  plan: EMPTY_PLAN,
  targetFolderExists: false,
  targetPdfExists: null,
  targetFolderLabel: 'Archive/Garden',
  targetPdfLabel: null,
  unreadableNoteNames: [],
  launchPath: null,
  ...over,
});

describe('close-out readiness: open marks', () => {
  it('is a warning with one row per mark, never a blocker', () => {
    const f = evaluateReadiness(base({openMarks: ['Plan.note · p3 · 2026-10-05']})).find(x => x.id === 'openMarks')!;
    expect(f.severity).toBe('warning');
    expect(f.items).toEqual([{label: 'Plan.note · p3 · 2026-10-05'}]);
    expect(evaluateReadiness(base()).find(x => x.id === 'openMarks')!.severity).toBe('ok');
  });
});

describe('archive ops: open marks', () => {
  const input = {
    mode: 'quick' as const,
    projectPath: '/P/Garden',
    plan: EMPTY_PLAN,
    targetFolder: '/A/Garden',
    targetPdf: null,
    areaFolder: null,
    resourcesRoot: '/R',
    toLinked: (p: string) => p,
  };
  it('moves them to the Inbox right before the folder', () => {
    const ops = planArchiveOps({...input, openMarkCount: 2});
    expect(ops.map(o => o.kind)).toEqual(['moveMarks', 'moveFolder', 'stampArchived']);
    expect(describeOp(ops[0], p => p)).toBe('2 open marks → Inbox');
    expect(planArchiveOps(input).map(o => o.kind)).toEqual(['moveFolder', 'stampArchived']);
  });
});

describe('integrity: mark note missing', () => {
  it('flags marks whose note is gone, relative to the item folder', async () => {
    const rawContent =
      '## Marks\n- 2026-10-05 10:42 [[Plan.note]] p1 ^m-20261005-104200-001\n- 2026-10-05 10:43 [[Gone.note]] p2 ^m-20261005-104300-002\n';
    const findings = await checkMarkNoteMissing(
      {itemKind: 'project', itemPath: '/P/Garden', tasks: [], meetings: [], rawContent, basePath: '/', resourcesPath: '/R', defaultResourceFolder: null},
      {fileExists: async p => p === '/P/Garden/Plan.note', folderExists: async () => true},
    );
    expect(findings.map(f => f.notePath)).toEqual(['Gone.note']);
    expect(findings[0].checkId).toBe('markNoteMissing');
  });
});
