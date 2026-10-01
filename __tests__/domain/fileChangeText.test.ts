import {archiveDoneText, emptyFolderConfirmNote, replacePdfConfirmText} from '../../src/domain/fileChangeText';

describe('fileChangeText', () => {
  it('names the folder that will be deleted and says what happens on "no"', () => {
    const note = emptyFolderConfirmNote('Note/2 Areas/Health', 'Note/4 Archive/2026/Health');
    expect(note).toContain('Note/4 Archive/2026/Health already exists');
    expect(note).toContain('empty folder Note/2 Areas/Health');
    expect(note).toContain('is deleted');
    expect(note).toContain('the empty folder simply stays');
  });

  it('announces the move, and a kept empty folder', () => {
    expect(archiveDoneText('Health', 'Note/4 Archive/2026/Health', null)).toBe('Moved "Health" to Note/4 Archive/2026/Health.');
    const kept = archiveDoneText('Health', 'Note/4 Archive/2026/Health', 'Note/2 Areas/Health');
    expect(kept).toContain('The empty folder Note/2 Areas/Health was kept');
  });

  it('names the PDF before replacing it', () => {
    expect(replacePdfConfirmText('Note/1 Projects/X/X.pdf')).toContain('Replace Note/1 Projects/X/X.pdf?');
  });
});
