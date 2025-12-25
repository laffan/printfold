/**
 * SpreadEditor Thumbnails Module
 * Handles rendering of spread thumbnails in the sidebar
 */

import { appState } from '../../services/state';
import type { Spread } from '../../types';

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
  const allSpreads = project.signatures.flatMap(sig => sig.spreads);

  // Clear existing thumbnails
  thumbnailContainer.innerHTML = '';

  if (allSpreads.length === 0) {
    return;
  }

  // Calculate thumbnail dimensions - maintain actual spread aspect ratio
  const thumbWidth = 80;
  const spreadAspect = (pageDimensions.width * 2) / pageDimensions.height;
  const thumbHeight = thumbWidth / spreadAspect;

  allSpreads.forEach((spread, index) => {
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'spread-thumbnail' + (index === currentSpreadIndex ? ' active' : '');

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

    // Verso page content - draw blank indicator or content lines
    if (spread.verso) {
      // Check if this is the back cover (page 0)
      if (spread.verso.pageNumber === 0) {
        // Draw back cover indicator with red dashed border
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(1, 1, thumbWidth / 2 - 2, thumbHeight - 2);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 1]);
        ctx.strokeRect(2, 2, thumbWidth / 2 - 4, thumbHeight - 4);
        ctx.setLineDash([]);
        ctx.fillStyle = '#dc2626';
        ctx.font = '5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BACK', thumbWidth / 4, thumbHeight / 2 - 1);
        ctx.fillText('COVER', thumbWidth / 4, thumbHeight / 2 + 5);
      } else if (spread.verso.isBlank || spread.verso.isStatic) {
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

    thumbDiv.appendChild(canvas);

    // Create labels container with individual page numbers
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'spread-thumbnail-labels';

    // Verso label - show "BC" for back cover (page 0), otherwise page number
    const versoLabel = document.createElement('div');
    versoLabel.className = 'spread-thumbnail-page-label' + (isVersoSelected ? ' selected' : '');
    const versoPageNum = spread.verso?.pageNumber;
    versoLabel.textContent = versoPageNum === 0 ? 'BC' : (versoPageNum?.toString() || '–');
    versoLabel.title = versoPageNum === 0 ? 'Back Cover' : `Page ${versoPageNum}`;
    versoLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(index);
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
    rectoLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(index);
      if (spread.recto) {
        selectPageFn(spread.recto.pageNumber, 'recto');
      }
      updateSpreadIndicatorFn();
    });
    labelsContainer.appendChild(rectoLabel);

    thumbDiv.appendChild(labelsContainer);

    // Create click areas for page selection (overlaid on canvas)
    const clickContainer = document.createElement('div');
    clickContainer.className = 'spread-thumbnail-clicks';
    clickContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: ${thumbHeight}px; display: flex;`;

    // Verso click area
    const versoClick = document.createElement('div');
    versoClick.style.cssText = 'flex: 1; cursor: pointer;';
    versoClick.addEventListener('click', (e) => {
      e.stopPropagation();
      setCurrentSpreadIndex(index);
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
      setCurrentSpreadIndex(index);
      if (spread.recto) {
        selectPageFn(spread.recto.pageNumber, 'recto');
      }
      updateSpreadIndicatorFn();
    });
    clickContainer.appendChild(rectoClick);

    thumbDiv.appendChild(clickContainer);

    thumbnailContainer.appendChild(thumbDiv);
  });

  // Scroll active thumbnail into view
  const activeThumbnail = thumbnailContainer.querySelector('.spread-thumbnail.active');
  if (activeThumbnail) {
    activeThumbnail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
