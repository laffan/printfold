/**
 * Panel setup and event handler initialization
 */

import { appState } from '../../../services/state';
import { switchToSelectedTab } from './shared';
import { addItemToCurrentPage, addImageToCurrentPage } from './itemCreation';
import { setupEditPropertyInputs } from './propertyInputs';
import { downloadPageAsPng, downloadSpreadAsPng, replacePageWithImage, replaceSpreadWithImage } from '../../../services/pageExport';
import type { PageItem } from '../../../types';

/**
 * Set up the Edit Page panel event handlers
 */
export function setupEditPagePanel(updateEditSelectedSectionFn: () => void): void {
  // Add Text button
  document.getElementById('btn-add-text')?.addEventListener('click', () => {
    addItemToCurrentPage('text');
  });

  // Add Rectangle button
  document.getElementById('btn-add-rect')?.addEventListener('click', () => {
    addItemToCurrentPage('rectangle');
  });

  // Add Ellipse button
  document.getElementById('btn-add-ellipse')?.addEventListener('click', () => {
    addItemToCurrentPage('ellipse');
  });

  // Add Line button
  document.getElementById('btn-add-line')?.addEventListener('click', () => {
    addItemToCurrentPage('line');
  });

  // Add Circle button
  document.getElementById('btn-add-circle')?.addEventListener('click', () => {
    addItemToCurrentPage('circle');
  });

  // Add Arrow button
  document.getElementById('btn-add-arrow')?.addEventListener('click', () => {
    addItemToCurrentPage('arrow');
  });

  // Add Image button
  document.getElementById('btn-add-image')?.addEventListener('click', () => {
    // Create file input to select image
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await addImageToCurrentPage(file);
      }
    };
    input.click();
  });

  // Duplicate item button
  document.getElementById('btn-duplicate-item')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
      if (item) {
        const newItem: PageItem = {
          ...item,
          id: crypto.randomUUID(),
          x: item.x + 20,
          y: item.y + 20,
        };
        appState.addItemToPage(editorState.selectedPageNumber, newItem);
        appState.updateEditor({ selectedItemId: newItem.id });
        switchToSelectedTab();
      }
    }
  });

  // Delete item button
  document.getElementById('btn-delete-item')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.deleteItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  // Z-order buttons
  document.getElementById('btn-bring-front')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.bringItemToFront(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  document.getElementById('btn-send-back')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.sendItemToBack(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  document.getElementById('btn-move-forward')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.moveItemForward(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  document.getElementById('btn-move-backward')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.moveItemBackward(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  // Download page as PNG
  document.getElementById('btn-download-page-png')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      downloadPageAsPng(editorState.selectedPageNumber);
    }
  });

  // Download spread as PNG
  document.getElementById('btn-download-spread-png')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      downloadSpreadAsPng(editorState.selectedPageNumber);
    }
  });

  // Replace page with image
  document.getElementById('btn-replace-page-image')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber === null) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && editorState.selectedPageNumber !== null) {
        await replacePageWithImage(editorState.selectedPageNumber, file);
      }
    };
    input.click();
  });

  // Replace spread with image
  document.getElementById('btn-replace-spread-image')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber === null) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && editorState.selectedPageNumber !== null) {
        await replaceSpreadWithImage(editorState.selectedPageNumber, file);
      }
    };
    input.click();
  });

  // Delete static page
  document.getElementById('btn-delete-static-page')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      appState.deleteStaticPage(editorState.selectedPageNumber);
    }
  });

  // Property input handlers
  setupEditPropertyInputs(updateEditSelectedSectionFn);
}
