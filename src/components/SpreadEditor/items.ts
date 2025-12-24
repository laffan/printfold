/**
 * SpreadEditor Items Module
 * Handles creation and rendering of page items (shapes, text)
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, PageItem, TextPageItem, ShapePageItem } from '../../types';

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
      node = new Konva.Rect({
        x: xOffset + item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fill: shapeItem.fillColor || 'transparent',
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 1,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
    } else if (shapeItem.shapeType === 'ellipse') {
      node = new Konva.Ellipse({
        x: xOffset + item.x + item.width / 2,
        y: item.y + item.height / 2,
        radiusX: item.width / 2,
        radiusY: item.height / 2,
        fill: shapeItem.fillColor || 'transparent',
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 1,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
        offset: { x: 0, y: 0 },
      });
    } else if (shapeItem.shapeType === 'circle') {
      // Circle uses the minimum of width/height for radius
      const radius = Math.min(item.width, item.height) / 2;
      node = new Konva.Circle({
        x: xOffset + item.x + radius,
        y: item.y + radius,
        radius: radius,
        fill: shapeItem.fillColor || 'transparent',
        stroke: shapeItem.strokeColor || '#000000',
        strokeWidth: shapeItem.strokeWidth || 1,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
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
  }

  if (node) {
    node.setAttr('itemId', item.id);
    node.setAttr('pageNumber', pageNumber);
    node.setAttr('xOffset', xOffset);

    // Handle click to select
    node.on('click tap', () => {
      appState.updateEditor({ selectedItemId: item.id });
    });

    // Handle double-click for text editing
    if (item.type === 'text') {
      node.on('dblclick dbltap', () => {
        startTextEditing(node as Konva.Text, item as TextPageItem, pageNumber, xOffset, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
      });
    }

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
