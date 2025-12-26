/**
 * Signature management utilities for the text flow engine
 */

import { createEmptyPage } from './pagination';
import type { FlowResult } from './types';
import type { PageContent, Spread, Signature, OutputOptions } from '../../types';
import { appState } from '../state';

/**
 * Capture static and available pages from existing signatures
 * Returns a map of pageNumber -> PageContent for pages that should be preserved
 */
export function captureStaticPages(signatures: Signature[]): Map<number, PageContent> {
  const preservedPages = new Map<number, PageContent>();

  for (const sig of signatures) {
    for (const spread of sig.spreads) {
      // Preserve static pages (explicitly claimed for static content)
      if (spread.verso?.pageState === 'static') {
        preservedPages.set(spread.verso.pageNumber, spread.verso);
      }
      if (spread.recto?.pageState === 'static') {
        preservedPages.set(spread.recto.pageNumber, spread.recto);
      }
      // Also preserve available pages that have items
      if (spread.verso?.pageState === 'available' && spread.verso.items?.length) {
        preservedPages.set(spread.verso.pageNumber, spread.verso);
      }
      if (spread.recto?.pageState === 'available' && spread.recto.items?.length) {
        preservedPages.set(spread.recto.pageNumber, spread.recto);
      }
    }
  }

  return preservedPages;
}

/**
 * Merge text pages with static/available pages
 */
export function mergeStaticPagesInPlace(
  textPages: PageContent[],
  preservedPages: Map<number, PageContent>
): PageContent[] {
  // If no preserved pages and no text, return empty
  if (preservedPages.size === 0 && textPages.length === 0) {
    return [];
  }

  // If no preserved pages, just return text pages numbered from 1
  if (preservedPages.size === 0) {
    return textPages.map((page, i) => ({
      ...page,
      pageNumber: i + 1,
      isRecto: (i + 1) % 2 === 1,
      pageState: 'text' as const,
    }));
  }

  // With preserved pages, we need to place them at their positions
  // and flow text into the remaining slots
  const maxPreservedPageNum = Math.max(...preservedPages.keys());
  const minPagesNeeded = Math.max(textPages.length + preservedPages.size, maxPreservedPageNum);

  const result: PageContent[] = [];
  let textPageIndex = 0;

  for (let pageNum = 1; pageNum <= minPagesNeeded; pageNum++) {
    if (preservedPages.has(pageNum)) {
      const preservedPage = preservedPages.get(pageNum)!;
      result.push({
        ...preservedPage,
        pageNumber: pageNum,
        isRecto: pageNum % 2 === 1,
      });
    } else if (textPageIndex < textPages.length) {
      result.push({
        ...textPages[textPageIndex],
        pageNumber: pageNum,
        isRecto: pageNum % 2 === 1,
        pageState: 'text',
      });
      textPageIndex++;
    } else {
      result.push(createEmptyPage(pageNum, true));
    }
  }

  // Append remaining text pages at the end
  while (textPageIndex < textPages.length) {
    const pageNum = result.length + 1;
    result.push({
      ...textPages[textPageIndex],
      pageNumber: pageNum,
      isRecto: pageNum % 2 === 1,
      pageState: 'text',
    });
    textPageIndex++;
  }

  return result;
}

/**
 * Pad pages to fill complete signatures
 */
export function padPagesToCompleteSignature(
  pages: PageContent[],
  pagesPerSig: number
): PageContent[] {
  if (pages.length === 0) {
    return pages;
  }

  const remainder = pages.length % pagesPerSig;
  if (remainder === 0) {
    return pages;
  }

  const pagesToAdd = pagesPerSig - remainder;
  const result = [...pages];
  let maxPageNum = Math.max(...pages.map(p => p.pageNumber));

  for (let i = 0; i < pagesToAdd; i++) {
    maxPageNum += 1;
    result.push({
      id: crypto.randomUUID(),
      pageNumber: maxPageNum,
      pageState: 'available',
      sections: [],
      isBlank: true,
      isRecto: maxPageNum % 2 === 1,
      isStatic: false,
      items: [],
    });
  }

  return result;
}

/**
 * Create visual spreads for a single signature's pages
 */
export function createSpreadsForSignature(
  pages: PageContent[],
  signatureNumber: number
): Spread[] {
  const spreads: Spread[] = [];

  if (pages.length === 0) return spreads;

  const project = appState.getProject();
  const prevFirstSpread = signatureNumber === 1 ? project.signatures[0]?.spreads[0] : null;

  const page1 = pages[0];

  // Preserve items and state from previous page 1
  if (signatureNumber === 1 && prevFirstSpread?.recto?.pageNumber === page1.pageNumber) {
    if (prevFirstSpread.recto.items && !page1.items?.length) {
      page1.items = prevFirstSpread.recto.items;
    }
    if (prevFirstSpread.recto.backgroundFill && !page1.backgroundFill) {
      page1.backgroundFill = prevFirstSpread.recto.backgroundFill;
    }
  }

  // First spread: null verso (ghost placeholder), page 1 on recto
  const spreadId = (signatureNumber === 1 && prevFirstSpread?.id) || crypto.randomUUID();
  spreads.push({
    id: spreadId,
    spreadNumber: 1,
    verso: null,
    recto: page1,
  });

  // Middle pages
  const remainingPages = pages.slice(1);
  const lastPage = remainingPages.length > 0 ? remainingPages[remainingPages.length - 1] : null;
  const middlePages = lastPage ? remainingPages.slice(0, -1) : [];

  for (let i = 0; i < middlePages.length; i += 2) {
    const verso = middlePages[i] || null;
    const recto = middlePages[i + 1] || null;

    if (verso || recto) {
      spreads.push({
        id: crypto.randomUUID(),
        spreadNumber: spreads.length + 1,
        verso,
        recto,
      });
    }
  }

  // Last spread: back cover on left, null on right
  if (lastPage && lastPage.pageNumber !== page1.pageNumber) {
    spreads.push({
      id: crypto.randomUUID(),
      spreadNumber: spreads.length + 1,
      verso: lastPage,
      recto: null,
    });
  }

  return spreads;
}

/**
 * Create signatures directly from pages
 */
export function createSignaturesFromPages(
  pages: PageContent[],
  pagesPerSig: number
): Signature[] {
  const signatures: Signature[] = [];

  if (pages.length === 0) {
    return signatures;
  }

  for (let sigStart = 0; sigStart < pages.length; sigStart += pagesPerSig) {
    const sigPages = pages.slice(sigStart, sigStart + pagesPerSig);
    const signatureNumber = Math.floor(sigStart / pagesPerSig) + 1;

    const spreads = createSpreadsForSignature(sigPages, signatureNumber);

    signatures.push({
      id: crypto.randomUUID(),
      signatureNumber,
      spreads,
      pageCount: sigPages.length,
    });
  }

  return signatures;
}

/**
 * Create a default empty signature with available pages
 */
export function createDefaultSignature(pagesPerSig: number): FlowResult {
  const pages: PageContent[] = [];

  for (let i = 0; i < pagesPerSig; i++) {
    const pageNum = i + 1;
    pages.push({
      id: crypto.randomUUID(),
      pageNumber: pageNum,
      pageState: 'available',
      sections: [],
      isBlank: true,
      isRecto: pageNum % 2 === 1,
      isStatic: false,
      items: [],
    });
  }

  const signatures = createSignaturesFromPages(pages, pagesPerSig);
  const spreads = signatures.flatMap(sig => sig.spreads);

  return {
    pages,
    spreads,
    signatures,
    totalPages: pages.length,
  };
}
