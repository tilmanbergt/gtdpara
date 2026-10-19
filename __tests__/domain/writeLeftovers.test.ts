// docs/dev/history/technical-design-quality-hardening.md §3.1: the hidden temp file of an
// unfinished save and the Integrity Check finding for it.
import {checkWriteLeftovers} from '../../src/domain/integrityCheck';
import {writeTempPathFor} from '../../src/domain/fileName';

describe('writeTempPathFor', () => {
  it('names a hidden file next to the target', () => {
    expect(writeTempPathFor('/storage/emulated/0/Note/1 Projects/Website/project.txt')).toBe(
      '/storage/emulated/0/Note/1 Projects/Website/.project.txt.gtdpara-tmp',
    );
  });
});

describe('checkWriteLeftovers', () => {
  it('reports nothing when there are no leftovers', () => {
    expect(checkWriteLeftovers([])).toEqual([]);
  });

  it('reports one item-level finding per leftover, naming the file', () => {
    const [finding] = checkWriteLeftovers([
      {itemKind: 'project', itemPath: '/p/Website', tempPath: '/p/Website/.project.txt.gtdpara-tmp'},
    ]);
    expect(finding).toMatchObject({
      checkId: 'writeLeftover',
      itemKind: 'project',
      itemPath: '/p/Website',
      entityKind: 'item',
      entityLabel: '.project.txt.gtdpara-tmp',
    });
    expect(finding.message).toContain('/p/Website/.project.txt.gtdpara-tmp');
  });
});
