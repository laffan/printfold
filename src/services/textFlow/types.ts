/**
 * Types for the text flow engine
 */

import type { DocumentSection, PageContent, Spread, Signature, RichTextLine } from '../../types';

export interface MeasuredSection extends DocumentSection {
  measuredHeight: number;
  lines: string[];           // Plain text lines (for backwards compatibility)
  richLines?: RichTextLine[]; // Rich text lines with inline styling
  lineHeights: number[];
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
