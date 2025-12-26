/**
 * Array item instance creation for repeated items
 */

import Konva from 'konva';
import { createItemNode } from './nodeCreation';
import type { PageItem, ShapePageItem, TextPageItem, ArrayInstance } from '../../../types';

/**
 * Create a single array instance node with optional fill override
 */
export function createArrayInstanceNode(
  item: PageItem,
  instanceIndex: number,
  xOffset: number,
  arrayOffsetX: number,
  arrayOffsetY: number,
  instanceConfig: ArrayInstance | undefined,
  pageNumber: number,
  zoomLevel: number,
  stage: Konva.Stage,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): Konva.Shape | Konva.Text | Konva.Arrow | null {
  // Create a modified item for this instance position
  const instanceItem: PageItem = {
    ...item,
    id: `${item.id}-instance-${instanceIndex}`,
    x: item.x + (arrayOffsetX * instanceIndex),
    y: item.y + (arrayOffsetY * instanceIndex),
    arrayCount: undefined,
    arrayOffsetX: undefined,
    arrayOffsetY: undefined,
    arrayInstances: undefined,
  } as PageItem;

  // Apply instance-specific fill override
  if (instanceConfig?.fill) {
    if (instanceItem.type === 'shape') {
      (instanceItem as ShapePageItem).fill = instanceConfig.fill;
    } else if (instanceItem.type === 'text') {
      (instanceItem as TextPageItem).fill = instanceConfig.fill;
    }
  }
  if (instanceConfig?.opacity !== undefined) {
    instanceItem.opacity = instanceConfig.opacity;
  }

  const node = createItemNode(instanceItem, xOffset, pageNumber, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
  if (node) {
    node.setAttr('arrayInstanceIndex', instanceIndex);
    node.setAttr('parentItemId', item.id);
  }
  return node;
}
