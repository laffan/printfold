/**
 * Static page operations for AppState
 */

import type { PageContent, Spread, Signature, PageState, FillConfig } from '../../types';
import { AppState } from './AppStateCore';

/**
 * Explicitly make a page static (removes it from text flow)
 * Used when user confirms they want to claim a page for static content
 */
AppState.prototype.makePageStatic = function(pageNumber: number): void {
  const prevState = this.getProject();

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.pageNumber === pageNumber
        ? { ...spread.verso, pageState: 'static' as const, isStatic: true, sections: [] }
        : spread.verso,
      recto: spread.recto?.pageNumber === pageNumber
        ? { ...spread.recto, pageState: 'static' as const, isStatic: true, sections: [] }
        : spread.recto,
    })),
  }));

  this.setProject({ ...prevState, signatures });
  this.notifyProjectListeners(prevState);

  // Trigger reflow - text will now flow around this static page
  this.requestReflow();
};

/**
 * Check if a page has items but is not static (needs "make static?" prompt)
 */
AppState.prototype.pageNeedsStaticPrompt = function(pageNumber: number): boolean {
  const project = this.getProject();
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const page = spread.verso?.pageNumber === pageNumber ? spread.verso
        : spread.recto?.pageNumber === pageNumber ? spread.recto
        : null;
      if (page && page.pageState !== 'static' && page.items && page.items.length > 0) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Insert a static page at the currently selected position
 * Pushes existing pages forward by 1
 * Automatically adds available pages to maintain signature boundaries
 */
AppState.prototype.insertStaticPageAtSelection = function(): void {
  const prevState = this.getProject();
  const editor = this.getEditor();
  const selectedPageNumber = editor.selectedPageNumber;

  if (selectedPageNumber === null || selectedPageNumber === undefined) {
    console.warn('No page selected');
    return;
  }

  const pagesPerSig = prevState.outputOptions.pagesPerSignature;

  // Collect all pages from signatures into a flat array
  const allPages: PageContent[] = [];
  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push(spread.verso);
      if (spread.recto) allPages.push(spread.recto);
    }
  }

  // Sort by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  // Find insert position (insert AT the selected page, pushing it forward)
  const insertIndex = allPages.findIndex(p => p.pageNumber >= selectedPageNumber);
  const actualInsertIndex = insertIndex === -1 ? allPages.length : insertIndex;

  // Create new static page
  const newPage: PageContent = {
    id: crypto.randomUUID(),
    pageNumber: selectedPageNumber, // Will be renumbered
    pageState: 'static',
    sections: [],
    isBlank: true,
    isRecto: selectedPageNumber % 2 === 1,
    isStatic: true,
    items: [],
  };

  // Insert the new page
  allPages.splice(actualInsertIndex, 0, newPage);

  // Check if we need to add available pages to maintain signature boundaries
  const currentTotal = allPages.length;
  const remainder = currentTotal % pagesPerSig;
  if (remainder !== 0) {
    // Need to add (pagesPerSig - remainder) available pages at the end
    const pagesToAdd = pagesPerSig - remainder;
    const maxPageNum = currentTotal; // Will be renumbered, but need unique starting point
    for (let i = 0; i < pagesToAdd; i++) {
      allPages.push({
        id: crypto.randomUUID(),
        pageNumber: maxPageNum + 1 + i, // Will be renumbered
        pageState: 'available',
        sections: [],
        isBlank: true,
        isRecto: false, // Will be recalculated
        isStatic: false,
        items: [],
      });
    }
  }

  // Renumber all pages (1-based page numbers)
  allPages.forEach((page, index) => {
    const pageNum = index + 1;
    page.pageNumber = pageNum;
    page.isRecto = pageNum % 2 === 1;
  });

  // Rebuild spreads from the page array
  const newSpreads: Spread[] = [];
  for (let i = 0; i < allPages.length; i += 2) {
    newSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: newSpreads.length + 1,
      verso: allPages[i] || null,
      recto: allPages[i + 1] || null,
    });
  }

  // Rebuild signatures
  const spreadsPerSig = pagesPerSig / 2;
  const newSignatures: Signature[] = [];

  for (let i = 0; i < newSpreads.length; i += spreadsPerSig) {
    const sigSpreads = newSpreads.slice(i, i + spreadsPerSig);
    newSignatures.push({
      id: crypto.randomUUID(),
      signatureNumber: newSignatures.length + 1,
      spreads: sigSpreads,
      pageCount: sigSpreads.length * 2,
    });
  }

  this.setProject({ ...prevState, signatures: newSignatures });
  this.notifyProjectListeners(prevState);

  // Select the new static page (its position after renumbering is actualInsertIndex + 1)
  const newPageNum = actualInsertIndex + 1;
  this.updateEditor({
    selectedPageNumber: newPageNum,
    selectedPagePosition: newPageNum % 2 === 1 ? 'recto' : 'verso',
  });

  // Trigger reflow to adjust text around new static page
  this.requestReflow();
};

/**
 * Move a static page from one position to another
 * The page at fromPageNumber is moved to toPageNumber, shifting other pages
 * The dragged page will end up AT the target position (1-based page number)
 */
AppState.prototype.moveStaticPage = function(fromPageNumber: number, toPageNumber: number): void {
  if (fromPageNumber === toPageNumber) return;

  const prevState = this.getProject();

  // Collect all pages from signatures
  const allPages: PageContent[] = [];
  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push({ ...spread.verso });
      if (spread.recto) allPages.push({ ...spread.recto });
    }
  }

  // Sort by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  // Find the page to move
  const fromIndex = allPages.findIndex(p => p.pageNumber === fromPageNumber);
  if (fromIndex === -1) {
    console.warn('Source page not found:', fromPageNumber);
    return;
  }

  const pageToMove = allPages[fromIndex];
  // Allow moving static pages or pages with items
  const hasItems = pageToMove.items && pageToMove.items.length > 0;
  if (pageToMove.pageState !== 'static' && !hasItems) {
    console.warn('Can only move static pages or pages with items');
    return;
  }

  // Remove page from current position
  allPages.splice(fromIndex, 1);

  // Calculate target index (0-based) for the desired position (1-based)
  // After removal, we need to account for the shift in indices
  let toIndex: number;

  if (fromPageNumber < toPageNumber) {
    // Moving forward: the page should end up at toPageNumber position
    // After removal, indices after fromIndex shift down by 1
    // We want to insert so the page ends up at position toPageNumber
    // toPageNumber - 1 is the 0-based index, but since we removed one element before,
    // the actual insert index is toPageNumber - 1 - 1 = toPageNumber - 2
    // But we want it AT that position, so we insert AFTER the preceding element
    toIndex = toPageNumber - 1;
    if (toIndex > allPages.length) {
      toIndex = allPages.length;
    }
  } else {
    // Moving backward: insert at the target position directly
    // toPageNumber - 1 is the 0-based index
    toIndex = toPageNumber - 1;
    if (toIndex < 0) {
      toIndex = 0;
    }
  }

  // Insert at new position
  allPages.splice(toIndex, 0, pageToMove);

  // Renumber all pages (1-based page numbers)
  allPages.forEach((page, index) => {
    const pageNum = index + 1;
    page.pageNumber = pageNum;
    page.isRecto = pageNum % 2 === 1;
  });

  // Rebuild spreads
  const newSpreads: Spread[] = [];
  for (let i = 0; i < allPages.length; i += 2) {
    newSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: newSpreads.length + 1,
      verso: allPages[i] || null,
      recto: allPages[i + 1] || null,
    });
  }

  // Rebuild signatures
  const pagesPerSig = prevState.outputOptions.pagesPerSignature;
  const spreadsPerSig = pagesPerSig / 2;
  const newSignatures: Signature[] = [];

  for (let i = 0; i < newSpreads.length; i += spreadsPerSig) {
    const sigSpreads = newSpreads.slice(i, i + spreadsPerSig);
    newSignatures.push({
      id: crypto.randomUUID(),
      signatureNumber: newSignatures.length + 1,
      spreads: sigSpreads,
      pageCount: sigSpreads.length * 2,
    });
  }

  this.setProject({ ...prevState, signatures: newSignatures });
  this.notifyProjectListeners(prevState);

  // Select the moved page at its new position (1-based)
  const newPageNum = toIndex + 1;
  this.updateEditor({
    selectedPageNumber: newPageNum,
    selectedPagePosition: newPageNum % 2 === 1 ? 'recto' : 'verso',
  });

  // Trigger reflow to adjust text around moved page
  this.requestReflow();
};

/**
 * Delete a static page and reflow text to fill the gap
 * This removes a page from the booklet and shifts remaining pages
 */
AppState.prototype.deleteStaticPage = function(pageNumber: number): void {
  const prevState = this.getProject();
  const pagesPerSig = prevState.outputOptions.pagesPerSignature;

  // Collect all pages from signatures
  const allPages: PageContent[] = [];
  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push({ ...spread.verso });
      if (spread.recto) allPages.push({ ...spread.recto });
    }
  }

  // Sort by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  // Find the page to delete
  const pageIndex = allPages.findIndex(p => p.pageNumber === pageNumber);
  if (pageIndex === -1) {
    console.warn('Page not found:', pageNumber);
    return;
  }

  const pageToDelete = allPages[pageIndex];
  // Only allow deleting static pages
  if (pageToDelete.pageState !== 'static') {
    console.warn('Can only delete static pages');
    return;
  }

  // Remove the page
  allPages.splice(pageIndex, 1);

  // If we now have fewer pages than a full signature, don't remove pages
  // (we always need at least one full signature worth of pages)
  // Instead, add an available page at the end to replace the deleted one
  const remainder = allPages.length % pagesPerSig;
  if (remainder !== 0 || allPages.length === 0) {
    // We need to fill to maintain complete signatures
    // Add available pages to the end
    const pagesToAdd = remainder === 0 ? pagesPerSig : pagesPerSig - remainder;
    const maxPageNum = allPages.length > 0
      ? Math.max(...allPages.map(p => p.pageNumber))
      : 0;
    for (let i = 0; i < pagesToAdd; i++) {
      allPages.push({
        id: crypto.randomUUID(),
        pageNumber: maxPageNum + 1 + i,
        pageState: 'available',
        sections: [],
        isBlank: true,
        isRecto: false, // Will be recalculated
        isStatic: false,
        items: [],
      });
    }
  }

  // Renumber all pages (1-based)
  allPages.forEach((page, index) => {
    const pageNum = index + 1;
    page.pageNumber = pageNum;
    page.isRecto = pageNum % 2 === 1;
  });

  // Rebuild spreads
  const newSpreads: Spread[] = [];
  for (let i = 0; i < allPages.length; i += 2) {
    newSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: newSpreads.length + 1,
      verso: allPages[i] || null,
      recto: allPages[i + 1] || null,
    });
  }

  // Rebuild signatures
  const spreadsPerSig = pagesPerSig / 2;
  const newSignatures: Signature[] = [];

  for (let i = 0; i < newSpreads.length; i += spreadsPerSig) {
    const sigSpreads = newSpreads.slice(i, i + spreadsPerSig);
    newSignatures.push({
      id: crypto.randomUUID(),
      signatureNumber: newSignatures.length + 1,
      spreads: sigSpreads,
      pageCount: sigSpreads.length * 2,
    });
  }

  this.setProject({ ...prevState, signatures: newSignatures });
  this.notifyProjectListeners(prevState);

  // Clear selection
  this.updateEditor({
    selectedPageNumber: null,
    selectedPagePosition: null,
  });

  // Trigger reflow to fill the gap with text content
  this.requestReflow();
};

/**
 * Set the page state for a specific page
 * Used when restoring saved projects
 */
AppState.prototype.setPageState = function(pageNumber: number, state: PageState): void {
  const prevState = this.getProject();

  // A page in 'text' state holds flowed markdown sections; static and
  // available pages are owned by the user (items / background only) and
  // must not retain leftover flowed content from a previous text flow.
  const applyPageState = (page: PageContent) => ({
    ...page,
    pageState: state,
    sections: state === 'text' ? page.sections : [],
    isBlank: state === 'available',
    isStatic: state === 'static',
  });

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.pageNumber === pageNumber ? applyPageState(spread.verso) : spread.verso,
      recto: spread.recto?.pageNumber === pageNumber ? applyPageState(spread.recto) : spread.recto,
    })),
  }));

  this.setProject({ ...prevState, signatures });
  this.notifyProjectListeners(prevState);
};

/**
 * Set the background fill for a specific page
 * Used when restoring saved projects and by the UI
 */
AppState.prototype.setPageBackgroundFill = function(pageNumber: number, fill: FillConfig | undefined): void {
  const prevState = this.getProject();

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.pageNumber === pageNumber
        ? { ...spread.verso, backgroundFill: fill }
        : spread.verso,
      recto: spread.recto?.pageNumber === pageNumber
        ? { ...spread.recto, backgroundFill: fill }
        : spread.recto,
    })),
  }));

  this.setProject({ ...prevState, signatures });
  this.notifyProjectListeners(prevState);
};
