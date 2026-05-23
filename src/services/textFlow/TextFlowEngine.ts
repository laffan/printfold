/**
 * Text flow engine for laying out markdown content across pages
 * Uses canvas-based text measurement for accurate flow calculations
 */

import { appState } from '../state';
import { parseMarkdownWithFootnotes } from './parsing';
import { flowSections, insertBlankPages } from './pagination';
import { calculatePageDimensions } from './dimensions';
import { buildInitialSlots, flowSectionsIntoSlots, materializeSlots } from './slotFlow';
import {
  captureStaticPages,
  mergeStaticPagesInPlace,
  padPagesToCompleteSignature,
  createSignaturesFromPages,
  createDefaultSignature
} from './signatures';
import {
  buildEndnoteSections,
  collectFootnoteNumbersOnPage,
  injectChapterEndnotes,
  measureFootnoteBlockHeight,
} from './footnotes';
import type { FootnoteDefinition, PageContent, TextFlowPageItem } from '../../types';
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

    // Parse markdown into sections + extract footnote definitions.
    const parsed = parseMarkdownWithFootnotes(markdown);
    let sections = parsed.sections;
    const footnotes = parsed.footnotes;
    const footnotesByNumber = new Map<number, FootnoteDefinition>();
    for (const f of footnotes) footnotesByNumber.set(f.number, f);

    // When endnote mode is on, append the synthetic endnote sections.
    const showAsEndnotes = this.layoutOptions.showFootnotesAsEndnotes === true;
    if (showAsEndnotes && footnotes.length > 0) {
      if (this.layoutOptions.endnotePlacement === 'chapter') {
        sections = injectChapterEndnotes(sections, footnotes);
      } else {
        sections = [...sections, ...buildEndnoteSections(footnotes)];
      }
    }

    // Calculate page dimensions
    const pageDimensions = calculatePageDimensions(
      this.outputOptions,
      this.layoutOptions,
      this.headerFooter
    );

    // Determine whether any static page has text-flow item regions; if so,
    // use slot-based flow so those regions receive their share of the
    // markdown stream alongside the surrounding pages.
    const hasTextFlowItems = [...staticPagesByNumber.values()].some(p =>
      (p.items || []).some((it): it is TextFlowPageItem => it.type === 'textFlow')
    );

    let textPages: import('../../types').PageContent[];
    let effectiveStaticPages = staticPagesByNumber;

    // Per-page reservations let the flow shrink the available content area
    // for pages that carry on-page footnotes. Recomputed each iteration
    // from the previous pass's results until it converges.
    const placeFootnotesOnPage = !showAsEndnotes && footnotes.length > 0;
    let reservations: number[] = [];
    // Footnotes should never crowd out the body content. Cap each page's
    // reservation so flow always has at least 30% of the content area for
    // body text — a runaway footnote block (e.g. one page bunching many
    // references) gets clipped here instead of producing zero body lines.
    const maxReservation = pageDimensions.contentHeight * 0.7;
    const computeReservations = (pages: PageContent[]): number[] => {
      if (!placeFootnotesOnPage) return [];
      return pages.map(page => {
        const nums = collectFootnoteNumbersOnPage(page);
        if (nums.length === 0) return 0;
        const defs = nums
          .map(n => footnotesByNumber.get(n))
          .filter((d): d is FootnoteDefinition => !!d);
        const raw = measureFootnoteBlockHeight(
          this.ctx,
          defs,
          pageDimensions.contentWidth,
          this.fontOptions,
          this.layoutOptions,
        );
        return Math.min(raw, maxReservation);
      });
    };

    // Merge two reservation arrays with a per-page maximum. We never let a
    // page's reservation shrink between iterations: when a footnote marker
    // sits right at a page boundary, reserving space for it pushes the
    // marker line to the next page — which would zero out the reservation
    // and let the line come back. That bounces forever. By keeping each
    // page's reservation monotonically non-decreasing, we anchor whichever
    // side of the boundary the marker landed on and converge in 1–2 extra
    // iterations. The worst case is a slightly under-filled body on the
    // page the marker vacated, which beats overlap.
    const mergeReservations = (prev: number[], next: number[]): number[] => {
      const len = Math.max(prev.length, next.length);
      const out = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        out[i] = Math.max(prev[i] || 0, next[i] || 0);
      }
      return out;
    };

    const runFlow = (): PageContent[] => {
      const getReserved = (pageIndex: number) => reservations[pageIndex] || 0;
      if (hasTextFlowItems) {
        const initialSlots = buildInitialSlots(staticPagesByNumber, pageDimensions);
        const filledSlots = flowSectionsIntoSlots(
          this.ctx,
          sections,
          initialSlots,
          pageDimensions,
          staticPagesByNumber,
          this.fontOptions,
          this.layoutOptions,
          getReserved,
        );
        const materialized = materializeSlots(filledSlots, staticPagesByNumber);
        effectiveStaticPages = materialized.updatedStaticPages;
        return materialized.textPages;
      }
      return flowSections(
        this.ctx,
        sections,
        pageDimensions,
        this.fontOptions,
        this.layoutOptions,
        getReserved,
      );
    };

    textPages = runFlow();
    if (placeFootnotesOnPage) {
      // Iterate until reservations are stable. With monotonic merging,
      // each iteration can only add to the reservation total (or leave it
      // unchanged), so the loop is bounded by the number of distinct page
      // slots that ever hold a footnote. 6 is generous for any realistic
      // document.
      for (let iter = 0; iter < 6; iter++) {
        const needed = computeReservations(textPages);
        const merged = mergeReservations(reservations, needed);
        const stable =
          merged.length === reservations.length &&
          merged.every((v, i) => Math.abs(v - reservations[i]) < 0.5);
        if (stable) break;
        reservations = merged;
        textPages = runFlow();
      }
      // Attach final footnote lists to each page so renderers can draw them.
      for (const page of textPages) {
        const nums = collectFootnoteNumbersOnPage(page);
        if (nums.length === 0) continue;
        const defs = nums
          .map(n => footnotesByNumber.get(n))
          .filter((d): d is FootnoteDefinition => !!d);
        if (defs.length > 0) page.footnotes = defs;
      }
    }

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

    // Merge text pages with static pages (use the updated static pages map
    // when slot-based flow ran, so populated textFlow items are kept).
    const allPages = mergeStaticPagesInPlace(textPagesWithBlanks, effectiveStaticPages);

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
