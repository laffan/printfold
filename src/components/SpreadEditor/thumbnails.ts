/**
 * SpreadEditor Thumbnails Module
 * Handles rendering of spread thumbnails in the sidebar
 */

import { appState } from '../../services/state';
import type { Spread } from '../../types';

// Track drag state
let draggedSpreadId: string | null = null;
let dragSourceSpreadIndex: number = -1;

/**
 * Render all spread thumbnails
 */
export function renderThumbnails(
  thumbnailContainer: HTMLElement,
  pageDimensions: { width: number; height: number },
  currentSpreadIndex: number,
  selectPageFn: (pageNumber: number, position: 'verso' | 'recto') => void,
  setCurrentSpreadIndex: (index: number) => void,
  updateSpreadIndicatorFn: () => void
): void {
  const project = appState.getProject();
  const editorState = appState.getEditor();

  // Clear existing thumbnails
  thumbnailContainer.innerHTML = '';

  if (project.signatures.length === 0) {
    return;
  }

  // Calculate thumbnail dimensions - maintain actual spread aspect ratio
  const thumbWidth = 80;
  const spreadAspect = (pageDimensions.width * 2) / pageDimensions.height;
  const thumbHeight = thumbWidth / spreadAspect;

  // Track global spread index for navigation
  let globalSpreadIndex = 0;

  // Iterate through signatures to create grouped thumbnails
  project.signatures.forEach((signature, sigIndex) => {
    // Create signature container with dashed border
    const sigContainer = document.createElement('div');
    sigContainer.className = 'signature-thumbnail-group';
    sigContainer.style.cssText = `
      border: 1px dashed #9ca3af;
      border-radius: 4px;
      padding: 6px;
      margin-bottom: 10px;
      background: rgba(156, 163, 175, 0.05);
      display: flex;
      flex-direction: column;
      align-items: center;
    `;

    // Add signature label
    const sigLabel = document.createElement('div');
    sigLabel.className = 'signature-label';
    sigLabel.style.cssText = `
      font-size: 9px;
      color: #6b7280;
      text-align: center;
      margin-bottom: 4px;
      font-weight: 500;
    `;
    sigLabel.textContent = `Sig ${sigIndex + 1}`;
    sigContainer.appendChild(sigLabel);

    // Render spreads within this signature
    signature.spreads.forEach((spread) => {
      const spreadIndex = globalSpreadIndex;
      globalSpreadIndex++;

      const thumbDiv = document.createElement('div');
      thumbDiv.className = 'spread-thumbnail' + (spreadIndex === currentSpreadIndex ? ' active' : '');

    // Create a small canvas for the thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = thumbWidth * 2; // Higher res for retina
    canvas.height = thumbHeight * 2;
    canvas.style.width = `${thumbWidth}px`;
    canvas.style.height = `${thumbHeight}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    // Draw page backgrounds (use backgroundFill if present)
    const getBackgroundColor = (page: typeof spread.verso) => {
      if (!page?.backgroundFill) return '#ffffff';
      if (page.backgroundFill.type === 'color') {
        return page.backgroundFill.color || '#ffffff';
      }
      // For gradients, use the first stop color
      if (page.backgroundFill.type === 'linearGradient' && page.backgroundFill.linearGradient?.stops?.length) {
        return page.backgroundFill.linearGradient.stops[0].color;
      }
      if (page.backgroundFill.type === 'radialGradient' && page.backgroundFill.radialGradient?.stops?.length) {
        return page.backgroundFill.radialGradient.stops[0].color;
      }
      return '#ffffff';
    };

    ctx.fillStyle = getBackgroundColor(spread.verso);
    ctx.fillRect(0, 0, thumbWidth / 2, thumbHeight);
    ctx.fillStyle = getBackgroundColor(spread.recto);
    ctx.fillRect(thumbWidth / 2, 0, thumbWidth / 2, thumbHeight);

    // Draw spine line
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(thumbWidth / 2, 0);
    ctx.lineTo(thumbWidth / 2, thumbHeight);
    ctx.stroke();

    // Draw content indicators (simple lines to represent text)
    ctx.fillStyle = '#d0d0d0';
    const contentMargin = 3;
    const signatureCount = project.signatures.length;

    // Verso page content - draw blank indicator or content lines
    if (spread.verso) {
      if (spread.verso.isBlank || spread.verso.isStatic) {
        // Draw blank/static page indicator
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(1, 1, thumbWidth / 2 - 2, thumbHeight - 2);
        ctx.fillStyle = '#cccccc';
        ctx.font = '6px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(spread.verso.isStatic ? 'S' : '∅', thumbWidth / 4, thumbHeight / 2 + 2);
      } else if (spread.verso.sections.length > 0) {
        ctx.fillStyle = '#d0d0d0';
        let yPos = contentMargin;
        for (const section of spread.verso.sections) {
          if (yPos > thumbHeight - contentMargin) break;
          const lineCount = (section as { lines?: string[] }).lines?.length || 1;
          for (let i = 0; i < Math.min(lineCount, 5); i++) {
            if (yPos > thumbHeight - contentMargin) break;
            const lineWidth = (thumbWidth / 2 - contentMargin * 2) * (0.6 + Math.random() * 0.35);
            ctx.fillRect(contentMargin, yPos, lineWidth, 1);
            yPos += 2;
          }
          yPos += 1;
        }
      }
    }

    // Recto page content
    if (spread.recto) {
      if (spread.recto.isBlank || spread.recto.isStatic) {
        // Draw blank/static page indicator
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(thumbWidth / 2 + 1, 1, thumbWidth / 2 - 2, thumbHeight - 2);
        ctx.fillStyle = '#cccccc';
        ctx.font = '6px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(spread.recto.isStatic ? 'S' : '∅', thumbWidth * 3 / 4, thumbHeight / 2 + 2);
      } else if (spread.recto.sections.length > 0) {
        ctx.fillStyle = '#d0d0d0';
        let yPos = contentMargin;
        for (const section of spread.recto.sections) {
          if (yPos > thumbHeight - contentMargin) break;
          const lineCount = (section as { lines?: string[] }).lines?.length || 1;
          for (let i = 0; i < Math.min(lineCount, 5); i++) {
            if (yPos > thumbHeight - contentMargin) break;
            const lineWidth = (thumbWidth / 2 - contentMargin * 2) * (0.6 + Math.random() * 0.35);
            ctx.fillRect(thumbWidth / 2 + contentMargin, yPos, lineWidth, 1);
            yPos += 2;
          }
          yPos += 1;
        }
      }
    }

    // Check selection state for labels
    const isVersoSelected = editorState.selectedPagePosition === 'verso' &&
      spread.verso?.pageNumber === editorState.selectedPageNumber;
    const isRectoSelected = editorState.selectedPagePosition === 'recto' &&
      spread.recto?.pageNumber === editorState.selectedPageNumber;

    // Check if this spread is a user-created static spread (from staticSpreads array)
    // This is different from isStatic on pages, which includes back cover and padding pages
    const staticSpreads = project.staticSpreads || [];
    const isUserStaticSpread = staticSpreads.some(ss => ss.id === spread.id);

    // DEBUG: Log static spread detection
    if (spreadIndex === 0) {
      console.log('[DEBUG] staticSpreads array:', staticSpreads.map(s => s.id));
    }
    if (spread.verso?.isStatic || spread.recto?.isStatic) {
      console.log(`[DEBUG] Spread ${spreadIndex} has static page(s). spread.id=${spread.id}, isUserStaticSpread=${isUserStaticSpread}`);
    }

    // Individual page static checks (for display purposes)
    const isVersoStatic = spread.verso?.isStatic ?? false;
    const isRectoStatic = spread.recto?.isStatic ?? false;

    thumbDiv.appendChild(canvas);

    // Create labels container with individual page numbers
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'spread-thumbnail-labels';

    // Verso label - show "BC" for back cover (page 0) only in single-signature booklets
    const versoLabel = document.createElement('div');
    versoLabel.className = 'spread-thumbnail-page-label' + (isVersoSelected ? ' selected' : '');
    const versoPageNum = spread.verso?.pageNumber;
    const isBackCover = versoPageNum === 0 && signatureCount === 1;
    versoLabel.textContent = isBackCover ? 'BC' : (versoPageNum?.toString() || '–');
    versoLabel.title = isBackCover ? 'Back Cover' : `Page ${versoPageNum}`;
    if (isBackCover) {
      versoLabel.style.color = '#dc2626';
      versoLabel.style.fontWeight = 'bold';
    }
    // Add dark orange background for user-created static spreads (not back cover)
    if (isUserStaticSpread) {
      versoLabel.classList.add('static-page-label');
    }
    versoLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(spreadIndex);
      if (spread.verso) {
        selectPageFn(spread.verso.pageNumber, 'verso');
      }
      updateSpreadIndicatorFn();
    });
    labelsContainer.appendChild(versoLabel);

    // Recto label
    const rectoLabel = document.createElement('div');
    rectoLabel.className = 'spread-thumbnail-page-label' + (isRectoSelected ? ' selected' : '');
    rectoLabel.textContent = spread.recto?.pageNumber?.toString() || '–';
    // Add dark orange background for user-created static spreads
    if (isUserStaticSpread) {
      rectoLabel.classList.add('static-page-label');
    }
    rectoLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(spreadIndex);
      if (spread.recto) {
        selectPageFn(spread.recto.pageNumber, 'recto');
      }
      updateSpreadIndicatorFn();
    });
    labelsContainer.appendChild(rectoLabel);

    thumbDiv.appendChild(labelsContainer);

    // Make user-created static spreads draggable
    if (isUserStaticSpread) {
      thumbDiv.setAttribute('draggable', 'true');
      thumbDiv.classList.add('draggable-thumbnail');

      // Drag start
      thumbDiv.addEventListener('dragstart', (e) => {
        e.stopPropagation();

        draggedSpreadId = spread.id;
        dragSourceSpreadIndex = spreadIndex;

        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('application/x-printfold-spread', JSON.stringify({
          spreadId: spread.id,
          sourceSpreadIndex: spreadIndex
        }));

        thumbDiv.classList.add('dragging');
      });

      // Drag end
      thumbDiv.addEventListener('dragend', () => {
        thumbDiv.classList.remove('dragging');
        draggedSpreadId = null;
        dragSourceSpreadIndex = -1;

        // Remove all drop indicators
        thumbnailContainer.querySelectorAll('.drop-target, .drop-before, .drop-after').forEach(el => {
          el.classList.remove('drop-target', 'drop-before', 'drop-after');
        });
      });
    }

    // Drop target handling - only for user-created static spreads
    if (isUserStaticSpread) {
      thumbDiv.addEventListener('dragover', (e) => {
        if (!draggedSpreadId) return;
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';

        // Don't allow dropping on self
        if (spreadIndex === dragSourceSpreadIndex) return;

        // Add visual feedback
        thumbDiv.classList.add('drop-target');
      });

      thumbDiv.addEventListener('dragleave', () => {
        thumbDiv.classList.remove('drop-target', 'drop-before', 'drop-after');
      });

      thumbDiv.addEventListener('drop', (e) => {
        e.preventDefault();
        thumbDiv.classList.remove('drop-target', 'drop-before', 'drop-after');

        const dataStr = e.dataTransfer?.getData('application/x-printfold-spread');
        if (!dataStr) return;

        const data = JSON.parse(dataStr);
        const sourceSpreadId: string = data.spreadId;

        if (!sourceSpreadId) return;

        // Perform the reorder using spread IDs
        appState.reorderStaticPages(sourceSpreadId, spread.id);
      });
    }

    // Create click areas for page selection (overlaid on canvas)
    const clickContainer = document.createElement('div');
    clickContainer.className = 'spread-thumbnail-clicks';
    // For static spreads, disable pointer events on overlay so drag can work on thumbDiv
    // (labels already have click handlers for page selection)
    const pointerEvents = isUserStaticSpread ? 'pointer-events: none;' : '';
    clickContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: ${thumbHeight}px; display: flex; ${pointerEvents}`;

    // Verso click area
    const versoClick = document.createElement('div');
    versoClick.style.cssText = 'flex: 1; cursor: pointer;';
    versoClick.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(spreadIndex);
      if (spread.verso) {
        selectPageFn(spread.verso.pageNumber, 'verso');
      }
      updateSpreadIndicatorFn();
    });
    clickContainer.appendChild(versoClick);

    // Recto click area
    const rectoClick = document.createElement('div');
    rectoClick.style.cssText = 'flex: 1; cursor: pointer;';
    rectoClick.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(spreadIndex);
      if (spread.recto) {
        selectPageFn(spread.recto.pageNumber, 'recto');
      }
      updateSpreadIndicatorFn();
    });
    clickContainer.appendChild(rectoClick);

    thumbDiv.appendChild(clickContainer);

      sigContainer.appendChild(thumbDiv);
    });

    thumbnailContainer.appendChild(sigContainer);
  });

  // Scroll active thumbnail into view
  const activeThumbnail = thumbnailContainer.querySelector('.spread-thumbnail.active');
  if (activeThumbnail) {
    activeThumbnail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
