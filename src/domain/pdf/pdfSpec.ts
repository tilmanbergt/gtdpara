/**
 * The positioned page description the native PDF writer consumes
 * (android/.../PdfModule.kt's buildPdf, via supernote/pdfNative.ts) - the
 * OUTPUT of domain/pdf/pdfLayout.ts. Lives in domain/ (not next to the
 * native binding) so the pure layout code can produce it without importing
 * anything device-side (design-overview.md §3's domain/ rule).
 *
 * Units are PDF points (1/72 in); coordinates are top-left origin - the
 * native writer flips them.
 */

export interface PdfTextItem {
  text: string;
  x: number;
  /** Top of the text line (the writer derives the baseline from `size`). */
  y: number;
  size: number;
  bold?: boolean;
}

export interface PdfLink {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0-based target page index in the output PDF. */
  page: number;
}

export type PdfPageSpec =
  | {kind: 'text'; w: number; h: number; items: PdfTextItem[]; links?: PdfLink[]}
  /** Full-page image; `layers` are image file paths composited bottom to top on white. */
  | {kind: 'image'; w: number; h: number; layers: string[]};

export interface PdfOutlineNode {
  title: string;
  /** 0-based page index. */
  page: number;
  children?: PdfOutlineNode[];
}

export interface PdfSpec {
  title: string;
  encoding: 'flate' | 'jpeg';
  jpegQuality?: number;
  pages: PdfPageSpec[];
  outline?: PdfOutlineNode[];
}
