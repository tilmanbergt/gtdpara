import {parseTasksSpan, writeTasksIntoContent} from '../../src/domain/markdown';
import {serializeTaskFields, splitTrailingFields} from '../../src/domain/taskLine';

const file = (lines: string[]) => `---\nkind: project\nstatus: active\n---\n\n## Tasks\n${lines.join('\n')}\n`;

function roundTrip(lines: string[]): string {
  const content = file(lines);
  const {tasks, extraLines} = parseTasksSpan(content);
  return writeTasksIntoContent(content, tasks, extraLines);
}

describe('task line fields', () => {
  it('writes every unchanged line form back byte-identical', () => {
    const lines = [
      '- [ ] Plain',
      '- [ ] Legacy due #due:2026-11-05',
      '- [ ] Legacy waiting #waiting-for:marco',
      '- [ ] New waiting #wf/marco [due:: 2026-10-09]',
      '- [x] Done with note → [[Todos/x.note]] [created:: 2026-10-01] [completion:: 2026-10-07]',
      '- [-] Cancelled +[[3 Resources/a.pdf]] [created:: 2026-10-01]',
      '- [ ] All → [[n.note]] +[[f.pdf#page=2]] [meeting:: 2026-10-01 Retro] [created:: 2026-10-01] [due:: 2026-10-09]',
      '- [ ] Unknown kept [due:: 2026-10-09] [priority:: high] [scheduled:: 2026-10-08]',
      '- [ ] [due:: 2026-10-09]',
    ];
    expect(roundTrip(lines)).toBe(file(lines));
  });

  it('parses text, links and fields apart', () => {
    const [t] = parseTasksSpan(
      file(['- [ ] Call #wf/anna → [[n.note]] +[[f.pdf]] [meeting:: 2026-10-01 Retro] [created:: 2026-10-01] [due:: 2026-10-09]']),
    ).tasks;
    expect(t.text).toBe('Call #wf/anna');
    expect(t.notePath).toBe('n.note');
    expect(t.linkedFile).toBe('f.pdf');
    expect(t.fields).toEqual({meeting: '2026-10-01 Retro', created: '2026-10-01', due: '2026-10-09', completion: null, extra: []});
    expect(t.dueDate).toBe('2026-10-09');
    expect(t.flowState).toBe('waiting-for');
    expect(t.waitingOn).toBe('anna');
  });

  it('reads the legacy #due: tag when there is no due field, the field when both exist', () => {
    const {tasks} = parseTasksSpan(file(['- [ ] A #due:2026-11-05', '- [ ] B #due:2026-11-05 [due:: 2026-12-01]']));
    expect(tasks[0].dueDate).toBe('2026-11-05');
    expect(tasks[0].fields.due).toBeNull();
    expect(tasks[1].dueDate).toBe('2026-12-01');
  });

  it('treats a field in the middle of the text as text', () => {
    const [t] = parseTasksSpan(file(['- [ ] Text [due:: 2026-10-09] more words'])).tasks;
    expect(t.text).toBe('Text [due:: 2026-10-09] more words');
    expect(t.dueDate).toBeNull();
  });

  it('writes known fields in the fixed order, unknown fields after them', () => {
    const lines = ['- [ ] X [priority:: high] [completion:: 2026-10-07] [due:: 2026-10-09] [created:: 2026-10-01]'];
    expect(roundTrip(lines)).toBe(file(['- [ ] X [created:: 2026-10-01] [due:: 2026-10-09] [completion:: 2026-10-07] [priority:: high]']));
  });

  it('keeps a repeated known key and an empty one as unknown fields, stable on a second write', () => {
    const once = roundTrip(['- [ ] X [due:: 2026-10-09] [due:: 2026-11-01] [created:: ]']);
    expect(once).toBe(file(['- [ ] X [due:: 2026-10-09] [due:: 2026-11-01] [created:: ]']));
    const {tasks} = parseTasksSpan(once);
    expect(tasks[0].dueDate).toBe('2026-10-09');
    expect(writeTasksIntoContent(once, tasks, [])).toBe(once);
  });

  it('keeps a known key with a non-date value and does not take it as the due date', () => {
    const [t] = parseTasksSpan(file(['- [ ] X #due:2026-11-05 [due:: soon]'])).tasks;
    expect(t.fields.due).toBe('soon');
    expect(t.dueDate).toBe('2026-11-05');
  });

  it('does not take wiki links or bracketed text for fields', () => {
    expect(splitTrailingFields('See [[note]]').fields.extra).toEqual([]);
    expect(splitTrailingFields('Pick [one] of [Two:: x]').text).toBe('Pick [one] of [Two:: x]');
  });

  it('serializes nothing for empty fields', () => {
    expect(serializeTaskFields({due: null, created: null, completion: null, meeting: null, extra: []})).toBe('');
  });

  it('leaves meeting lines alone', () => {
    const content = `## Meetings\n- 2026-10-01 10:00 Retro [due:: 2026-10-09]\n`;
    expect(parseTasksSpan(content).tasks).toEqual([]);
  });
});
