/**
 * Text measurement utilities for the text flow engine
 */

import { measurementCache } from './cache';
import type { MeasuredSection, PageDimensions } from './types';
import type { DocumentSection, FontStyle, FontOptions, LayoutOptions } from '../../types';

/**
 * Measure text width using canvas context
 */
export function measureTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontStyle: FontStyle
): number {
  const cacheKey = `${text}|${fontStyle.fontFamily}|${fontStyle.fontSize}|${fontStyle.fontWeight}`;
  const cached = measurementCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Font family names with spaces must be quoted in CSS font string
  const quotedFamily = fontStyle.fontFamily.includes(' ')
    ? `"${fontStyle.fontFamily}"`
    : fontStyle.fontFamily;
  ctx.font = `${fontStyle.fontStyle} ${fontStyle.fontWeight} ${fontStyle.fontSize}px ${quotedFamily}`;
  const width = ctx.measureText(text).width;
  measurementCache.set(cacheKey, width);
  return width;
}

/**
 * Wrap text to fit within a width
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontStyle: FontStyle
): string[] {
  // Apply a small safety margin (2%) to account for measurement differences
  // between Canvas 2D and Konva rendering engines
  const safeMaxWidth = maxWidth * 0.98;

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = measureTextWidth(ctx, testLine, fontStyle);

    if (testWidth <= safeMaxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // Check if single word is too long
      if (measureTextWidth(ctx, word, fontStyle) > safeMaxWidth) {
        // Break word
        const chars = word.split('');
        let charLine = '';
        for (const char of chars) {
          const testCharLine = charLine + char;
          if (measureTextWidth(ctx, testCharLine, fontStyle) <= safeMaxWidth) {
            charLine = testCharLine;
          } else {
            if (charLine) lines.push(charLine);
            charLine = char;
          }
        }
        currentLine = charLine;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Get font style for a section type
 */
export function getFontStyleForSection(
  section: DocumentSection,
  fontOptions: FontOptions
): FontStyle {
  switch (section.type) {
    case 'heading':
      return fontOptions[`h${section.level || 1}` as keyof FontOptions] as FontStyle;
    case 'code':
      return fontOptions.code;
    case 'blockquote':
      return fontOptions.blockquote;
    default:
      return fontOptions.body;
  }
}

/**
 * Measure a section's height
 */
export function measureSection(
  ctx: CanvasRenderingContext2D,
  section: DocumentSection,
  contentWidth: number,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): MeasuredSection {
  const fontStyle = getFontStyleForSection(section, fontOptions);
  const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

  // Handle different section types
  if (section.type === 'image') {
    // Fixed height for images (or could be configurable)
    return {
      ...section,
      measuredHeight: 200, // Placeholder height
      lines: [],
      lineHeights: [],
    };
  }

  if (section.type === 'hr') {
    return {
      ...section,
      measuredHeight: 24,
      lines: ['—————'],
      lineHeights: [24],
    };
  }

  // Wrap text content
  const textLines = section.content.split('\n');
  const wrappedLines: string[] = [];

  for (const textLine of textLines) {
    const wrapped = wrapText(ctx, textLine, contentWidth, fontStyle);
    wrappedLines.push(...wrapped);
  }

  const lineHeights = wrappedLines.map(() => lineHeight);

  // Add spacing before headings
  let spacingBefore = 0;
  if (section.type === 'heading') {
    switch (section.level) {
      case 1:
        spacingBefore = layoutOptions.spacingAboveH1;
        break;
      case 2:
        spacingBefore = layoutOptions.spacingAboveH2;
        break;
      case 3:
        spacingBefore = layoutOptions.spacingAboveH3;
        break;
    }
  }

  const measuredHeight = spacingBefore + wrappedLines.length * lineHeight + layoutOptions.paragraphSpacing;

  return {
    ...section,
    measuredHeight,
    lines: wrappedLines,
    lineHeights,
  };
}
