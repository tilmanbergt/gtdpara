/**
 * The project archive PDF as a PdfDocument (docs/dev/technical-design-project-
 * close-out.md §5.4) - cover, contents (linked), project record (text),
 * the included notes/images by group, and an index of everything that is
 * NOT in the PDF with where it lives after archiving. Pure: layout and
 * rendering happen in domain/pdf/pdfLayout.ts and storage/pdfExport.ts.
 */
import {A5X_PAGE, PdfBlock, PdfDocument, PdfOutlineEntry, PdfPart} from '../pdf/pdfDocument';
import {Meeting, Task} from '../types';
import {meetingDisplayTitle} from '../meetingTracking';
import {ContentEntry, ContentsModel} from './inventory';
import {CloseOutPlan, OutcomeDest} from './plan';

export interface ArchiveDocumentInput {
  projectName: string;
  area: string | null;
  scope: string;
  tasks: Task[];
  meetings: Meeting[];
  contents: ContentsModel;
  plan: CloseOutPlan;
  doneAt: string | null;
  /** YYYY-MM-DD the PDF is created (and, normally, archived). */
  today: string;
  /** Base-root-relative display of the project's archive folder, e.g. "4 Archive/2026/Home & Workshop/Workbench build". */
  archiveFolderLabel: string;
  /** Base-root-relative display of an outcome destination folder. */
  outcomeLabel: (dest: OutcomeDest) => string;
}

const ANCHOR = {cover: 'cover', toc: 'toc', record: 'record', index: 'index'};

function pageAnchor(entry: ContentEntry): string {
  return `e:${entry.key}`;
}

function row(cells: string[], widths: number[], extra: Partial<Extract<PdfBlock, {kind: 'row'}>> = {}): PdfBlock {
  return {kind: 'row', cells, widths, ...extra};
}

function activePeriod(meetings: Meeting[], doneAt: string | null): string {
  const first = meetings.map(m => m.date).filter(Boolean).sort()[0];
  if (first && doneAt) return `${first} – ${doneAt}`;
  if (doneAt) return `until ${doneAt}`;
  return first ? `from ${first}` : '';
}

export function buildArchiveDocument(input: ArchiveDocumentInput): PdfDocument {
  const {contents, plan} = input;
  const included = contents.groups
    .filter(g => g.id !== 'record')
    .map(g => ({group: g, entries: g.entries.filter(e => e.included && e.source.kind !== 'none' && e.source.kind !== 'record')}))
    .filter(g => g.entries.length > 0);
  const listedOnly = contents.groups.flatMap(g => g.entries).filter(e => e.group !== 'record' && !e.included);
  /** "todo:3" / "meeting:5" -> anchor of that item's note, when the note is in the PDF. */
  const noteAnchorByItem = new Map(
    included
      .flatMap(g => g.entries)
      .filter(e => e.item)
      .map(e => [`${e.item!.kind}:${e.item!.index}`, pageAnchor(e)]),
  );

  const doneTasks = input.tasks.filter(t => t.done).length;
  const cancelledTasks = input.tasks.filter(t => t.cancelled).length;
  const parts: PdfPart[] = [];

  // Cover
  parts.push({
    kind: 'text',
    anchor: ANCHOR.cover,
    blocks: [
      {kind: 'spacer', height: 90},
      {kind: 'heading', level: 1, text: input.projectName},
      {kind: 'paragraph', text: input.area ? `Project · ${input.area}` : 'Project'},
      {kind: 'paragraph', style: 'small', text: [activePeriod(input.meetings, input.doneAt) && `Active ${activePeriod(input.meetings, input.doneAt)}`, input.doneAt && `Done ${input.doneAt}`, `Archived ${input.today}`].filter(Boolean).join(' · ')},
      {kind: 'spacer', height: 16},
      ...(input.scope.trim() ? [{kind: 'paragraph', text: `Scope: ${input.scope.trim()}`} as PdfBlock] : []),
      {kind: 'spacer', height: 16},
      {kind: 'paragraph', text: `${input.tasks.length} todos (${doneTasks} done, ${cancelledTasks} cancelled, ${plan.moved.filter(m => m.kind === 'todo').length} moved)`},
      {kind: 'paragraph', text: `${input.meetings.length} meetings · ${contents.includedEntries} notes and files · ${contents.includedNotePages} note pages`},
      {kind: 'spacer', height: 24},
      {kind: 'paragraph', style: 'small', text: `Archive folder: ${input.archiveFolderLabel}`},
      {kind: 'paragraph', style: 'small', text: `Created by gtdpara on ${input.today}. Handwritten pages are images.`},
    ],
  });

  // Contents
  const toc: PdfBlock[] = [{kind: 'heading', level: 1, text: 'Contents'}];
  toc.push(row(['Project record', ''], [0.88, 0.12], {linkTo: ANCHOR.record, pageOf: ANCHOR.record}));
  for (const {group, entries} of included) {
    toc.push({kind: 'heading', level: 3, text: group.title});
    for (const e of entries) toc.push(row([e.title, ''], [0.88, 0.12], {linkTo: pageAnchor(e), pageOf: pageAnchor(e), indent: 12}));
  }
  if (listedOnly.length > 0) {
    toc.push({kind: 'spacer', height: 6});
    toc.push(row(['Index: files not in this PDF', ''], [0.88, 0.12], {linkTo: ANCHOR.index, pageOf: ANCHOR.index}));
  }
  parts.push({kind: 'text', anchor: ANCHOR.toc, blocks: toc});

  // Project record
  const record: PdfBlock[] = [{kind: 'heading', level: 1, text: 'Project record'}, {kind: 'heading', level: 2, text: 'Todos'}];
  if (input.tasks.length === 0 && plan.moved.every(m => m.kind !== 'todo')) record.push({kind: 'paragraph', style: 'small', text: 'No todos.'});
  input.tasks.forEach((t, index) => {
    // ASCII status marks: ✓/✗ are outside WinAnsi and would print as "?".
    const mark = t.done ? 'x' : t.cancelled ? '-' : ' ';
    const status = t.done ? 'done' : t.cancelled ? 'cancelled' : 'open';
    const anchor = noteAnchorByItem.get(`todo:${index}`);
    record.push(
      anchor
        ? row([mark, `${t.text} (${status})`, ''], [0.06, 0.82, 0.12], {linkTo: anchor, pageOf: anchor})
        : row([mark, t.text, status], [0.06, 0.74, 0.2]),
    );
  });
  plan.moved.filter(m => m.kind === 'todo').forEach(m => record.push(row(['>', m.label, `moved: ${m.to.replace(/^area:/, 'Area ')}`], [0.06, 0.64, 0.3])));
  record.push({kind: 'heading', level: 2, text: 'Meetings'});
  const sortedMeetings = input.meetings
    .map((m, index) => ({m, index}))
    .sort((a, b) => (a.m.date + a.m.time).localeCompare(b.m.date + b.m.time) || a.index - b.index);
  if (sortedMeetings.length === 0 && plan.moved.every(m => m.kind !== 'meeting')) record.push({kind: 'paragraph', style: 'small', text: 'No meetings.'});
  sortedMeetings.forEach(({m, index}) => {
    const anchor = noteAnchorByItem.get(`meeting:${index}`);
    const label = `${m.date}${m.time ? ` ${m.time}` : ''} · ${meetingDisplayTitle(m)}${m.cancelled ? ' (cancelled)' : ''}`;
    record.push(anchor ? row([label, ''], [0.88, 0.12], {linkTo: anchor, pageOf: anchor}) : row([label], [1]));
  });
  plan.moved.filter(m => m.kind === 'meeting').forEach(m => record.push(row([`${m.label}`, `moved: ${m.to.replace(/^area:/, 'Area ')}`], [0.7, 0.3])));
  if (plan.moves.length > 0) {
    record.push({kind: 'heading', level: 2, text: 'Outcomes moved out'});
    plan.moves.forEach(mv => record.push(row([mv.path, input.outcomeLabel(mv.dest)], [0.45, 0.55])));
  }
  parts.push({kind: 'text', anchor: ANCHOR.record, blocks: record});

  // Included notes and images, by group
  for (const {entries} of included) {
    for (const e of entries) {
      if (e.source.kind === 'note') {
        const src = e.source;
        src.pages.forEach((page, i) =>
          parts.push({
            kind: 'image',
            source: {kind: 'notePage', notePath: src.absPath, page},
            anchor: i === 0 ? pageAnchor(e) : undefined,
            label: `${e.title} · page ${page + 1}`,
          }),
        );
      } else if (e.source.kind === 'image') {
        parts.push({kind: 'image', source: {kind: 'imageFile', path: e.source.absPath}, anchor: pageAnchor(e), label: e.title});
      }
    }
  }

  // Index of everything not in the PDF
  if (listedOnly.length > 0) {
    const index: PdfBlock[] = [
      {kind: 'heading', level: 1, text: 'Index: files not in this PDF'},
      {kind: 'paragraph', style: 'small', text: 'Where each file is after archiving.'},
    ];
    for (const e of listedOnly) {
      const where = e.movedTo
        ? `${input.outcomeLabel(e.movedTo)}`
        : e.insideFolder && e.filePath
        ? `${input.archiveFolderLabel}/${e.filePath}`
        : e.meta;
      index.push(row([e.title, e.listedReason ?? 'not included'], [0.6, 0.4], {bold: true, style: 'small'}));
      index.push(row([where], [1], {style: 'small', indent: 12}));
    }
    parts.push({kind: 'text', anchor: ANCHOR.index, blocks: index});
  }

  const outline: PdfOutlineEntry[] = [
    {title: 'Cover', anchor: ANCHOR.cover},
    {title: 'Contents', anchor: ANCHOR.toc},
    {title: 'Project record', anchor: ANCHOR.record},
    ...included.map(({group, entries}) => ({
      title: group.title,
      anchor: pageAnchor(entries[0]),
      children: entries.map(e => ({title: e.title, anchor: pageAnchor(e)})),
    })),
    ...(listedOnly.length > 0 ? [{title: 'Index: files not in this PDF', anchor: ANCHOR.index}] : []),
  ];

  return {title: input.projectName, textPage: A5X_PAGE, parts, outline, pageNumbers: true};
}
