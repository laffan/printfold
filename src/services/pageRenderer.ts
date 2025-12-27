/**
 * Page Renderer Service
 * Renders static page items to canvas for high-fidelity PDF export
 */

import Konva from 'konva';
import { appState } from './state';
import type { PageContent, PageItem, TextPageItem, ShapePageItem, ImagePageItem, FillConfig } from '../types';

// Target DPI for print-quality rendering
const PRINT_DPI = 300;
const SCREEN_DPI = 72;
const SCALE_FACTOR = PRINT_DPI / SCREEN_DPI;

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
      text: textItem.content,
      fontSize: textItem.fontSize * scale,
      fontFamily: textItem.fontFamily,
      fontStyle: textItem.fontStyle === 'italic' ? 'italic' : 'normal',
      fontVariant: textItem.fontWeight === 'bold' ? 'bold' : 'normal',
      align: textItem.textAlign || 'left',
      rotation: item.rotation || 0,
      opacity,
    });

    // Apply fill if enabled
    if (hasFill) {
      applyFillToShape(textNode, textItem.fill, textItem.color, width, height, imageLoadPromises);
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
 * Render a page's items to a high-resolution image
 * Returns a data URL of the rendered image
 */
export async function renderPageToImage(
  page: PageContent,
  pageWidth: number,
  pageHeight: number,
  adjacentPage?: PageContent | null
): Promise<string | null> {
  // Check if page has items worth rendering
  const hasItems = (page.items && page.items.length > 0) ||
                   (adjacentPage?.items && adjacentPage.items.some(item => {
                     // Check for crossing items
                     if (page.isRecto) {
                       return item.x + item.width > pageWidth;
                     } else {
                       return item.x < 0;
                     }
                   }));

  if (!hasItems && !page.backgroundFill) {
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

    // Render page items
    if (page.items) {
      for (const item of page.items) {
        const node = createRenderNode(item, 0, SCALE_FACTOR, imageLoadPromises);
        if (node) {
          // Apply shadow if enabled
          if (item.hasShadow) {
            node.shadowEnabled(true);
            node.shadowColor(item.shadowColor || '#000000');
            node.shadowBlur((item.shadowBlur ?? 5) * SCALE_FACTOR);
            node.shadowOffsetX((item.shadowOffsetX ?? 3) * SCALE_FACTOR);
            node.shadowOffsetY((item.shadowOffsetY ?? 3) * SCALE_FACTOR);
            node.shadowOpacity(item.shadowOpacity ?? 0.5);
          }
          layer.add(node);
        }
      }
    }

    // Render crossing items from adjacent page
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

      if (crossingItems.length > 0) {
        console.log('[PRERENDER DEBUG] Rendering crossing items for page', page.pageNumber, {
          isRecto: page.isRecto,
          adjacentPageNum: adjacentPage.pageNumber,
          crossingItemsCount: crossingItems.length,
          crossingItems: crossingItems.map(item => ({
            id: item.id,
            x: item.x,
            width: item.width,
            xPlusWidth: item.x + item.width,
            pageWidth,
          })),
        });
      }

      for (const item of crossingItems) {
        // Adjust x position for the crossing item
        const offsetX = page.isRecto ? -pageWidth : pageWidth;
        const node = createRenderNode(item, offsetX, SCALE_FACTOR, imageLoadPromises);
        if (node) {
          // Apply shadow if enabled
          if (item.hasShadow) {
            node.shadowEnabled(true);
            node.shadowColor(item.shadowColor || '#000000');
            node.shadowBlur((item.shadowBlur ?? 5) * SCALE_FACTOR);
            node.shadowOffsetX((item.shadowOffsetX ?? 3) * SCALE_FACTOR);
            node.shadowOffsetY((item.shadowOffsetY ?? 3) * SCALE_FACTOR);
            node.shadowOpacity(item.shadowOpacity ?? 0.5);
          }
          layer.add(node);
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
 * Check if a page needs raster rendering (has complex fills, custom fonts, etc.)
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
    if (item.type === 'shape') {
      const shapeItem = item as ShapePageItem;
      if (shapeItem.fill && shapeItem.fill.type !== 'color') {
        return true;
      }
    } else if (item.type === 'text') {
      const textItem = item as TextPageItem;
      // Check for custom fonts (not standard PDF fonts)
      const standardFonts = ['Times New Roman', 'TimesRoman', 'Helvetica', 'Arial', 'Courier', 'Courier New'];
      if (!standardFonts.some(f => textItem.fontFamily.toLowerCase().includes(f.toLowerCase()))) {
        return true;
      }
    }
  }

  return false;
}
