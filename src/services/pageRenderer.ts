/**
 * Page Renderer Service
 * Renders static page items to canvas for high-fidelity PDF export
 */

import Konva from 'konva';
import { appState } from './state';
import { calculateArrayPositions, getTotalArrayInstances } from '../components/SpreadEditor/items/arrayItems';
import { applyTextTransform } from './textFlow';
import type { PageContent, PageItem, TextPageItem, ShapePageItem, ImagePageItem, TextFlowPageItem, FillConfig, FontStyle, RichTextLine, TextSpan } from '../types';
import type { MeasuredSection } from './textFlow/types';
import { buildPolygonPath } from './textFlow/polygonPath';

// Target DPI for print-quality rendering
const PRINT_DPI = 300;
const SCREEN_DPI = 72;
const SCALE_FACTOR = PRINT_DPI / SCREEN_DPI;

/**
 * Apply shadow properties to a Konva node
 */
function applyItemShadow(node: Konva.Shape | Konva.Text | Konva.Image, item: PageItem, scale: number): void {
  if (item.hasShadow) {
    node.shadowEnabled(true);
    node.shadowColor(item.shadowColor || '#000000');
    node.shadowBlur((item.shadowBlur ?? 5) * scale);
    node.shadowOffsetX((item.shadowOffsetX ?? 3) * scale);
    node.shadowOffsetY((item.shadowOffsetY ?? 3) * scale);
    node.shadowOpacity(item.shadowOpacity ?? 0.5);
  }
}

/**
 * Clear all fill-related properties from a shape
 * This ensures switching between fill types doesn't leave stale gradient/pattern data
 */
function clearFillProperties(shape: Konva.Shape): void {
  // Clear solid fill
  shape.fill('');

  // Clear linear gradient properties
  shape.fillLinearGradientStartPoint({ x: 0, y: 0 });
  shape.fillLinearGradientEndPoint({ x: 0, y: 0 });
  shape.fillLinearGradientColorStops([]);

  // Clear radial gradient properties
  shape.fillRadialGradientStartPoint({ x: 0, y: 0 });
  shape.fillRadialGradientEndPoint({ x: 0, y: 0 });
  shape.fillRadialGradientStartRadius(0);
  shape.fillRadialGradientEndRadius(0);
  shape.fillRadialGradientColorStops([]);

  // Clear pattern properties
  shape.fillPatternImage(undefined as unknown as HTMLImageElement);
}

/**
 * Apply fill config to a Konva shape (mirrors SpreadEditor/items.ts logic)
 */
function applyFillToShape(
  shape: Konva.Shape,
  fill: FillConfig | undefined,
  fallbackColor: string | undefined,
  width: number,
  height: number,
  imageLoadPromises: Promise<void>[]
): void {
  // Clear any previous fill properties first
  clearFillProperties(shape);

  if (!fill) {
    shape.fill(fallbackColor || 'transparent');
    return;
  }

  if (fill.type === 'color') {
    shape.fill(fill.color || 'transparent');
  } else if (fill.type === 'linearGradient' && fill.linearGradient) {
    const angle = (fill.linearGradient.angle * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const cx = width / 2;
    const cy = height / 2;
    const length = Math.sqrt(width * width + height * height) / 2;

    const startX = cx - cos * length;
    const startY = cy - sin * length;
    const endX = cx + cos * length;
    const endY = cy + sin * length;

    const colorStops: Array<number | string> = [];
    for (const stop of fill.linearGradient.stops) {
      colorStops.push(stop.offset);
      colorStops.push(stop.color);
    }

    shape.fillLinearGradientStartPoint({ x: startX, y: startY });
    shape.fillLinearGradientEndPoint({ x: endX, y: endY });
    shape.fillLinearGradientColorStops(colorStops);
  } else if (fill.type === 'radialGradient' && fill.radialGradient) {
    const cx = fill.radialGradient.centerX * width;
    const cy = fill.radialGradient.centerY * height;
    const radius = fill.radialGradient.radius * Math.max(width, height);

    const colorStops: Array<number | string> = [];
    for (const stop of fill.radialGradient.stops) {
      colorStops.push(stop.offset);
      colorStops.push(stop.color);
    }

    shape.fillRadialGradientStartPoint({ x: cx, y: cy });
    shape.fillRadialGradientEndPoint({ x: cx, y: cy });
    shape.fillRadialGradientStartRadius(0);
    shape.fillRadialGradientEndRadius(radius);
    shape.fillRadialGradientColorStops(colorStops);
  } else if (fill.type === 'pattern' && fill.pattern?.imageFileId) {
    const file = appState.getProject().files.find(f => f.id === fill.pattern?.imageFileId);
    if (file) {
      const loadPromise = new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          shape.fillPatternImage(img);
          shape.fillPatternRepeat(fill.pattern?.repeat || 'repeat');
          shape.fillPatternScale({ x: fill.pattern?.scale || 1, y: fill.pattern?.scale || 1 });
          shape.fillPatternOffset({ x: fill.pattern?.offsetX || 0, y: fill.pattern?.offsetY || 0 });
          shape.fillPatternRotation(fill.pattern?.rotation || 0);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = `data:image/png;base64,${file.content}`;
      });
      imageLoadPromises.push(loadPromise);
    }
  }
}

/**
 * Create a Konva node for a page item (simplified version for rendering only)
 */
function createRenderNode(
  item: PageItem,
  xOffset: number,
  scale: number,
  imageLoadPromises: Promise<void>[]
): Konva.Shape | Konva.Text | Konva.Image | null {
  const opacity = item.opacity ?? 1;
  const x = (xOffset + item.x) * scale;
  const y = item.y * scale;
  const width = item.width * scale;
  const height = item.height * scale;

  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    const isLinear = shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow';
    const hasFill = shapeItem.hasFill ?? !isLinear;
    const hasStroke = shapeItem.hasStroke ?? true;
    const strokeProps = hasStroke ? {
      stroke: shapeItem.strokeColor || '#000000',
      strokeWidth: (shapeItem.strokeWidth || 1) * scale,
    } : {};

    if (shapeItem.shapeType === 'rectangle') {
      const rect = new Konva.Rect({
        x,
        y,
        width,
        height,
        ...strokeProps,
        rotation: item.rotation || 0,
        opacity,
      });
      if (hasFill) {
        applyFillToShape(rect, shapeItem.fill, shapeItem.fillColor, width, height, imageLoadPromises);
      }
      return rect;
    } else if (shapeItem.shapeType === 'ellipse') {
      const ellipse = new Konva.Ellipse({
        x: x + width / 2,
        y: y + height / 2,
        radiusX: width / 2,
        radiusY: height / 2,
        ...strokeProps,
        rotation: item.rotation || 0,
        opacity,
      });
      if (hasFill) {
        applyFillToShape(ellipse, shapeItem.fill, shapeItem.fillColor, width, height, imageLoadPromises);
      }
      return ellipse;
    } else if (shapeItem.shapeType === 'circle') {
      const radius = Math.min(width, height) / 2;
      const circle = new Konva.Circle({
        x: x + radius,
        y: y + radius,
        radius,
        ...strokeProps,
        rotation: item.rotation || 0,
        opacity,
      });
      if (hasFill) {
        applyFillToShape(circle, shapeItem.fill, shapeItem.fillColor, radius * 2, radius * 2, imageLoadPromises);
      }
      return circle;
    } else if (shapeItem.shapeType === 'line') {
      return new Konva.Line({
        points: [x, y, x + width, y + height],
        stroke: hasStroke ? (shapeItem.strokeColor || '#000000') : undefined,
        strokeWidth: hasStroke ? (shapeItem.strokeWidth || 2) * scale : 0,
        opacity,
      });
    } else if (shapeItem.shapeType === 'arrow') {
      return new Konva.Arrow({
        points: [x, y, x + width, y + height],
        stroke: hasStroke ? (shapeItem.strokeColor || '#000000') : undefined,
        strokeWidth: hasStroke ? (shapeItem.strokeWidth || 2) * scale : 0,
        pointerLength: 10 * scale,
        pointerWidth: 10 * scale,
        opacity,
      });
    }
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    const hasFill = textItem.hasFill ?? true;
    const hasStroke = textItem.hasStroke ?? false;

    const textNode = new Konva.Text({
      x,
      y,
      width,
      height,
      text: applyTextTransform(textItem.content, textItem.textTransform),
      fontSize: textItem.fontSize * scale,
      fontFamily: textItem.fontFamily,
      fontStyle: textItem.fontStyle === 'italic' ? 'italic' : 'normal',
      fontVariant: textItem.fontWeight === 'bold' ? 'bold' : 'normal',
      align: textItem.textAlign || 'left',
      rotation: item.rotation || 0,
      opacity,
    });

    // Apply fill if enabled, otherwise make transparent
    if (hasFill) {
      applyFillToShape(textNode, textItem.fill, textItem.color, width, height, imageLoadPromises);
    } else {
      textNode.fill('transparent');
    }

    // Apply stroke if enabled
    if (hasStroke) {
      textNode.stroke(textItem.strokeColor || '#000000');
      textNode.strokeWidth((textItem.strokeWidth || 1) * scale);
    }

    return textNode;
  } else if (item.type === 'image') {
    const imageItem = item as ImagePageItem;
    const file = appState.getProject().files.find(f => f.id === imageItem.imageFileId);
    if (file) {
      // Create a placeholder node that will be updated when image loads
      const konvaImage = new Konva.Image({
        x,
        y,
        width,
        height,
        rotation: item.rotation || 0,
        opacity,
        image: undefined,
      } as Konva.ImageConfig);

      const loadPromise = new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          konvaImage.image(img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = `data:image/${file.name.endsWith('.png') ? 'png' : 'jpeg'};base64,${file.content}`;
      });
      imageLoadPromises.push(loadPromise);
      return konvaImage;
    }
  }

  return null;
}

/**
 * Get font style for a section type based on project font options
 */
function getFontStyleForSection(
  sectionType: string,
  level: number | undefined,
  fontOptions: ReturnType<typeof appState.getProject>['fontOptions']
): FontStyle {
  if (sectionType === 'heading' && level !== undefined) {
    switch (level) {
      case 1: return fontOptions.h1;
      case 2: return fontOptions.h2;
      case 3: return fontOptions.h3;
      case 4: return fontOptions.h4;
      case 5: return fontOptions.h5;
      case 6: return fontOptions.h6;
      default: return fontOptions.body;
    }
  } else if (sectionType === 'code') {
    return fontOptions.code;
  } else if (sectionType === 'blockquote') {
    return fontOptions.blockquote;
  }
  return fontOptions.body;
}

/**
 * Render text content (sections) to a Konva layer
 */
function renderTextContent(
  layer: Konva.Layer,
  page: PageContent,
  pageWidth: number,
  pageHeight: number,
  scale: number
): void {
  const project = appState.getProject();
  const { layoutOptions, fontOptions, headerFooter } = project;
  const margins = layoutOptions.margins;

  const isRecto = page.isRecto;
  const innerMargin = isRecto ? margins.inner : margins.outer;
  const outerMargin = isRecto ? margins.outer : margins.inner;

  const contentX = innerMargin * scale;
  const contentY = margins.top * scale;
  const contentWidth = (pageWidth - innerMargin - outerMargin) * scale;
  const contentHeight = (pageHeight - margins.top - margins.bottom) * scale;

  let currentY = contentY;

  // Render each section
  for (const section of page.sections) {
    const fontStyle = getFontStyleForSection(section.type, section.level, fontOptions);
    const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize * scale;
    const fontSize = fontStyle.fontSize * scale;

    // Add spacing above headings
    if (section.type === 'heading') {
      switch (section.level) {
        case 1: currentY += layoutOptions.spacingAboveH1 * scale; break;
        case 2: currentY += layoutOptions.spacingAboveH2 * scale; break;
        case 3: currentY += layoutOptions.spacingAboveH3 * scale; break;
      }
    }

    // Skip image placeholders
    if (section.type === 'image') {
      currentY += 110 * scale; // Approximate placeholder height
      continue;
    }

    const measuredSection = section as MeasuredSection;
    const richLines = measuredSection.richLines;
    const plainLines = measuredSection.lines || [section.content];
    const textAlign = fontStyle.textAlign || layoutOptions.textAlign || 'left';

    // Build Konva fontStyle string
    let konvaFontStyle = '';
    if (fontStyle.fontStyle === 'italic') konvaFontStyle += 'italic ';
    if (fontStyle.fontWeight === 'bold') konvaFontStyle += 'bold';
    konvaFontStyle = konvaFontStyle.trim() || 'normal';

    // If we have rich lines, render each span separately for styling
    if (richLines && richLines.length > 0) {
      for (const richLine of richLines) {
        if (currentY > contentY + contentHeight) break;

        // Pre-calculate line width for alignment by measuring each span
        let lineWidth = 0;
        for (const span of richLine.spans) {
          // Build span-specific style for accurate measurement
          let spanFontStyle = '';
          if (span.italic || fontStyle.fontStyle === 'italic') spanFontStyle += 'italic ';
          if (span.bold || fontStyle.fontWeight === 'bold') spanFontStyle += 'bold';
          spanFontStyle = spanFontStyle.trim() || 'normal';
          const spanFontFamily = span.code ? fontOptions.code.fontFamily : fontStyle.fontFamily;

          // Create temporary text node just for measurement
          const measureNode = new Konva.Text({
            text: span.text,
            fontSize: fontSize,
            fontFamily: spanFontFamily,
            fontStyle: spanFontStyle,
          });
          lineWidth += measureNode.width();
          measureNode.destroy();
        }

        let spanX = contentX;
        if (textAlign === 'center') {
          spanX = contentX + (contentWidth - lineWidth) / 2;
        } else if (textAlign === 'right') {
          spanX = contentX + contentWidth - lineWidth;
        }

        for (const span of richLine.spans) {
          // Build span-specific style
          let spanFontStyle = '';
          if (span.italic || fontStyle.fontStyle === 'italic') spanFontStyle += 'italic ';
          if (span.bold || fontStyle.fontWeight === 'bold') spanFontStyle += 'bold';
          spanFontStyle = spanFontStyle.trim() || 'normal';

          const spanFontFamily = span.code ? fontOptions.code.fontFamily : fontStyle.fontFamily;
          const spanColor = span.code ? fontOptions.code.color : fontStyle.color;

          // Create text node first to get accurate width
          const textNode = new Konva.Text({
            x: spanX,
            y: currentY,
            text: span.text,
            fontSize: fontSize,
            fontFamily: spanFontFamily,
            fontStyle: spanFontStyle,
            fill: spanColor,
          });

          const textWidth = textNode.width();

          // Draw highlight background if needed (using actual text width)
          if (span.highlight) {
            const highlightColor = fontOptions.highlight?.backgroundColor || '#ffff00';
            const bgRect = new Konva.Rect({
              x: spanX,
              y: currentY,
              width: textWidth,
              height: lineHeight,
              fill: highlightColor,
              stroke: undefined,
              strokeWidth: 0,
            });
            layer.add(bgRect);
          }

          // Add text node after highlight so text appears on top
          layer.add(textNode);

          // Draw strikethrough if needed
          if (span.strikethrough) {
            const strikeY = currentY + fontSize * 0.6;
            const line = new Konva.Line({
              points: [spanX, strikeY, spanX + textWidth, strikeY],
              stroke: spanColor,
              strokeWidth: fontSize / 15,
            });
            layer.add(line);
          }

          spanX += textWidth;
        }

        currentY += lineHeight;
      }
    } else {
      // Fallback to plain text rendering
      for (const line of plainLines) {
        if (currentY > contentY + contentHeight) break;

        const textNode = new Konva.Text({
          x: contentX,
          y: currentY,
          width: contentWidth,
          text: line,
          fontSize: fontSize,
          fontFamily: fontStyle.fontFamily,
          fontStyle: konvaFontStyle,
          fill: fontStyle.color,
          align: textAlign,
        });
        layer.add(textNode);

        currentY += lineHeight;
      }
    }

    currentY += layoutOptions.paragraphSpacing * scale;
  }

  // Render footer if enabled
  if (headerFooter.footer.enabled) {
    const footerHeight = headerFooter.footer.height * scale;
    const footerY = (pageHeight - margins.bottom) * scale + footerHeight / 2;
    const footerContent = isRecto ? headerFooter.footer.recto : headerFooter.footer.verso;
    const footerFont = headerFooter.footer.font;
    const footerSize = footerFont.fontSize * scale;
    const pageNumStr = page.pageNumber.toString();

    if (footerContent.left) {
      const text = footerContent.left.replace('{{pageNumber}}', pageNumStr);
      layer.add(new Konva.Text({
        x: contentX,
        y: footerY,
        text,
        fontSize: footerSize,
        fontFamily: footerFont.fontFamily,
        fill: footerFont.color,
      }));
    }

    if (footerContent.center) {
      const text = footerContent.center.replace('{{pageNumber}}', pageNumStr);
      layer.add(new Konva.Text({
        x: 0,
        y: footerY,
        width: pageWidth * scale,
        text,
        fontSize: footerSize,
        fontFamily: footerFont.fontFamily,
        fill: footerFont.color,
        align: 'center',
      }));
    }

    if (footerContent.right) {
      const text = footerContent.right.replace('{{pageNumber}}', pageNumStr);
      layer.add(new Konva.Text({
        x: contentX,
        y: footerY,
        width: contentWidth,
        text,
        fontSize: footerSize,
        fontFamily: footerFont.fontFamily,
        fill: footerFont.color,
        align: 'right',
      }));
    }
  }

  // Render header if enabled
  if (headerFooter.header.enabled) {
    const headerHeight = headerFooter.header.height * scale;
    const headerY = margins.top * scale - headerHeight * 1.5;
    const headerContent = isRecto ? headerFooter.header.recto : headerFooter.header.verso;
    const headerFont = headerFooter.header.font;
    const headerSize = headerFont.fontSize * scale;
    const pageNumStr = page.pageNumber.toString();

    if (headerContent.left) {
      const text = headerContent.left.replace('{{pageNumber}}', pageNumStr);
      layer.add(new Konva.Text({
        x: contentX,
        y: headerY,
        text,
        fontSize: headerSize,
        fontFamily: headerFont.fontFamily,
        fill: headerFont.color,
      }));
    }

    if (headerContent.center) {
      const text = headerContent.center.replace('{{pageNumber}}', pageNumStr);
      layer.add(new Konva.Text({
        x: 0,
        y: headerY,
        width: pageWidth * scale,
        text,
        fontSize: headerSize,
        fontFamily: headerFont.fontFamily,
        fill: headerFont.color,
        align: 'center',
      }));
    }

    if (headerContent.right) {
      const text = headerContent.right.replace('{{pageNumber}}', pageNumStr);
      layer.add(new Konva.Text({
        x: contentX,
        y: headerY,
        width: contentWidth,
        text,
        fontSize: headerSize,
        fontFamily: headerFont.fontFamily,
        fill: headerFont.color,
        align: 'right',
      }));
    }
  }
}

/**
 * Build a stroke-offset version of a polygon by pushing every anchor (and
 * bezier handle, for smooth points) outward from the centroid by the
 * given offset, in normalized space. Smooth/curved edges keep their shape.
 */
function offsetSmoothPolygonOutward(
  points: import('../types').PolygonPoint[],
  offsetScaled: number,
  scaledWidth: number,
  scaledHeight: number
): import('../types').PolygonPoint[] {
  if (points.length === 0) return points;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  // Convert offset (in scaled units) back to normalized along the larger
  // axis so the radial push reads naturally regardless of scale.
  const offNorm = offsetScaled / Math.max(scaledWidth, scaledHeight);

  const pushOut = (px: number, py: number) => {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: px, y: py };
    const factor = (dist + offNorm) / dist;
    return { x: cx + dx * factor, y: cy + dy * factor };
  };

  return points.map(p => {
    const anchor = pushOut(p.x, p.y);
    if (p.cornerType !== 'smooth') {
      return { ...p, x: anchor.x, y: anchor.y };
    }
    return {
      ...p,
      x: anchor.x,
      y: anchor.y,
      handleIn: p.handleIn ? pushOut(p.handleIn.x, p.handleIn.y) : undefined,
      handleOut: p.handleOut ? pushOut(p.handleOut.x, p.handleOut.y) : undefined,
    };
  });
}

/**
 * Render a text-flow page item into the supplied layer at scale, so the
 * flowed content shows up in pre-rendered page images (and therefore in
 * the exported PDF).
 */
function renderTextFlowItem(
  layer: Konva.Layer,
  item: TextFlowPageItem,
  xOffset: number,
  scale: number
): void {
  const project = appState.getProject();
  const groupX = (xOffset + item.x) * scale;
  const groupY = item.y * scale;
  const scaledWidth = item.width * scale;
  const scaledHeight = item.height * scale;

  // Use a Konva.Group with a clipFunc so flowed text stays inside the shape.
  // No outline or hit area is drawn — the editor's dashed border is purely a
  // visual aid and should not appear in the exported page.
  const isPolygon =
    item.flowShape === 'polygon' &&
    item.polygonPoints &&
    item.polygonPoints.length >= 3;

  const polygonAbsScaled = isPolygon
    ? item.polygonPoints!.map(p => ({
        x: p.x * scaledWidth,
        y: p.y * scaledHeight,
      }))
    : null;

  const group = new Konva.Group({
    x: groupX,
    y: groupY,
    width: scaledWidth,
    height: scaledHeight,
    rotation: item.rotation || 0,
    opacity: item.opacity ?? 1,
    // Polygon items skip the clip — wrapping already follows the silhouette.
    clipFunc: polygonAbsScaled ? undefined : (ctx) => {
      ctx.rect(0, 0, scaledWidth, scaledHeight);
    },
  });

  // Fill and stroke (only when enabled by the user). Editor-only dashed
  // border isn't rendered here. Stroke / fill with a non-zero offset are
  // drawn as separate shapes so each sits at its offset position. Polygons
  // use Konva.Path so smooth (bezier) vertices render correctly.
  const hasFill = item.hasFill === true;
  const hasStroke = item.hasStroke === true;
  const fillColor = hasFill
    ? (item.fill?.type === 'color' ? (item.fill?.color || '#ffffff') : '#ffffff')
    : undefined;
  const strokeOffset = (item.strokeOffset ?? 0) * scale;
  const fillOffset = (item.fillOffset ?? 0) * scale;
  const strokeOnPath = hasStroke && strokeOffset === 0;
  const fillOnPath = hasFill && fillOffset === 0;

  // Offset fill comes first so it sits behind everything else.
  if (hasFill && fillOffset !== 0 && fillColor !== undefined) {
    if (item.polygonPoints && item.polygonPoints.length >= 3) {
      const offsetPts = offsetSmoothPolygonOutward(item.polygonPoints, fillOffset, scaledWidth, scaledHeight);
      group.add(new Konva.Path({
        data: buildPolygonPath(offsetPts, scaledWidth, scaledHeight),
        fill: fillColor,
      }));
    } else {
      group.add(new Konva.Rect({
        x: -fillOffset,
        y: -fillOffset,
        width: scaledWidth + fillOffset * 2,
        height: scaledHeight + fillOffset * 2,
        fill: fillColor,
      }));
    }
  }

  if (fillOnPath || strokeOnPath) {
    if (item.polygonPoints && item.polygonPoints.length >= 3) {
      group.add(new Konva.Path({
        data: buildPolygonPath(item.polygonPoints, scaledWidth, scaledHeight),
        fill: fillOnPath ? fillColor : undefined,
        stroke: strokeOnPath ? (item.strokeColor || '#000000') : undefined,
        strokeWidth: strokeOnPath ? (item.strokeWidth ?? 1) * scale : 0,
      }));
    } else {
      group.add(new Konva.Rect({
        x: 0,
        y: 0,
        width: scaledWidth,
        height: scaledHeight,
        fill: fillOnPath ? fillColor : undefined,
        stroke: strokeOnPath ? (item.strokeColor || '#000000') : undefined,
        strokeWidth: strokeOnPath ? (item.strokeWidth ?? 1) * scale : 0,
      }));
    }
  }
  if (hasStroke && strokeOffset !== 0) {
    if (item.polygonPoints && item.polygonPoints.length >= 3) {
      const offsetPts = offsetSmoothPolygonOutward(item.polygonPoints, strokeOffset, scaledWidth, scaledHeight);
      group.add(new Konva.Path({
        data: buildPolygonPath(offsetPts, scaledWidth, scaledHeight),
        stroke: item.strokeColor || '#000000',
        strokeWidth: (item.strokeWidth ?? 1) * scale,
      }));
    } else {
      group.add(new Konva.Rect({
        x: -strokeOffset,
        y: -strokeOffset,
        width: scaledWidth + strokeOffset * 2,
        height: scaledHeight + strokeOffset * 2,
        stroke: item.strokeColor || '#000000',
        strokeWidth: (item.strokeWidth ?? 1) * scale,
      }));
    }
  }

  if (isPolygon) {
    renderTextFlowPolygonLines(group, item, scale);
  } else {
    renderTextFlowSquareSections(group, item, scale, project);
  }

  layer.add(group);
}

function renderTextFlowPolygonLines(
  group: Konva.Group,
  item: TextFlowPageItem,
  scale: number
): void {
  const lines = item.flowedPolygonLines || [];
  if (lines.length === 0) return;
  const project = appState.getProject();

  for (const line of lines) {
    const fontStyle = getFontStyleForSection(line.sectionType, line.sectionLevel, project.fontOptions);
    let combined = '';
    if (fontStyle.fontStyle === 'italic') combined += 'italic ';
    if (fontStyle.fontWeight === 'bold') combined += 'bold';
    combined = combined.trim() || 'normal';

    const textNode = new Konva.Text({
      x: line.x * scale,
      y: line.y * scale,
      text: line.text,
      fontSize: fontStyle.fontSize * scale,
      fontFamily: fontStyle.fontFamily,
      fontStyle: combined,
      fill: item.textColor || fontStyle.color,
    });
    group.add(textNode);
  }
}

function renderTextFlowSquareSections(
  group: Konva.Group,
  item: TextFlowPageItem,
  scale: number,
  project: ReturnType<typeof appState.getProject>
): void {
  const sections = (item.flowedSections as MeasuredSection[] | undefined) || [];
  if (sections.length === 0) return;

  const padding = (item.padding ?? 0) * scale;
  const contentX = padding;
  const contentWidth = Math.max(0, item.width * scale - padding * 2);
  let currentY = padding;

  for (const section of sections) {
    const fontStyle = getFontStyleForSection(section.type, section.level, project.fontOptions);
    const lineHeight = project.layoutOptions.lineHeight * fontStyle.fontSize * scale;
    const fontSize = fontStyle.fontSize * scale;
    const textAlign = fontStyle.textAlign || project.layoutOptions.textAlign;

    if (section.type === 'heading') {
      switch (section.level) {
        case 1: currentY += project.layoutOptions.spacingAboveH1 * scale; break;
        case 2: currentY += project.layoutOptions.spacingAboveH2 * scale; break;
        case 3: currentY += project.layoutOptions.spacingAboveH3 * scale; break;
      }
    }

    let combined = '';
    if (fontStyle.fontStyle === 'italic') combined += 'italic ';
    if (fontStyle.fontWeight === 'bold') combined += 'bold';
    combined = combined.trim() || 'normal';

    for (const line of section.lines) {
      const textNode = new Konva.Text({
        x: contentX,
        y: currentY,
        text: line,
        width: contentWidth,
        fontSize,
        fontFamily: fontStyle.fontFamily,
        fontStyle: combined,
        fill: item.textColor || fontStyle.color,
        align: textAlign as string,
        wrap: 'none',
      });
      group.add(textNode);
      currentY += lineHeight;
    }
    currentY += project.layoutOptions.paragraphSpacing * scale;
  }
}

/**
 * Render a page's items to a high-resolution image
 * Returns a data URL of the rendered image
 *
 * This renders both the page's own items AND crossing items from the adjacent page.
 * Konva's canvas automatically clips at boundaries, so all shapes are properly clipped.
 *
 * @param page The page content to render
 * @param pageWidth Page width in points
 * @param pageHeight Page height in points
 * @param adjacentPage Optional adjacent page for crossing items
 * @param includeTextContent If true, render text content (sections, headers, footers) as well
 */
export async function renderPageToImage(
  page: PageContent,
  pageWidth: number,
  pageHeight: number,
  adjacentPage?: PageContent | null,
  includeTextContent?: boolean
): Promise<string | null> {
  // Check if page has items worth rendering
  const hasOwnItems = page.items && page.items.length > 0;
  const hasCrossingItems = adjacentPage?.items?.some(item => {
    if (page.isRecto) {
      return item.x + item.width > pageWidth;
    } else {
      return item.x < 0;
    }
  });
  const hasItems = hasOwnItems || hasCrossingItems;
  const hasTextContent = includeTextContent && page.sections && page.sections.length > 0;

  if (!hasItems && !page.backgroundFill && !hasTextContent) {
    return null;
  }

  const scaledWidth = Math.round(pageWidth * SCALE_FACTOR);
  const scaledHeight = Math.round(pageHeight * SCALE_FACTOR);

  // Create a temporary container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  try {
    // Create temporary Konva stage
    const stage = new Konva.Stage({
      container,
      width: scaledWidth,
      height: scaledHeight,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    const imageLoadPromises: Promise<void>[] = [];

    // Draw background if present
    if (page.backgroundFill) {
      const bgRect = new Konva.Rect({
        x: 0,
        y: 0,
        width: scaledWidth,
        height: scaledHeight,
      });
      applyFillToShape(bgRect, page.backgroundFill, '#ffffff', scaledWidth, scaledHeight, imageLoadPromises);
      layer.add(bgRect);
    }

    // Render text content if requested (for "render text as images" mode)
    if (includeTextContent && page.sections && page.sections.length > 0) {
      renderTextContent(layer, page, pageWidth, pageHeight, SCALE_FACTOR);
    }

    // Render page items (including array instances)
    if (page.items) {
      for (const item of page.items) {
        // Text-flow items have multi-node content (one Konva.Text per flowed
        // line) so they don't fit createRenderNode's single-node model.
        if (item.type === 'textFlow') {
          renderTextFlowItem(layer, item as TextFlowPageItem, 0, SCALE_FACTOR);
          continue;
        }

        const dimensions = item.arrayDimensions || [];
        const totalInstances = getTotalArrayInstances(dimensions);

        if (totalInstances <= 1) {
          // No array - render single item
          const node = createRenderNode(item, 0, SCALE_FACTOR, imageLoadPromises);
          if (node) {
            applyItemShadow(node, item, SCALE_FACTOR);
            layer.add(node);
          }
        } else {
          // Array - render all instances in reverse order (first on top)
          const positions = calculateArrayPositions(dimensions);
          for (let i = positions.length - 1; i >= 0; i--) {
            const pos = positions[i];
            // Create a modified item for this instance position
            const instanceItem: PageItem = {
              ...item,
              x: item.x + pos.x,
              y: item.y + pos.y,
              arrayDimensions: undefined, // Don't recurse
            } as PageItem;

            const node = createRenderNode(instanceItem, 0, SCALE_FACTOR, imageLoadPromises);
            if (node) {
              applyItemShadow(node, item, SCALE_FACTOR);
              layer.add(node);
            }
          }
        }
      }
    }

    // Render crossing items from adjacent page (including array instances)
    // Konva's canvas automatically clips at boundaries, so circles etc. will be properly clipped
    if (adjacentPage?.items) {
      const crossingItems = adjacentPage.items.filter(item => {
        if (page.isRecto) {
          // This is recto, adjacent is verso - items extending right past verso boundary
          return item.x + item.width > pageWidth;
        } else {
          // This is verso, adjacent is recto - items with negative x extending left
          return item.x < 0;
        }
      });

      for (const item of crossingItems) {
        // Adjust x position for the crossing item
        const offsetX = page.isRecto ? -pageWidth : pageWidth;
        const dimensions = item.arrayDimensions || [];
        const totalInstances = getTotalArrayInstances(dimensions);

        if (totalInstances <= 1) {
          // No array - render single item
          const node = createRenderNode(item, offsetX, SCALE_FACTOR, imageLoadPromises);
          if (node) {
            applyItemShadow(node, item, SCALE_FACTOR);
            layer.add(node);
          }
        } else {
          // Array - render all instances in reverse order (first on top)
          const positions = calculateArrayPositions(dimensions);
          for (let i = positions.length - 1; i >= 0; i--) {
            const pos = positions[i];
            const instanceItem: PageItem = {
              ...item,
              x: item.x + pos.x,
              y: item.y + pos.y,
              arrayDimensions: undefined,
            } as PageItem;

            const node = createRenderNode(instanceItem, offsetX, SCALE_FACTOR, imageLoadPromises);
            if (node) {
              applyItemShadow(node, item, SCALE_FACTOR);
              layer.add(node);
            }
          }
        }
      }
    }

    // Wait for all images to load
    await Promise.all(imageLoadPromises);

    // Render the layer
    layer.draw();

    // Export to data URL
    const dataUrl = stage.toDataURL({
      pixelRatio: 1, // Already scaled
      mimeType: 'image/png',
    });

    // Cleanup
    stage.destroy();

    return dataUrl;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Check if a page needs raster rendering (has complex fills, custom fonts, arrays, etc.)
 */
export function pageNeedsRasterRendering(page: PageContent): boolean {
  if (!page.items || page.items.length === 0) {
    // Check background fill
    if (page.backgroundFill) {
      return page.backgroundFill.type !== 'color';
    }
    return false;
  }

  for (const item of page.items) {
    // Arrays always need raster rendering
    if (item.arrayDimensions && item.arrayDimensions.length > 0) {
      return true;
    }

    if (item.type === 'shape') {
      const shapeItem = item as ShapePageItem;
      if (shapeItem.fill && shapeItem.fill.type !== 'color') {
        return true;
      }
    } else if (item.type === 'text') {
      const textItem = item as TextPageItem;
      // Check for gradient/pattern fills on text
      if (textItem.fill && textItem.fill.type !== 'color') {
        return true;
      }
      // Check for custom fonts (not standard PDF fonts)
      const standardFonts = ['Times New Roman', 'TimesRoman', 'Helvetica', 'Arial', 'Courier', 'Courier New'];
      if (!standardFonts.some(f => textItem.fontFamily.toLowerCase().includes(f.toLowerCase()))) {
        return true;
      }
    }
  }

  return false;
}
