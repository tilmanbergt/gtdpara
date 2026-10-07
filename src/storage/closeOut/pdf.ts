/**
 * Creates the project's archive PDF for the close-out wizard's step 4
 * (docs/dev/history/technical-design-project-close-out.md §5.4/§8.2): builds the
 * document from the current contents and plan, runs the generic export
 * service (storage/pdfExport.ts) into the project folder - it moves into
 * the archive only in step 5 - and records the result in the plan
 * (unchecked: every new PDF has to be looked at again).
 */
import {buildArchiveDocument} from '../../domain/closeOut/archiveDocument';
import {parsePlan, withPdf} from '../../domain/closeOut/plan';
import {isoDate} from '../../domain/lifecycleDates';
import {findCachedItem} from '../dataCache';
import {PdfExportProgress, startPdfExport} from '../pdfExport';
import {CloseOutContext} from './context';
import {savePlan} from './planStore';

export interface CloseOutPdfJob {
  cancel(): void;
  done: Promise<{pages: number; bytes: number; failedPages: string[]; totalMs: number}>;
}

function localDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `replaceExisting`: the user confirmed replacing an existing PDF at
 * ctx.workingPdfPath (CloseOutWizard asks first). Without it, an existing
 * file makes the export fail instead of being overwritten.
 */
export function startCloseOutPdf(
  ctx: CloseOutContext,
  onProgress: (p: PdfExportProgress) => void,
  replaceExisting = false,
): CloseOutPdfJob {
  const today = isoDate(new Date());
  const doc = buildArchiveDocument({
    projectName: ctx.item.name,
    area: ctx.item.area,
    scope: ctx.item.scope,
    tasks: ctx.item.tasks,
    meetings: ctx.item.meetings,
    contents: ctx.contents,
    plan: ctx.plan,
    doneAt: ctx.doneAt,
    today,
    archiveFolderLabel: ctx.display(ctx.targets.folder),
    outcomeLabel: ctx.outcomeLabel,
  });
  const job = startPdfExport(doc, ctx.workingPdfPath, {
    overwrite: replaceExisting,
    onProgress,
  });
  const done = job.done.then(async result => {
    // Re-read the plan: it may have changed while the PDF was being built.
    const fresh = findCachedItem(ctx.item.path);
    const plan = fresh ? parsePlan(fresh.rawContent).plan : ctx.plan;
    await savePlan(ctx.item.path, withPdf(plan, {
      fileName: `${ctx.item.name}.pdf`,
      createdAt: localDateTime(new Date()),
      pages: result.pageCount,
      checked: false,
    }));
    return {pages: result.pageCount, bytes: result.bytes, failedPages: result.failedPages, totalMs: result.totalMs};
  });
  return {cancel: job.cancel, done};
}
