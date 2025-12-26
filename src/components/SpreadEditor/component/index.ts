/**
 * SpreadEditor Component Module
 * Re-exports from modular implementation
 */

export type { VisualSpread } from './types';
export { getVisualSpreads, findSpreadIndexForPage } from './navigation';
export {
  drawPageOutline,
  drawTransparentPlaceholder,
  drawPageBackground,
  drawSelectedPageIndicator
} from './rendering';

// Re-export the main class from the parent directory
// The main class is kept intact due to its complexity
