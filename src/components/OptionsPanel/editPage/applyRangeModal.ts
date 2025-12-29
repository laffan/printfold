/**
 * Apply Range Modal
 * Modal for selecting pages to apply a background to
 */

import { appState } from '../../../services/state';
import type { PageContent } from '../../../types';

let currentImageFileId: string | null = null;
let currentCallback: (() => void) | null = null;
let selectedPages: Set<number> = new Set();

/**
 * Show the apply range modal
 */
export function showApplyRangeModal(imageFileId: string, onComplete: () => void): void {
  currentImageFileId = imageFileId;
  currentCallback = onComplete;
  selectedPages = new Set();

  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const content = document.getElementById('modal-content');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');

  if (!overlay || !title || !content) return;

  title.textContent = 'Apply Background to Pages';

  // Get all pages
  const project = appState.getProject();
  const allPages: PageContent[] = [];
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push(spread.verso);
      if (spread.recto) allPages.push(spread.recto);
    }
  }
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  // Get the background image
  const file = project.files.find(f => f.id === imageFileId);
  const bgSrc = file ? `data:image/png;base64,${file.content}` : '';

  // Build modal content
  content.innerHTML = `
    <p style="margin-bottom: 12px; color: var(--color-text-secondary); font-size: 12px;">
      Click pages to select them, then click OK to apply the background.
    </p>
    <div class="apply-range-actions" style="margin-bottom: 12px; display: flex; gap: 8px;">
      <button id="select-all-pages" class="btn btn-secondary btn-small">Select All</button>
      <button id="select-none-pages" class="btn btn-secondary btn-small">Select None</button>
    </div>
    <div class="apply-range-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 8px; max-height: 300px; overflow-y: auto;">
      ${allPages.map(page => `
        <div class="apply-range-page" data-page="${page.pageNumber}" style="
          position: relative;
          aspect-ratio: 0.707;
          background: #fff;
          border: 2px solid var(--color-border);
          border-radius: 4px;
          cursor: pointer;
          overflow: hidden;
          transition: border-color 0.15s ease;
        ">
          ${page.customBackgroundImageId === imageFileId ? `
            <img src="${bgSrc}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.5;" />
          ` : ''}
          <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: var(--color-text);">
            ${page.pageNumber}
          </div>
          <div class="page-check" style="position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; background: var(--color-primary); border-radius: 50%; display: none; align-items: center; justify-content: center; color: #fff; font-size: 10px;">
            ✓
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Add click handlers for page selection
  const pageElements = content.querySelectorAll('.apply-range-page');
  pageElements.forEach(el => {
    el.addEventListener('click', () => {
      const pageNum = parseInt(el.getAttribute('data-page') || '0');
      if (selectedPages.has(pageNum)) {
        selectedPages.delete(pageNum);
        (el as HTMLElement).style.borderColor = 'var(--color-border)';
        const check = el.querySelector('.page-check') as HTMLElement;
        if (check) check.style.display = 'none';
      } else {
        selectedPages.add(pageNum);
        (el as HTMLElement).style.borderColor = 'var(--color-primary)';
        const check = el.querySelector('.page-check') as HTMLElement;
        if (check) check.style.display = 'flex';
      }
    });
  });

  // Select all button
  document.getElementById('select-all-pages')?.addEventListener('click', () => {
    pageElements.forEach(el => {
      const pageNum = parseInt(el.getAttribute('data-page') || '0');
      selectedPages.add(pageNum);
      (el as HTMLElement).style.borderColor = 'var(--color-primary)';
      const check = el.querySelector('.page-check') as HTMLElement;
      if (check) check.style.display = 'flex';
    });
  });

  // Select none button
  document.getElementById('select-none-pages')?.addEventListener('click', () => {
    pageElements.forEach(el => {
      const pageNum = parseInt(el.getAttribute('data-page') || '0');
      selectedPages.delete(pageNum);
      (el as HTMLElement).style.borderColor = 'var(--color-border)';
      const check = el.querySelector('.page-check') as HTMLElement;
      if (check) check.style.display = 'none';
    });
  });

  // Set up modal buttons
  const handleConfirm = () => {
    if (currentImageFileId && selectedPages.size > 0) {
      appState.applyBackgroundToPages(currentImageFileId, Array.from(selectedPages));
    }
    closeModal();
    if (currentCallback) currentCallback();
  };

  const handleCancel = () => {
    closeModal();
  };

  // Remove existing handlers and add new ones
  const newConfirmBtn = confirmBtn?.cloneNode(true) as HTMLElement;
  const newCancelBtn = cancelBtn?.cloneNode(true) as HTMLElement;
  confirmBtn?.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
  cancelBtn?.parentNode?.replaceChild(newCancelBtn, cancelBtn);

  newConfirmBtn?.addEventListener('click', handleConfirm);
  newCancelBtn?.addEventListener('click', handleCancel);

  // Show modal
  overlay.classList.remove('hidden');
}

/**
 * Close the modal
 */
function closeModal(): void {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  currentImageFileId = null;
  currentCallback = null;
  selectedPages = new Set();
}
