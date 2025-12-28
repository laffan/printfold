/**
 * Types for the PDF Generator
 */

import type { PDFFont, PDFImage } from 'pdf-lib';

export interface FontCache {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

export type ImageCacheType = Map<string, PDFImage>;
export type RenderedPageCacheType = Map<number, PDFImage>;

/**
 * Imposition sheet representing front/back of a physical sheet
 */
export interface ImpositionSheet {
  sheetNumber: number;
  front: { left: number; right: number };
  back: { left: number; right: number };
}
