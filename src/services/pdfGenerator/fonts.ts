/**
 * Font utilities for PDF generation
 */

import type { PDFFont } from 'pdf-lib';
import type { FontStyle, TextPageItem, FontOptions } from '../../types';
import type { FontCache } from './types';

/**
 * Get font style for a section type
 */
export function getFontStyleForSection(
  type: string,
  level: number | undefined,
  fontOptions: FontOptions
): FontStyle {
  switch (type) {
    case 'heading':
      return fontOptions[`h${level || 1}` as keyof typeof fontOptions] as FontStyle;
    case 'code':
      return fontOptions.code;
    case 'blockquote':
      return fontOptions.blockquote;
    default:
      return fontOptions.body;
  }
}

/**
 * Get the appropriate font from cache based on font style
 */
export function getFont(style: FontStyle, fontCache: FontCache): PDFFont {
  if (style.fontFamily.includes('mono') || style.fontFamily.includes('Menlo') || style.fontFamily.includes('Courier')) {
    return fontCache.mono;
  }

  if (style.fontWeight === 'bold' && style.fontStyle === 'italic') {
    return fontCache.boldItalic;
  }
  if (style.fontWeight === 'bold') {
    return fontCache.bold;
  }
  if (style.fontStyle === 'italic') {
    return fontCache.italic;
  }
  return fontCache.regular;
}

/**
 * Get font for text item (simplified - uses standard fonts)
 */
export function getTextItemFont(textItem: TextPageItem, fontCache: FontCache): PDFFont {
  if (textItem.fontWeight === 'bold' && textItem.fontStyle === 'italic') {
    return fontCache.boldItalic;
  }
  if (textItem.fontWeight === 'bold') {
    return fontCache.bold;
  }
  if (textItem.fontStyle === 'italic') {
    return fontCache.italic;
  }
  return fontCache.regular;
}
