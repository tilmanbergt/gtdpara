import {archiveDoneText, emptyFolderConfirmNote, noteCreationConfirmText, replacePdfConfirmText} from '../../src/domain/fileChangeText';

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

describe('reflection page confirm (docs/dev/history/technical-design-meeting-reflection.md, Part C fixed texts)', () => {
  const plan = {kind: 'new-reflection' as const, file: 'Meetings/sparring mieke 2026.note', absolutePath: '/x', setupName: 'Sparring'};
  it('names the setup and the file, after the meeting page', () => {
    const t = noteCreationConfirmText(plan, 'Note/x');
    expect(t.text).toBe("Sparring: reflection page in Meetings/sparring mieke 2026.note, after the meeting's page");
    expect(t.actionLabel).toBe('Add page');
  });
  it('says both pages when the meeting has none yet; no setup, no prefix', () => {
    const t = noteCreationConfirmText({...plan, withMeetingPage: true, setupName: null}, 'Note/x');
    expect(t.text).toBe('pages for the meeting and its reflection in Meetings/sparring mieke 2026.note');
    expect(t.actionLabel).toBe('Add pages');
  });
});
