/**
 * Text Flows List - UI component for managing text flow regions
 */

import { appState } from '../../../services/state';
import { addTextFlowToCurrentPage } from './itemCreation';
import type { TextFlowRegion } from '../../../types';

let selectedFlowId: string | null = null;
let draggedItem: HTMLElement | null = null;

/**
 * Sync the selected flow ID with what's selected on the canvas
 */
function syncSelectionWithCanvas(): void {
  const editorState = appState.getEditor();
  const selectedItemId = editorState.selectedItemIds[0];

  if (!selectedItemId) {
    selectedFlowId = null;
    return;
  }

  // Find if there's a text flow with this item ID
  const flow = appState.getTextFlowByItemId(selectedItemId);
  selectedFlowId = flow?.id || null;
}

/**
 * Update the text flows list in the UI
 */
export function updateTextFlowsList(): void {
  const listContainer = document.getElementById('text-flows-list');
  if (!listContainer) return;

  // Sync selection with what's selected on canvas
  syncSelectionWithCanvas();

  const textFlows = appState.getTextFlows();
  listContainer.innerHTML = '';

  if (textFlows.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'text-flows-empty';
    emptyMessage.textContent = 'No text flows yet. Click + to add one.';
    listContainer.appendChild(emptyMessage);
  } else {
    textFlows.forEach((flow, index) => {
      const item = createTextFlowListItem(flow, index);
      listContainer.appendChild(item);
    });
  }

  // Update remove button state
  updateRemoveButtonState();
}

/**
 * Create a list item for a text flow region
 */
function createTextFlowListItem(flow: TextFlowRegion, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'text-flow-item';
  item.dataset.flowId = flow.id;
  item.draggable = true;

  if (flow.id === selectedFlowId) {
    item.classList.add('selected');
  }

  // Drag handle
  const handle = document.createElement('span');
  handle.className = 'text-flow-handle';
  handle.innerHTML = '⠿';
  item.appendChild(handle);

  // Flow name
  const name = document.createElement('span');
  name.className = 'text-flow-name';
  name.textContent = flow.name;
  item.appendChild(name);

  // Page number indicator
  const pageInfo = document.createElement('span');
  pageInfo.className = 'text-flow-page';
  pageInfo.textContent = `p.${flow.pageNumber}`;
  item.appendChild(pageInfo);

  // Click to select
  item.addEventListener('click', () => {
    selectTextFlow(flow.id);
  });

  // Drag and drop handlers
  item.addEventListener('dragstart', (e) => {
    draggedItem = item;
    item.classList.add('dragging');
    e.dataTransfer?.setData('text/plain', flow.id);
  });

  item.addEventListener('dragend', () => {
    if (draggedItem) {
      draggedItem.classList.remove('dragging');
      draggedItem = null;
    }
    // Remove all drop indicators
    document.querySelectorAll('.text-flow-item.drop-above, .text-flow-item.drop-below')
      .forEach(el => el.classList.remove('drop-above', 'drop-below'));
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === item) return;

    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isAbove = e.clientY < midY;

    // Remove existing indicators
    item.classList.remove('drop-above', 'drop-below');

    // Add the appropriate indicator
    item.classList.add(isAbove ? 'drop-above' : 'drop-below');
  });

  item.addEventListener('dragleave', () => {
    item.classList.remove('drop-above', 'drop-below');
  });

  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drop-above', 'drop-below');

    if (!draggedItem || draggedItem === item) return;

    const draggedFlowId = draggedItem.dataset.flowId;
    const targetFlowId = flow.id;

    if (!draggedFlowId || !targetFlowId) return;

    // Get the current order
    const flows = appState.getTextFlows();
    const draggedIndex = flows.findIndex(f => f.id === draggedFlowId);
    const targetIndex = flows.findIndex(f => f.id === targetFlowId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Determine if dropping above or below
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertAbove = e.clientY < midY;

    // Create new order
    const newOrder = flows.map(f => f.id);
    newOrder.splice(draggedIndex, 1);

    let insertIndex = targetIndex;
    if (draggedIndex < targetIndex) {
      insertIndex--; // Adjust for removal
    }
    if (!insertAbove) {
      insertIndex++;
    }

    newOrder.splice(insertIndex, 0, draggedFlowId);

    // Update state
    appState.reorderTextFlows(newOrder);
    updateTextFlowsList();
  });

  return item;
}

/**
 * Select a text flow region
 */
export function selectTextFlow(flowId: string | null): void {
  selectedFlowId = flowId;

  // Update visual selection
  document.querySelectorAll('.text-flow-item').forEach(item => {
    item.classList.toggle('selected', (item as HTMLElement).dataset.flowId === flowId);
  });

  // Update remove button state
  updateRemoveButtonState();

  // If a flow is selected, highlight it on the canvas and select the item
  if (flowId) {
    const flow = appState.getTextFlowRegion(flowId);
    if (flow) {
      // Select the item on the page
      appState.updateEditor({
        selectedPageNumber: flow.pageNumber,
        selectedItemId: flow.itemId,
      });
      appState.selectItem(flow.itemId, false);
    }
  }
}

/**
 * Get the currently selected text flow ID
 */
export function getSelectedTextFlowId(): string | null {
  return selectedFlowId;
}

/**
 * Update the remove button state based on selection
 */
function updateRemoveButtonState(): void {
  const removeBtn = document.getElementById('btn-remove-text-flow') as HTMLButtonElement | null;
  if (removeBtn) {
    removeBtn.disabled = selectedFlowId === null;
  }
}

/**
 * Set up event handlers for text flows list
 */
export function setupTextFlowsListHandlers(): void {
  // Add text flow button
  document.getElementById('btn-add-text-flow')?.addEventListener('click', () => {
    addTextFlowToCurrentPage();
    updateTextFlowsList();
  });

  // Remove text flow button
  document.getElementById('btn-remove-text-flow')?.addEventListener('click', () => {
    if (selectedFlowId) {
      appState.removeTextFlowRegion(selectedFlowId);
      selectedFlowId = null;
      updateTextFlowsList();
      appState.requestReflow();
    }
  });
}

/**
 * Clear the text flow selection
 */
export function clearTextFlowSelection(): void {
  selectedFlowId = null;
  updateRemoveButtonState();
  document.querySelectorAll('.text-flow-item.selected').forEach(el => {
    el.classList.remove('selected');
  });
}
