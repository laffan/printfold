/**
 * Text measurement utilities for the text flow engine
 */

import { measurementCache } from './cache';
import { parseInlineMarkdown, mergeAdjacentSpans, applyTextTransform } from './parsing';
import type { MeasuredSection, PageDimensions } from './types';
import type { DocumentSection, FontStyle, FontOptions, LayoutOptions, TextSpan, RichTextLine } from '../../types';

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
    case 'endnoteHeader':
      return fontOptions[`h${section.level || 2}` as keyof FontOptions] as FontStyle;
    case 'endnote':
      return fontOptions.footnote;
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

  // Apply textTransform before wrapping so width measurements match render
  const transformedContent = applyTextTransform(section.content, fontStyle.textTransform);
  const textLines = transformedContent.split('\n');
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

  // Generate rich text lines for sections that support inline formatting
  let richLines: RichTextLine[] | undefined;
  let finalLines: string[] = wrappedLines;
  let finalLineHeights: number[] = lineHeights;

  if (
    section.type === 'paragraph' ||
    section.type === 'blockquote' ||
    section.type === 'endnote'
  ) {
    richLines = wrapRichText(ctx, section.rawMarkdown, contentWidth, fontStyle, fontOptions);

    // IMPORTANT: Derive lines from richLines to ensure consistent line counts
    // This prevents text from being cropped when paragraphs are split across pages
    if (richLines && richLines.length > 0) {
      finalLines = richLines.map(rl => rl.spans.map(s => s.text).join(''));
      finalLineHeights = richLines.map(() => lineHeight);
    }
  }

  const measuredHeight = spacingBefore + finalLines.length * lineHeight + layoutOptions.paragraphSpacing;

  return {
    ...section,
    measuredHeight,
    lines: finalLines,
    richLines,
    lineHeights: finalLineHeights,
  };
}

/**
 * Get font style for a span, applying bold/italic/code modifiers
 */
export function getSpanFontStyle(baseStyle: FontStyle, span: TextSpan, fontOptions: FontOptions): FontStyle {
  let style = { ...baseStyle };

  // For code spans, use the code font
  if (span.code) {
    style = {
      ...style,
      fontFamily: fontOptions.code.fontFamily,
      fontSize: baseStyle.fontSize * 0.9, // Slightly smaller for inline code
    };
  }

  // Footnote reference markers render as a small superscript.
  if (span.footnoteNumber !== undefined) {
    style = {
      ...style,
      fontSize: baseStyle.fontSize * 0.65,
      fontWeight: 'normal',
      fontStyle: 'normal',
    };
  }

  // Apply bold
  if (span.bold) {
    style.fontWeight = 'bold';
  }

  // Apply italic
  if (span.italic) {
    style.fontStyle = 'italic';
  }

  return style;
}

/**
 * Measure the width of a TextSpan
 */
export function measureSpanWidth(
  ctx: CanvasRenderingContext2D,
  span: TextSpan,
  baseStyle: FontStyle,
  fontOptions: FontOptions
): number {
  const spanStyle = getSpanFontStyle(baseStyle, span, fontOptions);
  return measureTextWidth(ctx, span.text, spanStyle);
}

/**
 * Measure the total width of a RichTextLine
 */
export function measureRichLineWidth(
  ctx: CanvasRenderingContext2D,
  line: RichTextLine,
  baseStyle: FontStyle,
  fontOptions: FontOptions
): number {
  let totalWidth = 0;
  for (const span of line.spans) {
    totalWidth += measureSpanWidth(ctx, span, baseStyle, fontOptions);
  }
  return totalWidth;
}

/**
 * Word with style tracking for rich text wrapping
 */
interface StyledWord {
  text: string;
  span: TextSpan;         // Original span for style info
  trailingSpace: boolean; // Whether this word has trailing whitespace
}

/**
 * Split spans into words while preserving style information
 */
function spansToWords(spans: TextSpan[]): StyledWord[] {
  const words: StyledWord[] = [];

  for (const span of spans) {
    // Split on whitespace but preserve info about trailing spaces
    const parts = span.text.split(/(\s+)/);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        // This is whitespace - mark the previous word as having trailing space
        if (words.length > 0) {
          words[words.length - 1].trailingSpace = true;
        }
      } else {
        // This is a word
        words.push({
          text: part,
          span: { ...span, text: part }, // Copy span with just this word's text
          trailingSpace: false,
        });
      }
    }
  }

  return words;
}

/**
 * Wrap rich text to fit within a width, preserving inline styles
 */
export function wrapRichText(
  ctx: CanvasRenderingContext2D,
  markdown: string,
  maxWidth: number,
  baseStyle: FontStyle,
  fontOptions: FontOptions
): RichTextLine[] {
  // Apply safety margin
  const safeMaxWidth = maxWidth * 0.98;

  // Handle multiline markdown (split on actual newlines first)
  const paragraphs = markdown.split(/\n\n+/);
  const allLines: RichTextLine[] = [];

  for (const paragraph of paragraphs) {
    // Skip empty paragraphs
    if (!paragraph.trim()) continue;

    // Single newlines within a paragraph are treated as hard line breaks
    // (so poetry and other line-sensitive content renders correctly).
    // Each hard-line is parsed and wrapped independently.
    const hardLines = paragraph.split('\n');

    for (const hardLine of hardLines) {
      const trimmed = hardLine.trim();
      if (!trimmed) {
        allLines.push({ spans: [{ text: '' }] });
        continue;
      }

      const spans = parseInlineMarkdown(trimmed);
      if (spans.length === 0) {
        allLines.push({ spans: [{ text: '' }] });
        continue;
      }

      // Apply textTransform to every span before wrapping
      const transformedSpans = baseStyle.textTransform && baseStyle.textTransform !== 'none'
        ? spans.map(s => ({ ...s, text: applyTextTransform(s.text, baseStyle.textTransform) }))
        : spans;

      const wrapped = wrapSpansToLines(ctx, transformedSpans, safeMaxWidth, baseStyle, fontOptions);
      allLines.push(...wrapped);
    }
  }

  return allLines;
}

/**
 * Wrap a sequence of styled spans into width-constrained rich text lines.
 */
function wrapSpansToLines(
  ctx: CanvasRenderingContext2D,
  spans: TextSpan[],
  safeMaxWidth: number,
  baseStyle: FontStyle,
  fontOptions: FontOptions
): RichTextLine[] {
  const words = spansToWords(spans);
  if (words.length === 0) {
    return [{ spans: [{ text: '' }] }];
  }

  const lines: RichTextLine[] = [];
  let currentLineSpans: TextSpan[] = [];
  let currentLineWidth = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordStyle = getSpanFontStyle(baseStyle, word.span, fontOptions);
    const wordWidth = measureTextWidth(ctx, word.text, wordStyle);

    // Calculate width with space if not first word on line
    const addedWidth = currentLineSpans.length > 0
      ? measureTextWidth(ctx, ' ', wordStyle) + wordWidth
      : wordWidth;

    if (currentLineWidth + addedWidth <= safeMaxWidth) {
      // Word fits on current line
      if (currentLineSpans.length > 0) {
        // Add space before word (as part of previous span or new span)
        const lastSpan = currentLineSpans[currentLineSpans.length - 1];
        if (spansHaveSameStyle(lastSpan, word.span)) {
          // Same style, append to last span
          lastSpan.text += ' ' + word.text;
        } else {
          // Different style, add space to last span and new span for word
          lastSpan.text += ' ';
          currentLineSpans.push({ ...word.span });
        }
      } else {
        // First word on line
        currentLineSpans.push({ ...word.span });
      }
      currentLineWidth += addedWidth;
    } else {
      // Word doesn't fit - start new line
      if (currentLineSpans.length > 0) {
        lines.push({ spans: mergeAdjacentSpans(currentLineSpans) });
      }

      // Check if single word is too long
      if (wordWidth > safeMaxWidth) {
        // Break the word character by character
        const brokenLines = breakLongWord(ctx, word, safeMaxWidth, baseStyle, fontOptions);
        for (let j = 0; j < brokenLines.length - 1; j++) {
          lines.push(brokenLines[j]);
        }
        // Last part becomes current line
        if (brokenLines.length > 0) {
          const lastLine = brokenLines[brokenLines.length - 1];
          currentLineSpans = [...lastLine.spans];
          currentLineWidth = measureRichLineWidth(ctx, lastLine, baseStyle, fontOptions);
        } else {
          currentLineSpans = [];
          currentLineWidth = 0;
        }
      } else {
        // Word fits on new line
        currentLineSpans = [{ ...word.span }];
        currentLineWidth = wordWidth;
      }
    }
  }

  // Add final line
  if (currentLineSpans.length > 0) {
    lines.push({ spans: mergeAdjacentSpans(currentLineSpans) });
  }

  return lines;
}

/**
 * Check if two spans have the same styling
 */
function spansHaveSameStyle(a: TextSpan, b: TextSpan): boolean {
  // Footnote-marker spans must never merge with their neighbours — the
  // footnoteNumber and the smaller superscript size are span-specific.
  if (a.footnoteNumber !== undefined || b.footnoteNumber !== undefined) return false;
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.strikethrough === b.strikethrough &&
    a.highlight === b.highlight &&
    a.link === b.link
  );
}

/**
 * Break a long word into multiple lines
 */
function breakLongWord(
  ctx: CanvasRenderingContext2D,
  word: StyledWord,
  maxWidth: number,
  baseStyle: FontStyle,
  fontOptions: FontOptions
): RichTextLine[] {
  const lines: RichTextLine[] = [];
  const chars = word.text.split('');
  const spanStyle = getSpanFontStyle(baseStyle, word.span, fontOptions);
  let currentText = '';

  for (const char of chars) {
    const testText = currentText + char;
    const testWidth = measureTextWidth(ctx, testText, spanStyle);

    if (testWidth <= maxWidth) {
      currentText = testText;
    } else {
      if (currentText) {
        lines.push({ spans: [{ ...word.span, text: currentText }] });
      }
      currentText = char;
    }
  }

  if (currentText) {
    lines.push({ spans: [{ ...word.span, text: currentText }] });
  }

  return lines;
}
