/**
 * Page operations for AppState
 * Handles blockTextFlow toggle, page insertion, movement, and deletion
 */

import type { PageContent, Spread, Signature, PageState, FillConfig } from '../../types';
import { AppState } from './AppStateCore';

/**
 * Set the blockTextFlow flag for a page
 * When true, text flow skips this page entirely
 */
AppState.prototype.setBlockTextFlow = function(pageNumber: number, blocked: boolean): void {
  const prevState = this.getProject();

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.pageNumber === pageNumber
        ? { ...spread.verso, blockTextFlow: blocked, pageState: (blocked ? 'available' : spread.verso.pageState) as PageState, isStatic: blocked }
        : spread.verso,
      recto: spread.recto?.pageNumber === pageNumber
        ? { ...spread.recto, blockTextFlow: blocked, pageState: (blocked ? 'available' : spread.recto.pageState) as PageState, isStatic: blocked }
        : spread.recto,
    })),
  }));

  this.setProject({ ...prevState, signatures });
  this.notifyProjectListeners(prevState);

  // Trigger reflow - text will now flow around/through this page
  this.requestReflow();
};

/**
 * @deprecated Use setBlockTextFlow instead.
 * Explicitly make a page static (removes it from text flow)
 */
AppState.prototype.makePageStatic = function(pageNumber: number): void {
  this.setBlockTextFlow(pageNumber, true);
};

/**
 * Check if a page has items but is not blocking text flow
 * (may want to suggest blocking text flow)
 */
AppState.prototype.pageNeedsStaticPrompt = function(pageNumber: number): boolean {
  const project = this.getProject();
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const page = spread.verso?.pageNumber === pageNumber ? spread.verso
        : spread.recto?.pageNumber === pageNumber ? spread.recto
        : null;
      if (page && !page.blockTextFlow && page.pageState !== 'static' && page.items && page.items.length > 0) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Insert a page at the currently selected position
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

  // Create new page with blockTextFlow enabled
  const newPage: PageContent = {
    id: crypto.randomUUID(),
    pageNumber: selectedPageNumber, // Will be renumbered
    pageState: 'available',
    sections: [],
    isBlank: true,
    isRecto: selectedPageNumber % 2 === 1,
    isStatic: true, // backward compat
    blockTextFlow: true,
    items: [],
  };

  // Insert the new page
  allPages.splice(actualInsertIndex, 0, newPage);

  // Check if we need to add available pages to maintain signature boundaries
  const currentTotal = allPages.length;
  const remainder = currentTotal % pagesPerSig;
  if (remainder !== 0) {
    const pagesToAdd = pagesPerSig - remainder;
    const maxPageNum = currentTotal;
    for (let i = 0; i < pagesToAdd; i++) {
      allPages.push({
        id: crypto.randomUUID(),
        pageNumber: maxPageNum + 1 + i,
        pageState: 'available',
        sections: [],
        isBlank: true,
        isRecto: false,
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

  // Select the new page
  const newPageNum = actualInsertIndex + 1;
  this.updateEditor({
    selectedPageNumber: newPageNum,
    selectedPagePosition: newPageNum % 2 === 1 ? 'recto' : 'verso',
  });

  // Trigger reflow
  this.requestReflow();
};

/**
 * Move a page from one position to another
 * The page at fromPageNumber is moved to toPageNumber, shifting other pages
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
  // Allow moving pages with blockTextFlow or items
  const hasItems = pageToMove.items && pageToMove.items.length > 0;
  if (!pageToMove.blockTextFlow && pageToMove.pageState !== 'static' && !hasItems) {
    console.warn('Can only move pages with blocked text flow or items');
    return;
  }

  // Remove page from current position
  allPages.splice(fromIndex, 1);

  let toIndex: number;
  if (fromPageNumber < toPageNumber) {
    toIndex = toPageNumber - 1;
    if (toIndex > allPages.length) {
      toIndex = allPages.length;
    }
  } else {
    toIndex = toPageNumber - 1;
    if (toIndex < 0) {
      toIndex = 0;
    }
  }

  // Insert at new position
  allPages.splice(toIndex, 0, pageToMove);

  // Renumber all pages
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

  // Select the moved page at its new position
  const newPageNum = toIndex + 1;
  this.updateEditor({
    selectedPageNumber: newPageNum,
    selectedPagePosition: newPageNum % 2 === 1 ? 'recto' : 'verso',
  });

  this.requestReflow();
};

/**
 * Delete a page with blocked text flow and reflow text to fill the gap
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
  // Allow deleting pages with blockTextFlow or legacy static
  if (!pageToDelete.blockTextFlow && pageToDelete.pageState !== 'static') {
    console.warn('Can only delete pages with blocked text flow');
    return;
  }

  // Remove the page
  allPages.splice(pageIndex, 1);

  // Fill to maintain complete signatures
  const remainder = allPages.length % pagesPerSig;
  if (remainder !== 0 || allPages.length === 0) {
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
        isRecto: false,
        isStatic: false,
        items: [],
      });
    }
  }

  // Renumber all pages
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

  this.requestReflow();
};

/**
 * Set the page state for a specific page
 * Used when restoring saved projects
 */
AppState.prototype.setPageState = function(pageNumber: number, state: PageState): void {
  const prevState = this.getProject();

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.pageNumber === pageNumber
        ? {
            ...spread.verso,
            pageState: state === 'static' ? 'available' as PageState : state,
            isBlank: state === 'available',
            isStatic: state === 'static',
            blockTextFlow: state === 'static' ? true : spread.verso.blockTextFlow,
          }
        : spread.verso,
      recto: spread.recto?.pageNumber === pageNumber
        ? {
            ...spread.recto,
            pageState: state === 'static' ? 'available' as PageState : state,
            isBlank: state === 'available',
            isStatic: state === 'static',
            blockTextFlow: state === 'static' ? true : spread.recto.blockTextFlow,
          }
        : spread.recto,
    })),
  }));

  this.setProject({ ...prevState, signatures });
  this.notifyProjectListeners(prevState);
};

/**
 * Set the background fill for a specific page
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
