import {closeOutInterrupted, parsePlan} from '../../src/domain/closeOut/plan';
import {checkCloseOutInterrupted, IntegrityCheckInput} from '../../src/domain/integrityCheck';

const file = (planLines: string[]) =>
  ['---', 'kind: project', 'status: done', '---', '', '## Tasks', '', '## Close-out', ...planLines, ''].join('\n');

const input = (rawContent: string, itemKind: IntegrityCheckInput['itemKind'] = 'project'): IntegrityCheckInput => ({
  itemKind,
  itemPath: '/Note/1 Projects/Workbench',
  tasks: [],
  meetings: [],
  rawContent,
  basePath: '/Note',
  resourcesPath: '/Note/3 Resources',
  defaultResourceFolder: null,
});

describe('closeOutInterrupted', () => {
  it('is false without a journal (nothing started yet)', () => {
    expect(closeOutInterrupted(parsePlan(file(['- step: archive'])).plan)).toBe(false);
  });
  it('is true when the run started but stamp is not done', () => {
    const raw = file(['- step: archive', '- journal: move-folder started 2026-10-04T10:00']);
    expect(closeOutInterrupted(parsePlan(raw).plan)).toBe(true);
  });
  it('is false once stamp is done', () => {
    const raw = file(['- step: archive', '- journal: move-folder done 2026-10-04T10:00', '- journal: stamp done 2026-10-04T10:01']);
    expect(closeOutInterrupted(parsePlan(raw).plan)).toBe(false);
  });
});

describe('checkCloseOutInterrupted', () => {
  it('reports an interrupted close-out with the project name', async () => {
    const findings = await checkCloseOutInterrupted(input(file(['- journal: move-pdf done 2026-10-04T10:00'])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({checkId: 'closeOutInterrupted', entityKind: 'item', entityLabel: 'Workbench'});
  });
  it('ignores projects without a plan, and areas', async () => {
    expect(await checkCloseOutInterrupted(input('## Tasks\n'))).toEqual([]);
    expect(await checkCloseOutInterrupted(input(file(['- journal: move-pdf done x']), 'area'))).toEqual([]);
  });
});
