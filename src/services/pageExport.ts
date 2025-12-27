/**
 * Page Export Service
 * Handles exporting blank pages and selected pages as SVG/PNG
 */

import Konva from 'konva';
import { appState } from './state';
import { calculatePageDimensions } from './textFlow/dimensions';
import { env } from './environment';
import type { PageContent, PageItem, TextPageItem, ShapePageItem, ImagePageItem, FillConfig } from '../types';
import { calculateArrayPositions, getTotalArrayInstances } from '../components/SpreadEditor/items/arrayItems';

// Target DPI for print-quality rendering
const PRINT_DPI = 300;
const SCREEN_DPI = 72;
const SCALE_FACTOR = PRINT_DPI / SCREEN_DPI;

/**
 * Get page dimensions from current project settings
 */
export function getPageDimensions(): { width: number; height: number } {
  const project = appState.getProject();
  const dims = calculatePageDimensions(
    project.outputOptions,
    project.layoutOptions,
    project.headerFooter
  );
  return { width: dims.width, height: dims.height };
}

/**
 * Download a blank single page as PNG (300 DPI)
 */
export async function downloadBlankPage(): Promise<void> {
  const { width, height } = getPageDimensions();
  const scaledWidth = Math.round(width * SCALE_FACTOR);
  const scaledHeight = Math.round(height * SCALE_FACTOR);

  // Create a temporary container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  try {
    const stage = new Konva.Stage({
      container,
      width: scaledWidth,
      height: scaledHeight,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Draw white background
    const bg = new Konva.Rect({
      x: 0,
      y: 0,
      width: scaledWidth,
      height: scaledHeight,
      fill: '#ffffff',
    });
    layer.add(bg);
    layer.draw();

    // Export to data URL and download
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 });
    const blob = await dataUrlToBlob(dataUrl);
    env.downloadFile('blank-page.png', blob);

    stage.destroy();
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Download a blank spread (verso + recto) as PNG (300 DPI)
 */
export async function downloadBlankSpread(): Promise<void> {
  const { width, height } = getPageDimensions();
  const spreadWidth = width * 2;
  const scaledWidth = Math.round(spreadWidth * SCALE_FACTOR);
  const scaledHeight = Math.round(height * SCALE_FACTOR);

  // Create a temporary container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  try {
    const stage = new Konva.Stage({
      container,
      width: scaledWidth,
      height: scaledHeight,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Draw white background
    const bg = new Konva.Rect({
      x: 0,
      y: 0,
      width: scaledWidth,
      height: scaledHeight,
      fill: '#ffffff',
    });
    layer.add(bg);

    // Draw center fold line (light gray dashed)
    const centerX = scaledWidth / 2;
    const foldLine = new Konva.Line({
      points: [centerX, 0, centerX, scaledHeight],
      stroke: '#cccccc',
      strokeWidth: 1,
      dash: [10, 5],
    });
    layer.add(foldLine);

    layer.draw();

    // Export to data URL and download
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 });
    const blob = await dataUrlToBlob(dataUrl);
    env.downloadFile('blank-spread.png', blob);

    stage.destroy();
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Apply fill config to a Konva shape
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
 * Create a Konva node for a page item
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
      const rect = new Konva.Rect({ x, y, width, height, ...strokeProps, rotation: item.rotation || 0, opacity });
      if (hasFill) applyFillToShape(rect, shapeItem.fill, shapeItem.fillColor, width, height, imageLoadPromises);
      return rect;
    } else if (shapeItem.shapeType === 'ellipse') {
      const ellipse = new Konva.Ellipse({
        x: x + width / 2, y: y + height / 2,
        radiusX: width / 2, radiusY: height / 2,
        ...strokeProps, rotation: item.rotation || 0, opacity
      });
      if (hasFill) applyFillToShape(ellipse, shapeItem.fill, shapeItem.fillColor, width, height, imageLoadPromises);
      return ellipse;
    } else if (shapeItem.shapeType === 'circle') {
      const radius = Math.min(width, height) / 2;
      const circle = new Konva.Circle({
        x: x + radius, y: y + radius, radius,
        ...strokeProps, rotation: item.rotation || 0, opacity
      });
      if (hasFill) applyFillToShape(circle, shapeItem.fill, shapeItem.fillColor, radius * 2, radius * 2, imageLoadPromises);
      return circle;
    } else if (shapeItem.shapeType === 'line') {
      return new Konva.Line({
        points: [x, y, x + width, y + height],
        stroke: hasStroke ? (shapeItem.strokeColor || '#000000') : undefined,
        strokeWidth: hasStroke ? (shapeItem.strokeWidth || 2) * scale : 0, opacity
      });
    } else if (shapeItem.shapeType === 'arrow') {
      return new Konva.Arrow({
        points: [x, y, x + width, y + height],
        stroke: hasStroke ? (shapeItem.strokeColor || '#000000') : undefined,
        strokeWidth: hasStroke ? (shapeItem.strokeWidth || 2) * scale : 0,
        pointerLength: 10 * scale, pointerWidth: 10 * scale, opacity
      });
    }
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    const hasFill = textItem.hasFill ?? true;
    const hasStroke = textItem.hasStroke ?? false;
    const textNode = new Konva.Text({
      x, y, width, height, text: textItem.content,
      fontSize: textItem.fontSize * scale, fontFamily: textItem.fontFamily,
      fontStyle: textItem.fontStyle === 'italic' ? 'italic' : 'normal',
      fontVariant: textItem.fontWeight === 'bold' ? 'bold' : 'normal',
      align: textItem.textAlign || 'left',
      rotation: item.rotation || 0, opacity
    });
    if (hasFill) applyFillToShape(textNode, textItem.fill, textItem.color, width, height, imageLoadPromises);
    else textNode.fill('transparent');
    if (hasStroke) {
      textNode.stroke(textItem.strokeColor || '#000000');
      textNode.strokeWidth((textItem.strokeWidth || 1) * scale);
    }
    return textNode;
  } else if (item.type === 'image') {
    const imageItem = item as ImagePageItem;
    const file = appState.getProject().files.find(f => f.id === imageItem.imageFileId);
    if (file) {
      const konvaImage = new Konva.Image({
        x, y, width, height, rotation: item.rotation || 0, opacity, image: undefined
      } as Konva.ImageConfig);
      const loadPromise = new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => { konvaImage.image(img); resolve(); };
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
 * Find a page by its page number
 */
function findPage(pageNumber: number): PageContent | null {
  const project = appState.getProject();
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) return spread.verso;
      if (spread.recto?.pageNumber === pageNumber) return spread.recto;
    }
  }
  return null;
}

/**
 * Render page items to a Konva layer
 */
async function renderPageItems(
  layer: Konva.Layer,
  page: PageContent,
  scale: number,
  pageWidth: number,
  pageHeight: number
): Promise<void> {
  const imageLoadPromises: Promise<void>[] = [];
  const scaledWidth = pageWidth * scale;
  const scaledHeight = pageHeight * scale;

  // Draw background if present
  if (page.backgroundFill) {
    const bgRect = new Konva.Rect({ x: 0, y: 0, width: scaledWidth, height: scaledHeight });
    applyFillToShape(bgRect, page.backgroundFill, '#ffffff', scaledWidth, scaledHeight, imageLoadPromises);
    layer.add(bgRect);
  }

  // Render page items
  if (page.items) {
    for (const item of page.items) {
      const dimensions = item.arrayDimensions || [];
      const totalInstances = getTotalArrayInstances(dimensions);

      if (totalInstances <= 1) {
        const node = createRenderNode(item, 0, scale, imageLoadPromises);
        if (node) { applyItemShadow(node, item, scale); layer.add(node); }
      } else {
        const positions = calculateArrayPositions(dimensions);
        for (let i = positions.length - 1; i >= 0; i--) {
          const pos = positions[i];
          const instanceItem: PageItem = {
            ...item, x: item.x + pos.x, y: item.y + pos.y, arrayDimensions: undefined
          } as PageItem;
          const node = createRenderNode(instanceItem, 0, scale, imageLoadPromises);
          if (node) { applyItemShadow(node, item, scale); layer.add(node); }
        }
      }
    }
  }

  await Promise.all(imageLoadPromises);
}

/**
 * Download selected page as PNG (300 DPI)
 */
export async function downloadPageAsPng(pageNumber: number): Promise<void> {
  const page = findPage(pageNumber);
  if (!page) return;

  const { width, height } = getPageDimensions();
  const scaledWidth = Math.round(width * SCALE_FACTOR);
  const scaledHeight = Math.round(height * SCALE_FACTOR);

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  try {
    const stage = new Konva.Stage({ container, width: scaledWidth, height: scaledHeight });
    const layer = new Konva.Layer();
    stage.add(layer);

    // White background
    const bg = new Konva.Rect({ x: 0, y: 0, width: scaledWidth, height: scaledHeight, fill: '#ffffff' });
    layer.add(bg);

    // Render page items
    await renderPageItems(layer, page, SCALE_FACTOR, width, height);
    layer.draw();

    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 });
    const blob = await dataUrlToBlob(dataUrl);
    env.downloadFile(`page-${pageNumber}.png`, blob);

    stage.destroy();
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Download selected page as SVG
 */
export async function downloadPageAsSvg(pageNumber: number): Promise<void> {
  const page = findPage(pageNumber);
  if (!page) return;

  const { width, height } = getPageDimensions();

  // Create SVG content
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  // White background
  svgContent += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

  // Add background fill if present
  if (page.backgroundFill && page.backgroundFill.type === 'color') {
    svgContent += `<rect width="${width}" height="${height}" fill="${page.backgroundFill.color || '#ffffff'}"/>`;
  }

  // Render items as SVG elements
  if (page.items) {
    for (const item of page.items) {
      svgContent += renderItemToSvg(item, width, height);
    }
  }

  svgContent += '</svg>';

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  env.downloadFile(`page-${pageNumber}.svg`, blob);
}

/**
 * Render a page item to SVG string
 */
function renderItemToSvg(item: PageItem, _pageWidth: number, _pageHeight: number): string {
  const transform = item.rotation ? ` transform="rotate(${item.rotation} ${item.x + item.width/2} ${item.y + item.height/2})"` : '';
  const opacity = item.opacity !== undefined && item.opacity !== 1 ? ` opacity="${item.opacity}"` : '';

  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    const isLinear = shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow';
    const hasFill = shapeItem.hasFill ?? !isLinear;
    const hasStroke = shapeItem.hasStroke ?? true;
    const fill = hasFill ? (shapeItem.fill?.type === 'color' ? shapeItem.fill.color : shapeItem.fillColor) || '#cccccc' : 'none';
    const stroke = hasStroke ? (shapeItem.strokeColor || '#000000') : 'none';
    const strokeWidth = hasStroke ? (shapeItem.strokeWidth || 1) : 0;

    if (shapeItem.shapeType === 'rectangle') {
      return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform}${opacity}/>`;
    } else if (shapeItem.shapeType === 'ellipse') {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${item.width/2}" ry="${item.height/2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform}${opacity}/>`;
    } else if (shapeItem.shapeType === 'circle') {
      const r = Math.min(item.width, item.height) / 2;
      const cx = item.x + r;
      const cy = item.y + r;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform}${opacity}/>`;
    } else if (shapeItem.shapeType === 'line') {
      return `<line x1="${item.x}" y1="${item.y}" x2="${item.x + item.width}" y2="${item.y + item.height}" stroke="${stroke}" stroke-width="${strokeWidth}"${opacity}/>`;
    } else if (shapeItem.shapeType === 'arrow') {
      // Simple arrow as line with marker
      return `<line x1="${item.x}" y1="${item.y}" x2="${item.x + item.width}" y2="${item.y + item.height}" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#arrowhead)"${opacity}/>`;
    }
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    const fill = (textItem.fill?.type === 'color' ? textItem.fill.color : textItem.color) || '#000000';
    const fontStyle = textItem.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontWeight = textItem.fontWeight === 'bold' ? 'bold' : 'normal';
    const anchor = textItem.textAlign === 'center' ? 'middle' : textItem.textAlign === 'right' ? 'end' : 'start';
    const textX = textItem.textAlign === 'center' ? item.x + item.width / 2 : textItem.textAlign === 'right' ? item.x + item.width : item.x;
    const escapedContent = textItem.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<text x="${textX}" y="${item.y + textItem.fontSize}" font-family="${textItem.fontFamily}" font-size="${textItem.fontSize}" font-style="${fontStyle}" font-weight="${fontWeight}" fill="${fill}" text-anchor="${anchor}"${transform}${opacity}>${escapedContent}</text>`;
  } else if (item.type === 'image') {
    const imageItem = item as ImagePageItem;
    const file = appState.getProject().files.find(f => f.id === imageItem.imageFileId);
    if (file) {
      const mimeType = file.name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `<image x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" href="data:${mimeType};base64,${file.content}"${transform}${opacity}/>`;
    }
  }

  return '';
}

/**
 * Convert data URL to Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Replace page content with an image fitted to page dimensions
 */
export async function replacePageWithImage(pageNumber: number, file: File): Promise<void> {
  const page = findPage(pageNumber);
  if (!page) return;

  const { width, height } = getPageDimensions();

  // Read file as base64
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  // Add file to project
  const projectFile = {
    id: crypto.randomUUID(),
    name: file.name,
    type: 'image' as const,
    content,
    isBase64: true,
    lastModified: file.lastModified,
  };
  appState.addFiles([projectFile]);

  // Clear existing items on the page
  if (page.items) {
    for (const item of [...page.items]) {
      appState.deleteItemFromPage(pageNumber, item.id);
    }
  }

  // Add image item covering the entire page
  const imageItem: ImagePageItem = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    opacity: 1,
    imageFileId: projectFile.id,
  };

  appState.addItemToPage(pageNumber, imageItem);
}

/**
 * Find the spread containing a page number
 */
function findSpread(pageNumber: number): { verso: PageContent | null; recto: PageContent | null } | null {
  const project = appState.getProject();

  // Build visual spreads like thumbnails do
  const allPages: PageContent[] = [];
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push(spread.verso);
      if (spread.recto) allPages.push(spread.recto);
    }
  }

  allPages.sort((a, b) => a.pageNumber - b.pageNumber);
  if (allPages.length === 0) return null;

  const maxPageNum = Math.max(...allPages.map(p => p.pageNumber));
  const pageMap = new Map<number, PageContent>();
  for (const page of allPages) {
    pageMap.set(page.pageNumber, page);
  }

  // Find which visual spread contains this page
  // Page 1 is recto of first spread [null|1]
  // Pages 2,3 are [2|3], pages 4,5 are [4|5], etc.
  if (pageNumber === 1) {
    return { verso: null, recto: pageMap.get(1) || null };
  }

  // For page N > 1: verso is even, recto is odd
  // Visual spread index = floor((N) / 2)
  const versoNum = pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
  const rectoNum = versoNum + 1;

  return {
    verso: pageMap.get(versoNum) || null,
    recto: rectoNum <= maxPageNum ? (pageMap.get(rectoNum) || null) : null
  };
}

/**
 * Download current spread as PNG (300 DPI)
 */
export async function downloadSpreadAsPng(pageNumber: number): Promise<void> {
  const spread = findSpread(pageNumber);
  if (!spread) return;

  const { width, height } = getPageDimensions();
  const spreadWidth = width * 2;
  const scaledWidth = Math.round(spreadWidth * SCALE_FACTOR);
  const scaledHeight = Math.round(height * SCALE_FACTOR);

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  try {
    const stage = new Konva.Stage({ container, width: scaledWidth, height: scaledHeight });
    const layer = new Konva.Layer();
    stage.add(layer);

    // White background for entire spread
    const bg = new Konva.Rect({ x: 0, y: 0, width: scaledWidth, height: scaledHeight, fill: '#ffffff' });
    layer.add(bg);

    const imageLoadPromises: Promise<void>[] = [];
    const scaledPageWidth = width * SCALE_FACTOR;

    // Render verso (left page)
    if (spread.verso) {
      // Draw verso background
      if (spread.verso.backgroundFill) {
        const versoBg = new Konva.Rect({ x: 0, y: 0, width: scaledPageWidth, height: scaledHeight });
        applyFillToShape(versoBg, spread.verso.backgroundFill, '#ffffff', scaledPageWidth, scaledHeight, imageLoadPromises);
        layer.add(versoBg);
      }
      // Render verso items
      if (spread.verso.items) {
        for (const item of spread.verso.items) {
          const node = createRenderNode(item, 0, SCALE_FACTOR, imageLoadPromises);
          if (node) { applyItemShadow(node, item, SCALE_FACTOR); layer.add(node); }
        }
      }
    }

    // Render recto (right page)
    if (spread.recto) {
      // Draw recto background (offset by page width)
      if (spread.recto.backgroundFill) {
        const rectoBg = new Konva.Rect({ x: scaledPageWidth, y: 0, width: scaledPageWidth, height: scaledHeight });
        applyFillToShape(rectoBg, spread.recto.backgroundFill, '#ffffff', scaledPageWidth, scaledHeight, imageLoadPromises);
        layer.add(rectoBg);
      }
      // Render recto items (offset by page width)
      if (spread.recto.items) {
        for (const item of spread.recto.items) {
          const node = createRenderNode(item, width, SCALE_FACTOR, imageLoadPromises);
          if (node) { applyItemShadow(node, item, SCALE_FACTOR); layer.add(node); }
        }
      }
    }

    await Promise.all(imageLoadPromises);
    layer.draw();

    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 });
    const blob = await dataUrlToBlob(dataUrl);

    // Name based on pages in spread
    const versoNum = spread.verso?.pageNumber;
    const rectoNum = spread.recto?.pageNumber;
    const filename = versoNum && rectoNum
      ? `spread-${versoNum}-${rectoNum}.png`
      : versoNum
        ? `spread-${versoNum}.png`
        : `spread-${rectoNum}.png`;

    env.downloadFile(filename, blob);
    stage.destroy();
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Replace spread content with an image fitted to spread dimensions
 * The image spans the full spread width (2x page width)
 * Verso gets the left half, recto gets the right half
 */
export async function replaceSpreadWithImage(pageNumber: number, file: File): Promise<void> {
  const spread = findSpread(pageNumber);
  if (!spread) return;

  const { width, height } = getPageDimensions();

  // Read file as base64
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  // Add file to project
  const projectFile = {
    id: crypto.randomUUID(),
    name: file.name,
    type: 'image' as const,
    content,
    isBase64: true,
    lastModified: file.lastModified,
  };
  appState.addFiles([projectFile]);

  // The spread image is 2x page width, so each page shows half
  // Verso: x=0, shows left half (0 to width)
  // Recto: x=-width, shows right half (width to 2*width)

  // For verso (left half of image)
  if (spread.verso) {
    const versoPageNum = spread.verso.pageNumber;
    if (spread.verso.items) {
      for (const item of [...spread.verso.items]) {
        appState.deleteItemFromPage(versoPageNum, item.id);
      }
    }

    // Image positioned at origin, width is 2x page width
    // Page bounds clip to show left half
    const versoImage: ImagePageItem = {
      id: crypto.randomUUID(),
      type: 'image',
      x: 0,
      y: 0,
      width: width * 2, // Full spread width
      height,
      rotation: 0,
      opacity: 1,
      imageFileId: projectFile.id,
    };

    appState.addItemToPage(versoPageNum, versoImage);
  }

  // For recto (right half of image)
  if (spread.recto) {
    const rectoPageNum = spread.recto.pageNumber;
    if (spread.recto.items) {
      for (const item of [...spread.recto.items]) {
        appState.deleteItemFromPage(rectoPageNum, item.id);
      }
    }

    // Image positioned at -width, so right half (width to 2*width) is visible
    const rectoImage: ImagePageItem = {
      id: crypto.randomUUID(),
      type: 'image',
      x: -width, // Offset so right half is visible
      y: 0,
      width: width * 2, // Full spread width
      height,
      rotation: 0,
      opacity: 1,
      imageFileId: projectFile.id,
    };

    appState.addItemToPage(rectoPageNum, rectoImage);
  }
}
