/**
 * Multi-select controls for align and distribute
 */

import { appState } from '../../../services/state';

/**
 * Set up the multi-select controls (align & distribute)
 */
export function setupMultiSelectControls(): void {
  // Align buttons
  document.getElementById('btn-align-left')?.addEventListener('click', () => {
    appState.alignItems('left');
  });
  document.getElementById('btn-align-h-center')?.addEventListener('click', () => {
    appState.alignItems('center');
  });
  document.getElementById('btn-align-right')?.addEventListener('click', () => {
    appState.alignItems('right');
  });
  document.getElementById('btn-align-top')?.addEventListener('click', () => {
    appState.alignItems('top');
  });
  document.getElementById('btn-align-v-center')?.addEventListener('click', () => {
    appState.alignItems('middle');
  });
  document.getElementById('btn-align-bottom')?.addEventListener('click', () => {
    appState.alignItems('bottom');
  });

  // Distribute buttons
  document.getElementById('btn-distribute-h')?.addEventListener('click', () => {
    appState.distributeItems('horizontal');
  });
  document.getElementById('btn-distribute-v')?.addEventListener('click', () => {
    appState.distributeItems('vertical');
  });
}

/**
 * Update the multi-select controls visibility and count
 */
export function updateMultiSelectControls(): void {
  const editorState = appState.getEditor();
  const multiSelectControls = document.getElementById('multi-select-controls');
  const multiSelectCount = document.getElementById('multi-select-count');

  if (!multiSelectControls) return;

  const selectedCount = editorState.selectedItemIds.length;

  if (selectedCount > 1) {
    multiSelectControls.style.display = 'block';
    if (multiSelectCount) {
      multiSelectCount.textContent = `${selectedCount} items selected`;
    }

    // Enable/disable distribute buttons based on count
    const distributeH = document.getElementById('btn-distribute-h') as HTMLButtonElement;
    const distributeV = document.getElementById('btn-distribute-v') as HTMLButtonElement;
    if (distributeH) distributeH.disabled = selectedCount < 3;
    if (distributeV) distributeV.disabled = selectedCount < 3;
  } else {
    multiSelectControls.style.display = 'none';
  }
}
