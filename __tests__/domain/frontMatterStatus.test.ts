import {parseFrontMatter, writeFrontMatterIntoContent} from '../../src/domain/markdown';
import {ItemStatus} from '../../src/domain/types';

const FILE = ['---', 'kind: project', 'status: active', 'custom: keep me', '---', '', '## Tasks', '', '- [ ] One', ''].join('\n');

describe('status in the frontmatter', () => {
  it.each<ItemStatus>(['active', 'on-hold', 'done', 'archived'])('round-trips %s', status => {
    const fm = parseFrontMatter(FILE);
    const written = writeFrontMatterIntoContent(FILE, {...fm, status});
    expect(parseFrontMatter(written).status).toBe(status);
  });
  it('keeps unknown frontmatter lines and the body', () => {
    const fm = parseFrontMatter(FILE);
    const written = writeFrontMatterIntoContent(FILE, {...fm, status: 'done', dailyFocus: true});
    expect(written).toContain('custom: keep me');
    expect(written).toContain('kind: project');
    expect(written).toContain('- [ ] One');
    expect(parseFrontMatter(written).dailyFocus).toBe(true);
  });
  it('reads a missing or unknown status as active', () => {
    expect(parseFrontMatter('## Tasks\n').status).toBe('active');
    expect(parseFrontMatter('---\nstatus: paused\n---\n').status).toBe('active');
  });
});
