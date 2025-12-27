/**
 * Page items rendering for the SpreadEditor
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import { switchToSelectedTab } from '../../OptionsPanel/editPage';
import { createItemNode } from './nodeCreation';
import { createArrayInstanceNodes, getTotalArrayInstances } from './arrayItems';
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
    const dimensions = item.arrayDimensions || [];
    const totalInstances = getTotalArrayInstances(dimensions);

    // If no array dimensions or only 1 instance, just create a single item
    if (totalInstances <= 1) {
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

    // Create all array instances within the group using multi-dimensional calculation
    const instanceNodes = createArrayInstanceNodes(
      item, 0, page.pageNumber, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn
    );

    for (const instanceNode of instanceNodes) {
      // Remove individual event handlers - group handles interactions
      instanceNode.draggable(false);
      instanceNode.off('click tap dragstart dragmove dragend transform transformend');
      instanceNode.setAttr('isArrayMember', true);
      group.add(instanceNode);
    }

    // Handle group click to select the parent item
    group.on('click tap', (e) => {
      const position = xOffset === 0 ? 'verso' : 'recto';
      const additive = e.evt?.shiftKey || false;
      appState.updateEditor({
        selectedPageNumber: page.pageNumber,
        selectedPagePosition: position,
      });
      appState.selectItem(item.id, additive);
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
