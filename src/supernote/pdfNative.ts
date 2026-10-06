/**
 * JS surface of gtdpara's own PDF writer (android/.../PdfModule.kt, native
 * name "GtdParaPdf") plus thin wrappers around the sn-plugin-lib calls that
 * feed it note-page images - docs/dev/technical-design-project-close-out.md
 * §2.1/§3. Generic on purpose: nothing here knows about projects, archives
 * or close-out (storage/pdfExport.ts is the one client that turns a document
 * model into a finished PDF; see there).
 *
 * The SDK wrappers return a raw {ok, result, error, ms} record instead of
 * throwing: a page that fails to render must become a placeholder page in
 * the export, not abort a 300-page run.
 *
 * Replaces the spike's supernote/archivePdf.ts (2026-09-28): same writer,
 * plus job ids, progress events and cancel; the spike-only calls
 * (template/mark rendering, batch PDF rasterizing) are gone.
 */
import {DeviceEventEmitter, NativeModules} from 'react-native';
import {PluginFileAPI} from 'sn-plugin-lib';
import {PdfSpec} from '../domain/pdf/pdfSpec';
import {ensureFileReadPermission, ensureFileWritePermission} from './pluginPermissions';
import {log, logError} from '../utils/log';
import {errorMessage} from '../utils/errorMessage';

// ---- sn-plugin-lib wrappers ----

export interface ApiCall<T> {
  ok: boolean;
  result: T | null;
  error: string | null;
  ms: number;
}

type RawResponse = {success?: boolean; result?: unknown; error?: {code?: number; message?: string} | null} | null | undefined;

async function call<T>(name: string, fn: () => Promise<unknown>): Promise<ApiCall<T>> {
  const start = Date.now();
  try {
    const raw = (await fn()) as RawResponse;
    const ms = Date.now() - start;
    const ok = !!raw && raw.success === true && raw.result !== false;
    const error = ok ? null : raw?.error?.message || `${name}: no success`;
    if (!ok) logError(`${name}: failed`, error);
    return {ok, result: ok ? ((raw?.result ?? null) as T | null) : null, error, ms};
  } catch (e) {
    const error = errorMessage(e);
    logError(`${name}: threw`, error);
    return {ok: false, result: null, error, ms: Date.now() - start};
  }
}

async function requireRead(): Promise<void> {
  if (!(await ensureFileReadPermission())) throw new Error('File read permission was not granted.');
}

async function requireWrite(): Promise<void> {
  if (!(await ensureFileWritePermission())) throw new Error('File write permission was not granted.');
}

/**
 * Renders one note page to a PNG. Spike result (2026-09-28): `type` 1 (white
 * background) already contains the page's background template - no separate
 * template call or layering is needed. `times` 1 = native resolution.
 */
export async function generateNotePng(notePath: string, page: number, pngPath: string, times: 1 | 2 = 1): Promise<ApiCall<boolean>> {
  await requireWrite();
  return call('generateNotePng', () => PluginFileAPI.generateNotePng({notePath, page, times, pngPath, type: 1}));
}

export async function getNotePageCount(notePath: string): Promise<ApiCall<number>> {
  await requireRead();
  return call('getNoteTotalPageNum', () => PluginFileAPI.getNoteTotalPageNum(notePath));
}

/** Page size in pixels. */
export async function getNotePageSize(notePath: string, page: number): Promise<ApiCall<{width: number; height: number}>> {
  await requireRead();
  return call('getPageSize', () => PluginFileAPI.getPageSize(notePath, page));
}

/** 0=A5, 1=A6, 2=A6X, 3=A5X, 4=Nomad, 5=Manta. */
export async function getFileMachineType(notePath: string): Promise<ApiCall<number>> {
  await requireRead();
  return call('getFileMachineType', () => PluginFileAPI.getFileMachineType(notePath));
}

/** Whether a note/folder is password-locked. The result's exact shape is logged, not interpreted beyond truthiness. */
export async function getPathEncryptionStatus(path: string): Promise<ApiCall<unknown>> {
  await requireRead();
  return call('getPathEncryptionStatus', () => PluginFileAPI.getPathEncryptionStatus(path));
}

/**
 * Pixels per inch for a note's origin device, used to give PDF pages their
 * real physical size (points = px * 72 / ppi). The A5 and A5X are 226 ppi;
 * the A6, A6X, Nomad and Manta are ~300 ppi. Unknown types fall back to 226.
 */
export function ppiForMachineType(type: number | null): number {
  return type === 1 || type === 2 || type === 4 || type === 5 ? 300 : 226;
}

// ---- PDF spec: the types live in domain/pdf/pdfSpec.ts (pure layout produces them) ----

export type {PdfLink, PdfOutlineNode, PdfPageSpec, PdfSpec, PdfTextItem} from '../domain/pdf/pdfSpec';

export interface BuildPdfResult {
  bytes: number;
  pages: number;
  totalMs: number;
  imageMs: number[];
  missingLayers: number;
}

export interface RenderedPdfPage {
  png: string;
  widthPt: number;
  heightPt: number;
  pxW: number;
  pxH: number;
  ms: number;
}

export interface FileInfo {
  exists: boolean;
  isFile: boolean;
  bytes: number;
}

export interface ImageInfo {
  exists: boolean;
  bytes: number;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  cornerAlpha?: number;
  cornerGray?: number;
}

export interface PdfBuildProgress {
  jobId: string;
  /** Image pages encoded so far. */
  done: number;
  /** Image pages in the spec. */
  total: number;
}

/** Rejection code when a build was stopped with cancelBuild - callers show "cancelled", not an error. */
export const PDF_CANCELLED = 'E_CANCELLED';

interface GtdParaPdfNativeModule {
  fileInfo(path: string): Promise<FileInfo>;
  imageInfo(path: string): Promise<ImageInfo>;
  pdfInfo(pdfPath: string): Promise<{totalPages: number; pages: {widthPt: number; heightPt: number}[]}>;
  renderPdfPage(pdfPath: string, pageIndex: number, pngPath: string, dpi: number, maxLongSidePx: number): Promise<RenderedPdfPage>;
  buildPdf(jobId: string, specJson: string, outPath: string, overwrite: boolean): Promise<BuildPdfResult>;
  cancelBuild(jobId: string): Promise<boolean>;
}

const PROGRESS_EVENT = 'GtdParaPdfProgress';

const {GtdParaPdf} = NativeModules as {GtdParaPdf?: GtdParaPdfNativeModule};

function native(): GtdParaPdfNativeModule {
  if (!GtdParaPdf) throw new Error('GtdParaPdf native module is not available on this build (rebuild the plugin).');
  return GtdParaPdf;
}

export async function fileInfo(path: string): Promise<FileInfo> {
  await requireRead();
  return native().fileInfo(path);
}

export async function imageInfo(path: string): Promise<ImageInfo> {
  await requireRead();
  return native().imageInfo(path);
}

/** Page count + sizes in points, without rendering. Unused in v1 (existing PDFs are not merged) - kept for v2. */
export async function pdfInfo(pdfPath: string) {
  await requireRead();
  return native().pdfInfo(pdfPath);
}

/** Renders one page of an existing PDF, capped so the longer side is at most `maxLongSidePx`. Unused in v1 - kept for v2. */
export async function renderPdfPage(pdfPath: string, pageIndex: number, pngPath: string, dpi: number, maxLongSidePx: number) {
  await requireWrite();
  return native().renderPdfPage(pdfPath, pageIndex, pngPath, dpi, maxLongSidePx);
}

/**
 * Builds the PDF natively. Writes `<outPath>.part` and renames it when
 * complete. If `outPath` exists: rejects, unless `overwrite` is set and it
 * is a .pdf - then it is replaced, but only once the new file is complete.
 * `onProgress` fires after every encoded image page. Rejects with code
 * `PDF_CANCELLED` after `cancelBuild(jobId)` - the .part file is already
 * removed by then.
 */
export async function buildPdf(
  jobId: string,
  spec: PdfSpec,
  outPath: string,
  options: {overwrite?: boolean; onProgress?: (p: PdfBuildProgress) => void} = {},
): Promise<BuildPdfResult> {
  const {overwrite = false, onProgress} = options;
  await requireWrite();
  log('buildPdf: start', jobId, outPath, `${spec.pages.length} pages`, spec.encoding);
  const sub = onProgress
    ? DeviceEventEmitter.addListener(PROGRESS_EVENT, (e: PdfBuildProgress) => {
        if (e.jobId === jobId) onProgress(e);
      })
    : null;
  try {
    const result = await native().buildPdf(jobId, JSON.stringify(spec), outPath, overwrite);
    log('buildPdf: done', jobId, `${result.bytes} bytes`, `${result.totalMs} ms`);
    return result;
  } finally {
    sub?.remove();
  }
}

/** Asks a running build to stop after its current page. Resolves false if no such job is running. */
export async function cancelBuild(jobId: string): Promise<boolean> {
  return native().cancelBuild(jobId);
}
