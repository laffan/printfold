/**
 * Text flow through regions
 * Flows markdown content through TextFlow regions on static pages
 *
 * Text flow regions intercept content at their page position:
 * - If a text flow region is on page 3, it captures content that would have started on page 3
 * - Multiple regions are processed in order (A, B, C...)
 * - Content flows: regular pages -> text flow regions -> continue on regular pages
 */

import { appState } from '../state';
import { measureSection, getFontStyleForSection } from './measurement';
import type { MeasuredSection, PageDimensions } from './types';
import type { DocumentSection, FontOptions, LayoutOptions, TextFlowRegion, PageContent } from '../../types';

/**
 * Result of flowing text through regions
 */
export interface RegionFlowResult {
  /** Content that was flowed into each region, keyed by region ID */
  regionContent: Map<string, MeasuredSection[]>;
  /** Map of page numbers that have text flow regions */
  pagesWithRegions: Set<number>;
}

/**
 * Get the bounds of a text flow region item
 */
export function getRegionBounds(region: TextFlowRegion, signatures: import('../../types').Signature[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  // Find the page containing this region
  for (const sig of signatures) {
    for (const spread of sig.spreads) {
      const pages = [spread.verso, spread.recto].filter(Boolean) as PageContent[];
      for (const page of pages) {
        if (page.pageNumber === region.pageNumber && page.items) {
          const item = page.items.find(i => i.id === region.itemId && i.type === 'textflow');
          if (item) {
            return {
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
            };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Get all text flow regions sorted by their page position
 */
export function getTextFlowsByPage(): Map<number, TextFlowRegion[]> {
  const project = appState.getProject();
  const textFlows = project.textFlows || [];

  // Group regions by page number
  const byPage = new Map<number, TextFlowRegion[]>();

  for (const flow of textFlows) {
    const existing = byPage.get(flow.pageNumber) || [];
    existing.push(flow);
    byPage.set(flow.pageNumber, existing);
  }

  return byPage;
}

/**
 * Flow content into a single region
 * Returns the measured sections that fit and updates remainingSections in place
 */
export function flowIntoRegion(
  ctx: CanvasRenderingContext2D,
  region: TextFlowRegion,
  remainingSections: DocumentSection[],
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): MeasuredSection[] {
  const project = appState.getProject();
  const bounds = getRegionBounds(region, project.signatures);

  if (!bounds || remainingSections.length === 0) {
    return [];
  }

  const regionSections: MeasuredSection[] = [];
  let currentHeight = 0;

  // Flow sections into this region
  while (remainingSections.length > 0) {
    const section = remainingSections[0];

    // Measure the section for this region's width
    const measured = measureSection(ctx, section, bounds.width, fontOptions, layoutOptions);

    // Check if section fits in remaining space
    if (currentHeight + measured.measuredHeight <= bounds.height) {
      regionSections.push(measured);
      currentHeight += measured.measuredHeight;
      remainingSections.shift();
    } else {
      // Try to fit partial content for paragraphs
      if ((section.type === 'paragraph' || section.type === 'blockquote') && measured.lines.length > 1) {
        const fontStyle = getFontStyleForSection(section, fontOptions);
        const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

        const remainingHeight = bounds.height - currentHeight;
        const linesForRegion = Math.floor(remainingHeight / lineHeight);

        if (linesForRegion >= 2) {
          // Split the section
          const firstPart: MeasuredSection = {
            ...measured,
            lines: measured.lines.slice(0, linesForRegion),
            richLines: measured.richLines?.slice(0, linesForRegion),
            lineHeights: measured.lines.slice(0, linesForRegion).map(() => lineHeight),
            measuredHeight: linesForRegion * lineHeight,
          };
          regionSections.push(firstPart);

          // Update the remaining section
          const remainingLines = measured.lines.slice(linesForRegion);
          if (remainingLines.length > 0) {
            // Create a modified section with remaining content
            const remainingSection: DocumentSection = {
              ...section,
              content: remainingLines.join('\n'),
            };
            remainingSections[0] = remainingSection;
          } else {
            remainingSections.shift();
          }
        }
      }
      // Region is full, stop
      break;
    }
  }

  return regionSections;
}

/**
 * Create an empty region flow result
 */
export function createEmptyRegionFlowResult(): RegionFlowResult {
  return {
    regionContent: new Map(),
    pagesWithRegions: new Set(),
  };
}

/**
 * This is a compatibility function - the old approach is deprecated.
 * Region flow now happens during pagination, not before.
 */
export function flowSectionsIntoRegions(
  ctx: CanvasRenderingContext2D,
  sections: DocumentSection[],
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): RegionFlowResult & { remainingSections: DocumentSection[] } {
  // This function is now a no-op - regions are processed during pagination
  // Return all sections as remaining
  const project = appState.getProject();
  const textFlows = project.textFlows || [];

  return {
    regionContent: new Map(),
    pagesWithRegions: new Set(textFlows.map(f => f.pageNumber)),
    remainingSections: sections,
  };
}
