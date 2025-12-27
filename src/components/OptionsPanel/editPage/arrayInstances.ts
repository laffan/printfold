/**
 * Array dimensions list management for multi-dimensional arrays
 */

import { appState } from '../../../services/state';
import type { PageItem, ArrayDimension } from '../../../types';

/**
 * Update the array dimensions list UI
 */
export function updateArrayDimensionsList(item: PageItem): void {
  const container = document.getElementById('array-dimensions-list');
  if (!container) return;

  const dimensions = item.arrayDimensions || [];

  // Clear existing content
  container.innerHTML = '';

  // Create UI for each dimension
  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const dimensionEl = createDimensionElement(i, dim);
    container.appendChild(dimensionEl);
  }
}

/**
 * Create a single dimension's UI element
 */
function createDimensionElement(index: number, dim: ArrayDimension): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'array-dimension-item';
  wrapper.innerHTML = `
    <div class="array-dimension-header">
      <span class="array-dimension-label">Dimension ${index + 1}</span>
      <button class="array-dimension-remove" data-index="${index}" title="Remove dimension">×</button>
    </div>
    <div class="array-dimension-controls">
      <div class="input-row">
        <label>Count</label>
        <input type="number" class="dim-count" data-index="${index}" value="${dim.count}" min="2" max="50" />
      </div>
      <div class="input-row">
        <label>X Offset</label>
        <input type="number" class="dim-offset-x" data-index="${index}" value="${dim.offsetX}" />
      </div>
      <div class="input-row">
        <label>Y Offset</label>
        <input type="number" class="dim-offset-y" data-index="${index}" value="${dim.offsetY}" />
      </div>
    </div>
  `;

  // Set up event handlers
  const removeBtn = wrapper.querySelector('.array-dimension-remove') as HTMLButtonElement;
  removeBtn?.addEventListener('click', () => removeDimension(index));

  const countInput = wrapper.querySelector('.dim-count') as HTMLInputElement;
  countInput?.addEventListener('input', () => updateDimensionProperty(index, 'count', parseInt(countInput.value, 10) || 2));

  const offsetXInput = wrapper.querySelector('.dim-offset-x') as HTMLInputElement;
  offsetXInput?.addEventListener('input', () => updateDimensionProperty(index, 'offsetX', parseFloat(offsetXInput.value) || 0));

  const offsetYInput = wrapper.querySelector('.dim-offset-y') as HTMLInputElement;
  offsetYInput?.addEventListener('input', () => updateDimensionProperty(index, 'offsetY', parseFloat(offsetYInput.value) || 0));

  return wrapper;
}

/**
 * Update a specific property of a dimension
 */
function updateDimensionProperty(dimIndex: number, prop: 'count' | 'offsetX' | 'offsetY', value: number): void {
  const editorState = appState.getEditor();
  if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

  const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
  if (!item) return;

  const dimensions = [...(item.arrayDimensions || [])];
  if (dimIndex >= dimensions.length) return;

  dimensions[dimIndex] = {
    ...dimensions[dimIndex],
    [prop]: prop === 'count' ? Math.max(2, Math.min(50, value)) : value,
  };

  appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
    arrayDimensions: dimensions,
  });
}

/**
 * Remove a dimension from the array
 */
function removeDimension(dimIndex: number): void {
  const editorState = appState.getEditor();
  if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

  const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
  if (!item) return;

  const dimensions = [...(item.arrayDimensions || [])];
  dimensions.splice(dimIndex, 1);

  appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
    arrayDimensions: dimensions.length > 0 ? dimensions : undefined,
  });
}

/**
 * Add a new dimension to the array
 */
export function addArrayDimension(): void {
  const editorState = appState.getEditor();
  if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

  const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
  if (!item) return;

  const dimensions = [...(item.arrayDimensions || [])];

  // Create a new dimension with sensible defaults
  // First dimension defaults to horizontal, second to vertical, etc.
  const isFirstDimension = dimensions.length === 0;
  const newDimension: ArrayDimension = {
    id: crypto.randomUUID(),
    count: 3,
    offsetX: isFirstDimension ? 30 : 0,
    offsetY: isFirstDimension ? 0 : 30,
  };

  dimensions.push(newDimension);

  appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
    arrayDimensions: dimensions,
  });
}

/**
 * Set up the "Add Dimension" button handler
 */
export function setupAddDimensionButton(): void {
  const addBtn = document.getElementById('add-array-dimension');
  if (addBtn) {
    // Remove any existing listeners
    const newBtn = addBtn.cloneNode(true) as HTMLButtonElement;
    addBtn.parentNode?.replaceChild(newBtn, addBtn);

    newBtn.addEventListener('click', () => {
      addArrayDimension();
    });
  }
}
