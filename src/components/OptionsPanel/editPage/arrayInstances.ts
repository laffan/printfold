/**
 * Array instances list management
 */

import { appState } from '../../../services/state';
import { createFillPicker } from '../../FillPicker';
import { instanceFillPickers } from './shared';
import type { PageItem, ShapePageItem, TextPageItem, FillConfig } from '../../../types';

/**
 * Update the array instances list UI
 */
export function updateArrayInstancesList(item: PageItem): void {
  const container = document.getElementById('array-instances-list');
  if (!container) return;

  const arrayCount = item.arrayCount || 1;
  const arrayInstances = item.arrayInstances || [];

  // Clear existing pickers
  instanceFillPickers.forEach(picker => picker.destroy?.());
  instanceFillPickers.clear();
  container.innerHTML = '';

  // Don't show list if array count is 1 or less
  if (arrayCount <= 1) return;

  // Get the default fill from the item
  let defaultFill: FillConfig = { type: 'color', color: '#cccccc' };
  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    defaultFill = shapeItem.fill || { type: 'color', color: shapeItem.fillColor || '#cccccc' };
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    defaultFill = textItem.fill || { type: 'color', color: textItem.color || '#000000' };
  }

  // Create instance items
  for (let i = 0; i < arrayCount; i++) {
    const instanceConfig = arrayInstances.find(inst => inst.index === i);
    const instanceFill = instanceConfig?.fill || defaultFill;

    const instanceItem = document.createElement('div');
    instanceItem.className = 'array-instance-item';
    instanceItem.innerHTML = `
      <span class="array-instance-label">Instance ${i + 1}</span>
      <div class="array-instance-fill" id="instance-fill-${i}"></div>
    `;
    container.appendChild(instanceItem);

    // Create fill picker for this instance
    const fillContainer = instanceItem.querySelector(`#instance-fill-${i}`) as HTMLElement;
    if (fillContainer) {
      const picker = createFillPicker(fillContainer, instanceFill, (fill) => {
        const editorState = appState.getEditor();
        if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

        // Get current item and update its arrayInstances
        const currentItem = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
        if (!currentItem) return;

        const currentInstances = [...(currentItem.arrayInstances || [])];
        const existingIndex = currentInstances.findIndex(inst => inst.index === i);

        if (existingIndex >= 0) {
          currentInstances[existingIndex] = { ...currentInstances[existingIndex], fill };
        } else {
          currentInstances.push({ index: i, fill });
        }

        appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
          arrayInstances: currentInstances
        });
      });
      instanceFillPickers.set(i, picker);
    }
  }
}
