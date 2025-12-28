/**
 * Types for the PDF Generator
 */

import type { PDFFont, PDFImage } from 'pdf-lib';

/**
 * Font variants for a single font family
 */
export interface FontVariants {
  regular: PDFFont;
  bold?: PDFFont;
  italic?: PDFFont;
  boldItalic?: PDFFont;
}

/**
 * Font cache - stores embedded fonts by family name
 * Also includes fallback fonts for each category
 */
export interface FontCache {
  // Dynamically embedded fonts (by family name)
  embedded: Map<string, FontVariants>;

  // Fallback fonts (standard PDF fonts)
  fallback: {
    serif: FontVariants;
    sans: FontVariants;
    mono: FontVariants;
  };
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
