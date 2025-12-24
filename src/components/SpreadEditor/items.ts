/**
 * SpreadEditor Items Module
 * Handles creation and rendering of page items (shapes, text)
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, PageItem, TextPageItem, ShapePageItem, ImagePageItem, FillConfig, SpanningItem } from '../../types';

/**
 * Apply fill config to a Konva shape
 */
function applyFillToShape(
  shape: Konva.Shape,
  fill: FillConfig | undefined,
  fallbackColor: string | undefined,
  width: number,
  height: number
): void {
  // Use fallback if no fill config
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

    // Calculate gradient endpoints based on angle
    const cx = width / 2;
    const cy = height / 2;
    const length = Math.sqrt(width * width + height * height) / 2;

    const startX = cx - cos * length;
    const startY = cy - sin * length;
    const endX = cx + cos * length;
    const endY = cy + sin * length;

    // Build color stops array for Konva
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
      const img = new window.Image();
      img.src = `data:image/png;base64,${file.content}`;
      img.onload = () => {
        shape.fillPatternImage(img);
        shape.fillPatternRepeat(fill.pattern?.repeat || 'repeat');
        shape.fillPatternScale({ x: fill.pattern?.scale || 1, y: fill.pattern?.scale || 1 });
        shape.fillPatternOffset({ x: fill.pattern?.offsetX || 0, y: fill.pattern?.offsetY || 0 });
        shape.fillPatternRotation(fill.pattern?.rotation || 0);
        shape.getLayer()?.batchDraw();
      };
    }
  }
}

/**
 * Create a Konva node for a page item
 */
export function createItemNode(
  item: PageItem,
  xOffset: number,
  pageNumber: number,
  zoomLevel: number,
  stage: Konva.Stage,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): Konva.Shape | Konva.Text | Konva.Arrow | null {
  let node: Konva.Shape | Konva.Text | Konva.Arrow | null = null;
  const opacity = item.opacity ?? 1;

  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    if (shapeItem.shapeType === 'rectangle') {
      const rect = new Konva.Rect({
        x: xOffset + item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 1,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
      applyFillToShape(rect, shapeItem.fill, shapeItem.fillColor, item.width, item.height);
      node = rect;
    } else if (shapeItem.shapeType === 'ellipse') {
      const ellipse = new Konva.Ellipse({
        x: xOffset + item.x + item.width / 2,
        y: item.y + item.height / 2,
        radiusX: item.width / 2,
        radiusY: item.height / 2,
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 1,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
        offset: { x: 0, y: 0 },
      });
      applyFillToShape(ellipse, shapeItem.fill, shapeItem.fillColor, item.width, item.height);
      node = ellipse;
    } else if (shapeItem.shapeType === 'circle') {
      // Circle uses the minimum of width/height for radius
      const radius = Math.min(item.width, item.height) / 2;
      const circle = new Konva.Circle({
        x: xOffset + item.x + radius,
        y: item.y + radius,
        radius: radius,
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 1,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
      applyFillToShape(circle, shapeItem.fill, shapeItem.fillColor, radius * 2, radius * 2);
      node = circle;
    } else if (shapeItem.shapeType === 'line') {
      node = new Konva.Line({
        x: xOffset + item.x,
        y: item.y,
        points: [0, 0, item.width, 0],
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 2,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
    } else if (shapeItem.shapeType === 'arrow') {
      node = new Konva.Arrow({
        x: xOffset + item.x,
        y: item.y,
        points: [0, 0, item.width, 0],
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 2,
        fill: shapeItem.strokeColor || '#000000',
        pointerLength: 10,
        pointerWidth: 8,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
    }
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    node = new Konva.Text({
      x: xOffset + item.x,
      y: item.y,
      width: item.width,
      text: textItem.content,
      fontSize: textItem.fontSize,
      fontFamily: textItem.fontFamily,
      fontStyle: `${textItem.fontWeight === 'bold' ? 'bold' : ''} ${textItem.fontStyle === 'italic' ? 'italic' : ''}`.trim() || 'normal',
      fill: textItem.color,
      align: textItem.textAlign,
      rotation: item.rotation || 0,
      opacity,
      draggable: true,
    });
  } else if (item.type === 'image') {
    const imageItem = item as ImagePageItem;
    const imageFile = appState.getProject().files.find(f => f.id === imageItem.imageFileId);

    if (imageFile) {
      // Load image first, then create Konva.Image
      const img = new window.Image();
      img.src = `data:image/png;base64,${imageFile.content}`;

      const konvaImage = new Konva.Image({
        x: xOffset + item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        image: img,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
      konvaImage.setAttr('itemId', item.id);
      konvaImage.setAttr('pageNumber', pageNumber);
      konvaImage.setAttr('xOffset', xOffset);
      konvaImage.setAttr('imageLoading', true);

      // Redraw when image loads and update transformer
      img.onload = () => {
        konvaImage.setAttr('imageLoading', false);
        itemsLayer.batchDraw();
        // If this item is selected, update the transformer
        if (appState.getEditor().selectedItemId === item.id) {
          updateTransformerFn();
        }
      };

      node = konvaImage;
    }
  }

  if (node) {
    node.setAttr('itemId', item.id);
    node.setAttr('pageNumber', pageNumber);
    node.setAttr('xOffset', xOffset);

    // Handle click to select item and its page
    node.on('click tap', () => {
      // Determine page position (verso or recto) based on xOffset
      // xOffset is 0 for verso, pageWidth for recto
      const position = xOffset === 0 ? 'verso' : 'recto';
      appState.updateEditor({
        selectedItemId: item.id,
        selectedPageNumber: pageNumber,
        selectedPagePosition: position,
      });
    });

    // Handle double-click for text editing
    if (item.type === 'text') {
      node.on('dblclick dbltap', () => {
        startTextEditing(node as Konva.Text, item as TextPageItem, pageNumber, xOffset, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
      });
    }

    // Handle drag move to keep transformer in sync
    node.on('dragmove', () => {
      // Force transformer to update during drag
      itemsLayer.batchDraw();
    });

    // Handle drag end to update position
    node.on('dragend', () => {
      let newX = node!.x() - xOffset;
      let newY = node!.y();

      // For centered shapes, convert back from center position to top-left
      if (item.type === 'shape') {
        const shapeItem = item as ShapePageItem;
        if (shapeItem.shapeType === 'ellipse') {
          newX -= item.width / 2;
          newY -= item.height / 2;
        } else if (shapeItem.shapeType === 'circle') {
          const radius = Math.min(item.width, item.height) / 2;
          newX -= radius;
          newY -= radius;
        }
      }

      appState.updateItemOnPage(pageNumber, item.id, { x: newX, y: newY });
    });

    // Handle transform end to update size/rotation
    node.on('transformend', () => {
      const scaleX = node!.scaleX();
      const scaleY = node!.scaleY();
      const rotation = node!.rotation();

      // Reset scale and apply to width/height
      node!.scaleX(1);
      node!.scaleY(1);

      let newWidth = item.width * scaleX;
      let newHeight = item.height * scaleY;
      let newX = node!.x() - xOffset;
      let newY = node!.y();

      // For ellipse, we need to handle differently since it's centered
      if (item.type === 'shape' && (item as ShapePageItem).shapeType === 'ellipse') {
        const ellipse = node as Konva.Ellipse;
        newWidth = ellipse.radiusX() * 2 * scaleX;
        newHeight = ellipse.radiusY() * 2 * scaleY;
        ellipse.radiusX(newWidth / 2);
        ellipse.radiusY(newHeight / 2);
        // Convert from center to top-left
        newX -= newWidth / 2;
        newY -= newHeight / 2;
      }

      // For circle, update both width and height to maintain aspect
      if (item.type === 'shape' && (item as ShapePageItem).shapeType === 'circle') {
        const circle = node as Konva.Circle;
        const newRadius = circle.radius() * Math.max(scaleX, scaleY);
        circle.radius(newRadius);
        newWidth = newRadius * 2;
        newHeight = newRadius * 2;
        // Convert from center to top-left
        newX -= newRadius;
        newY -= newRadius;
      }

      appState.updateItemOnPage(pageNumber, item.id, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
        rotation: rotation,
      });
    });
  }

  return node;
}

/**
 * Start editing a text item with a textarea overlay
 */
export function startTextEditing(
  textNode: Konva.Text,
  item: TextPageItem,
  pageNumber: number,
  xOffset: number,
  zoomLevel: number,
  stage: Konva.Stage,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): void {
  // Hide the text node while editing
  textNode.hide();
  transformer.nodes([]);
  itemsLayer.draw();

  // Get the position of the text node
  const textPosition = textNode.getAbsolutePosition();
  const stageBox = stage.container().getBoundingClientRect();

  // Create a textarea
  const textarea = document.createElement('textarea');
  stage.container().parentElement!.appendChild(textarea);

  // Position and style the textarea
  textarea.value = item.content;
  textarea.style.position = 'absolute';
  textarea.style.left = `${stageBox.left + textPosition.x}px`;
  textarea.style.top = `${stageBox.top + textPosition.y}px`;
  textarea.style.width = `${textNode.width() * zoomLevel}px`;
  textarea.style.minHeight = `${textNode.height() * zoomLevel}px`;
  textarea.style.fontSize = `${item.fontSize * zoomLevel}px`;
  textarea.style.fontFamily = item.fontFamily;
  textarea.style.fontWeight = item.fontWeight;
  textarea.style.fontStyle = item.fontStyle;
  textarea.style.color = item.color;
  textarea.style.textAlign = item.textAlign;
  textarea.style.border = '2px solid #22c55e';
  textarea.style.borderRadius = '2px';
  textarea.style.padding = '2px 4px';
  textarea.style.margin = '0';
  textarea.style.overflow = 'hidden';
  textarea.style.background = 'white';
  textarea.style.outline = 'none';
  textarea.style.resize = 'none';
  textarea.style.lineHeight = '1.2';
  textarea.style.zIndex = '1000';
  textarea.style.transformOrigin = 'left top';

  // Apply rotation if any
  if (item.rotation) {
    textarea.style.transform = `rotate(${item.rotation}deg)`;
  }

  textarea.focus();
  textarea.select();

  // Auto-resize textarea
  const resizeTextarea = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', resizeTextarea);
  resizeTextarea();

  // Handle blur/finish editing
  const finishEditing = () => {
    const newContent = textarea.value;
    textarea.remove();
    textNode.show();

    // Update the item content
    if (newContent !== item.content) {
      appState.updateItemOnPage(pageNumber, item.id, { content: newContent });
    }

    updateTransformerFn();
    itemsLayer.draw();
  };

  textarea.addEventListener('blur', finishEditing);

  // Handle escape to cancel, enter+shift for newline, enter to finish
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textarea.value = item.content; // Restore original
      textarea.blur();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });
}

/**
 * Render items for a specific page
 */
export function renderPageItems(
  page: PageContent,
  xOffset: number,
  pageDimensions: { width: number; height: number },
  itemNodes: Map<string, Konva.Node>,
  itemsLayer: Konva.Layer,
  zoomLevel: number,
  stage: Konva.Stage,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): void {
  if (!page.items) return;

  for (const item of page.items) {
    const node = createItemNode(item, xOffset, page.pageNumber, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
    if (node) {
      itemNodes.set(item.id, node);
      itemsLayer.add(node);
    }
  }
}

/**
 * Render spanning items that bridge across verso and recto
 * Spanning items have x position relative to the full spread width
 */
export function renderSpanningItems(
  spanningItems: SpanningItem[],
  spreadId: string,
  pageDimensions: { width: number; height: number },
  itemNodes: Map<string, Konva.Node>,
  itemsLayer: Konva.Layer,
  zoomLevel: number,
  stage: Konva.Stage,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): void {
  if (!spanningItems || spanningItems.length === 0) return;

  for (const item of spanningItems) {
    // Convert spanning item to PageItem format for createItemNode
    // Spanning items use x=0 as the left edge of verso
    const pageItem = convertSpanningToPageItem(item);
    if (!pageItem) continue;

    // xOffset is 0 since spanning items are positioned relative to the full spread
    const node = createItemNode(pageItem, 0, -1, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
    if (node) {
      // Store with a special prefix to identify as spanning
      node.setAttr('isSpanningItem', true);
      node.setAttr('spreadId', spreadId);
      itemNodes.set(item.id, node);
      itemsLayer.add(node);

      // Update drag handling for spanning items
      node.off('dragend');
      node.on('dragend', () => {
        const newPos = node.position();
        appState.updateSpanningItem(spreadId, item.id, {
          x: newPos.x / zoomLevel,
          y: newPos.y / zoomLevel,
        });
      });
    }
  }
}

/**
 * Convert a SpanningItem to a PageItem for rendering
 */
function convertSpanningToPageItem(item: SpanningItem): PageItem | null {
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
