/**
 * SpreadEditor Thumbnails Module
 * Handles rendering of spread thumbnails in the sidebar
 */

import { appState } from '../../services/state';
import type { Spread } from '../../types';

// Track drag state for spreads
let draggedSpreadId: string | null = null;
let dragSourceSpreadIndex: number = -1;

// Track drag state for signatures
let draggedSignatureIndex: number = -1;

// Track drag state for individual pages
let draggedPageNumber: number = -1;

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

    // Make signatures draggable when there's more than one
    if (project.signatures.length > 1) {
      sigContainer.setAttribute('draggable', 'true');
      sigContainer.style.cursor = 'grab';

      // Signature drag start
      sigContainer.addEventListener('dragstart', (e) => {
        // Don't start signature drag if we're dragging a spread inside
        if (draggedSpreadId !== null) {
          e.preventDefault();
          return;
        }

        draggedSignatureIndex = sigIndex;
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('application/x-printfold-signature', JSON.stringify({
          signatureIndex: sigIndex
        }));

        sigContainer.classList.add('dragging-signature');
        sigContainer.style.opacity = '0.5';
      });

      // Signature drag end
      sigContainer.addEventListener('dragend', () => {
        sigContainer.classList.remove('dragging-signature');
        sigContainer.style.opacity = '1';
        draggedSignatureIndex = -1;

        // Remove all signature drop indicators
        thumbnailContainer.querySelectorAll('.signature-drop-target').forEach(el => {
          el.classList.remove('signature-drop-target');
          (el as HTMLElement).style.borderColor = '#9ca3af';
        });
      });

      // Signature dragover (for receiving other signatures)
      sigContainer.addEventListener('dragover', (e) => {
        // Only handle signature drags, not spread drags
        if (draggedSignatureIndex === -1) return;
        if (draggedSignatureIndex === sigIndex) return;

        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';

        sigContainer.classList.add('signature-drop-target');
        sigContainer.style.borderColor = '#3b82f6';
      });

      // Signature dragleave
      sigContainer.addEventListener('dragleave', (e) => {
        // Check if we're leaving to a child element
        if (sigContainer.contains(e.relatedTarget as Node)) return;

        sigContainer.classList.remove('signature-drop-target');
        sigContainer.style.borderColor = '#9ca3af';
      });

      // Signature drop
      sigContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        sigContainer.classList.remove('signature-drop-target');
        sigContainer.style.borderColor = '#9ca3af';

        const dataStr = e.dataTransfer?.getData('application/x-printfold-signature');
        if (!dataStr) return;

        const data = JSON.parse(dataStr);
        const sourceIndex: number = data.signatureIndex;

        if (sourceIndex === sigIndex) return;

        // Reorder signatures
        appState.reorderSignatures(sourceIndex, sigIndex);
      });
    }

    // Render spreads within this signature
    signature.spreads.forEach((spread, spreadIdxInSig) => {
      // Check if this is the last spread of this signature
      const isLastSpreadOfSig = spreadIdxInSig === signature.spreads.length - 1;
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

    // Draw verso background - only if page exists (empty positions show nothing)
    if (spread.verso) {
      ctx.fillStyle = getBackgroundColor(spread.verso);
      ctx.fillRect(0, 0, thumbWidth / 2, thumbHeight);
    }
    // Empty verso: show nothing (transparent)

    // Draw recto background - only if page exists
    if (spread.recto) {
      ctx.fillStyle = getBackgroundColor(spread.recto);
      ctx.fillRect(thumbWidth / 2, 0, thumbWidth / 2, thumbHeight);
    }
    // Empty recto: show nothing (transparent)

    // Draw spine line
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(thumbWidth / 2, 0);
    ctx.lineTo(thumbWidth / 2, thumbHeight);
    ctx.stroke();

    // Draw content indicators (simple lines to represent text)
    const contentMargin = 3;

    // Verso page content - only if page exists
    if (spread.verso) {
      if (spread.verso.isBlank || spread.verso.isStatic) {
        // Draw blank/static page indicator
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(1, 1, thumbWidth / 2 - 2, thumbHeight - 2);
        ctx.fillStyle = '#cccccc';
        ctx.font = '6px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(spread.verso.isStatic ? 'S' : '∅', thumbWidth / 4, thumbHeight / 2 + 2);
      } else if (spread.verso.sections && spread.verso.sections.length > 0) {
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

    // Recto page content - only if page exists
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

    // Get page states for verso and recto
    const versoPageState = spread.verso?.pageState || 'available';
    const rectoPageState = spread.recto?.pageState || 'available';

    // Check if either page is static (for drag/drop)
    const hasStaticPage = versoPageState === 'static' || rectoPageState === 'static';

    thumbDiv.appendChild(canvas);

    // Create labels container with individual page numbers
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'spread-thumbnail-labels';

    // Verso label - only show if page exists
    if (spread.verso) {
      const versoLabel = document.createElement('div');
      versoLabel.className = 'spread-thumbnail-page-label' + (isVersoSelected ? ' selected' : '');
      versoLabel.textContent = spread.verso.pageNumber.toString();
      versoLabel.title = `Page ${spread.verso.pageNumber}`;

      // Add page state class for background color
      versoLabel.classList.add(`page-state-${versoPageState}`);
      versoLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        setCurrentSpreadIndex(spreadIndex);
        selectPageFn(spread.verso!.pageNumber, 'verso');
        updateSpreadIndicatorFn();
      });

      // Make static verso page draggable
      if (versoPageState === 'static') {
        versoLabel.setAttribute('draggable', 'true');
        versoLabel.style.cursor = 'grab';

        versoLabel.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          draggedPageNumber = spread.verso!.pageNumber;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('application/x-printfold-page', JSON.stringify({
            pageNumber: spread.verso!.pageNumber
          }));
          versoLabel.classList.add('dragging-page');
          versoLabel.style.opacity = '0.5';
        });

        versoLabel.addEventListener('dragend', () => {
          versoLabel.classList.remove('dragging-page');
          versoLabel.style.opacity = '1';
          draggedPageNumber = -1;
          thumbnailContainer.querySelectorAll('.page-drop-target').forEach(el => {
            el.classList.remove('page-drop-target');
          });
        });
      }

      // Drop target for dragged static pages
      versoLabel.addEventListener('dragover', (e) => {
        if (draggedPageNumber === -1) return;
        if (draggedPageNumber === spread.verso!.pageNumber) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer!.dropEffect = 'move';
        versoLabel.classList.add('page-drop-target');
      });

      versoLabel.addEventListener('dragleave', () => {
        versoLabel.classList.remove('page-drop-target');
      });

      versoLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        versoLabel.classList.remove('page-drop-target');

        const dataStr = e.dataTransfer?.getData('application/x-printfold-page');
        if (!dataStr) return;

        const data = JSON.parse(dataStr);
        const sourcePageNumber: number = data.pageNumber;
        const targetPageNumber = spread.verso!.pageNumber;

        if (sourcePageNumber !== targetPageNumber) {
          appState.moveStaticPage(sourcePageNumber, targetPageNumber);
        }
      });

      labelsContainer.appendChild(versoLabel);
    } else {
      // Empty verso - add spacer to maintain layout
      const spacer = document.createElement('div');
      spacer.className = 'spread-thumbnail-page-label empty';
      spacer.style.visibility = 'hidden';
      labelsContainer.appendChild(spacer);
    }

    // Recto label - only show if page exists
    if (spread.recto) {
      const rectoLabel = document.createElement('div');
      rectoLabel.className = 'spread-thumbnail-page-label' + (isRectoSelected ? ' selected' : '');
      rectoLabel.textContent = spread.recto.pageNumber.toString();
      rectoLabel.title = `Page ${spread.recto.pageNumber}`;

      // Add page state class for background color
      rectoLabel.classList.add(`page-state-${rectoPageState}`);
      rectoLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        setCurrentSpreadIndex(spreadIndex);
        selectPageFn(spread.recto!.pageNumber, 'recto');
        updateSpreadIndicatorFn();
      });

      // Make static recto page draggable
      if (rectoPageState === 'static') {
        rectoLabel.setAttribute('draggable', 'true');
        rectoLabel.style.cursor = 'grab';

        rectoLabel.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          draggedPageNumber = spread.recto!.pageNumber;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('application/x-printfold-page', JSON.stringify({
            pageNumber: spread.recto!.pageNumber
          }));
          rectoLabel.classList.add('dragging-page');
          rectoLabel.style.opacity = '0.5';
        });

        rectoLabel.addEventListener('dragend', () => {
          rectoLabel.classList.remove('dragging-page');
          rectoLabel.style.opacity = '1';
          draggedPageNumber = -1;
          thumbnailContainer.querySelectorAll('.page-drop-target').forEach(el => {
            el.classList.remove('page-drop-target');
          });
        });
      }

      // Drop target for dragged static pages
      rectoLabel.addEventListener('dragover', (e) => {
        if (draggedPageNumber === -1) return;
        if (draggedPageNumber === spread.recto!.pageNumber) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer!.dropEffect = 'move';
        rectoLabel.classList.add('page-drop-target');
      });

      rectoLabel.addEventListener('dragleave', () => {
        rectoLabel.classList.remove('page-drop-target');
      });

      rectoLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rectoLabel.classList.remove('page-drop-target');

        const dataStr = e.dataTransfer?.getData('application/x-printfold-page');
        if (!dataStr) return;

        const data = JSON.parse(dataStr);
        const sourcePageNumber: number = data.pageNumber;
        const targetPageNumber = spread.recto!.pageNumber;

        if (sourcePageNumber !== targetPageNumber) {
          appState.moveStaticPage(sourcePageNumber, targetPageNumber);
        }
      });

      labelsContainer.appendChild(rectoLabel);
    } else {
      // Empty recto - add spacer to maintain layout
      const spacer = document.createElement('div');
      spacer.className = 'spread-thumbnail-page-label empty';
      spacer.style.visibility = 'hidden';
      labelsContainer.appendChild(spacer);
    }

    thumbDiv.appendChild(labelsContainer);

    // Create "Make Static?" buttons container for pages with items but not static
    const versoNeedsPrompt = spread.verso && appState.pageNeedsStaticPrompt(spread.verso.pageNumber);
    const rectoNeedsPrompt = spread.recto && appState.pageNeedsStaticPrompt(spread.recto.pageNumber);

    if (versoNeedsPrompt || rectoNeedsPrompt) {
      const promptContainer = document.createElement('div');
      promptContainer.className = 'make-static-prompt-container';
      promptContainer.style.cssText = `
        display: flex;
        gap: 2px;
        margin-top: 2px;
        width: 100%;
      `;

      if (versoNeedsPrompt && spread.verso) {
        const versoBtn = document.createElement('button');
        versoBtn.className = 'make-static-btn';
        versoBtn.textContent = 'Static?';
        versoBtn.title = `Make page ${spread.verso.pageNumber} static (removes from text flow)`;
        versoBtn.style.cssText = `
          flex: 1;
          font-size: 8px;
          padding: 1px 2px;
          border: 1px solid #ea580c;
          background: #fff7ed;
          color: #ea580c;
          border-radius: 2px;
          cursor: pointer;
        `;
        const pageNum = spread.verso.pageNumber;
        versoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          appState.makePageStatic(pageNum);
        });
        promptContainer.appendChild(versoBtn);
      } else {
        // Spacer for alignment
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        promptContainer.appendChild(spacer);
      }

      if (rectoNeedsPrompt && spread.recto) {
        const rectoBtn = document.createElement('button');
        rectoBtn.className = 'make-static-btn';
        rectoBtn.textContent = 'Static?';
        rectoBtn.title = `Make page ${spread.recto.pageNumber} static (removes from text flow)`;
        rectoBtn.style.cssText = `
          flex: 1;
          font-size: 8px;
          padding: 1px 2px;
          border: 1px solid #ea580c;
          background: #fff7ed;
          color: #ea580c;
          border-radius: 2px;
          cursor: pointer;
        `;
        const pageNum = spread.recto.pageNumber;
        rectoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          appState.makePageStatic(pageNum);
        });
        promptContainer.appendChild(rectoBtn);
      } else if (versoNeedsPrompt) {
        // Spacer for alignment
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        promptContainer.appendChild(spacer);
      }

      thumbDiv.appendChild(promptContainer);
    }

    // Make spreads with static pages draggable
    if (hasStaticPage) {
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

    // Drop target handling - only for spreads with static pages
    if (hasStaticPage) {
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
    const pointerEvents = hasStaticPage ? 'pointer-events: none;' : '';
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
