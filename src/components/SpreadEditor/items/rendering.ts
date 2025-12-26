/**
 * Page items rendering for the SpreadEditor
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import { switchToSelectedTab } from '../../OptionsPanel/editPage';
import { createItemNode } from './nodeCreation';
import { createArrayInstanceNode } from './arrayItems';
import type { PageContent, PageItem, SpanningItem, TextPageItem, ShapePageItem, ImagePageItem } from '../../../types';

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
    const arrayCount = item.arrayCount || 1;
    const arrayOffsetX = item.arrayOffsetX || 0;
    const arrayOffsetY = item.arrayOffsetY || 0;
    const arrayInstances = item.arrayInstances || [];

    // If array count is 1 or less, just create a single item
    if (arrayCount <= 1) {
      const node = createItemNode(item, xOffset, page.pageNumber, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
      if (node) {
        itemNodes.set(item.id, node);
        itemsLayer.add(node);
      }
      continue;
    }

    // Create a Konva.Group for array items
    const group = new Konva.Group({
      x: xOffset,
      y: 0,
      draggable: true,
    });
    group.setAttr('itemId', item.id);
    group.setAttr('pageNumber', page.pageNumber);
    group.setAttr('xOffset', xOffset);
    group.setAttr('isArrayGroup', true);

    // Create all array instances within the group
    for (let i = 0; i < Math.min(arrayCount, 50); i++) {
      const instanceConfig = arrayInstances.find(inst => inst.index === i);
      const instanceNode = createArrayInstanceNode(
        item, i, 0, arrayOffsetX, arrayOffsetY,
        instanceConfig, page.pageNumber, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn
      );
      if (instanceNode) {
        // Remove individual event handlers - group handles interactions
        instanceNode.draggable(false);
        instanceNode.off('click tap dragstart dragmove dragend transform transformend');
        instanceNode.setAttr('isArrayMember', true);
        group.add(instanceNode);
      }
    }

    // Handle group click to select the parent item
    group.on('click tap', () => {
      const position = xOffset === 0 ? 'verso' : 'recto';
      appState.updateEditor({
        selectedItemId: item.id,
        selectedItemIds: [item.id],
        selectedPageNumber: page.pageNumber,
        selectedPagePosition: position,
      });
      switchToSelectedTab();
    });

    // Handle group drag
    group.on('dragend', () => {
      const newX = group.x() - xOffset + item.x;
      const newY = group.y() + item.y;
      appState.updateItemOnPage(page.pageNumber, item.id, { x: newX, y: newY });
    });

    itemNodes.set(item.id, group);
    itemsLayer.add(group);
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
