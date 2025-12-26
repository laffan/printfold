/**
 * Types for the text flow engine
 */

import type { DocumentSection, PageContent, Spread, Signature } from '../../types';

export interface MeasuredSection extends DocumentSection {
  measuredHeight: number;
  lines: string[];
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
