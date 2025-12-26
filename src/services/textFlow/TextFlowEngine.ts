/**
 * Text flow engine for laying out markdown content across pages
 * Uses canvas-based text measurement for accurate flow calculations
 */

import { appState } from '../state';
import { parseMarkdown } from './parsing';
import { flowSections, insertBlankPages } from './pagination';
import { calculatePageDimensions } from './dimensions';
import {
  captureStaticPages,
  mergeStaticPagesInPlace,
  padPagesToCompleteSignature,
  createSignaturesFromPages,
  createDefaultSignature
} from './signatures';
import { calculateImposition, ImpositionSheet } from './imposition';
import type { FlowResult } from './types';
import type { FontOptions, LayoutOptions, OutputOptions, HeaderFooterOptions, Signature } from '../../types';

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

    // Flow sections across pages
    const textPages = flowSections(
      this.ctx,
      sections,
      pageDimensions,
      this.fontOptions,
      this.layoutOptions
    );

    // Insert blank pages (user-specified)
    const textPagesWithBlanks = insertBlankPages(textPages, project.blankPages);

    // If there's no content and no static pages, preserve the existing signature structure
    if (textPagesWithBlanks.length === 0 && staticPagesByNumber.size === 0) {
      if (project.signatures.length > 0) {
        const allPages: import('../../types').PageContent[] = [];
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
