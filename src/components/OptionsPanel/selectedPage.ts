/**
 * OptionsPanel Selected Page Module
 * Handles the selected page panel
 */

import { appState } from '../../services/state';

/**
 * Set up the selected page panel event handlers
 */
export function setupSelectedPagePanel(): void {
  // Delete page button (for blank/static pages)
  document.getElementById('btn-delete-page')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      appState.removeBlankPage(editorState.selectedPageNumber);
      // Clear selection
      appState.updateEditor({ selectedPageNumber: null, selectedPagePosition: null });
    }
  });

  // Add blank page after button (for content pages)
  document.getElementById('btn-add-blank-after')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      const afterPageNumber = editorState.selectedPageNumber;
      appState.addBlankPage(afterPageNumber);

      // Auto-select the new blank page
      // The new blank page is inserted after the current page, so it's afterPageNumber + 1
      const newPageNumber = afterPageNumber + 1;
      // Odd pages are recto, even pages are verso
      const newPosition = newPageNumber % 2 === 1 ? 'recto' : 'verso';
      appState.updateEditor({
        selectedPageNumber: newPageNumber,
        selectedPagePosition: newPosition,
      });

      // Dispatch event to navigate to the new page's spread
      window.dispatchEvent(new CustomEvent('navigate-to-page', {
        detail: { pageNumber: newPageNumber }
      }));
    }
  });
}

/**
 * Update the selected page section based on current selection
 */
export function updateSelectedPagePanel(): void {
  const editorState = appState.getEditor();
  const project = appState.getProject();
  const section = document.getElementById('selected-page-section');

  if (!section) return;

  // Hide section if no page selected
  if (editorState.selectedPageNumber === null || editorState.selectedPagePosition === null) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  // Find the selected page
  let selectedPage = null;
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (editorState.selectedPagePosition === 'verso' &&
          spread.verso?.pageNumber === editorState.selectedPageNumber) {
        selectedPage = spread.verso;
        break;
      }
      if (editorState.selectedPagePosition === 'recto' &&
          spread.recto?.pageNumber === editorState.selectedPageNumber) {
        selectedPage = spread.recto;
        break;
      }
    }
    if (selectedPage) break;
  }

  // Update info
  document.getElementById('selected-page-number')!.textContent =
    editorState.selectedPageNumber.toString();
  document.getElementById('selected-page-position')!.textContent =
    editorState.selectedPagePosition === 'verso' ? 'Left (verso)' : 'Right (recto)';

  // Determine page type and show appropriate actions
  const staticActions = document.getElementById('static-page-actions')!;
  const normalActions = document.getElementById('normal-page-actions')!;

  // Blank pages are considered "static" from user's perspective
  const isBlankOrStatic = selectedPage?.isBlank || selectedPage?.isStatic;

  if (isBlankOrStatic) {
    document.getElementById('selected-page-type')!.textContent = 'Blank';
    staticActions.style.display = 'flex';
    normalActions.style.display = 'none';
  } else {
    document.getElementById('selected-page-type')!.textContent = 'Content';
    staticActions.style.display = 'none';
    normalActions.style.display = 'flex';
  }
}
