/**
 * Custom Background functionality
 * Handles custom background images for pages
 */

import { appState } from '../../../services/state';
import { downloadBlankPage, downloadPageAsPng, getPageDimensions } from '../../../services/pageExport';
import { showApplyRangeModal } from './applyRangeModal';

/**
 * Set up custom background section event handlers
 */
export function setupCustomBackgroundHandlers(): void {
  // Download Blank button
  document.getElementById('btn-download-blank')?.addEventListener('click', () => {
    downloadBlankPage();
  });

  // Download Current button
  document.getElementById('btn-download-current')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      downloadPageAsPng(editorState.selectedPageNumber);
    }
  });

  // Upload Background button
  document.getElementById('btn-upload-background')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber === null) return;

    // Capture the page number now, in case selection changes while file picker is open
    const pageNumber = editorState.selectedPageNumber;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await uploadBackground(pageNumber, file);
      }
    };
    input.click();
  });

  // Remove Background button
  document.getElementById('btn-remove-background')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber !== null) {
      appState.setCustomBackground(editorState.selectedPageNumber, undefined);
      updateCustomBackgroundSection();
    }
  });
}

/**
 * Upload a background image for a page
 */
async function uploadBackground(pageNumber: number, file: File): Promise<void> {
  // Read file as base64
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  // Add file to project
  const projectFile = {
    id: crypto.randomUUID(),
    name: `bg-${file.name}`,
    type: 'image' as const,
    content,
    isBase64: true,
    lastModified: file.lastModified,
  };
  appState.addFiles([projectFile]);

  // Set as custom background for this page
  appState.setCustomBackground(pageNumber, projectFile.id);

  // Update the UI
  updateCustomBackgroundSection();
}

/**
 * Update the custom background section visibility and content
 */
export function updateCustomBackgroundSection(): void {
  const editorState = appState.getEditor();
  const section = document.getElementById('custom-background-section');
  const downloadCurrentBtn = document.getElementById('btn-download-current');
  const removeBackgroundBtn = document.getElementById('btn-remove-background');
  const librarySection = document.getElementById('background-library-section');

  if (!section) return;

  // Show section when a page is selected (any page type)
  if (editorState.selectedPageNumber === null) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  // Find the selected page to check if it's a text page
  const project = appState.getProject();
  let selectedPage = null;
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso?.pageNumber === editorState.selectedPageNumber) {
        selectedPage = spread.verso;
        break;
      }
      if (spread.recto?.pageNumber === editorState.selectedPageNumber) {
        selectedPage = spread.recto;
        break;
      }
    }
    if (selectedPage) break;
  }

  // Hide "Download Current" for text pages (pages with text content)
  const isTextPage = selectedPage?.pageState === 'text' ||
    (selectedPage?.sections && selectedPage.sections.length > 0 && selectedPage?.pageState !== 'static');
  if (downloadCurrentBtn) {
    downloadCurrentBtn.style.display = isTextPage ? 'none' : 'block';
  }

  // Show/hide remove button based on whether page has a custom background
  const currentBackground = appState.getCustomBackground(editorState.selectedPageNumber);
  if (removeBackgroundBtn) {
    removeBackgroundBtn.style.display = currentBackground ? 'block' : 'none';
  }

  // Update background library
  updateBackgroundLibrary();

  // Show library section if there are backgrounds
  const backgrounds = appState.getBackgroundLibrary();
  if (librarySection) {
    librarySection.style.display = backgrounds.length > 0 ? 'block' : 'none';
  }
}

/**
 * Update the background library list
 */
function updateBackgroundLibrary(): void {
  const libraryContainer = document.getElementById('background-library');
  if (!libraryContainer) return;

  const editorState = appState.getEditor();
  const project = appState.getProject();
  const backgrounds = appState.getBackgroundLibrary();
  const currentBackground = editorState.selectedPageNumber !== null
    ? appState.getCustomBackground(editorState.selectedPageNumber)
    : null;

  libraryContainer.innerHTML = '';

  for (const imageFileId of backgrounds) {
    const file = project.files.find(f => f.id === imageFileId);
    if (!file) continue;

    const item = document.createElement('div');
    item.className = 'background-library-item';
    if (currentBackground === imageFileId) {
      item.classList.add('active');
    }

    // Thumbnail
    const thumbnail = document.createElement('img');
    thumbnail.className = 'background-thumbnail';
    thumbnail.src = `data:image/png;base64,${file.content}`;
    thumbnail.alt = file.name;
    item.appendChild(thumbnail);

    // Actions container
    const actions = document.createElement('div');
    actions.className = 'background-actions';

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-secondary btn-small';
    applyBtn.textContent = 'Apply';
    applyBtn.title = 'Apply to current page';
    applyBtn.addEventListener('click', () => {
      if (editorState.selectedPageNumber !== null) {
        appState.setCustomBackground(editorState.selectedPageNumber, imageFileId);
        updateCustomBackgroundSection();
      }
    });
    actions.appendChild(applyBtn);

    // Apply All button
    const applyAllBtn = document.createElement('button');
    applyAllBtn.className = 'btn btn-secondary btn-small';
    applyAllBtn.textContent = 'All';
    applyAllBtn.title = 'Apply to all pages';
    applyAllBtn.addEventListener('click', () => {
      appState.applyBackgroundToAllPages(imageFileId);
      updateCustomBackgroundSection();
    });
    actions.appendChild(applyAllBtn);

    // Apply Range button
    const applyRangeBtn = document.createElement('button');
    applyRangeBtn.className = 'btn btn-secondary btn-small btn-apply-range';
    applyRangeBtn.textContent = 'Range';
    applyRangeBtn.title = 'Apply to selected pages';
    applyRangeBtn.addEventListener('click', () => {
      showApplyRangeModal(imageFileId, () => {
        updateCustomBackgroundSection();
      });
    });
    actions.appendChild(applyRangeBtn);

    item.appendChild(actions);
    libraryContainer.appendChild(item);
  }
}
