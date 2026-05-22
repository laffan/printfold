/**
 * SpreadEditor Content Module
 * Handles rendering of page content (text, images, headings)
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, FontStyle, TextSpan, RichTextLine, FontOptions, FootnoteDefinition } from '../../types';
import type { MeasuredSection } from '../../services/textFlow/types';
import {
  FOOTNOTE_RULE_GAP,
  FOOTNOTE_RULE_THICKNESS,
  FOOTNOTE_RULE_WIDTH_RATIO,
} from '../../services/textFlow/footnotes';

/**
 * Draw page content (text sections, images, headings)
 */
export function drawPageContent(
  page: PageContent,
  x: number,
  y: number,
  width: number,
  height: number,
  layer: Konva.Layer
): void {
  const project = appState.getProject();
  let currentY = y;

  for (const section of page.sections) {
    const fontStyle = getFontStyleForSection(section.type, section.level);
    const lineHeight = project.layoutOptions.lineHeight * fontStyle.fontSize;

    // Add spacing before headings
    if (section.type === 'heading') {
      switch (section.level) {
        case 1:
          currentY += project.layoutOptions.spacingAboveH1;
          break;
        case 2:
          currentY += project.layoutOptions.spacingAboveH2;
          break;
        case 3:
          currentY += project.layoutOptions.spacingAboveH3;
          break;
      }
    }

    // Handle image placeholders
    if (section.type === 'image') {
      const imageFile = section.imageRef ? appState.getImageByName(section.imageRef) : null;

      if (imageFile) {
        const imgX = x;
        const imgY = currentY;
        const maxImgWidth = width; // Full content width

        // Create placeholder while image loads
        const placeholder = new Konva.Rect({
          x: imgX,
          y: imgY,
          width: maxImgWidth,
          height: 100,
          fill: '#f8f8f8',
          stroke: '#ddd',
          strokeWidth: 1,
        });
        layer.add(placeholder);

        // Load and display image asynchronously with correct aspect ratio
        const img = new window.Image();
        img.onload = () => {
          placeholder.destroy();

          // Calculate size: full width, auto height maintaining aspect ratio
          const aspectRatio = img.width / img.height;
          const displayWidth = maxImgWidth;
          const displayHeight = displayWidth / aspectRatio;

          const konvaImage = new Konva.Image({
            x: imgX,
            y: imgY,
            width: displayWidth,
            height: displayHeight,
            image: img,
          });
          layer.add(konvaImage);

          // Add caption if present
          if (section.content && section.content.trim()) {
            const captionText = new Konva.Text({
              x: imgX,
              y: imgY + displayHeight + 4,
              text: section.content,
              fontSize: 9,
              fontStyle: 'italic',
              fill: '#666666',
              width: displayWidth,
              align: 'center',
            });
            layer.add(captionText);
          }

          layer.draw();
        };
        img.src = `data:image/png;base64,${imageFile.content}`;

        currentY += 120; // Will be adjusted when image loads
      } else {
        // Draw placeholder
        const placeholder = new Konva.Rect({
          x,
          y: currentY,
          width: Math.min(width, 200),
          height: 100,
          fill: '#f0f0f0',
          stroke: '#cccccc',
          strokeWidth: 1,
          dash: [4, 4],
        });
        layer.add(placeholder);

        const placeholderText = new Konva.Text({
          x: x + 10,
          y: currentY + 40,
          text: `Image not uploaded: ${section.imageRef || 'unknown'}`,
          fontSize: 10,
          fill: '#999999',
          width: Math.min(width, 200) - 20,
          wrap: 'word',
          align: 'center',
        });
        layer.add(placeholderText);
        currentY += 110;
      }
      continue;
    }

    // Draw text content
    const measuredSection = section as MeasuredSection;
    const lines = measuredSection.lines || [section.content];
    const richLines = measuredSection.richLines;
    // Use per-element textAlign if set, otherwise fall back to layoutOptions
    const textAlign = fontStyle.textAlign || project.layoutOptions.textAlign;

    // Use rich lines if available (for paragraphs and blockquotes with inline styling)
    if (richLines && richLines.length > 0) {
      for (const richLine of richLines) {
        if (currentY > y + height) break;

        // Draw the rich line with all its styled spans
        drawRichLineKonva(
          layer,
          richLine,
          x,
          currentY,
          fontStyle,
          project.fontOptions,
          width,
          lineHeight,
          textAlign
        );

        currentY += lineHeight;
      }
    } else {
      // Fallback to plain text rendering
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (currentY > y + height) break;

        // Combine fontWeight and fontStyle for Konva
        let combinedFontStyle = '';
        if (fontStyle.fontWeight === 'bold') combinedFontStyle += 'bold';
        if (fontStyle.fontStyle === 'italic') {
          combinedFontStyle += (combinedFontStyle ? ' ' : '') + 'italic';
        }
        if (!combinedFontStyle) combinedFontStyle = 'normal';

        const text = new Konva.Text({
          x,
          y: currentY,
          text: line,
          fontSize: fontStyle.fontSize,
          fontFamily: fontStyle.fontFamily,
          fontStyle: combinedFontStyle,
          fill: fontStyle.color,
          width,
          // For justify, we need wrap enabled; for left align, disable wrap to use pre-wrapped lines
          wrap: textAlign === 'justify' ? 'word' : 'none',
          align: textAlign,
          ellipsis: textAlign !== 'justify',
          textDecoration: fontStyle.textDecoration || '',
        });

        // Draw inline background color (highlight) if set
        if (fontStyle.backgroundColor && fontStyle.backgroundColor !== '#ffffff') {
          const textWidth = text.width();
          const textHeight = lineHeight;
          const bgRect = new Konva.Rect({
            x,
            y: currentY,
            width: textWidth,
            height: textHeight,
            fill: fontStyle.backgroundColor,
          });
          layer.add(bgRect);
        }

        layer.add(text);
        currentY += lineHeight;
      }
    }

    // Add paragraph spacing
    currentY += project.layoutOptions.paragraphSpacing;
  }

  // Draw footnote block at the bottom of the content area (above the
  // bottom margin). Pagination already shrank the effective content area
  // to leave room for it.
  if (page.footnotes && page.footnotes.length > 0) {
    drawFootnoteBlock(page.footnotes, x, y, width, height, layer);
  }
}

/**
 * Draw the footnote block at the bottom of a page: a short separator rule
 * followed by each footnote rendered with the `footnote` FontStyle.
 */
function drawFootnoteBlock(
  footnotes: FootnoteDefinition[],
  x: number,
  y: number,
  width: number,
  height: number,
  layer: Konva.Layer,
): void {
  const project = appState.getProject();
  const style = project.fontOptions.footnote;
  const lineHeight = (style.lineHeight ?? project.layoutOptions.lineHeight) * style.fontSize;

  // Estimate total block height the same way the pagination reservation
  // did, then anchor the block flush against the bottom of the content area.
  let totalLines = 0;
  for (const f of footnotes) {
    const lines = estimateLineCount(`${f.number}. ${f.content}`, width, style);
    totalLines += lines;
  }
  const ruleSpace = FOOTNOTE_RULE_GAP + FOOTNOTE_RULE_THICKNESS + FOOTNOTE_RULE_GAP;
  const blockHeight = ruleSpace + totalLines * lineHeight;

  let currentY = y + height - blockHeight;

  // Separator rule (~30% of content width).
  const rule = new Konva.Line({
    points: [x, currentY + FOOTNOTE_RULE_GAP, x + width * FOOTNOTE_RULE_WIDTH_RATIO, currentY + FOOTNOTE_RULE_GAP],
    stroke: style.color || '#000000',
    strokeWidth: FOOTNOTE_RULE_THICKNESS,
    listening: false,
  });
  layer.add(rule);
  currentY += ruleSpace;

  // One footnote per loop; each may wrap across multiple lines.
  for (const f of footnotes) {
    const text = `${f.number}. ${f.content}`;
    const wrapped = wrapPlainToWidth(text, width, style);
    for (const line of wrapped) {
      drawSimpleSpan(layer, { text: line }, x, currentY, style);
      currentY += lineHeight;
    }
  }
}

function drawSimpleSpan(
  layer: Konva.Layer,
  span: TextSpan,
  x: number,
  y: number,
  style: FontStyle,
): void {
  let combined = '';
  if (style.fontWeight === 'bold') combined += 'bold';
  if (style.fontStyle === 'italic') combined += (combined ? ' ' : '') + 'italic';
  if (!combined) combined = 'normal';
  const text = new Konva.Text({
    x,
    y,
    text: span.text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    fontStyle: combined,
    fill: style.color,
    listening: false,
  });
  layer.add(text);
}

function estimateLineCount(text: string, contentWidth: number, style: FontStyle): number {
  return wrapPlainToWidth(text, contentWidth, style).length;
}

function wrapPlainToWidth(text: string, contentWidth: number, style: FontStyle): string[] {
  // Light wrapping helper used only for footnote bodies — uses an offscreen
  // canvas so the result matches the rest of the layout engine.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [text];
  const safe = contentWidth * 0.98;
  const quoted = style.fontFamily.includes(' ') ? `"${style.fontFamily}"` : style.fontFamily;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${quoted}`;
  const out: string[] = [];
  for (const hard of text.split('\n')) {
    const words = hard.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (ctx.measureText(cand).width <= safe) {
        line = cand;
      } else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

/**
 * Get font style for a specific section type
 */
export function getFontStyleForSection(type: string, level?: number): FontStyle {
  const project = appState.getProject();
  const fonts = project.fontOptions;

  switch (type) {
    case 'heading':
      return fonts[`h${level || 1}` as keyof typeof fonts] as FontStyle;
    case 'code':
      return fonts.code;
    case 'blockquote':
      return fonts.blockquote;
    case 'endnoteHeader':
      return fonts[`h${level || 2}` as keyof typeof fonts] as FontStyle;
    case 'endnote':
      return fonts.footnote;
    default:
      return fonts.body;
  }
}

/**
 * Get Konva font style string for a span
 */
function getSpanFontStyle(baseStyle: FontStyle, span: TextSpan): string {
  let isBold = baseStyle.fontWeight === 'bold';
  let isItalic = baseStyle.fontStyle === 'italic';

  if (span.bold) isBold = true;
  if (span.italic) isItalic = true;

  let style = '';
  if (isBold) style += 'bold';
  if (isItalic) style += (style ? ' ' : '') + 'italic';
  return style || 'normal';
}

/**
 * Get font family for a span
 */
function getSpanFontFamily(baseStyle: FontStyle, span: TextSpan, fontOptions: FontOptions): string {
  if (span.code) {
    return fontOptions.code.fontFamily;
  }
  return baseStyle.fontFamily;
}

/**
 * Get font size for a span
 */
function getSpanFontSize(baseFontSize: number, span: TextSpan): number {
  if (span.footnoteNumber !== undefined) {
    return baseFontSize * 0.65;
  }
  if (span.code) {
    return baseFontSize * 0.9;
  }
  return baseFontSize;
}

/**
 * Draw a rich text line using multiple Konva.Text nodes
 */
function drawRichLineKonva(
  layer: Konva.Layer,
  line: RichTextLine,
  x: number,
  y: number,
  baseStyle: FontStyle,
  fontOptions: FontOptions,
  contentWidth: number,
  lineHeight: number,
  textAlign: string | undefined
): void {
  // First pass: measure total width for alignment
  let totalWidth = 0;
  const spanWidths: number[] = [];

  for (const span of line.spans) {
    const fontFamily = getSpanFontFamily(baseStyle, span, fontOptions);
    const fontSize = getSpanFontSize(baseStyle.fontSize, span);
    const fontStyle = getSpanFontStyle(baseStyle, span);

    // Create temporary text node to measure
    const tempText = new Konva.Text({
      text: span.text,
      fontSize,
      fontFamily,
      fontStyle,
    });
    const spanWidth = tempText.width();
    spanWidths.push(spanWidth);
    totalWidth += spanWidth;
    tempText.destroy();
  }

  // Calculate starting x based on alignment
  let currentX = x;
  if (textAlign === 'center') {
    currentX = x + (contentWidth - totalWidth) / 2;
  } else if (textAlign === 'right') {
    currentX = x + contentWidth - totalWidth;
  }

  // Second pass: draw each span
  for (let i = 0; i < line.spans.length; i++) {
    const span = line.spans[i];
    const fontFamily = getSpanFontFamily(baseStyle, span, fontOptions);
    const fontSize = getSpanFontSize(baseStyle.fontSize, span);
    const fontStyleStr = getSpanFontStyle(baseStyle, span);
    const spanWidth = spanWidths[i];

    // Draw highlight background if needed
    if (span.highlight && fontOptions.highlight) {
      const bgRect = new Konva.Rect({
        x: currentX,
        y: y,
        width: spanWidth,
        height: lineHeight,
        fill: fontOptions.highlight.backgroundColor,
        listening: false,
      });
      layer.add(bgRect);
    }

    // Determine text decoration
    let textDecoration = '';
    if (span.strikethrough) {
      textDecoration = 'line-through';
    }

    // Footnote-reference markers render raised so they read as
    // superscript. Other spans stay on the baseline.
    const yOffset = span.footnoteNumber !== undefined
      ? -baseStyle.fontSize * 0.35
      : 0;

    // Create text node for this span
    const textNode = new Konva.Text({
      x: currentX,
      y: y + yOffset,
      text: span.text,
      fontSize,
      fontFamily,
      fontStyle: fontStyleStr,
      fill: span.highlight && fontOptions.highlight
        ? fontOptions.highlight.textColor
        : baseStyle.color,
      textDecoration,
      listening: false, // Don't intercept mouse events
    });

    layer.add(textNode);
    currentX += spanWidth;
  }
}
