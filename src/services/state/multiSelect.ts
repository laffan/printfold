/**
 * Multi-select and clipboard operations for AppState
 */

import type { PageItem } from '../../types';
import { AppState } from './AppStateCore';

/**
 * Select a single item (clears other selections unless additive)
 */
AppState.prototype.selectItem = function(itemId: string, additive = false): void {
  const editor = this.getEditor();
  if (additive) {
    // Toggle the item in the selection
    const ids = editor.selectedItemIds.includes(itemId)
      ? editor.selectedItemIds.filter(id => id !== itemId)
      : [...editor.selectedItemIds, itemId];
    this.updateEditor({
      selectedItemIds: ids,
      selectedItemId: ids.length === 1 ? ids[0] : (ids.length > 0 ? ids[ids.length - 1] : null),
    });
  } else {
    this.updateEditor({
      selectedItemIds: [itemId],
      selectedItemId: itemId,
    });
  }
};

/**
 * Select multiple items
 */
AppState.prototype.selectItems = function(itemIds: string[]): void {
  this.updateEditor({
    selectedItemIds: itemIds,
    selectedItemId: itemIds.length === 1 ? itemIds[0] : (itemIds.length > 0 ? itemIds[itemIds.length - 1] : null),
  });
};

/**
 * Add items to current selection
 */
AppState.prototype.addToSelection = function(itemIds: string[]): void {
  const editor = this.getEditor();
  const newIds = [...editor.selectedItemIds];
  for (const id of itemIds) {
    if (!newIds.includes(id)) {
      newIds.push(id);
    }
  }
  this.updateEditor({
    selectedItemIds: newIds,
    selectedItemId: newIds.length === 1 ? newIds[0] : (newIds.length > 0 ? newIds[newIds.length - 1] : null),
  });
};

/**
 * Clear all item selection
 */
AppState.prototype.clearSelection = function(): void {
  this.updateEditor({
    selectedItemIds: [],
    selectedItemId: null,
  });
};

/**
 * Get all selected items from the current page
 */
AppState.prototype.getSelectedItems = function(): PageItem[] {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return [];

  const items: PageItem[] = [];
  for (const id of editor.selectedItemIds) {
    const item = this.getItemFromPage(pageNumber, id);
    if (item) items.push(item);
  }
  return items;
};

/**
 * Copy selected items to clipboard
 */
AppState.prototype.copyToClipboard = function(): void {
  const items = this.getSelectedItems();
  if (items.length === 0) return;

  // Deep clone items for clipboard
  const clipboardItems = items.map(item => ({
    ...JSON.parse(JSON.stringify(item)),
    id: crypto.randomUUID(), // New IDs for paste
  }));
  this.updateEditor({ clipboard: clipboardItems });
};

/**
 * Paste items from clipboard to current page
 */
AppState.prototype.pasteFromClipboard = function(): PageItem[] {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return [];
  if (editor.clipboard.length === 0) return [];

  const pastedItems: PageItem[] = [];
  const newIds: string[] = [];

  for (const item of editor.clipboard) {
    const newItem: PageItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      x: item.x + 20, // Offset pasted items
      y: item.y + 20,
    };
    pastedItems.push(newItem);
    newIds.push(newItem.id);
    this.addItemToPage(pageNumber, newItem);
  }

  // Select the pasted items
  this.selectItems(newIds);
  return pastedItems;
};

/**
 * Delete all selected items
 */
AppState.prototype.deleteSelectedItems = function(): void {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return;

  const ids = [...editor.selectedItemIds];
  for (const itemId of ids) {
    this.deleteItemFromPage(pageNumber, itemId);
  }
  this.clearSelection();
};

/**
 * Duplicate selected items with offset
 */
AppState.prototype.duplicateSelectedItems = function(): PageItem[] {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return [];

  const items = this.getSelectedItems();
  if (items.length === 0) return [];

  const duplicatedItems: PageItem[] = [];
  const newIds: string[] = [];

  for (const item of items) {
    const newItem: PageItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      x: item.x + 20,
      y: item.y + 20,
    };
    duplicatedItems.push(newItem);
    newIds.push(newItem.id);
    this.addItemToPage(pageNumber, newItem);
  }

  // Select the duplicated items
  this.selectItems(newIds);
  return duplicatedItems;
};

/**
 * Duplicate selected items at the same position (for Option+drag)
 * The originals stay in place, duplicates are created and selected
 */
AppState.prototype.duplicateItemsAtPosition = function(): PageItem[] {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return [];

  const items = this.getSelectedItems();
  if (items.length === 0) return [];

  const duplicatedItems: PageItem[] = [];
  const newIds: string[] = [];

  for (const item of items) {
    const newItem: PageItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      // Same position - the duplicates will be dragged
      x: item.x,
      y: item.y,
    };
    duplicatedItems.push(newItem);
    newIds.push(newItem.id);
    this.addItemToPage(pageNumber, newItem);
  }

  // Select the duplicated items - they will be the ones being dragged
  this.selectItems(newIds);
  return duplicatedItems;
};

/**
 * Duplicate selected items in place (for Option+drag)
 * Creates duplicates at the same position but keeps originals selected.
 * The originals continue to be dragged (appearing as the "copy"),
 * while duplicates stay behind (appearing as the "original").
 */
AppState.prototype.duplicateItemsInPlace = function(): PageItem[] {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return [];

  const items = this.getSelectedItems();
  if (items.length === 0) return [];

  const duplicatedItems: PageItem[] = [];

  for (const item of items) {
    const newItem: PageItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      x: item.x,
      y: item.y,
    };
    duplicatedItems.push(newItem);
    // Add duplicate but don't select it - it stays behind
    this.addItemToPage(pageNumber, newItem);
  }

  // Keep originals selected - they continue to be dragged
  return duplicatedItems;
};

/**
 * Align selected items
 */
AppState.prototype.alignItems = function(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return;

  const items = this.getSelectedItems();
  if (items.length < 2) return;

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.x + item.width);
    minY = Math.min(minY, item.y);
    maxY = Math.max(maxY, item.y + item.height);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  for (const item of items) {
    let newX = item.x;
    let newY = item.y;

    switch (alignment) {
      case 'left':
        newX = minX;
        break;
      case 'center':
        newX = centerX - item.width / 2;
        break;
      case 'right':
        newX = maxX - item.width;
        break;
      case 'top':
        newY = minY;
        break;
      case 'middle':
        newY = centerY - item.height / 2;
        break;
      case 'bottom':
        newY = maxY - item.height;
        break;
    }

    if (newX !== item.x || newY !== item.y) {
      this.updateItemOnPage(pageNumber, item.id, { x: newX, y: newY });
    }
  }
};

/**
 * Distribute selected items evenly
 */
AppState.prototype.distributeItems = function(axis: 'horizontal' | 'vertical'): void {
  const editor = this.getEditor();
  const pageNumber = editor.selectedPageNumber;
  if (pageNumber === null) return;

  const items = this.getSelectedItems();
  if (items.length < 3) return;

  // Sort by position
  const sorted = [...items].sort((a, b) =>
    axis === 'horizontal' ? a.x - b.x : a.y - b.y
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (axis === 'horizontal') {
    const totalSpace = (last.x + last.width) - first.x;
    const totalItemWidth = sorted.reduce((sum, item) => sum + item.width, 0);
    const gap = (totalSpace - totalItemWidth) / (sorted.length - 1);

    let currentX = first.x;
    for (const item of sorted) {
      if (item.x !== currentX) {
        this.updateItemOnPage(pageNumber, item.id, { x: currentX });
      }
      currentX += item.width + gap;
    }
  } else {
    const totalSpace = (last.y + last.height) - first.y;
    const totalItemHeight = sorted.reduce((sum, item) => sum + item.height, 0);
    const gap = (totalSpace - totalItemHeight) / (sorted.length - 1);

    let currentY = first.y;
    for (const item of sorted) {
      if (item.y !== currentY) {
        this.updateItemOnPage(pageNumber, item.id, { y: currentY });
      }
      currentY += item.height + gap;
    }
  }
};
