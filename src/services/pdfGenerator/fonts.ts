/**
 * Font utilities for PDF generation
 */

import type { PDFFont } from 'pdf-lib';
import type { FontStyle, TextPageItem, FontOptions, TextSpan } from '../../types';
import type { FontCache, FontVariants } from './types';

// Sans-serif font names (for category detection)
const SANS_SERIF_FONTS = [
  'arial', 'helvetica', 'verdana', 'tahoma', 'trebuchet',
  'lucida sans', 'segoe ui', 'calibri', 'candara', 'optima',
  'futura', 'gill sans', 'century gothic', 'sans-serif',
  'dm sans', 'inter', 'work sans', 'space grotesk', 'syne',
  'libre franklin', 'fira sans', 'alegreya sans', 'source sans',
  'roboto', 'poppins', 'archivo narrow', 'karla', 'proza libre',
  'ibm plex sans', 'manrope', 'montserrat', 'lato', 'pt sans',
  'chivo', 'rubik', 'open sans', 'raleway',
];

// Monospace font names (for category detection)
const MONOSPACE_FONTS = [
  'courier', 'monaco', 'consolas', 'menlo', 'lucida console',
  'monospace', 'mono', 'code',
  'space mono', 'inconsolata', 'fira code', 'jetbrains mono',
];

// Serif font names (for category detection)
const SERIF_FONTS = [
  'georgia', 'times', 'palatino', 'garamond', 'baskerville',
  'book antiqua', 'cambria', 'serif',
  'cormorant', 'eczar', 'alegreya', 'source serif', 'fraunces',
  'inknut antiqua', 'biorhyme', 'libre baskerville', 'playfair display',
  'lora', 'spectral', 'pt serif', 'cardo', 'neuton', 'merriweather',
];

/**
 * Determine font category from font family name
 */
export function getFontCategory(fontFamily: string): 'serif' | 'sans' | 'mono' {
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
    case 'endnoteHeader':
      return fontOptions[`h${level || 2}` as keyof typeof fontOptions] as FontStyle;
    case 'endnote':
      return fontOptions.footnote;
    default:
      return fontOptions.body;
  }
}

/**
 * Get font variant from FontVariants based on weight/style
 */
function getFontVariant(
  variants: FontVariants,
  isBold: boolean,
  isItalic: boolean
): PDFFont {
  if (isBold && isItalic && variants.boldItalic) {
    return variants.boldItalic;
  }
  if (isBold && variants.bold) {
    return variants.bold;
  }
  if (isItalic && variants.italic) {
    return variants.italic;
  }
  return variants.regular;
}

/**
 * Normalize font family name for cache lookup
 */
function normalizeFontFamily(fontFamily: string): string {
  // Remove quotes and extra whitespace
  return fontFamily.replace(/["']/g, '').trim().toLowerCase();
}

/**
 * Get the appropriate font from cache based on font style
 * First checks for embedded fonts, then falls back to standard PDF fonts
 */
export function getFont(style: FontStyle, fontCache: FontCache): PDFFont {
  const isBold = style.fontWeight === 'bold';
  const isItalic = style.fontStyle === 'italic';
  const normalizedFamily = normalizeFontFamily(style.fontFamily);

  // First, try to find an embedded font for this exact family
  for (const [family, variants] of fontCache.embedded) {
    if (normalizeFontFamily(family) === normalizedFamily) {
      return getFontVariant(variants, isBold, isItalic);
    }
  }

  // Also try partial matches (e.g., "Georgia" matches "Georgia, serif")
  for (const [family, variants] of fontCache.embedded) {
    const normalizedCached = normalizeFontFamily(family);
    if (normalizedFamily.includes(normalizedCached) || normalizedCached.includes(normalizedFamily)) {
      return getFontVariant(variants, isBold, isItalic);
    }
  }

  // Fall back to category-based standard fonts
  const category = getFontCategory(style.fontFamily);
  const fallbackVariants = fontCache.fallback[category];
  return getFontVariant(fallbackVariants, isBold, isItalic);
}

/**
 * Get font for text item
 */
export function getTextItemFont(textItem: TextPageItem, fontCache: FontCache): PDFFont {
  const isBold = textItem.fontWeight === 'bold';
  const isItalic = textItem.fontStyle === 'italic';
  const normalizedFamily = normalizeFontFamily(textItem.fontFamily);

  // First, try to find an embedded font
  for (const [family, variants] of fontCache.embedded) {
    if (normalizeFontFamily(family) === normalizedFamily) {
      return getFontVariant(variants, isBold, isItalic);
    }
  }

  // Partial match
  for (const [family, variants] of fontCache.embedded) {
    const normalizedCached = normalizeFontFamily(family);
    if (normalizedFamily.includes(normalizedCached) || normalizedCached.includes(normalizedFamily)) {
      return getFontVariant(variants, isBold, isItalic);
    }
  }

  // Fall back to category-based standard fonts
  const category = getFontCategory(textItem.fontFamily);
  const fallbackVariants = fontCache.fallback[category];
  return getFontVariant(fallbackVariants, isBold, isItalic);
}

/**
 * Get font for a TextSpan, applying span styling on top of base font style
 * For code spans, uses the code font from fontOptions
 */
export function getFontForSpan(
  span: TextSpan,
  baseStyle: FontStyle,
  fontOptions: FontOptions,
  fontCache: FontCache
): PDFFont {
  // Determine the font family (code spans use the code font)
  const fontFamily = span.code === true
    ? fontOptions.code.fontFamily
    : baseStyle.fontFamily;

  // Determine bold/italic: start with base style, then apply span overrides
  // Use strict equality to avoid truthy issues
  const isBold = baseStyle.fontWeight === 'bold' || span.bold === true;
  const isItalic = baseStyle.fontStyle === 'italic' || span.italic === true;

  // Build a computed style and use the existing getFont function
  // This ensures consistent font lookup with the rest of the PDF generation
  const computedStyle: FontStyle = {
    ...baseStyle,
    fontFamily,
    fontWeight: isBold ? 'bold' : 'normal',
    fontStyle: isItalic ? 'italic' : 'normal',
  };

  return getFont(computedStyle, fontCache);
}

/**
 * Get font size for a span, applying code span size reduction
 */
export function getFontSizeForSpan(span: TextSpan, baseFontSize: number): number {
  if (span.footnoteNumber !== undefined) {
    return baseFontSize * 0.65;
  }
  if (span.code) {
    return baseFontSize * 0.9; // Slightly smaller for inline code
  }
  return baseFontSize;
}
