/**
 * Font utilities for PDF generation
 */

import type { PDFFont } from 'pdf-lib';
import type { FontStyle, TextPageItem, FontOptions } from '../../types';
import type { FontCache } from './types';

// Sans-serif font names (maps to Helvetica in PDF)
const SANS_SERIF_FONTS = [
  'arial', 'helvetica', 'verdana', 'tahoma', 'trebuchet',
  'lucida sans', 'segoe ui', 'calibri', 'candara', 'optima',
  'futura', 'gill sans', 'century gothic', 'sans-serif',
  // Google Fonts that are sans-serif
  'dm sans', 'inter', 'work sans', 'space grotesk', 'syne',
  'libre franklin', 'fira sans', 'alegreya sans', 'source sans',
  'roboto', 'poppins', 'archivo narrow', 'karla', 'proza libre',
  'ibm plex sans', 'manrope', 'montserrat', 'lato', 'pt sans',
  'chivo', 'rubik', 'open sans', 'raleway',
];

// Monospace font names (maps to Courier in PDF)
const MONOSPACE_FONTS = [
  'courier', 'monaco', 'consolas', 'menlo', 'lucida console',
  'monospace', 'mono', 'code',
  // Google Fonts that are monospace
  'space mono', 'inconsolata', 'fira code', 'jetbrains mono',
];

// Serif font names (maps to Times in PDF) - default fallback
const SERIF_FONTS = [
  'georgia', 'times', 'palatino', 'garamond', 'baskerville',
  'book antiqua', 'cambria', 'serif',
  // Google Fonts that are serif
  'cormorant', 'eczar', 'alegreya', 'source serif', 'fraunces',
  'inknut antiqua', 'biorhyme', 'libre baskerville', 'playfair display',
  'lora', 'spectral', 'pt serif', 'cardo', 'neuton', 'merriweather',
];

/**
 * Determine font category from font family name
 */
function getFontCategory(fontFamily: string): 'serif' | 'sans' | 'mono' {
  const lower = fontFamily.toLowerCase();

  // Check monospace first (more specific)
  for (const mono of MONOSPACE_FONTS) {
    if (lower.includes(mono)) {
      return 'mono';
    }
  }

  // Check sans-serif
  for (const sans of SANS_SERIF_FONTS) {
    if (lower.includes(sans)) {
      return 'sans';
    }
  }

  // Check serif explicitly
  for (const serif of SERIF_FONTS) {
    if (lower.includes(serif)) {
      return 'serif';
    }
  }

  // Default to serif (classic book typography)
  return 'serif';
}

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
 * Maps web-safe fonts to their PDF standard equivalents:
 * - Serif fonts → TimesRoman
 * - Sans-serif fonts → Helvetica
 * - Monospace fonts → Courier
 */
export function getFont(style: FontStyle, fontCache: FontCache): PDFFont {
  const category = getFontCategory(style.fontFamily);
  const isBold = style.fontWeight === 'bold';
  const isItalic = style.fontStyle === 'italic';

  if (category === 'mono') {
    if (isBold && isItalic) return fontCache.monoBoldItalic;
    if (isBold) return fontCache.monoBold;
    if (isItalic) return fontCache.monoItalic;
    return fontCache.monoRegular;
  }

  if (category === 'sans') {
    if (isBold && isItalic) return fontCache.sansBoldItalic;
    if (isBold) return fontCache.sansBold;
    if (isItalic) return fontCache.sansItalic;
    return fontCache.sansRegular;
  }

  // Serif (default)
  if (isBold && isItalic) return fontCache.serifBoldItalic;
  if (isBold) return fontCache.serifBold;
  if (isItalic) return fontCache.serifItalic;
  return fontCache.serifRegular;
}

/**
 * Get font for text item - maps to appropriate PDF font category
 */
export function getTextItemFont(textItem: TextPageItem, fontCache: FontCache): PDFFont {
  const category = getFontCategory(textItem.fontFamily);
  const isBold = textItem.fontWeight === 'bold';
  const isItalic = textItem.fontStyle === 'italic';

  if (category === 'mono') {
    if (isBold && isItalic) return fontCache.monoBoldItalic;
    if (isBold) return fontCache.monoBold;
    if (isItalic) return fontCache.monoItalic;
    return fontCache.monoRegular;
  }

  if (category === 'sans') {
    if (isBold && isItalic) return fontCache.sansBoldItalic;
    if (isBold) return fontCache.sansBold;
    if (isItalic) return fontCache.sansItalic;
    return fontCache.sansRegular;
  }

  // Serif (default)
  if (isBold && isItalic) return fontCache.serifBoldItalic;
  if (isBold) return fontCache.serifBold;
  if (isItalic) return fontCache.serifItalic;
  return fontCache.serifRegular;
}
