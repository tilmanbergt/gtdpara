// docs/dev/history/technical-design-quality-hardening.md §3.2: a save against a file that
// changed outside gtdpara.
import {decideWrite, DataFileChange} from '../../src/domain/writeGuard';
import {DATA_FILE_HEADINGS, FRONT_MATTER_PART, dataFilePartText, writeScopeIntoContent} from '../../src/domain/markdown';

const BASE = '---\nkind: project\nstatus: active\n---\n\n## Scope\nOld scope\n\n## Tasks\n- [ ] One\n\n## Meetings\n';

/** A save that rewrites the Tasks section to the given lines. */
function tasksChange(lines: string[]): DataFileChange {
  return {
    parts: [DATA_FILE_HEADINGS.tasks],
    apply: content => content.replace(/## Tasks\n(?:- .*\n)*/, `## Tasks\n${lines.map(l => `${l}\n`).join('')}`),
  };
}

describe('dataFilePartText', () => {
  it('reads a section, the frontmatter, and null for a missing part', () => {
    expect(dataFilePartText(BASE, DATA_FILE_HEADINGS.scope)).toBe('Old scope\n');
    expect(dataFilePartText(BASE, FRONT_MATTER_PART)).toBe('kind: project\nstatus: active');
    expect(dataFilePartText(BASE, DATA_FILE_HEADINGS.weeklyGoals)).toBeNull();
    expect(dataFilePartText('no frontmatter', FRONT_MATTER_PART)).toBeNull();
  });
});

describe('decideWrite', () => {
  it('writes onto the base when the file is unchanged', () => {
    const d = decideWrite('project', BASE, BASE, tasksChange(['- [ ] One', '- [ ] Two']));
    expect(d).toEqual({kind: 'write', merged: false, content: BASE.replace('- [ ] One\n', '- [ ] One\n- [ ] Two\n')});
  });

  it('scaffolds a missing file', () => {
    const d = decideWrite('project', '', '', tasksChange(['- [ ] One']));
    expect(d.kind).toBe('write');
    expect(d.kind === 'write' && d.content).toContain('## Tasks\n- [ ] One\n');
  });

  it('keeps an outside change to another part and writes its own part into it', () => {
    const outside = writeScopeIntoContent(BASE, 'New scope from Obsidian');
    const d = decideWrite('project', BASE, outside, tasksChange(['- [ ] One', '- [ ] Two']));
    expect(d.kind).toBe('write');
    if (d.kind !== 'write') return;
    expect(d.merged).toBe(true);
    expect(d.content).toContain('New scope from Obsidian');
    expect(d.content).toContain('- [ ] Two');
  });

  it('reports a conflict when the outside change touched the same part', () => {
    const outside = BASE.replace('- [ ] One', '- [x] One');
    expect(decideWrite('project', BASE, outside, tasksChange(['- [ ] One', '- [ ] Two']))).toEqual({
      kind: 'conflict',
      parts: [DATA_FILE_HEADINGS.tasks],
    });
  });

  it('reports a file deleted outside as gone, whatever part the save writes', () => {
    expect(decideWrite('project', BASE, '', tasksChange(['- [ ] One']))).toEqual({kind: 'gone'});
    const goals: DataFileChange = {parts: [DATA_FILE_HEADINGS.weeklyGoals], apply: c => c};
    expect(decideWrite('project', BASE, '', goals)).toEqual({kind: 'gone'});
  });

  it('names only the touched parts of a multi-part save', () => {
    const outside = BASE.replace('status: active', 'status: on-hold');
    const change: DataFileChange = {parts: [DATA_FILE_HEADINGS.tasks, FRONT_MATTER_PART], apply: c => c};
    expect(decideWrite('project', BASE, outside, change)).toEqual({kind: 'conflict', parts: [FRONT_MATTER_PART]});
  });
});
