/**
 * Array item instance creation for multi-dimensional repeated items
 *
 * Each dimension creates copies with its own offset pattern.
 * For example:
 * - Dimension 1: count=3, offset=(20, 0) creates copies at (0,0), (20,0), (40,0)
 * - Dimension 2: count=2, offset=(0, 30) duplicates the above row at y+30
 * Result: 6 copies in a 3x2 grid pattern
 */

import Konva from 'konva';
import { createItemNode } from './nodeCreation';
import type { PageItem, ArrayDimension } from '../../../types';

/**
 * Calculate all instance positions for multi-dimensional array
 * Returns array of {x, y} offsets for each instance
 */
export function calculateArrayPositions(dimensions: ArrayDimension[]): Array<{ x: number; y: number }> {
  if (!dimensions || dimensions.length === 0) {
    return [{ x: 0, y: 0 }];
  }

  // Start with the base position
  let positions: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];

  // Apply each dimension
  for (const dim of dimensions) {
    const newPositions: Array<{ x: number; y: number }> = [];

    // For each existing position, create dim.count copies
    for (const pos of positions) {
      for (let i = 0; i < dim.count; i++) {
        newPositions.push({
          x: pos.x + (dim.offsetX * i),
          y: pos.y + (dim.offsetY * i),
        });
      }
    }

    positions = newPositions;
  }

  return positions;
}

/**
 * Create all array instance nodes for an item
 */
export function createArrayInstanceNodes(
  item: PageItem,
  xOffset: number,
  pageNumber: number,
  zoomLevel: number,
  stage: Konva.Stage,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): Konva.Node[] {
  const dimensions = item.arrayDimensions || [];
  const positions = calculateArrayPositions(dimensions);
  const nodes: Konva.Node[] = [];

  // Create a node for each position
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];

    // Create a modified item for this instance position
    const instanceItem: PageItem = {
      ...item,
      id: `${item.id}-instance-${i}`,
      x: item.x + pos.x,
      y: item.y + pos.y,
      arrayDimensions: undefined, // Don't recurse
    } as PageItem;

    const node = createItemNode(
      instanceItem,
      xOffset,
      pageNumber,
      zoomLevel,
      stage,
      itemsLayer,
      transformer,
      updateTransformerFn
    );

    if (node) {
      node.setAttr('arrayInstanceIndex', i);
      node.setAttr('parentItemId', item.id);
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Get the total number of instances created by the array dimensions
 */
export function getTotalArrayInstances(dimensions: ArrayDimension[]): number {
  if (!dimensions || dimensions.length === 0) {
    return 1;
  }

  return dimensions.reduce((total, dim) => total * dim.count, 1);
}
