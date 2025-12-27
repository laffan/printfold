/**
 * SpreadEditor Items Module
 * Handles creation and rendering of page items (shapes, text, images)
 */

// Re-export all public functions
export { applyFillToShape } from './fill';
export { startTextEditing } from './textEditing';
export { createItemNode } from './nodeCreation';
export { createArrayInstanceNodes, calculateArrayPositions, getTotalArrayInstances } from './arrayItems';
export { renderPageItems, renderSpanningItems } from './rendering';
