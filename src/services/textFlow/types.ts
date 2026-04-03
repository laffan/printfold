/**
 * Types for the text flow engine
 */

import type { DocumentSection, PageContent, Spread, Signature, RichTextLine } from '../../types';

// Per-line positioning info for rendering when text wraps around items
export interface LinePosition {
  xOffset: number;  // Horizontal offset from normal content x (in points)
  width: number;    // Width used for this line (may differ from full content width)
}

export interface MeasuredSection extends DocumentSection {
  measuredHeight: number;
  lines: string[];           // Plain text lines (for backwards compatibility)
  richLines?: RichTextLine[]; // Rich text lines with inline styling
  lineHeights: number[];
  linePositions?: LinePosition[]; // Per-line position offsets for text displacement
}

export interface FlowResult {
  pages: PageContent[];
  spreads: Spread[];
  signatures: Signature[];
  totalPages: number;
}

export interface PageDimensions {
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
}
