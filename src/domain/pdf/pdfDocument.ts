/**
 * Document model for gtdpara's PDF pipeline (docs/dev/technical-design-project-
 * close-out.md §3.1) - what a caller describes, before layout. Generic: no
 * project/archive concepts here; the close-out archive PDF is one document
 * built from these parts (domain/closeOut/archiveDocument.ts).
 *
 * Callers never deal with page numbers: links, bookmarks and "page N"
 * references all name ANCHORS, and domain/pdf/pdfLayout.ts resolves them.
 */

/** Visual role of a line of text - sizes live in pdfLayout.ts's TEXT_STYLES. */
export type TextStyle = 'title' | 'h1' | 'h2' | 'h3' | 'body' | 'small';

export type PdfBlock =
  /** A heading; `anchor` marks the page it lands on. Kept with the following line (never alone at a page bottom). */
  | {kind: 'heading'; text: string; level: 1 | 2 | 3; anchor?: string}
  /** Wrapped text. */
  | {kind: 'paragraph'; text: string; style?: 'body' | 'small'; bold?: boolean}
  /**
   * One single-line table row. `widths` are fractions of the text width (the
   * last cell takes whatever is left if they don't sum to 1). Cells that
   * don't fit are cut with "…". `linkTo` makes the whole row a link to that
   * anchor. `pageOf` replaces the LAST cell with the 1-based page number of
   * that anchor (tables of contents).
   */
  | {kind: 'row'; cells: string[]; widths: number[]; linkTo?: string; pageOf?: string; bold?: boolean; style?: 'body' | 'small'; indent?: number}
  | {kind: 'spacer'; height: number}
  | {kind: 'pageBreak'};

export type ImageSource =
  | {kind: 'notePage'; notePath: string; page: number}
  | {kind: 'imageFile'; path: string};

export type PdfPart =
  /** Flows over as many text pages as needed. `anchor` marks its first page. */
  | {kind: 'text'; blocks: PdfBlock[]; anchor?: string}
  /** One full page. `label` names it in a placeholder page if it can't be rendered. */
  | {kind: 'image'; source: ImageSource; anchor?: string; label: string};

export interface PdfOutlineEntry {
  title: string;
  anchor: string;
  children?: PdfOutlineEntry[];
}

export interface PdfDocument {
  title: string;
  /** Size of TEXT pages in points; image pages take their own size. */
  textPage: {w: number; h: number};
  parts: PdfPart[];
  outline: PdfOutlineEntry[];
  /** Print "page N of M" at the bottom of text pages. */
  pageNumbers?: boolean;
}

/** A5X screen size in points (1404 x 1872 px at 226 ppi) - the default text page size, matching note pages. */
export const A5X_PAGE = {w: Math.round(((1404 * 72) / 226) * 100) / 100, h: Math.round(((1872 * 72) / 226) * 100) / 100};

/**
 * How an image part was resolved before layout (storage/pdfExport.ts's render
 * phase): the file(s) to draw and the page size in points - or a failure,
 * which layout turns into a placeholder text page.
 */
export type ResolvedImage = {ok: true; layers: string[]; w: number; h: number} | {ok: false; reason: string};
