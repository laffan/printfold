/**
 * Text flow operations for AppState
 * Manages text flow regions that allow flowing markdown content through static pages
 */

import type { TextFlowRegion, TextFlowPageItem, PageItem } from '../../types';
import { AppState } from './AppStateCore';

/**
 * Generate the next text flow name (Text Flow A, Text Flow B, etc.)
 */
function generateTextFlowName(existingFlows: TextFlowRegion[]): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let index = 0;

  // Find the next available letter
  const usedLetters = new Set(
    existingFlows
      .map(f => f.name.match(/Text Flow ([A-Z]+)/)?.[1])
      .filter(Boolean)
  );

  while (index < 26 && usedLetters.has(letters[index])) {
    index++;
  }

  if (index >= 26) {
    // Fallback to numbering if we run out of letters
    return `Text Flow ${existingFlows.length + 1}`;
  }

  return `Text Flow ${letters[index]}`;
}

/**
 * Add a new text flow region
 */
AppState.prototype.addTextFlowRegion = function(itemId: string, pageNumber: number): TextFlowRegion {
  const prevState = this.getProject();
  const existingFlows = prevState.textFlows || [];

  const region: TextFlowRegion = {
    id: crypto.randomUUID(),
    name: generateTextFlowName(existingFlows),
    itemId,
    pageNumber,
  };

  // Also update the TextFlowPageItem with the flowId
  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: updatePageItem(spread.verso, itemId, { flowId: region.id }),
      recto: updatePageItem(spread.recto, itemId, { flowId: region.id }),
    })),
  }));

  this.setProject({
    ...prevState,
    signatures,
    textFlows: [...existingFlows, region],
  });
  this.notifyProjectListeners(prevState);

  return region;
};

/**
 * Helper to update a TextFlowPageItem in a page
 */
function updatePageItem(
  page: import('../../types').PageContent | null,
  itemId: string,
  updates: Partial<TextFlowPageItem>
): import('../../types').PageContent | null {
  if (!page || !page.items) return page;

  const updatedItems = page.items.map(item => {
    if (item.id === itemId && item.type === 'textflow') {
      return { ...item, ...updates } as PageItem;
    }
    return item;
  });

  return { ...page, items: updatedItems };
}

/**
 * Remove a text flow region
 */
AppState.prototype.removeTextFlowRegion = function(regionId: string): void {
  const prevState = this.getProject();
  const existingFlows = prevState.textFlows || [];

  // Find the region to get the itemId
  const region = existingFlows.find(f => f.id === regionId);
  if (!region) return;

  // Remove the TextFlowPageItem from the page
  const signatures = prevState.signatures.map(sig => ({
    ...sig,
    spreads: sig.spreads.map(spread => ({
      ...spread,
      verso: removeItemFromPage(spread.verso, region.itemId),
      recto: removeItemFromPage(spread.recto, region.itemId),
    })),
  }));

  this.setProject({
    ...prevState,
    signatures,
    textFlows: existingFlows.filter(f => f.id !== regionId),
  });
  this.notifyProjectListeners(prevState);
};

/**
 * Helper to remove an item from a page
 */
function removeItemFromPage(
  page: import('../../types').PageContent | null,
  itemId: string
): import('../../types').PageContent | null {
  if (!page || !page.items) return page;
  return { ...page, items: page.items.filter(item => item.id !== itemId) };
}

/**
 * Update a text flow region's properties
 */
AppState.prototype.updateTextFlowRegion = function(regionId: string, updates: Partial<TextFlowRegion>): void {
  const prevState = this.getProject();
  const existingFlows = prevState.textFlows || [];

  const updatedFlows = existingFlows.map(flow =>
    flow.id === regionId ? { ...flow, ...updates } : flow
  );

  this.setProject({
    ...prevState,
    textFlows: updatedFlows,
  });
  this.notifyProjectListeners(prevState);
};

/**
 * Reorder text flows (for drag/drop reordering)
 */
AppState.prototype.reorderTextFlows = function(regionIds: string[]): void {
  const prevState = this.getProject();
  const existingFlows = prevState.textFlows || [];

  // Create a map for quick lookup
  const flowMap = new Map(existingFlows.map(f => [f.id, f]));

  // Reorder based on the provided IDs
  const reorderedFlows = regionIds
    .map(id => flowMap.get(id))
    .filter((f): f is TextFlowRegion => f !== undefined);

  // Add any flows that weren't in the list (shouldn't happen but just in case)
  for (const flow of existingFlows) {
    if (!regionIds.includes(flow.id)) {
      reorderedFlows.push(flow);
    }
  }

  this.setProject({
    ...prevState,
    textFlows: reorderedFlows,
  });
  this.notifyProjectListeners(prevState);
};

/**
 * Get all text flow regions in order
 */
AppState.prototype.getTextFlows = function(): TextFlowRegion[] {
  return this.getProject().textFlows || [];
};

/**
 * Get a text flow region by ID
 */
AppState.prototype.getTextFlowRegion = function(regionId: string): TextFlowRegion | null {
  const flows = this.getProject().textFlows || [];
  return flows.find(f => f.id === regionId) || null;
};

/**
 * Get a text flow region by item ID
 */
AppState.prototype.getTextFlowByItemId = function(itemId: string): TextFlowRegion | null {
  const flows = this.getProject().textFlows || [];
  return flows.find(f => f.itemId === itemId) || null;
};

/**
 * Clean up orphaned text flow regions (where the item no longer exists)
 */
AppState.prototype.cleanupOrphanedTextFlows = function(): void {
  const prevState = this.getProject();
  const existingFlows = prevState.textFlows || [];

  if (existingFlows.length === 0) return;

  // Collect all item IDs from pages
  const allItemIds = new Set<string>();
  for (const sig of prevState.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.items) {
        spread.verso.items.forEach(item => allItemIds.add(item.id));
      }
      if (spread.recto?.items) {
        spread.recto.items.forEach(item => allItemIds.add(item.id));
      }
    }
  }

  // Filter out orphaned flows
  const validFlows = existingFlows.filter(flow => allItemIds.has(flow.itemId));

  if (validFlows.length !== existingFlows.length) {
    this.setProject({
      ...prevState,
      textFlows: validFlows,
    });
    this.notifyProjectListeners(prevState);
  }
};
