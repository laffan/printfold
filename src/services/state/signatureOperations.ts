/**
 * Signature and spread management for AppState
 */

import type { PageContent, Spread, Signature, StaticSpread, SpanningItem } from '../../types';
import { AppState } from './AppStateCore';

/**
 * Add a signature's worth of available pages at the end of the booklet
 * Each signature has its own spread layout: [null|first], [middle pairs], [last|null]
 */
AppState.prototype.addAvailableSignature = function(): void {
  const prevState = this.getProject();
  const pagesPerSig = prevState.outputOptions.pagesPerSignature;

  // Collect all pages from existing signatures
  const existingPages: PageContent[] = [];
  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) existingPages.push({ ...spread.verso });
      if (spread.recto) existingPages.push({ ...spread.recto });
    }
  }

  // Find the highest page number (or start at 0 if empty)
  const maxPageNum = existingPages.length > 0
    ? Math.max(...existingPages.map(p => p.pageNumber))
    : 0;

  // Create new pages for the new signature
  const newPages: PageContent[] = [];
  for (let i = 0; i < pagesPerSig; i++) {
    const pageNum = maxPageNum + 1 + i;
    newPages.push({
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

  // Create spreads for the new signature: [null|first], [middle pairs], [last|null]
  const newSpreads: Spread[] = [];

  // First spread: [null | first page]
  newSpreads.push({
    id: crypto.randomUUID(),
    spreadNumber: 1,
    verso: null,
    recto: newPages[0],
  });

  // Middle spreads: pairs of pages (all except first and last)
  for (let i = 1; i < newPages.length - 1; i += 2) {
    newSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: newSpreads.length + 1,
      verso: newPages[i],
      recto: newPages[i + 1] || null,
    });
  }

  // Last spread: [last page | null]
  if (newPages.length > 1) {
    newSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: newSpreads.length + 1,
      verso: newPages[newPages.length - 1],
      recto: null,
    });
  }

  // Create the new signature
  const newSignature: Signature = {
    id: crypto.randomUUID(),
    signatureNumber: prevState.signatures.length + 1,
    spreads: newSpreads,
    pageCount: pagesPerSig,
  };

  // Add to existing signatures
  const newSignatures = [...prevState.signatures, newSignature];

  this.setProject({ ...prevState, signatures: newSignatures });
  this.notifyProjectListeners(prevState);

  // Don't call requestReflow() - we're adding available pages, not text content
};

// DEPRECATED: Old staticSpreads methods - kept for backward compatibility
// Add a complete signature worth of static spreads
AppState.prototype.addStaticSignature = function(): void {
  // Redirect to new method
  this.addAvailableSignature();
};

// DEPRECATED: Add a single static spread (2 pages)
AppState.prototype.addStaticSpread = function(): void {
  const prevState = this.getProject();
  const staticSpreads = [...(prevState.staticSpreads || [])];

  const newIndex = staticSpreads.length;
  const basePageNumber = 1000 + newIndex * 2;

  const newSpread: StaticSpread = {
    id: crypto.randomUUID(),
    index: newIndex,
    verso: {
      id: crypto.randomUUID(),
      pageNumber: basePageNumber,
      pageState: 'static',
      sections: [],
      isBlank: true,
      isRecto: false,
      isStatic: true,
      items: [],
    },
    recto: {
      id: crypto.randomUUID(),
      pageNumber: basePageNumber + 1,
      pageState: 'static',
      sections: [],
      isBlank: true,
      isRecto: true,
      isStatic: true,
      items: [],
    },
  };

  staticSpreads.push(newSpread);
  this.setProject({ ...prevState, staticSpreads });
  this.notifyProjectListeners(prevState);
  this.requestReflow();
};

// DEPRECATED: Old method - redirect to new implementation
AppState.prototype.addStaticPage = function(position: 'verso' | 'recto' = 'recto'): void {
  // Redirect to new method
  this.insertStaticPageAtSelection();
};

AppState.prototype.removeStaticSpread = function(spreadId: string): void {
  const prevState = this.getProject();
  const staticSpreads = (prevState.staticSpreads || []).filter(s => s.id !== spreadId);

  // Reindex remaining spreads
  staticSpreads.forEach((spread, index) => {
    spread.index = index;
  });

  this.setProject({ ...prevState, staticSpreads });
  this.notifyProjectListeners(prevState);
  this.requestReflow();
};

AppState.prototype.getStaticSpreads = function(): StaticSpread[] {
  return this.getProject().staticSpreads || [];
};

/**
 * Reorder static spreads by swapping their positions
 * Handles both staticSpreads array and signature spreads with isStatic pages
 * @param sourceSpreadId - The ID of the spread being dragged
 * @param targetSpreadId - The ID of the spread to swap with
 */
AppState.prototype.reorderStaticPages = function(sourceSpreadId: string, targetSpreadId: string): void {
  const prevState = this.getProject();
  const staticSpreads = [...(prevState.staticSpreads || [])];

  // First try to swap in staticSpreads array
  const sourceStaticIndex = staticSpreads.findIndex(s => s.id === sourceSpreadId);
  const targetStaticIndex = staticSpreads.findIndex(s => s.id === targetSpreadId);

  if (sourceStaticIndex !== -1 && targetStaticIndex !== -1) {
    // Both are in staticSpreads - swap them
    if (sourceStaticIndex === targetStaticIndex) return;

    const temp = staticSpreads[sourceStaticIndex];
    staticSpreads[sourceStaticIndex] = staticSpreads[targetStaticIndex];
    staticSpreads[targetStaticIndex] = temp;

    staticSpreads.forEach((spread, index) => {
      spread.index = index;
    });

    this.setProject({ ...prevState, staticSpreads });
    this.notifyProjectListeners(prevState);
    this.requestReflow();
    return;
  }

  // If not in staticSpreads, try to swap in signatures
  // Find the spreads in signatures
  let sourceInfo: { sigIndex: number; spreadIndex: number } | null = null;
  let targetInfo: { sigIndex: number; spreadIndex: number } | null = null;

  for (let sigIndex = 0; sigIndex < prevState.signatures.length; sigIndex++) {
    const sig = prevState.signatures[sigIndex];
    for (let spreadIndex = 0; spreadIndex < sig.spreads.length; spreadIndex++) {
      const spread = sig.spreads[spreadIndex];
      if (spread.id === sourceSpreadId) {
        sourceInfo = { sigIndex, spreadIndex };
      }
      if (spread.id === targetSpreadId) {
        targetInfo = { sigIndex, spreadIndex };
      }
    }
  }

  if (!sourceInfo || !targetInfo) {
    console.warn('Could not find source or target spread in signatures');
    return;
  }

  // Only allow swapping within the same signature for now
  if (sourceInfo.sigIndex !== targetInfo.sigIndex) {
    console.warn('Cannot swap spreads across different signatures');
    return;
  }

  // Swap the spreads in the signature
  const signatures = prevState.signatures.map((sig, sigIndex) => {
    if (sigIndex !== sourceInfo!.sigIndex) return sig;

    const spreads = [...sig.spreads];
    const temp = spreads[sourceInfo!.spreadIndex];
    spreads[sourceInfo!.spreadIndex] = spreads[targetInfo!.spreadIndex];
    spreads[targetInfo!.spreadIndex] = temp;

    return { ...sig, spreads };
  });

  this.setProject({ ...prevState, signatures });
  this.notifyProjectListeners(prevState);
  // Note: Don't call requestReflow() as that would regenerate spreads from markdown
};

/**
 * Reorder signatures by moving one signature to a new position
 * Text reflows after reordering to fill available pages in the new order
 */
AppState.prototype.reorderSignatures = function(sourceIndex: number, targetIndex: number): void {
  const project = this.getProject();
  if (sourceIndex === targetIndex) return;
  if (sourceIndex < 0 || sourceIndex >= project.signatures.length) return;
  if (targetIndex < 0 || targetIndex >= project.signatures.length) return;

  const prevState = project;

  // Collect all pages maintaining their pageState
  const allPages: PageContent[] = [];
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push({ ...spread.verso });
      if (spread.recto) allPages.push({ ...spread.recto });
    }
  }

  // Sort by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  // Get pages per signature
  const pagesPerSig = project.outputOptions.pagesPerSignature;

  // Split pages into signature chunks
  const sigChunks: PageContent[][] = [];
  for (let i = 0; i < allPages.length; i += pagesPerSig) {
    sigChunks.push(allPages.slice(i, i + pagesPerSig));
  }

  // Reorder the chunks
  const [movedChunk] = sigChunks.splice(sourceIndex, 1);
  sigChunks.splice(targetIndex, 0, movedChunk);

  // Flatten and renumber pages (1-based page numbers)
  const reorderedPages: PageContent[] = [];
  for (const chunk of sigChunks) {
    for (const page of chunk) {
      const newPageNum = reorderedPages.length + 1;
      reorderedPages.push({
        ...page,
        pageNumber: newPageNum,
        isRecto: newPageNum % 2 === 1,
      });
    }
  }

  // Rebuild spreads
  const newSpreads: Spread[] = [];
  for (let i = 0; i < reorderedPages.length; i += 2) {
    newSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: newSpreads.length + 1,
      verso: reorderedPages[i] || null,
      recto: reorderedPages[i + 1] || null,
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

  // Trigger reflow to adjust text around reordered pages
  this.requestReflow();
};

// Spanning items (items that bridge across verso and recto)
AppState.prototype.addSpanningItemToSpread = function(spreadId: string, item: SpanningItem): void {
  const prevState = this.getProject();
  const staticSpreads = (prevState.staticSpreads || []).map(spread => {
    if (spread.id !== spreadId) return spread;
    return {
      ...spread,
      spanningItems: [...(spread.spanningItems || []), item],
    };
  });
  this.setProject({ ...prevState, staticSpreads });
  this.notifyProjectListeners(prevState);
};

AppState.prototype.updateSpanningItem = function(spreadId: string, itemId: string, updates: Partial<SpanningItem>): void {
  const prevState = this.getProject();
  const staticSpreads = (prevState.staticSpreads || []).map(spread => {
    if (spread.id !== spreadId) return spread;
    return {
      ...spread,
      spanningItems: (spread.spanningItems || []).map(item =>
        item.id === itemId ? { ...item, ...updates } as SpanningItem : item
      ),
    };
  });
  this.setProject({ ...prevState, staticSpreads });
  this.notifyProjectListeners(prevState);
};

AppState.prototype.deleteSpanningItem = function(spreadId: string, itemId: string): void {
  const prevState = this.getProject();
  const editor = this.getEditor();
  const staticSpreads = (prevState.staticSpreads || []).map(spread => {
    if (spread.id !== spreadId) return spread;
    return {
      ...spread,
      spanningItems: (spread.spanningItems || []).filter(item => item.id !== itemId),
    };
  });
  this.setProject({ ...prevState, staticSpreads });
  this.notifyProjectListeners(prevState);

  if (editor.selectedItemId === itemId) {
    this.updateEditor({ selectedItemId: null });
  }
};
