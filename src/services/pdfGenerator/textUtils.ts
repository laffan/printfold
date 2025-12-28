/**
 * Text utilities for PDF generation
 */

import type { PDFPage } from 'pdf-lib';
import type { RichTextLine, TextSpan, FontStyle, FontOptions } from '../../types';
import type { FontCache } from './types';
import { getFontForSpan, getFontSizeForSpan } from './fonts';
import { parseColor } from './colors';

/**
 * Sanitize text for WinAnsi encoding (removes emojis and non-Latin characters)
 */
export function sanitizeText(text: string): string {
  // Replace common special characters with ASCII equivalents
  let sanitized = text
    .replace(/[\u2018\u2019]/g, "'") // Smart quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/\u2014/g, '--') // Em dash
    .replace(/\u2013/g, '-') // En dash
    .replace(/\u2026/g, '...') // Ellipsis
    .replace(/\u00A0/g, ' '); // Non-breaking space

  // Remove any characters outside the WinAnsi range (keep only printable ASCII and Latin-1)
  // WinAnsi supports: 0x20-0x7E (basic ASCII) and 0xA0-0xFF (Latin-1 supplement)
  sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

  return sanitized;
}

/**
 * Draw a rich text line on a PDF page
 * Handles bold, italic, code, strikethrough, and highlight styles
 */
export function drawRichLine(
  pdfPage: PDFPage,
  line: RichTextLine,
  x: number,
  y: number,
  baseStyle: FontStyle,
  fontOptions: FontOptions,
  fontCache: FontCache,
  contentWidth: number,
  textAlign: 'left' | 'center' | 'right' | 'justify' = 'left'
): void {
  // Calculate total line width for alignment
  let totalWidth = 0;
  const spanWidths: number[] = [];

  for (const span of line.spans) {
    const font = getFontForSpan(span, baseStyle, fontOptions, fontCache);
    const fontSize = getFontSizeForSpan(span, baseStyle.fontSize);
    const text = sanitizeText(span.text);
    const width = font.widthOfTextAtSize(text, fontSize);
    spanWidths.push(width);
    totalWidth += width;
  }

  // Calculate starting x based on alignment
  let currentX = x;
  if (textAlign === 'center') {
    currentX = x + (contentWidth - totalWidth) / 2;
  } else if (textAlign === 'right') {
    currentX = x + contentWidth - totalWidth;
  }

  // Draw each span
  for (let i = 0; i < line.spans.length; i++) {
    const span = line.spans[i];
    const font = getFontForSpan(span, baseStyle, fontOptions, fontCache);
    const fontSize = getFontSizeForSpan(span, baseStyle.fontSize);
    const text = sanitizeText(span.text);
    const spanWidth = spanWidths[i];

    // Get text color (base color or could be modified for links)
    const textColor = parseColor(baseStyle.color);

    // Draw highlight background if needed
    if (span.highlight && fontOptions.highlight) {
      pdfPage.drawRectangle({
        x: currentX,
        y: y - fontSize * 0.2, // Slight offset below baseline
        width: spanWidth,
        height: fontSize * 1.2, // Cover full line height
        color: parseColor(fontOptions.highlight.backgroundColor),
      });
    }

    // Draw the text
    pdfPage.drawText(text, {
      x: currentX,
      y: y,
      size: fontSize,
      font,
      color: textColor,
    });

    // Draw strikethrough if needed
    if (span.strikethrough) {
      const strikeY = y + fontSize * 0.35; // Approximate middle of text
      const lineColor = fontOptions.strikethrough
        ? parseColor(fontOptions.strikethrough.lineColor)
        : textColor;
      pdfPage.drawLine({
        start: { x: currentX, y: strikeY },
        end: { x: currentX + spanWidth, y: strikeY },
        thickness: fontSize / 15,
        color: lineColor,
      });
    }

    currentX += spanWidth;
  }
}

/**
 * Measure the width of a rich text line
 */
export function measureRichLineWidthPdf(
  line: RichTextLine,
  baseStyle: FontStyle,
  fontOptions: FontOptions,
  fontCache: FontCache
): number {
  let totalWidth = 0;

  for (const span of line.spans) {
    const font = getFontForSpan(span, baseStyle, fontOptions, fontCache);
    const fontSize = getFontSizeForSpan(span, baseStyle.fontSize);
    const text = sanitizeText(span.text);
    totalWidth += font.widthOfTextAtSize(text, fontSize);
  }

  return totalWidth;
}
