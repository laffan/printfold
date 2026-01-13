/**
 * Text flow engine for laying out markdown content across pages
 * Uses canvas-based text measurement for accurate flow calculations
 */

import { appState } from '../state';
import { parseMarkdown } from './parsing';
import { flowSections, insertBlankPages, createEmptyPage } from './pagination';
import { calculatePageDimensions } from './dimensions';
import { measureSection, getFontStyleForSection } from './measurement';
import {
  captureStaticPages,
  mergeStaticPagesInPlace,
  padPagesToCompleteSignature,
  createSignaturesFromPages,
  createDefaultSignature
} from './signatures';
import { calculateImposition, ImpositionSheet } from './imposition';
import {
  RegionFlowResult,
  getTextFlowsByPage,
  getRegionBounds,
  flowIntoRegion,
  createEmptyRegionFlowResult
} from './regionFlow';
import type { FlowResult, MeasuredSection, PageDimensions } from './types';
import type {
  FontOptions,
  LayoutOptions,
  OutputOptions,
  HeaderFooterOptions,
  Signature,
  DocumentSection,
  PageContent,
  TextFlowRegion
} from '../../types';

export class TextFlowEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontOptions: FontOptions;
  private layoutOptions: LayoutOptions;
  private outputOptions: OutputOptions;
  private headerFooter: HeaderFooterOptions;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.fontOptions = appState.getProject().fontOptions;
    this.layoutOptions = appState.getProject().layoutOptions;
    this.outputOptions = appState.getProject().outputOptions;
    this.headerFooter = appState.getProject().headerFooter;
  }

  // Store the last region flow result for rendering
  private lastRegionFlowResult: RegionFlowResult | null = null;

  /**
   * Get the content for a specific text flow region
   */
  getRegionContent(regionId: string): MeasuredSection[] {
    if (!this.lastRegionFlowResult) return [];
    return this.lastRegionFlowResult.regionContent.get(regionId) || [];
  }

  /**
   * Flow content through pages and text flow regions
   * Text flow regions intercept content at their page position
   */
  private flowWithRegions(
    sections: DocumentSection[],
    pageDimensions: PageDimensions,
    staticPagesByNumber: Map<number, PageContent>
  ): { textPages: PageContent[]; regionContent: Map<string, MeasuredSection[]> } {
    const project = appState.getProject();
    const textFlows = project.textFlows || [];
    const regionContent = new Map<string, MeasuredSection[]>();

    // If no text flow regions, just flow normally
    if (textFlows.length === 0) {
      const textPages = flowSections(
        this.ctx,
        sections,
        pageDimensions,
        this.fontOptions,
        this.layoutOptions
      );
      return { textPages, regionContent };
    }

    // Get text flows grouped by page number
    const flowsByPage = getTextFlowsByPage();

    // Sort static page numbers that have text flow regions
    const staticPagesWithFlows = Array.from(flowsByPage.keys()).sort((a, b) => a - b);

    const textPages: PageContent[] = [];
    let remainingSections = [...sections];
    let currentSlot = 1; // The page position we're filling

    while (remainingSections.length > 0 || currentSlot <= Math.max(...staticPagesWithFlows, 0)) {
      // Check if this slot has a static page with text flow regions
      if (staticPagesByNumber.has(currentSlot) && flowsByPage.has(currentSlot)) {
        // Flow content into the text flow regions at this position
        const regionsAtPage = flowsByPage.get(currentSlot)!;

        for (const region of regionsAtPage) {
          const content = flowIntoRegion(
            this.ctx,
            region,
            remainingSections,
            this.fontOptions,
            this.layoutOptions
          );
          regionContent.set(region.id, content);
        }

        // Move to next slot (static page is already captured separately)
        currentSlot++;
        continue;
      }

      // Check if this slot has a static page (without flow regions)
      if (staticPagesByNumber.has(currentSlot)) {
        // Skip this slot - static page will be merged in later
        currentSlot++;
        continue;
      }

      // No static page at this slot - fill with text content
      if (remainingSections.length === 0) {
        // No more content, we're done
        break;
      }

      // Flow one page worth of content
      const pageContent = this.flowOnePage(remainingSections, pageDimensions);
      if (pageContent.sections.length > 0) {
        // Assign a temporary page number (will be reassigned during merge)
        pageContent.pageNumber = textPages.length + 1;
        textPages.push(pageContent);
      }

      currentSlot++;

      // Safety check to prevent infinite loops
      if (currentSlot > 1000) break;
    }

    // Flow any remaining content
    while (remainingSections.length > 0) {
      const pageContent = this.flowOnePage(remainingSections, pageDimensions);
      if (pageContent.sections.length > 0) {
        pageContent.pageNumber = textPages.length + 1;
        textPages.push(pageContent);
      } else {
        break; // No more content could be flowed
      }
    }

    return { textPages, regionContent };
  }

  /**
   * Flow content into a single page
   */
  private flowOnePage(
    remainingSections: DocumentSection[],
    pageDimensions: PageDimensions
  ): PageContent {
    const page: PageContent = createEmptyPage(1);
    page.pageState = 'text';
    let currentHeight = 0;

    while (remainingSections.length > 0) {
      const section = remainingSections[0];
      const measured = measureSection(
        this.ctx,
        section,
        pageDimensions.contentWidth,
        this.fontOptions,
        this.layoutOptions
      );

      if (currentHeight + measured.measuredHeight <= pageDimensions.contentHeight) {
        page.sections.push(measured);
        currentHeight += measured.measuredHeight;
        remainingSections.shift();
      } else {
        // Try to fit partial content for paragraphs
        if ((section.type === 'paragraph' || section.type === 'blockquote') && measured.lines.length > 1) {
          const fontStyle = getFontStyleForSection(section, this.fontOptions);
          const lineHeight = this.layoutOptions.lineHeight * fontStyle.fontSize;

          const remainingHeight = pageDimensions.contentHeight - currentHeight;
          const linesForPage = Math.floor(remainingHeight / lineHeight);

          if (linesForPage >= 2) {
            const firstPart: MeasuredSection = {
              ...measured,
              lines: measured.lines.slice(0, linesForPage),
              richLines: measured.richLines?.slice(0, linesForPage),
              lineHeights: measured.lines.slice(0, linesForPage).map(() => lineHeight),
              measuredHeight: linesForPage * lineHeight,
            };
            page.sections.push(firstPart);
            currentHeight += firstPart.measuredHeight;

            // Update remaining section
            const remainingLines = measured.lines.slice(linesForPage);
            if (remainingLines.length > 0) {
              remainingSections[0] = {
                ...section,
                content: remainingLines.join('\n'),
              };
            } else {
              remainingSections.shift();
            }
          }
        }
        // Page is full
        break;
      }
    }

    return page;
  }

  /**
   * Main entry point - reflow content based on current state
   * Static pages are preserved in place and text flows around them
   */
  reflow(markdown: string): FlowResult {
    // Refresh options from state
    const project = appState.getProject();
    this.fontOptions = project.fontOptions;
    this.layoutOptions = project.layoutOptions;
    this.outputOptions = project.outputOptions;
    this.headerFooter = project.headerFooter;

    // Capture existing static pages from current signatures
    const staticPagesByNumber = captureStaticPages(project.signatures);

    // Parse markdown into sections
    const sections = parseMarkdown(markdown);

    // Calculate page dimensions
    const pageDimensions = calculatePageDimensions(
      this.outputOptions,
      this.layoutOptions,
      this.headerFooter
    );

    // Flow content through pages and regions
    const { textPages, regionContent } = this.flowWithRegions(
      sections,
      pageDimensions,
      staticPagesByNumber
    );

    // Store region content for rendering
    this.lastRegionFlowResult = {
      regionContent,
      pagesWithRegions: new Set((project.textFlows || []).map(f => f.pageNumber)),
    };

    // Insert blank pages (user-specified)
    const textPagesWithBlanks = insertBlankPages(textPages, project.blankPages);

    // If there's no content and no static pages, preserve the existing signature structure
    if (textPagesWithBlanks.length === 0 && staticPagesByNumber.size === 0) {
      if (project.signatures.length > 0) {
        const allPages: PageContent[] = [];
        for (const sig of project.signatures) {
          for (const spread of sig.spreads) {
            if (spread.verso) allPages.push(spread.verso);
            if (spread.recto) allPages.push(spread.recto);
          }
        }
        return {
          pages: allPages,
          spreads: project.signatures.flatMap(s => s.spreads),
          signatures: project.signatures,
          totalPages: allPages.length,
        };
      }
      return createDefaultSignature(this.outputOptions.pagesPerSignature);
    }

    // Merge text pages with static pages
    const allPages = mergeStaticPagesInPlace(textPagesWithBlanks, staticPagesByNumber);

    // Pad pages to complete signatures
    const paddedPages = padPagesToCompleteSignature(allPages, this.outputOptions.pagesPerSignature);

    // Create signatures from pages
    const signatures = createSignaturesFromPages(paddedPages, this.outputOptions.pagesPerSignature);

    // Collect all spreads
    const spreads = signatures.flatMap(sig => sig.spreads);

    return {
      pages: paddedPages,
      spreads,
      signatures,
      totalPages: paddedPages.length,
    };
  }

  /**
   * Calculate imposition order for printing
   */
  calculateImposition(signature: Signature): ImpositionSheet[] {
    return calculateImposition(signature);
  }
}
