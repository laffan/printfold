/**
 * Text flow through regions
 * Flows markdown content through TextFlow regions on static pages
 */

import { appState } from '../state';
import { measureSection, getFontStyleForSection } from './measurement';
import type { MeasuredSection, PageDimensions } from './types';
import type { DocumentSection, FontOptions, LayoutOptions, TextFlowRegion, TextFlowPageItem, PageContent } from '../../types';

/**
 * Result of flowing text through regions
 */
export interface RegionFlowResult {
  /** Content that was flowed into each region, keyed by region ID */
  regionContent: Map<string, MeasuredSection[]>;
  /** Remaining sections that didn't fit in any region */
  remainingSections: DocumentSection[];
}

/**
 * Get the bounds of a text flow region item
 */
function getRegionBounds(region: TextFlowRegion, signatures: import('../../types').Signature[]): {
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
 * Flow sections into text flow regions
 * Returns content for each region and remaining sections that didn't fit
 */
export function flowSectionsIntoRegions(
  ctx: CanvasRenderingContext2D,
  sections: DocumentSection[],
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): RegionFlowResult {
  const project = appState.getProject();
  const textFlows = project.textFlows || [];

  // If no text flow regions, return all sections as remaining
  if (textFlows.length === 0) {
    return {
      regionContent: new Map(),
      remainingSections: sections,
    };
  }

  const regionContent = new Map<string, MeasuredSection[]>();
  let remainingSections = [...sections];

  // Process each region in order
  for (const region of textFlows) {
    const bounds = getRegionBounds(region, project.signatures);
    if (!bounds) continue;

    // Initialize content array for this region
    regionContent.set(region.id, []);
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
        // Region is full, move to next region
        break;
      }
    }

    regionContent.set(region.id, regionSections);
  }

  return {
    regionContent,
    remainingSections,
  };
}

/**
 * Get the content for a specific text flow region
 */
export function getRegionContent(regionId: string, regionFlowResult: RegionFlowResult): MeasuredSection[] {
  return regionFlowResult.regionContent.get(regionId) || [];
}
