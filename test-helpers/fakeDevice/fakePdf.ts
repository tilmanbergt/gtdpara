/**
 * A stand-in for the native GtdParaPdf module (android/.../PdfModule.kt) on
 * top of FakeFs: buildPdf writes a `.pdf` file holding the spec as JSON, so a
 * scenario can check that a PDF was made and what it holds; the drawing itself
 * is the native module's and is checked on the device
 * (docs/dev/history/technical-design-quality-hardening.md §4.2).
 */
import {FakeFs} from './fakeFs';

export interface FakePdfBuild {
  outPath: string;
  pages: number;
  spec: {pages?: unknown[]} & Record<string, unknown>;
}

export class FakePdf {
  readonly builds: FakePdfBuild[] = [];

  constructor(private readonly fs: FakeFs) {}

  readonly module = {
    fileInfo: async (path: string) => {
      const content = this.fs.get(path);
      return {exists: content !== undefined || this.fs.exists(path), isFile: content !== undefined, bytes: content?.length ?? 0};
    },
    imageInfo: async (path: string) => {
      const content = this.fs.get(path);
      return {exists: content !== undefined, bytes: content?.length ?? 0, width: 1404, height: 1872};
    },
    pdfInfo: async () => ({totalPages: 0, pages: []}),
    renderPdfPage: async () => {
      throw new Error('renderPdfPage is not available in the fake device');
    },
    buildPdf: async (_jobId: string, specJson: string, outPath: string, overwrite: boolean) => {
      if (this.fs.exists(outPath) && !overwrite) {
        const e = new Error(`A file exists at ${outPath}`) as Error & {code: string};
        e.code = 'E_EXISTS';
        throw e;
      }
      const spec = JSON.parse(specJson);
      const pages = Array.isArray(spec.pages) ? spec.pages.length : 0;
      await this.fs.module.writeTextFile(outPath, `%PDF-fake\n${specJson}`);
      this.builds.push({outPath, pages, spec});
      return {bytes: specJson.length, pages, totalMs: 1, imageMs: [], missingLayers: 0};
    },
    cancelBuild: async () => true,
    addListener: () => undefined,
    removeListeners: () => undefined,
  };
}
