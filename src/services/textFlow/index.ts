/**
 * Text Flow Engine Module
 * Re-exports from modular implementation
 */

export { TextFlowEngine } from './TextFlowEngine';
export { clearMeasurementCache } from './cache';
export { parseMarkdown } from './parsing';
export { flowSections, insertBlankPages, createEmptyPage } from './pagination';
export { calculatePageDimensions, getMarginsForPage } from './dimensions';
export {
  captureStaticPages,
  mergeStaticPagesInPlace,
  padPagesToCompleteSignature,
  createSignaturesFromPages,
  createSpreadsForSignature,
  createDefaultSignature
} from './signatures';
export { calculateImposition } from './imposition';
export type { FlowResult, MeasuredSection, PageDimensions } from './types';

import { TextFlowEngine } from './TextFlowEngine';

// Singleton instance
export const textFlowEngine = new TextFlowEngine();
