/**
 * Navigation utilities for the SpreadEditor
 */

import { appState } from '../../../services/state';
import type { PageContent } from '../../../types';
import type { VisualSpread } from './types';

/**
 * Get all visual spreads (reading order pairs)
 * Visual spreads show pages in reading order: [null|1], [2|3], [4|5], etc.
 */
export function getVisualSpreads(): VisualSpread[] {
  const project = appState.getProject();

  // Collect all pages from all signatures
  const allPages: PageContent[] = [];
  project.signatures.forEach(sig => {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push(spread.verso);
      if (spread.recto) allPages.push(spread.recto);
    }
  });

  // Sort pages by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  if (allPages.length === 0) return [];

  // Find the highest page number to determine total visual spreads
  const maxPageNum = Math.max(...allPages.map(p => p.pageNumber));

  // Create a map for quick page lookup
  const pageMap = new Map<number, PageContent>();
  for (const page of allPages) {
    pageMap.set(page.pageNumber, page);
  }

  // Create visual spreads: [null|1], [2|3], [4|5], ..., [N|null]
  const visualSpreads: VisualSpread[] = [];

  // First spread: [null | page 1]
  visualSpreads.push({
    verso: null,
    recto: pageMap.get(1) || null,
  });

  // Middle and last spreads: [2|3], [4|5], etc.
  for (let versoNum = 2; versoNum <= maxPageNum; versoNum += 2) {
    const rectoNum = versoNum + 1;
    visualSpreads.push({
      verso: pageMap.get(versoNum) || null,
      recto: rectoNum <= maxPageNum ? (pageMap.get(rectoNum) || null) : null,
    });
  }

  return visualSpreads;
}

/**
 * Find the visual spread index containing a specific page number
 */
export function findSpreadIndexForPage(pageNumber: number): number {
  const visualSpreads = getVisualSpreads();

  for (let i = 0; i < visualSpreads.length; i++) {
    const spread = visualSpreads[i];
    if (
      (spread.verso && spread.verso.pageNumber === pageNumber) ||
      (spread.recto && spread.recto.pageNumber === pageNumber)
    ) {
      return i;
    }
  }

  return -1;
}
