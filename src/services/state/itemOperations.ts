/**
 * Page item operations for AppState
 */

import type { PageItem, PageContent, FillConfig, StaticSpread } from '../../types';
import { AppState } from './AppStateCore';

// Page items (for static pages)
AppState.prototype.addItemToPage = function(pageNumber: number, item: PageItem): void {
  const prevState = this.getProject();

  // Find which spread and position (verso/recto) contains this page
  let targetSpreadId: string | null = null;
  let targetPosition: 'verso' | 'recto' | null = null;

  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'verso';
        break;
      }
      if (spread.recto?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'recto';
        break;
      }
    }
    if (targetSpreadId) break;
  }

  // Helper to update a page by page number (for signatures)
  // Items can be added to any page type - pageState is not changed automatically
  const updatePageByNumber = (page: PageContent | null) => {
    if (!page || page.pageNumber !== pageNumber) return page;
    return {
      ...page,
      items: [...(page.items || []), item],
      // Don't auto-claim - user must explicitly make page static
      // Keep isStatic in sync with pageState for backward compatibility
      isStatic: page.pageState === 'static',
    };
  };

  // Helper to update static spread by spread ID and position
  const updateStaticSpread = (spread: StaticSpread) => {
    if (spread.id !== targetSpreadId) return spread;
    if (targetPosition === 'verso' && spread.verso) {
      return {
        ...spread,
        verso: { ...spread.verso, items: [...(spread.verso.items || []), item] },
      };
    }
    if (targetPosition === 'recto' && spread.recto) {
      return {
        ...spread,
        recto: { ...spread.recto, items: [...(spread.recto.items || []), item] },
      };
    }
    return spread;
  };

  // Update signatures
  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: updatePageByNumber(spread.verso),
      recto: updatePageByNumber(spread.recto),
    })),
  }));

  // Update static spreads by ID match
  const staticSpreads = (prevState.staticSpreads || []).map(updateStaticSpread);

  this.setProject({ ...prevState, signatures, staticSpreads });
  this.notifyProjectListeners(prevState);
};

AppState.prototype.updateItemOnPage = function(pageNumber: number, itemId: string, updates: Partial<PageItem>): void {
  const prevState = this.getProject();

  // Find which spread and position (verso/recto) contains this page
  let targetSpreadId: string | null = null;
  let targetPosition: 'verso' | 'recto' | null = null;

  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'verso';
        break;
      }
      if (spread.recto?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'recto';
        break;
      }
    }
    if (targetSpreadId) break;
  }

  // Helper to update a page by page number
  const updatePageByNumber = (page: PageContent | null) => {
    if (!page || page.pageNumber !== pageNumber) return page;
    return {
      ...page,
      items: (page.items || []).map(item =>
        item.id === itemId ? { ...item, ...updates } as PageItem : item
      ),
    };
  };

  // Helper to update items in a page
  const updateItems = (items: PageItem[] | undefined) => {
    return (items || []).map(item =>
      item.id === itemId ? { ...item, ...updates } as PageItem : item
    );
  };

  // Helper to update static spread by spread ID and position
  const updateStaticSpread = (spread: StaticSpread) => {
    if (spread.id !== targetSpreadId) return spread;
    if (targetPosition === 'verso' && spread.verso) {
      return {
        ...spread,
        verso: { ...spread.verso, items: updateItems(spread.verso.items) },
      };
    }
    if (targetPosition === 'recto' && spread.recto) {
      return {
        ...spread,
        recto: { ...spread.recto, items: updateItems(spread.recto.items) },
      };
    }
    return spread;
  };

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: updatePageByNumber(spread.verso),
      recto: updatePageByNumber(spread.recto),
    })),
  }));

  // Update static spreads by ID match
  const staticSpreads = (prevState.staticSpreads || []).map(updateStaticSpread);

  this.setProject({ ...prevState, signatures, staticSpreads });
  this.notifyProjectListeners(prevState);

  // Reflow if a text-flow item moved or resized — its content slot changed.
  const affectsTextFlow =
    'x' in updates || 'y' in updates || 'width' in updates ||
    'height' in updates || 'padding' in updates;
  if (affectsTextFlow) {
    const item = this.getItemFromPage(pageNumber, itemId);
    if (item?.type === 'textFlow') {
      this.requestReflow();
    }
  }
};

AppState.prototype.deleteItemFromPage = function(pageNumber: number, itemId: string): void {
  const prevState = this.getProject();
  const editor = this.getEditor();
  const deletedItem = this.getItemFromPage(pageNumber, itemId);

  // Find which spread and position (verso/recto) contains this page
  let targetSpreadId: string | null = null;
  let targetPosition: 'verso' | 'recto' | null = null;

  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'verso';
        break;
      }
      if (spread.recto?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'recto';
        break;
      }
    }
    if (targetSpreadId) break;
  }

  // Helper to update a page by page number
  const updatePageByNumber = (page: PageContent | null) => {
    if (!page || page.pageNumber !== pageNumber) return page;
    return {
      ...page,
      items: (page.items || []).filter(item => item.id !== itemId),
    };
  };

  // Helper to filter items in a page
  const filterItems = (items: PageItem[] | undefined) => {
    return (items || []).filter(item => item.id !== itemId);
  };

  // Helper to update static spread by spread ID and position
  const updateStaticSpread = (spread: StaticSpread) => {
    if (spread.id !== targetSpreadId) return spread;
    if (targetPosition === 'verso' && spread.verso) {
      return {
        ...spread,
        verso: { ...spread.verso, items: filterItems(spread.verso.items) },
      };
    }
    if (targetPosition === 'recto' && spread.recto) {
      return {
        ...spread,
        recto: { ...spread.recto, items: filterItems(spread.recto.items) },
      };
    }
    return spread;
  };

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: updatePageByNumber(spread.verso),
      recto: updatePageByNumber(spread.recto),
    })),
  }));

  // Update static spreads by ID match
  const staticSpreads = (prevState.staticSpreads || []).map(updateStaticSpread);

  this.setProject({ ...prevState, signatures, staticSpreads });
  this.notifyProjectListeners(prevState);

  // Clear selection if the deleted item was selected
  if (editor.selectedItemId === itemId) {
    this.updateEditor({ selectedItemId: null });
  }

  // Reflow if a text-flow item was removed — its content must spill back out.
  if (deletedItem?.type === 'textFlow') {
    this.requestReflow();
  }
};

AppState.prototype.updatePageBackground = function(pageNumber: number, backgroundFill: FillConfig | undefined): void {
  const prevState = this.getProject();

  // Find which spread and position (verso/recto) contains this page
  let targetSpreadId: string | null = null;
  let targetPosition: 'verso' | 'recto' | null = null;

  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'verso';
        break;
      }
      if (spread.recto?.pageNumber === pageNumber) {
        targetSpreadId = spread.id;
        targetPosition = 'recto';
        break;
      }
    }
    if (targetSpreadId) break;
  }

  // Helper to update a page by page number
  const updatePageByNumber = (page: PageContent | null) => {
    if (!page || page.pageNumber !== pageNumber) return page;
    return { ...page, backgroundFill };
  };

  // Helper to update static spread by spread ID and position
  const updateStaticSpread = (spread: StaticSpread) => {
    if (spread.id !== targetSpreadId) return spread;
    if (targetPosition === 'verso' && spread.verso) {
      return {
        ...spread,
        verso: { ...spread.verso, backgroundFill },
      };
    }
    if (targetPosition === 'recto' && spread.recto) {
      return {
        ...spread,
        recto: { ...spread.recto, backgroundFill },
      };
    }
    return spread;
  };

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: updatePageByNumber(spread.verso),
      recto: updatePageByNumber(spread.recto),
    })),
  }));

  // Update static spreads by ID match
  const staticSpreads = (prevState.staticSpreads || []).map(updateStaticSpread);

  this.setProject({ ...prevState, signatures, staticSpreads });
  this.notifyProjectListeners(prevState);
};

AppState.prototype.getPageBackground = function(pageNumber: number): FillConfig | undefined {
  const project = this.getProject();
  // Check signatures
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) return spread.verso.backgroundFill;
      if (spread.recto?.pageNumber === pageNumber) return spread.recto.backgroundFill;
    }
  }
  // Check static spreads
  for (const spread of project.staticSpreads || []) {
    if (spread.verso?.pageNumber === pageNumber) return spread.verso.backgroundFill;
    if (spread.recto?.pageNumber === pageNumber) return spread.recto.backgroundFill;
  }
  return undefined;
};

AppState.prototype.getItemFromPage = function(pageNumber: number, itemId: string): PageItem | null {
  const project = this.getProject();
  const checkPage = (page: PageContent | null) => {
    if (!page || page.pageNumber !== pageNumber) return null;
    return page.items?.find(item => item.id === itemId) || null;
  };

  // Check signatures
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const item = checkPage(spread.verso) || checkPage(spread.recto);
      if (item) return item;
    }
  }
  // Check static spreads
  for (const spread of project.staticSpreads || []) {
    const item = checkPage(spread.verso) || checkPage(spread.recto);
    if (item) return item;
  }
  return null;
};

/**
 * Move item to the front (highest z-index) on its page
 */
AppState.prototype.bringItemToFront = function(pageNumber: number, itemId: string): void {
  reorderItemInPage(this, pageNumber, itemId, 'front');
};

/**
 * Move item to the back (lowest z-index) on its page
 */
AppState.prototype.sendItemToBack = function(pageNumber: number, itemId: string): void {
  reorderItemInPage(this, pageNumber, itemId, 'back');
};

/**
 * Move item one step forward in z-order
 */
AppState.prototype.moveItemForward = function(pageNumber: number, itemId: string): void {
  reorderItemInPage(this, pageNumber, itemId, 'forward');
};

/**
 * Move item one step backward in z-order
 */
AppState.prototype.moveItemBackward = function(pageNumber: number, itemId: string): void {
  reorderItemInPage(this, pageNumber, itemId, 'backward');
};

/**
 * Internal helper to reorder items on a page
 */
function reorderItemInPage(state: AppState, pageNumber: number, itemId: string, direction: 'front' | 'back' | 'forward' | 'backward'): void {
  const prevState = state.getProject();

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => {
      const updatePage = (page: typeof spread.verso) => {
        if (!page || page.pageNumber !== pageNumber || !page.items) return page;

        const items = [...page.items];
        const index = items.findIndex(item => item.id === itemId);
        if (index === -1) return page;

        const [item] = items.splice(index, 1);

        switch (direction) {
          case 'front':
            items.push(item);
            break;
          case 'back':
            items.unshift(item);
            break;
          case 'forward':
            if (index < items.length) {
              items.splice(index + 1, 0, item);
            } else {
              items.push(item);
            }
            break;
          case 'backward':
            if (index > 0) {
              items.splice(index - 1, 0, item);
            } else {
              items.unshift(item);
            }
            break;
        }

        return { ...page, items };
      };
      return {
        ...spread,
        verso: updatePage(spread.verso),
        recto: updatePage(spread.recto),
      };
    }),
  }));

  state.setProject({ ...prevState, signatures });
  state.notifyProjectListeners(prevState);
}

/**
 * Set custom background image for a specific page
 * Also adds to the background library if not already present
 */
AppState.prototype.setCustomBackground = function(pageNumber: number, imageFileId: string | undefined): void {
  const prevState = this.getProject();

  // Update page's customBackgroundImageId
  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.pageNumber === pageNumber
        ? { ...spread.verso, customBackgroundImageId: imageFileId }
        : spread.verso,
      recto: spread.recto?.pageNumber === pageNumber
        ? { ...spread.recto, customBackgroundImageId: imageFileId }
        : spread.recto,
    })),
  }));

  // If adding a background (not removing), add to library if not present
  let customBackgrounds = prevState.customBackgrounds || [];
  if (imageFileId && !customBackgrounds.includes(imageFileId)) {
    customBackgrounds = [...customBackgrounds, imageFileId];
  }

  this.setProject({ ...prevState, signatures, customBackgrounds });
  this.notifyProjectListeners(prevState);
};

/**
 * Get the custom background image ID for a specific page
 */
AppState.prototype.getCustomBackground = function(pageNumber: number): string | undefined {
  const project = this.getProject();
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === pageNumber) return spread.verso.customBackgroundImageId;
      if (spread.recto?.pageNumber === pageNumber) return spread.recto.customBackgroundImageId;
    }
  }
  return undefined;
};

/**
 * Add an image to the background library
 */
AppState.prototype.addToBackgroundLibrary = function(imageFileId: string): void {
  const prevState = this.getProject();
  const customBackgrounds = prevState.customBackgrounds || [];
  if (!customBackgrounds.includes(imageFileId)) {
    this.setProject({ ...prevState, customBackgrounds: [...customBackgrounds, imageFileId] });
    this.notifyProjectListeners(prevState);
  }
};

/**
 * Remove an image from the background library
 * Also removes from any pages using it
 */
AppState.prototype.removeFromBackgroundLibrary = function(imageFileId: string): void {
  const prevState = this.getProject();

  // Remove from library
  const customBackgrounds = (prevState.customBackgrounds || []).filter(id => id !== imageFileId);

  // Remove from any pages using this background
  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso?.customBackgroundImageId === imageFileId
        ? { ...spread.verso, customBackgroundImageId: undefined }
        : spread.verso,
      recto: spread.recto?.customBackgroundImageId === imageFileId
        ? { ...spread.recto, customBackgroundImageId: undefined }
        : spread.recto,
    })),
  }));

  this.setProject({ ...prevState, signatures, customBackgrounds });
  this.notifyProjectListeners(prevState);
};

/**
 * Get the list of background image IDs in the library
 */
AppState.prototype.getBackgroundLibrary = function(): string[] {
  return this.getProject().customBackgrounds || [];
};

/**
 * Apply a background to multiple pages
 */
AppState.prototype.applyBackgroundToPages = function(imageFileId: string, pageNumbers: number[]): void {
  const prevState = this.getProject();
  const pageSet = new Set(pageNumbers);

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso && pageSet.has(spread.verso.pageNumber)
        ? { ...spread.verso, customBackgroundImageId: imageFileId }
        : spread.verso,
      recto: spread.recto && pageSet.has(spread.recto.pageNumber)
        ? { ...spread.recto, customBackgroundImageId: imageFileId }
        : spread.recto,
    })),
  }));

  // Ensure it's in the library
  let customBackgrounds = prevState.customBackgrounds || [];
  if (!customBackgrounds.includes(imageFileId)) {
    customBackgrounds = [...customBackgrounds, imageFileId];
  }

  this.setProject({ ...prevState, signatures, customBackgrounds });
  this.notifyProjectListeners(prevState);
};

/**
 * Apply a background to all pages
 */
AppState.prototype.applyBackgroundToAllPages = function(imageFileId: string): void {
  const prevState = this.getProject();

  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: spread.verso ? { ...spread.verso, customBackgroundImageId: imageFileId } : null,
      recto: spread.recto ? { ...spread.recto, customBackgroundImageId: imageFileId } : null,
    })),
  }));

  // Ensure it's in the library
  let customBackgrounds = prevState.customBackgrounds || [];
  if (!customBackgrounds.includes(imageFileId)) {
    customBackgrounds = [...customBackgrounds, imageFileId];
  }

  this.setProject({ ...prevState, signatures, customBackgrounds });
  this.notifyProjectListeners(prevState);
};
