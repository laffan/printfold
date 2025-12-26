/**
 * Types for the SpreadEditor component
 */

import type { PageContent } from '../../../types';

// Type for visual spreads (reading order pairs)
export interface VisualSpread {
  verso: PageContent | null;
  recto: PageContent | null;
}
