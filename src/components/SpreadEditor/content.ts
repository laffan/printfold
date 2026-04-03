/**
 * SpreadEditor Content Module
 * Handles rendering of page content (text, images, headings)
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, FontStyle, TextSpan, RichTextLine, FontOptions } from '../../types';
import type { MeasuredSection, LinePosition } from '../../services/textFlow/types';

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

    // Get per-line positions for text displacement (if any)
    const linePositions = measuredSection.linePositions;

    // Use rich lines if available (for paragraphs and blockquotes with inline styling)
    if (richLines && richLines.length > 0) {
      for (let lineIdx = 0; lineIdx < richLines.length; lineIdx++) {
        const richLine = richLines[lineIdx];
        if (currentY > y + height) break;

        // Apply per-line displacement offset if available
        const linePos = linePositions?.[lineIdx];
        const lineX = x + (linePos?.xOffset ?? 0);
        const lineWidth = linePos?.width ?? width;

        // Draw the rich line with all its styled spans
        drawRichLineKonva(
          layer,
          richLine,
          lineX,
          currentY,
          fontStyle,
          project.fontOptions,
          lineWidth,
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

        // Apply per-line displacement offset if available
        const linePos = linePositions?.[lineIndex];
        const lineX = x + (linePos?.xOffset ?? 0);
        const lineWidth = linePos?.width ?? width;

        // Combine fontWeight and fontStyle for Konva
        let combinedFontStyle = '';
        if (fontStyle.fontWeight === 'bold') combinedFontStyle += 'bold';
        if (fontStyle.fontStyle === 'italic') {
          combinedFontStyle += (combinedFontStyle ? ' ' : '') + 'italic';
        }
        if (!combinedFontStyle) combinedFontStyle = 'normal';

        const text = new Konva.Text({
          x: lineX,
          y: currentY,
          text: line,
          fontSize: fontStyle.fontSize,
          fontFamily: fontStyle.fontFamily,
          fontStyle: combinedFontStyle,
          fill: fontStyle.color,
          width: lineWidth,
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
            x: lineX,
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

    // Create text node for this span
    const textNode = new Konva.Text({
      x: currentX,
      y: y,
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
