/**
 * OptionsPanel Selected Page Module
 * Handles the selected page panel
 */

import { appState } from '../../services/state';

/**
 * Set up the selected page panel event handlers
 */
export function setupSelectedPagePanel(): void {
  // No additional setup needed - page info is now display-only
}

/**
 * Update the selected page section based on current selection
 */
export function updateSelectedPagePanel(): void {
  const editorState = appState.getEditor();
  const project = appState.getProject();
  const section = document.getElementById('selected-page-section');
  const summaryEl = document.getElementById('selected-page-summary');

  if (!section || !summaryEl) return;

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

  // Determine page type
  const isBlockedOrStatic = selectedPage?.blockTextFlow || selectedPage?.isStatic;
  const hasContent = selectedPage?.sections && selectedPage.sections.length > 0;
  const pageType = isBlockedOrStatic ? 'No Text' : hasContent ? 'Content' : 'Available';
  const position = editorState.selectedPagePosition === 'verso' ? 'Left (verso)' : 'Right (recto)';

  // Update condensed summary: "Page 2 | Left (verso) | No Text"
  summaryEl.textContent = `Page ${editorState.selectedPageNumber} | ${position} | ${pageType}`;
}
