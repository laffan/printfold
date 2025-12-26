/**
 * PDF Generator Module
 * Re-exports from modular implementation
 */

export { PDFGenerator } from './PDFGenerator';
export type { FontCache, ImageCacheType, RenderedPageCacheType } from './types';
export { sanitizeText } from './textUtils';
export { parseColor, getFillColorFromConfig } from './colors';
export { getFontStyleForSection, getFont, getTextItemFont } from './fonts';
export { embedImages, preRenderStaticPages } from './images';
export { addPrintMarks } from './printMarks';
export { drawPageItemsClipped, drawPageItems, spanningItemToPageItem } from './itemDrawing';
