/**
 * Page background fill picker
 */

import { appState } from '../../../services/state';
import { createFillPicker } from '../../FillPicker';
import { pageBackgroundPicker, setPageBackgroundPicker } from './shared';
import type { FillConfig } from '../../../types';

/**
 * Set up the page background fill picker
 */
export function setupPageBackgroundPicker(pageNumber: number): void {
  const container = document.getElementById('page-background-picker');
  if (!container) return;

  // Get current page background
  const currentFill: FillConfig = appState.getPageBackground(pageNumber) || {
    type: 'color',
    color: '#ffffff'
  };

  if (pageBackgroundPicker) {
    pageBackgroundPicker.setFill(currentFill);
  } else {
    const picker = createFillPicker(container, currentFill, (fill) => {
      const editorState = appState.getEditor();
      if (editorState.selectedPageNumber === null) return;
      appState.updatePageBackground(editorState.selectedPageNumber, fill);
    });
    setPageBackgroundPicker(picker);
  }
}
