/**
 * Page item drawing utilities for PDF generation
 */

import { rgb, degrees } from 'pdf-lib';
import type { PDFPage, PDFImage } from 'pdf-lib';
import type { PageItem, TextPageItem, ShapePageItem, ImagePageItem, TextFlowPageItem, SpanningItem, FontOptions, LayoutOptions } from '../../types';
import type { FontCache, ImageCacheType } from './types';
import type { MeasuredSection } from '../textFlow/types';
import { parseColor, getFillColorFromConfig } from './colors';
import { getTextItemFont, getFontStyleForSection, getFont } from './fonts';
import { sanitizeText, drawRichLine } from './textUtils';
import { applyTextTransform } from '../textFlow';

/**
 * Draw the flowed content inside a text-flow page item.
 * `itemPdfY` is the bottom of the item in PDF coordinates (y-up).
 */
export function drawTextFlowItem(
  pdfPage: PDFPage,
  item: TextFlowPageItem,
  pageX: number,
  itemPdfY: number,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions,
  fontCache: FontCache
): void {
  if (item.flowShape === 'polygon') {
    drawPolygonFlowItem(pdfPage, item, pageX, itemPdfY, fontOptions, fontCache);
    return;
  }

  const sections = (item.flowedSections as MeasuredSection[] | undefined) || [];
  if (sections.length === 0) return;

  const padding = item.padding ?? 0;
  const contentX = pageX + item.x + padding;
  const contentTopY = itemPdfY + item.height - padding; // PDF y of top of content area
  const contentBottomY = itemPdfY + padding;
  const contentWidth = Math.max(0, item.width - padding * 2);

  let currentY = contentTopY;

  for (const section of sections) {
    const fontStyle = getFontStyleForSection(section.type, section.level, fontOptions);
    const font = getFont(fontStyle, fontCache);
    const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

    if (section.type === 'heading') {
      switch (section.level) {
        case 1: currentY -= layoutOptions.spacingAboveH1; break;
        case 2: currentY -= layoutOptions.spacingAboveH2; break;
        case 3: currentY -= layoutOptions.spacingAboveH3; break;
      }
    }

    const lines = section.lines || [section.content];
    const richLines = section.richLines;
    const textAlign = fontStyle.textAlign || layoutOptions.textAlign || 'left';

    if (richLines && richLines.length > 0) {
      for (const richLine of richLines) {
        if (currentY < contentBottomY) break;
        drawRichLine(
          pdfPage,
          richLine,
          contentX,
          currentY - fontStyle.fontSize,
          fontStyle,
          fontOptions,
          fontCache,
          contentWidth,
          textAlign
        );
        currentY -= lineHeight;
      }
    } else {
      for (const line of lines) {
        if (currentY < contentBottomY) break;
        const sanitized = sanitizeText(line);
        const textWidth = font.widthOfTextAtSize(sanitized, fontStyle.fontSize);
        let lineX = contentX;
        if (textAlign === 'center') {
          lineX = contentX + (contentWidth - textWidth) / 2;
        } else if (textAlign === 'right') {
          lineX = contentX + contentWidth - textWidth;
        }
        pdfPage.drawText(sanitized, {
          x: lineX,
          y: currentY - fontStyle.fontSize,
          size: fontStyle.fontSize,
          font,
          color: parseColor(fontStyle.color),
        });
        currentY -= lineHeight;
      }
    }
    currentY -= layoutOptions.paragraphSpacing;
  }
}

/**
 * Convert a SpanningItem to a PageItem for rendering
 */
export function spanningItemToPageItem(item: SpanningItem): PageItem | null {
  if (item.type === 'text') {
    return {
      ...item,
      type: 'text',
      content: item.content || '',
      fontFamily: item.fontFamily || 'Arial',
      fontSize: item.fontSize || 16,
      fontWeight: item.fontWeight || 'normal',
      fontStyle: item.fontStyle || 'normal',
      color: item.color || '#000000',
      textAlign: item.textAlign || 'left',
    } as TextPageItem;
  } else if (item.type === 'shape') {
    return {
      ...item,
      type: 'shape',
      shapeType: item.shapeType || 'rectangle',
      fill: item.fill,
      fillColor: item.fillColor,
      strokeColor: item.strokeColor,
      strokeWidth: item.strokeWidth,
    } as ShapePageItem;
  } else if (item.type === 'image') {
    return {
      ...item,
      type: 'image',
      imageFileId: item.imageFileId || '',
    } as ImagePageItem;
  }
  return null;
}

/**
 * Draw a polygon-shaped text-flow item: render each pre-positioned line at
 * its computed (x, y) in item-local coordinates.
 */
function drawPolygonFlowItem(
  pdfPage: PDFPage,
  item: TextFlowPageItem,
  pageX: number,
  itemPdfY: number,
  fontOptions: FontOptions,
  fontCache: FontCache
): void {
  const lines = item.flowedPolygonLines || [];
  if (lines.length === 0) return;

  for (const line of lines) {
    const fontStyle = getFontStyleForSection(line.sectionType, line.sectionLevel, fontOptions);
    const font = getFont(fontStyle, fontCache);
    // PDF y is bottom-up. itemPdfY is item bottom; item.height - line.y is
    // distance from item bottom up to the top of the line; subtract fontSize
    // to land on the baseline (pdf-lib draws from baseline upward).
    const baselineY = itemPdfY + (item.height - line.y) - fontStyle.fontSize;
    pdfPage.drawText(sanitizeText(line.text), {
      x: pageX + item.x + line.x,
      y: baselineY,
      size: fontStyle.fontSize,
      font,
      color: parseColor(fontStyle.color),
    });
  }
}

/**
 * Draw page items with clipping and offset support for cross-page items
 */
export function drawPageItemsClipped(
  pdfPage: PDFPage,
  items: PageItem[],
  pageX: number,
  pageY: number,
  pageWidth: number,
  pageHeight: number,
  itemOffsetX: number,
  clipWidth: number,
  fontCache: FontCache,
  imageCache: ImageCacheType,
  fontOptions?: FontOptions,
  layoutOptions?: LayoutOptions
): void {
  for (const item of items) {
    const adjustedX = item.x + itemOffsetX;

    // Skip if completely outside the clip region
    if (adjustedX + item.width <= 0 || adjustedX >= clipWidth) continue;

    // Calculate visible portion
    const visibleLeft = Math.max(0, adjustedX);
    const visibleRight = Math.min(clipWidth, adjustedX + item.width);
    const visibleWidth = visibleRight - visibleLeft;

    if (visibleWidth <= 0) continue;

    const opacity = item.opacity ?? 1;
    const itemPdfY = pageY + pageHeight - item.y - item.height;

    if (item.type === 'text') {
      const textItem = item as TextPageItem;
      const font = getTextItemFont(textItem, fontCache);
      const color = parseColor(textItem.color);
      const textY = itemPdfY + item.height - textItem.fontSize;

      pdfPage.drawText(sanitizeText(applyTextTransform(textItem.content, textItem.textTransform)), {
        x: pageX + adjustedX,
        y: textY,
        size: textItem.fontSize,
        font,
        color,
        opacity,
      });
    } else if (item.type === 'shape') {
      const shapeItem = item as ShapePageItem;
      const fillColor = getFillColorFromConfig(shapeItem.fill, shapeItem.fillColor);
      const strokeColor = shapeItem.strokeColor ? parseColor(shapeItem.strokeColor) : rgb(0, 0, 0);
      const strokeWidth = shapeItem.strokeWidth ?? 1;

      if (shapeItem.shapeType === 'rectangle') {
        pdfPage.drawRectangle({
          x: pageX + visibleLeft,
          y: itemPdfY,
          width: visibleWidth,
          height: item.height,
          color: fillColor,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          opacity,
        });
      } else if (shapeItem.shapeType === 'ellipse' || shapeItem.shapeType === 'circle') {
        // Draw circles/ellipses - pdf-lib clipping in PDFGenerator handles partial visibility
        // No need for center-based skip since clipping is now applied at the page level
        const centerX = pageX + adjustedX + item.width / 2;
        const centerY = itemPdfY + item.height / 2;

        if (shapeItem.shapeType === 'circle') {
          const radius = Math.min(item.width, item.height) / 2;
          pdfPage.drawCircle({
            x: centerX,
            y: centerY,
            size: radius,
            color: fillColor,
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            opacity,
          });
        } else {
          pdfPage.drawEllipse({
            x: centerX,
            y: centerY,
            xScale: item.width / 2,
            yScale: item.height / 2,
            color: fillColor,
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            opacity,
          });
        }
      } else if (shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow') {
        pdfPage.drawLine({
          start: { x: pageX + adjustedX, y: itemPdfY + item.height },
          end: { x: pageX + adjustedX + item.width, y: itemPdfY },
          color: strokeColor,
          thickness: strokeWidth,
          opacity,
        });
      }
    } else if (item.type === 'image') {
      const imageItem = item as ImagePageItem;
      const pdfImage = imageCache.get(imageItem.imageFileId);
      if (pdfImage) {
        pdfPage.drawImage(pdfImage, {
          x: pageX + visibleLeft,
          y: itemPdfY,
          width: visibleWidth,
          height: item.height,
          opacity,
        });
      }
    } else if (item.type === 'textFlow') {
      if (fontOptions && layoutOptions) {
        drawTextFlowItem(pdfPage, item as TextFlowPageItem, pageX + itemOffsetX, itemPdfY, fontOptions, layoutOptions, fontCache);
      }
    }
  }
}

/**
 * Draw page items (shapes, text) on a static/blank page
 */
export function drawPageItems(
  pdfPage: PDFPage,
  items: PageItem[],
  pageX: number,
  pageY: number,
  pageWidth: number,
  pageHeight: number,
  fontCache: FontCache,
  imageCache: ImageCacheType
): void {
  for (const item of items) {
    const opacity = item.opacity ?? 1;
    const itemPdfY = pageY + pageHeight - item.y - item.height;

    if (item.type === 'text') {
      const textItem = item as TextPageItem;
      const font = getTextItemFont(textItem, fontCache);
      const color = parseColor(textItem.color);
      const textY = itemPdfY + item.height - textItem.fontSize;

      pdfPage.drawText(sanitizeText(applyTextTransform(textItem.content, textItem.textTransform)), {
        x: pageX + item.x,
        y: textY,
        size: textItem.fontSize,
        font,
        color,
        opacity,
      });
    } else if (item.type === 'shape') {
      const shapeItem = item as ShapePageItem;
      const fillColor = getFillColorFromConfig(shapeItem.fill, shapeItem.fillColor);
      const strokeColor = shapeItem.strokeColor ? parseColor(shapeItem.strokeColor) : rgb(0, 0, 0);
      const strokeWidth = shapeItem.strokeWidth ?? 1;

      if (shapeItem.shapeType === 'rectangle') {
        pdfPage.drawRectangle({
          x: pageX + item.x,
          y: itemPdfY,
          width: item.width,
          height: item.height,
          color: fillColor,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          opacity,
          rotate: item.rotation ? degrees(item.rotation) : undefined,
        });
      } else if (shapeItem.shapeType === 'ellipse') {
        const centerX = pageX + item.x + item.width / 2;
        const centerY = itemPdfY + item.height / 2;

        pdfPage.drawEllipse({
          x: centerX,
          y: centerY,
          xScale: item.width / 2,
          yScale: item.height / 2,
          color: fillColor,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          opacity,
        });
      } else if (shapeItem.shapeType === 'circle') {
        const radius = Math.min(item.width, item.height) / 2;
        const centerX = pageX + item.x + radius;
        const centerY = itemPdfY + radius;

        pdfPage.drawCircle({
          x: centerX,
          y: centerY,
          size: radius,
          color: fillColor,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          opacity,
        });
      } else if (shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow') {
        const startX = pageX + item.x;
        const startY = itemPdfY + item.height / 2;
        const endX = startX + item.width;
        const endY = startY;

        pdfPage.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness: strokeWidth,
          color: strokeColor,
          opacity,
        });

        if (shapeItem.shapeType === 'arrow') {
          const arrowSize = 8;
          pdfPage.drawLine({
            start: { x: endX, y: endY },
            end: { x: endX - arrowSize, y: endY + arrowSize / 2 },
            thickness: strokeWidth,
            color: strokeColor,
            opacity,
          });
          pdfPage.drawLine({
            start: { x: endX, y: endY },
            end: { x: endX - arrowSize, y: endY - arrowSize / 2 },
            thickness: strokeWidth,
            color: strokeColor,
            opacity,
          });
        }
      }
    } else if (item.type === 'image') {
      const imageItem = item as ImagePageItem;
      const pdfImage = imageCache.get(imageItem.imageFileId);

      if (pdfImage) {
        pdfPage.drawImage(pdfImage, {
          x: pageX + item.x,
          y: itemPdfY,
          width: item.width,
          height: item.height,
          opacity,
          rotate: item.rotation ? degrees(item.rotation) : undefined,
        });
      }
    }
  }
}
