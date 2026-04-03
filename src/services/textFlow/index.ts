/**
 * Text Flow Engine Module
 * Re-exports from modular implementation
 */

export { TextFlowEngine } from './TextFlowEngine';
export { clearMeasurementCache } from './cache';
export { parseMarkdown, parseInlineMarkdown, tokensToSpans, mergeAdjacentSpans, richLineToPlainText, plainTextToRichLine } from './parsing';
export { getSpanFontStyle, measureSpanWidth, measureRichLineWidth, wrapRichText, wrapRichTextAtWidth, getFontStyleForSection } from './measurement';
export { flowSections, insertBlankPages, createEmptyPage } from './pagination';
export { calculatePageDimensions, getMarginsForPage } from './dimensions';
export {
  captureBlockedPages,
  captureStaticPages,
  mergeBlockedPagesInPlace,
  mergeStaticPagesInPlace,
  padPagesToCompleteSignature,
  createSignaturesFromPages,
  createSpreadsForSignature,
  createDefaultSignature
} from './signatures';
export { calculateImposition } from './imposition';
export {
  buildDisplacementZones,
  getTextRegionAtY,
  collectDisplacementZones,
  findNextClearY
} from './displacement';
export type { FlowResult, MeasuredSection, PageDimensions, LinePosition } from './types';
export type { DisplacementZone, TextRegion } from './displacement';

import { TextFlowEngine } from './TextFlowEngine';

// Singleton instance
export const textFlowEngine = new TextFlowEngine();
