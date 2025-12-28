/**
 * Types for the PDF Generator
 */

import type { PDFFont, PDFImage } from 'pdf-lib';

export interface FontCache {
  // Serif fonts (for Georgia, Times New Roman, Palatino, etc.)
  serifRegular: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  serifBoldItalic: PDFFont;
  // Sans-serif fonts (for Arial, Helvetica, Verdana, etc.)
  sansRegular: PDFFont;
  sansBold: PDFFont;
  sansItalic: PDFFont;
  sansBoldItalic: PDFFont;
  // Monospace fonts (for Courier, Monaco, Consolas, etc.)
  monoRegular: PDFFont;
  monoBold: PDFFont;
  monoItalic: PDFFont;
  monoBoldItalic: PDFFont;
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
