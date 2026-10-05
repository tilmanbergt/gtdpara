import {
  ensureSkeleton,
  parseMarksSpan,
  parseTasksSpan,
  writeMarksIntoContent,
  writeTasksIntoContent,
} from '../../src/domain/markdown';
import {Mark} from '../../src/domain/types';

const mark = (id: string, page = 0): Mark => ({id, createdAt: '2026-10-05 10:42', notePath: 'Prep.note', page, text: null});
const M1 = 'm-20261005-104212-351';
const M2 = 'm-20261005-104300-002';

const PROJECT = `---
kind: project
status: active
---

## Scope

Turn the garden into a vegetable garden.

## Tasks

- [ ] Order soil #next

## Meetings

- 2026-10-04 10:00 Site visit
`;

describe('## Marks section', () => {
  it('parses a file written by an older version as no marks', () => {
    expect(parseMarksSpan(PROJECT)).toEqual({marks: [], extraLines: []});
  });

  it('appends the section at the end, leaving everything else as it was', () => {
    const next = writeMarksIntoContent(PROJECT, [mark(M1, 2)]);
    expect(next.startsWith(PROJECT.replace(/\n+$/, ''))).toBe(true);
    expect(next.endsWith('\n\n## Marks\n- 2026-10-05 10:42 [[Prep.note]] p3 ^m-20261005-104212-351\n')).toBe(true);
    expect(parseMarksSpan(next).marks).toEqual([mark(M1, 2)]);
    expect(parseTasksSpan(next).tasks.map(t => t.text)).toEqual(['Order soil #next']);
  });

  it('keeps marks when the Tasks section is rewritten, and vice versa', () => {
    const withMark = writeMarksIntoContent(PROJECT, [mark(M1)]);
    const {tasks, extraLines} = parseTasksSpan(withMark);
    const withTask = writeTasksIntoContent(withMark, [...tasks, {...tasks[0], text: 'Measure beds'}], extraLines);
    expect(parseMarksSpan(withTask).marks.map(m => m.id)).toEqual([M1]);
    const twoMarks = writeMarksIntoContent(withTask, [mark(M1), mark(M2)]);
    expect(parseTasksSpan(twoMarks).tasks.map(t => t.text)).toEqual(['Order soil #next', 'Measure beds']);
  });

  it('works in a section placed before other sections and keeps hand-written lines', () => {
    const content = `## Marks\n- 2026-10-05 10:42 [[Prep.note]] p1 ^${M1}\nremember the blue page\n\n## Tasks\n- [ ] A\n`;
    const parsed = parseMarksSpan(content);
    expect(parsed.marks.map(m => m.id)).toEqual([M1]);
    expect(parsed.extraLines).toEqual(['remember the blue page']);
    const next = writeMarksIntoContent(content, [], parsed.extraLines);
    expect(next).toBe('## Marks\nremember the blue page\n\n## Tasks\n- [ ] A\n');
  });

  it('keeps an empty heading when the last mark goes', () => {
    const next = writeMarksIntoContent(writeMarksIntoContent(PROJECT, [mark(M1)]), []);
    expect(next.endsWith('## Marks\n')).toBe(true);
    expect(parseMarksSpan(next).marks).toEqual([]);
  });

  it('reads CRLF lines', () => {
    const content = `## Marks\r\n- 2026-10-05 10:42 [[Prep.note]] p1 ^${M1}\r\n`;
    expect(parseMarksSpan(content).marks.map(m => m.id)).toEqual([M1]);
  });

  it('is never scaffolded by ensureSkeleton', () => {
    expect(ensureSkeleton('', 'inbox')).not.toContain('## Marks');
  });
});
