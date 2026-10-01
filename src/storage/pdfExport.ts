/**
 * PDF export service (docs/dev/technical-design-project-close-out.md §3.3) -
 * turns a PdfDocument (domain/pdf/pdfDocument.ts) into a finished PDF file.
 * Generic: nothing here knows about projects or archives; the close-out
 * wizard is one caller.
 *
 * Phases, each reported through `onProgress`:
 * 1. render - every `notePage` image part becomes a PNG via generateNotePng
 *    (white background; the spike showed that already includes the page's
 *    template). A page that fails becomes a placeholder page, never an abort.
 *    Image files are measured and fitted into the text page's aspect.
 * 2. layout - pure (domain/pdf/pdfLayout.ts).
 * 3. build  - native writer, progress per encoded image page.
 *
 * Cancel works in every phase (between pages while rendering, via the
 * native cancel while building). Rendered PNGs live in the plugin's PRIVATE
 * temp folder (`<private>/tmp/<jobId>/`, no permission needed, invisible to
 * the user) and are removed in `finally`, success or not
 * (docs/dev/technical-design-inkhub-submission.md §3.2). The output file
 * only ever appears complete: the native writer builds it in the private
 * temp folder and copies it to `outPath` at the end.
 *
 * Fallback (unverified host behavior, see the design's test plan): the page
 * renderer (PluginFileAPI.generateNotePng) is a host call - if the host
 * cannot write into the plugin's private folder, the first page fails there
 * and rendering switches to `EXPORT/gtdpara/tmp/` with FIXED file names
 * (page-0001.png, ...) that the next export overwrites. Those files are
 * never deleted (that would need FILE:DELETE); PRIVACY.md says so.
 */
import {PdfDocument, ResolvedImage} from '../domain/pdf/pdfDocument';
import {layoutDocument} from '../domain/pdf/pdfLayout';
import {
  buildPdf,
  cancelBuild,
  generateNotePng,
  getFileMachineType,
  getNotePageSize,
  imageInfo,
  PDF_CANCELLED,
  ppiForMachineType,
} from '../supernote/pdfNative';
import {deleteTempTree, ensureFolderExists, GTDPARA_EXPORT_ROOT, getPrivateTempDir} from '../supernote/fileSystem';
import {log, logError, logWarn} from '../utils/log';

/** Shared-storage fallback for rendered pages (see the module comment) - fixed names, overwritten, never deleted. */
export const PDF_FALLBACK_TEMP_DIR = `${GTDPARA_EXPORT_ROOT}/tmp`;

export type PdfExportPhase = 'render' | 'layout' | 'build';

export interface PdfExportProgress {
  phase: PdfExportPhase;
  done: number;
  total: number;
  /** What is being worked on right now, e.g. "Daily.note · page 4". */
  label: string;
}

export interface PdfExportResult {
  outPath: string;
  bytes: number;
  pageCount: number;
  /** Anchor -> 0-based page index in the finished PDF. */
  anchorPages: Record<string, number>;
  /** Labels of pages that could not be rendered and became placeholder pages. */
  failedPages: string[];
  unresolvedAnchors: string[];
  totalMs: number;
}

export interface PdfExportOptions {
  /**
   * Replace an existing PDF at the output path (only after the new one is
   * complete). Callers set this only after the user confirmed replacing it.
   */
  overwrite?: boolean;
  onProgress?: (p: PdfExportProgress) => void;
}

export interface PdfExportJob {
  jobId: string;
  /** Stops after the current page; `done` then rejects with PdfExportCancelled. */
  cancel(): void;
  done: Promise<PdfExportResult>;
}

export class PdfExportCancelled extends Error {
  constructor() {
    super('PDF creation was cancelled.');
    this.name = 'PdfExportCancelled';
  }
}

/** Fits a w x h pixel image into `box` (points), keeping its aspect ratio. */
export function fitIntoPage(pxW: number, pxH: number, box: {w: number; h: number}): {w: number; h: number} {
  if (pxW <= 0 || pxH <= 0) return box;
  const scale = Math.min(box.w / pxW, box.h / pxH);
  return {w: Math.round(pxW * scale * 100) / 100, h: Math.round(pxH * scale * 100) / 100};
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function startPdfExport(doc: PdfDocument, outPath: string, options: PdfExportOptions): PdfExportJob {
  const jobId = `pdf-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let tempDir: string | null = null;
  let usingFallback = false;
  let renderedCount = 0;
  let cancelled = false;
  let building = false;
  const report = (p: PdfExportProgress) => {
    try {
      options.onProgress?.(p);
    } catch (e) {
      logError('pdfExport: onProgress threw', e instanceof Error ? e.message : String(e));
    }
  };
  const checkCancelled = () => {
    if (cancelled) throw new PdfExportCancelled();
  };

  const run = async (): Promise<PdfExportResult> => {
    const started = Date.now();
    tempDir = `${await getPrivateTempDir()}/${jobId}`;
    const pngPathFor = (i: number, n: number) =>
      usingFallback
        ? `${PDF_FALLBACK_TEMP_DIR}/page-${String(n).padStart(4, '0')}.png`
        : `${tempDir}/p${String(i).padStart(4, '0')}.png`;

    // 1. render
    const images: (ResolvedImage | undefined)[] = new Array(doc.parts.length).fill(undefined);
    const machineTypes = new Map<string, number | null>();
    const renderTotal = doc.parts.filter(p => p.kind === 'image').length;
    let renderDone = 0;
    for (let i = 0; i < doc.parts.length; i++) {
      const part = doc.parts[i];
      if (part.kind !== 'image') continue;
      checkCancelled();
      const src = part.source;
      if (src.kind === 'notePage') {
        report({phase: 'render', done: renderDone, total: renderTotal, label: `${baseName(src.notePath)} · page ${src.page + 1}`});
        let png = pngPathFor(i, renderedCount + 1);
        let rendered = await generateNotePng(src.notePath, src.page, png);
        if (!rendered.ok && renderedCount === 0 && !usingFallback) {
          // First page failed in the private folder: the host renderer may
          // not be able to write there. Retry once in the fallback folder.
          logWarn('pdfExport: rendering into the private temp folder failed, using the fallback folder', rendered.error);
          usingFallback = true;
          await ensureFolderExists(PDF_FALLBACK_TEMP_DIR);
          png = pngPathFor(i, renderedCount + 1);
          rendered = await generateNotePng(src.notePath, src.page, png);
          if (!rendered.ok) usingFallback = false; // not a location problem - keep the private folder
        }
        if (rendered.ok) renderedCount++;
        if (!rendered.ok) {
          images[i] = {ok: false, reason: rendered.error ?? 'render failed'};
        } else {
          if (!machineTypes.has(src.notePath)) machineTypes.set(src.notePath, (await getFileMachineType(src.notePath)).result);
          const ppi = ppiForMachineType(machineTypes.get(src.notePath) ?? null);
          const size = (await getNotePageSize(src.notePath, src.page)).result ?? {width: 1404, height: 1872};
          images[i] = {
            ok: true,
            layers: [png],
            w: Math.round(((size.width * 72) / ppi) * 100) / 100,
            h: Math.round(((size.height * 72) / ppi) * 100) / 100,
          };
        }
      } else {
        report({phase: 'render', done: renderDone, total: renderTotal, label: baseName(src.path)});
        try {
          const info = await imageInfo(src.path);
          images[i] =
            info.exists && info.width && info.height && info.width > 0
              ? {ok: true, layers: [src.path], ...fitIntoPage(info.width, info.height, doc.textPage)}
              : {ok: false, reason: 'file missing or not a readable image'};
        } catch (e) {
          images[i] = {ok: false, reason: e instanceof Error ? e.message : String(e)};
        }
      }
      renderDone++;
    }
    report({phase: 'render', done: renderDone, total: renderTotal, label: ''});

    // 2. layout
    checkCancelled();
    report({phase: 'layout', done: 0, total: 1, label: ''});
    const layout = layoutDocument(doc, images);
    if (layout.unresolvedAnchors.length > 0) log('pdfExport: unresolved anchors', layout.unresolvedAnchors.join(', '));

    // 3. build
    checkCancelled();
    const imagePages = layout.spec.pages.filter(p => p.kind === 'image').length;
    report({phase: 'build', done: 0, total: imagePages, label: baseName(outPath)});
    building = true;
    try {
      const built = await buildPdf(jobId, layout.spec, outPath, {
        overwrite: options.overwrite,
        onProgress: p => report({phase: 'build', done: p.done, total: p.total, label: baseName(outPath)}),
      });
      return {
        outPath,
        bytes: built.bytes,
        pageCount: built.pages,
        anchorPages: layout.anchorPages,
        failedPages: layout.placeholders,
        unresolvedAnchors: layout.unresolvedAnchors,
        totalMs: Date.now() - started,
      };
    } catch (e) {
      const code = (e as {code?: string} | null)?.code;
      if (code === PDF_CANCELLED || cancelled) throw new PdfExportCancelled();
      throw e;
    } finally {
      building = false;
    }
  };

  const done = run().finally(() => {
    if (tempDir) void deleteTempTree(tempDir);
    if (usingFallback) log('pdfExport: rendered pages were kept in', PDF_FALLBACK_TEMP_DIR, '(overwritten by the next export)');
  });
  log('pdfExport: started', jobId, outPath, `${doc.parts.length} parts`);
  return {
    jobId,
    cancel() {
      cancelled = true;
      if (building) cancelBuild(jobId).catch(() => undefined);
    },
    done,
  };
}
