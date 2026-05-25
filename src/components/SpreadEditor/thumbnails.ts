/**
 * SpreadEditor Thumbnails Module
 * Handles rendering of page thumbnails in the sidebar
 * Uses visual spreads (reading order pairs) instead of signature-based spreads
 */

import { appState } from '../../services/state';
import type { PageContent, ImagePageItem } from '../../types';

// Track drag state for individual pages
let draggedPageNumber: number = -1;

// Image cache for thumbnail rendering
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Preload images for thumbnail rendering
 */
export function preloadThumbnailImages(): void {
  const project = appState.getProject();

  for (const file of project.files) {
    if (file.type === 'image' && !imageCache.has(file.id)) {
      const img = new Image();
      img.onload = () => {
        imageCache.set(file.id, img);
      };
      const mimeType = file.name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      img.src = `data:${mimeType};base64,${file.content}`;
    }
  }
}

/**
 * Get cached image or return null
 */
function getCachedImage(fileId: string): HTMLImageElement | null {
  return imageCache.get(fileId) || null;
}

/**
 * Render all page thumbnails as visual spreads
 * Visual spreads show pages in reading order: [null|1], [2|3], [4|5], etc.
 * This correctly represents page transitions across signatures
 */
export function renderThumbnails(
  thumbnailContainer: HTMLElement,
  pageDimensions: { width: number; height: number },
  selectedPageNumber: number | null,
  selectPageFn: (pageNumber: number, position: 'verso' | 'recto') => void,
  updateSpreadIndicatorFn: () => void
): void {
  const project = appState.getProject();
  const editorState = appState.getEditor();

  // Preload images for thumbnail rendering
  preloadThumbnailImages();

  // Clear existing thumbnails
  thumbnailContainer.innerHTML = '';

  if (project.signatures.length === 0) {
    return;
  }

  // Collect all pages from all signatures
  const allPages: PageContent[] = [];
  const pageToSignature = new Map<number, number>(); // pageNumber -> signatureIndex

  project.signatures.forEach((sig, sigIdx) => {
    for (const spread of sig.spreads) {
      if (spread.verso) {
        allPages.push(spread.verso);
        pageToSignature.set(spread.verso.pageNumber, sigIdx);
      }
      if (spread.recto) {
        allPages.push(spread.recto);
        pageToSignature.set(spread.recto.pageNumber, sigIdx);
      }
    }
  });

  // Sort pages by page number
  allPages.sort((a, b) => a.pageNumber - b.pageNumber);

  if (allPages.length === 0) {
    return;
  }

  // Find the highest page number to determine total visual spreads
  const maxPageNum = Math.max(...allPages.map(p => p.pageNumber));

  // Create a map for quick page lookup
  const pageMap = new Map<number, PageContent>();
  for (const page of allPages) {
    pageMap.set(page.pageNumber, page);
  }

  // Determine layout mode
  const bookletType = project.outputOptions.bookletType ?? 'booklet';
  const singlePageLayout = bookletType === 'singleSided';

  // Calculate thumbnail dimensions
  const thumbWidth = 80;
  const spreadAspect = singlePageLayout
    ? pageDimensions.width / pageDimensions.height
    : (pageDimensions.width * 2) / pageDimensions.height;
  const thumbHeight = thumbWidth / spreadAspect;

  // Create visual spreads based on booklet type
  const visualSpreads: Array<{ verso: PageContent | null; recto: PageContent | null }> = [];

  if (bookletType === 'singleSided') {
    for (const page of allPages) {
      visualSpreads.push({ verso: page, recto: null });
    }
  } else if (bookletType === 'doubleSided') {
    for (let i = 0; i < allPages.length; i += 2) {
      visualSpreads.push({
        verso: allPages[i],
        recto: allPages[i + 1] || null,
      });
    }
  } else {
    // Booklet mode: [null|1], [2|3], [4|5], ..., [N|null]
    visualSpreads.push({
      verso: null,
      recto: pageMap.get(1) || null,
    });

    for (let versoNum = 2; versoNum <= maxPageNum; versoNum += 2) {
      const rectoNum = versoNum + 1;
      visualSpreads.push({
        verso: pageMap.get(versoNum) || null,
        recto: rectoNum <= maxPageNum ? (pageMap.get(rectoNum) || null) : null,
      });
    }
  }

  // Helper to get background color
  const getBackgroundColor = (page: PageContent | null): string | null => {
    if (!page) return null;
    if (!page.backgroundFill) return null; // No fill = transparent
    if (page.backgroundFill.type === 'color') {
      return page.backgroundFill.color || null;
    }
    if (page.backgroundFill.type === 'linearGradient' && page.backgroundFill.linearGradient?.stops?.length) {
      return page.backgroundFill.linearGradient.stops[0].color;
    }
    if (page.backgroundFill.type === 'radialGradient' && page.backgroundFill.radialGradient?.stops?.length) {
      return page.backgroundFill.radialGradient.stops[0].color;
    }
    return null;
  };

  // In single-page mode, each thumb shows one page at full width
  const pageThumbWidth = singlePageLayout ? thumbWidth : thumbWidth / 2;

  // Render each visual spread
  visualSpreads.forEach((vSpread, vSpreadIdx) => {
    // Determine if this visual spread is active based on selected page number
    const isActive = selectedPageNumber !== null && (
      (vSpread.verso?.pageNumber === selectedPageNumber) ||
      (vSpread.recto?.pageNumber === selectedPageNumber)
    );
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'spread-thumbnail' + (isActive ? ' active' : '');

    // Check for signature boundary between verso and recto
    const versoSig = vSpread.verso ? pageToSignature.get(vSpread.verso.pageNumber) : null;
    const rectoSig = vSpread.recto ? pageToSignature.get(vSpread.recto.pageNumber) : null;
    const hasSigBoundary = versoSig !== null && rectoSig !== null && versoSig !== rectoSig;

    // Create canvas for thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = thumbWidth * 2;
    canvas.height = thumbHeight * 2;
    canvas.style.width = `${thumbWidth}px`;
    canvas.style.height = `${thumbHeight}px`;
    const ctx = canvas.getContext('2d', { alpha: true })!;
    ctx.globalAlpha = 1.0;
    ctx.scale(2, 2);

    // Draw verso background (left side, or full width in single-page mode)
    if (vSpread.verso) {
      const bgColor = getBackgroundColor(vSpread.verso);
      if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, pageThumbWidth, thumbHeight);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageThumbWidth, thumbHeight);
      }
    } else {
      ctx.fillStyle = 'rgba(187, 186, 186, 1)';
      ctx.fillRect(0, 0, pageThumbWidth, thumbHeight);
      ctx.strokeStyle = 'rgba(170, 170, 170, 1)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(0, 0, pageThumbWidth, thumbHeight);
      ctx.setLineDash([]);
    }

    if (!singlePageLayout) {
      // Draw recto background (right side)
      if (vSpread.recto) {
        const bgColor = getBackgroundColor(vSpread.recto);
        if (bgColor) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(pageThumbWidth, 0, pageThumbWidth, thumbHeight);
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 1)';
          ctx.fillRect(pageThumbWidth, 0, pageThumbWidth, thumbHeight);
        }
      } else {
        ctx.fillStyle = 'rgba(187, 186, 186, 1)';
        ctx.fillRect(pageThumbWidth, 0, pageThumbWidth, thumbHeight);
        ctx.strokeStyle = 'rgba(170, 170, 170, 1)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(pageThumbWidth, 0, pageThumbWidth, thumbHeight);
        ctx.setLineDash([]);
      }

      // Draw spine line (with signature boundary indicator if needed)
      if (hasSigBoundary) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
      } else {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(pageThumbWidth, 0);
      ctx.lineTo(pageThumbWidth, thumbHeight);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw page content (items and text sections)
    const contentMargin = 3;

    // Verso content
    if (vSpread.verso) {
      drawPageContent(ctx, vSpread.verso, 0, pageThumbWidth, thumbHeight, contentMargin, pageDimensions);
    }

    // Recto content (not in single-page mode)
    if (!singlePageLayout && vSpread.recto) {
      drawPageContent(ctx, vSpread.recto, pageThumbWidth, pageThumbWidth, thumbHeight, contentMargin, pageDimensions);
    }

    thumbDiv.appendChild(canvas);

    // Create labels container
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'spread-thumbnail-labels';

    // Check selection state
    const isVersoSelected = editorState.selectedPagePosition === 'verso' &&
      vSpread.verso?.pageNumber === editorState.selectedPageNumber;
    const isRectoSelected = editorState.selectedPagePosition === 'recto' &&
      vSpread.recto?.pageNumber === editorState.selectedPageNumber;

    // Verso label
    if (vSpread.verso) {
      const versoLabel = createPageLabel(
        vSpread.verso,
        isVersoSelected || (singlePageLayout && vSpread.verso?.pageNumber === editorState.selectedPageNumber),
        'verso',
        selectPageFn,
        updateSpreadIndicatorFn,
        thumbnailContainer
      );
      labelsContainer.appendChild(versoLabel);
    } else if (!singlePageLayout) {
      const spacer = document.createElement('div');
      spacer.className = 'spread-thumbnail-page-label empty';
      spacer.style.visibility = 'hidden';
      labelsContainer.appendChild(spacer);
    }

    // Recto label (not in single-page mode)
    if (!singlePageLayout) {
      if (vSpread.recto) {
        const rectoLabel = createPageLabel(
          vSpread.recto,
          isRectoSelected,
          'recto',
          selectPageFn,
          updateSpreadIndicatorFn,
          thumbnailContainer
        );
        labelsContainer.appendChild(rectoLabel);
      } else {
        const spacer = document.createElement('div');
        spacer.className = 'spread-thumbnail-page-label empty';
        spacer.style.visibility = 'hidden';
        labelsContainer.appendChild(spacer);
      }
    }

    thumbDiv.appendChild(labelsContainer);

    // Add "Make Static?" prompts if needed
    const versoNeedsPrompt = vSpread.verso && appState.pageNeedsStaticPrompt(vSpread.verso.pageNumber);
    const rectoNeedsPrompt = vSpread.recto && appState.pageNeedsStaticPrompt(vSpread.recto.pageNumber);

    if (versoNeedsPrompt || rectoNeedsPrompt) {
      const promptContainer = createStaticPromptContainer(vSpread, versoNeedsPrompt, rectoNeedsPrompt);
      thumbDiv.appendChild(promptContainer);
    }

    // Click areas for page selection AND drag/drop
    const clickContainer = document.createElement('div');
    clickContainer.className = 'spread-thumbnail-clicks';
    clickContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: ${thumbHeight}px; display: flex;`;

    // Verso click/drag area
    const versoClick = document.createElement('div');
    versoClick.style.cssText = 'flex: 1; cursor: pointer;';
    versoClick.addEventListener('click', (e) => {
      e.stopPropagation();
      if (vSpread.verso) {
        // Select page - editor will navigate to correct spread via state listener
        selectPageFn(vSpread.verso.pageNumber, 'verso');
        updateSpreadIndicatorFn();
      }
    });

    // Add drag/drop handlers to verso click area
    if (vSpread.verso) {
      setupPageDragDrop(versoClick, vSpread.verso, 'verso', thumbnailContainer);
    }
    clickContainer.appendChild(versoClick);

    // Recto click/drag area (not in single-page mode)
    if (!singlePageLayout) {
      const rectoClick = document.createElement('div');
      rectoClick.style.cssText = 'flex: 1; cursor: pointer;';
      rectoClick.addEventListener('click', (e) => {
        e.stopPropagation();
        if (vSpread.recto) {
          selectPageFn(vSpread.recto.pageNumber, 'recto');
          updateSpreadIndicatorFn();
        }
      });

      if (vSpread.recto) {
        setupPageDragDrop(rectoClick, vSpread.recto, 'recto', thumbnailContainer);
      }
      clickContainer.appendChild(rectoClick);
    }

    thumbDiv.appendChild(clickContainer);

    thumbnailContainer.appendChild(thumbDiv);
  });

  // Scroll active thumbnail into view
  const activeThumbnail = thumbnailContainer.querySelector('.spread-thumbnail.active');
  if (activeThumbnail) {
    activeThumbnail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/**
 * Set up drag and drop handlers for a page area (either the click area or the label)
 * Makes the entire area draggable if the page is static or has items
 */
function setupPageDragDrop(
  element: HTMLElement,
  page: PageContent,
  position: 'verso' | 'recto',
  thumbnailContainer: HTMLElement
): void {
  const pageState = page.pageState || 'available';
  const hasItems = page.items && page.items.length > 0;
  const isDraggable = pageState === 'static' || hasItems;

  if (isDraggable) {
    element.setAttribute('draggable', 'true');
    element.style.cursor = 'grab';

    element.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      draggedPageNumber = page.pageNumber;
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('application/x-printfold-page', JSON.stringify({
        pageNumber: page.pageNumber
      }));
      element.style.opacity = '0.5';
    });

    element.addEventListener('dragend', () => {
      element.style.opacity = '1';
      draggedPageNumber = -1;
      // Clear all drop targets
      thumbnailContainer.querySelectorAll('.page-drop-target').forEach(el => {
        el.classList.remove('page-drop-target');
      });
    });
  }

  // Always set up as drop target (for receiving dragged pages)
  element.addEventListener('dragover', (e) => {
    if (draggedPageNumber === -1) return;
    if (draggedPageNumber === page.pageNumber) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    element.classList.add('page-drop-target');
  });

  element.addEventListener('dragleave', () => {
    element.classList.remove('page-drop-target');
  });

  element.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('page-drop-target');

    const dataStr = e.dataTransfer?.getData('application/x-printfold-page');
    if (!dataStr) return;

    const data = JSON.parse(dataStr);
    const sourcePageNumber: number = data.pageNumber;

    if (sourcePageNumber !== page.pageNumber) {
      // Move to this exact page position
      appState.moveStaticPage(sourcePageNumber, page.pageNumber);
    }
  });
}

/**
 * Draw page content on canvas - includes text sections and items
 */
function drawPageContent(
  ctx: CanvasRenderingContext2D,
  page: PageContent,
  xOffset: number,
  width: number,
  height: number,
  margin: number,
  pageDimensions: { width: number; height: number }
): void {
  // Scale factor from page dimensions to thumbnail dimensions
  const scaleX = width / pageDimensions.width;
  const scaleY = height / pageDimensions.height;

  // Get actual margins from project
  const project = appState.getProject();
  const margins = project.layoutOptions.margins;

  // Calculate scaled margins - account for recto (right) vs verso (left) pages
  // For recto: inner margin is on LEFT (spine side), outer on RIGHT
  // For verso: outer margin is on LEFT, inner on RIGHT (spine side)
  const leftMargin = page.isRecto ? margins.inner * scaleX : margins.outer * scaleX;
  const rightMargin = page.isRecto ? margins.outer * scaleX : margins.inner * scaleX;
  const topMargin = margins.top * scaleY;
  const bottomMargin = margins.bottom * scaleY;

  // Draw items on static/available pages
  if (page.items && page.items.length > 0) {
    for (const item of page.items) {
      const itemX = xOffset + item.x * scaleX;
      const itemY = item.y * scaleY;
      const itemW = item.width * scaleX;
      const itemH = item.height * scaleY;

      if (item.type === 'shape') {
        const shapeItem = item as import('../../types').ShapePageItem;
        const fillColor = shapeItem.fillColor || '#cccccc';
        const strokeColor = shapeItem.strokeColor || '#666666';

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(0.5, (shapeItem.strokeWidth || 1) * scaleX);

        if (shapeItem.shapeType === 'rectangle') {
          if (shapeItem.hasFill !== false) {
            ctx.fillRect(itemX, itemY, itemW, itemH);
          }
          if (shapeItem.hasStroke !== false) {
            ctx.strokeRect(itemX, itemY, itemW, itemH);
          }
        } else if (shapeItem.shapeType === 'ellipse' || shapeItem.shapeType === 'circle') {
          ctx.beginPath();
          ctx.ellipse(
            itemX + itemW / 2,
            itemY + itemH / 2,
            itemW / 2,
            itemH / 2,
            0, 0, Math.PI * 2
          );
          if (shapeItem.hasFill !== false) {
            ctx.fill();
          }
          if (shapeItem.hasStroke !== false) {
            ctx.stroke();
          }
        } else if (shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow') {
          ctx.beginPath();
          ctx.moveTo(itemX, itemY);
          ctx.lineTo(itemX + itemW, itemY + itemH);
          ctx.stroke();
        }
      } else if (item.type === 'text') {
        const textItem = item as import('../../types').TextPageItem;
        ctx.fillStyle = textItem.color || '#333333';
        // Draw text as multiple lines within the bounding box
        const lineHeight = 2;
        const lineSpacing = 1.5;
        let yPos = itemY;
        while (yPos < itemY + itemH - lineHeight) {
          // Vary line width slightly for natural appearance
          const lineWidth = itemW * (0.7 + Math.random() * 0.3);
          ctx.fillRect(itemX, yPos, lineWidth, lineHeight);
          yPos += lineHeight + lineSpacing;
        }
      } else if (item.type === 'image') {
        const imageItem = item as ImagePageItem;
        const cachedImg = getCachedImage(imageItem.imageFileId);

        if (cachedImg) {
          // Draw the image scaled to fit the item bounds
          ctx.drawImage(cachedImg, itemX, itemY, itemW, itemH);
        } else {
          // Fallback: Draw a light gray box (no X, looks less broken)
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(itemX, itemY, itemW, itemH);
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(itemX, itemY, itemW, itemH);
        }
      }
    }
  }

  // Draw text sections (for text pages) with proper margins
  if (page.sections && page.sections.length > 0 && page.pageState === 'text') {
    const contentX = xOffset + leftMargin;
    const contentWidth = width - leftMargin - rightMargin;
    const contentHeight = height - topMargin - bottomMargin;

    ctx.fillStyle = '#b0b0b0';
    let yPos = topMargin;
    const lineHeight = 1.5;
    const lineSpacing = 1.2;
    const paragraphSpacing = 3;

    for (const section of page.sections) {
      if (yPos > height - bottomMargin) break;

      // Check for headings - draw them bolder/larger
      const sectionType = (section as { type?: string }).type;
      const isHeading = sectionType?.startsWith('heading');

      if (isHeading) {
        // Draw heading as a slightly thicker, shorter line
        ctx.fillStyle = '#808080';
        const headingWidth = contentWidth * (0.3 + Math.random() * 0.4);
        ctx.fillRect(contentX, yPos, headingWidth, 2);
        yPos += 4;
        ctx.fillStyle = '#b0b0b0';
      }

      // Draw content lines
      const lineCount = (section as { lines?: string[] }).lines?.length || 3;
      for (let i = 0; i < Math.min(lineCount, 8); i++) {
        if (yPos > height - bottomMargin) break;
        // Vary line width for natural text appearance
        const lineWidth = contentWidth * (0.6 + Math.random() * 0.35);
        ctx.fillRect(contentX, yPos, lineWidth, lineHeight);
        yPos += lineHeight + lineSpacing;
      }
      yPos += paragraphSpacing;
    }
  }
}

/**
 * Create a page label element (page number display)
 * Note: Drag/drop is now handled by the click areas (setupPageDragDrop)
 */
function createPageLabel(
  page: PageContent,
  isSelected: boolean,
  position: 'verso' | 'recto',
  selectPageFn: (pageNumber: number, position: 'verso' | 'recto') => void,
  updateSpreadIndicatorFn: () => void,
  thumbnailContainer: HTMLElement
): HTMLElement {
  const label = document.createElement('div');
  label.className = 'spread-thumbnail-page-label' + (isSelected ? ' selected' : '');
  label.textContent = page.pageNumber.toString();
  label.title = `Page ${page.pageNumber}`;

  const pageState = page.pageState || 'available';
  label.classList.add(`page-state-${pageState}`);

  // Indicate if this page is draggable (for visual feedback)
  const hasItems = page.items && page.items.length > 0;
  const isDraggable = pageState === 'static' || hasItems;
  if (isDraggable) {
    label.classList.add('draggable');
  }

  // Click handler (labels are below the click areas, but this is a fallback)
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    selectPageFn(page.pageNumber, position);
    updateSpreadIndicatorFn();
  });

  return label;
}

/**
 * Create "Make Static?" prompt container
 */
function createStaticPromptContainer(
  vSpread: { verso: PageContent | null; recto: PageContent | null },
  versoNeedsPrompt: boolean | null,
  rectoNeedsPrompt: boolean | null
): HTMLElement {
  const promptContainer = document.createElement('div');
  promptContainer.className = 'make-static-prompt-container';
  promptContainer.style.cssText = `
    display: flex;
    gap: 2px;
    margin-top: 2px;
    width: 100%;
  `;

  if (versoNeedsPrompt && vSpread.verso) {
    const versoBtn = document.createElement('button');
    versoBtn.className = 'make-static-btn';
    versoBtn.textContent = 'Static?';
    versoBtn.title = `Make page ${vSpread.verso.pageNumber} static (removes from text flow)`;
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
    const pageNum = vSpread.verso.pageNumber;
    versoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.makePageStatic(pageNum);
    });
    promptContainer.appendChild(versoBtn);
  } else {
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    promptContainer.appendChild(spacer);
  }

  if (rectoNeedsPrompt && vSpread.recto) {
    const rectoBtn = document.createElement('button');
    rectoBtn.className = 'make-static-btn';
    rectoBtn.textContent = 'Static?';
    rectoBtn.title = `Make page ${vSpread.recto.pageNumber} static (removes from text flow)`;
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
    const pageNum = vSpread.recto.pageNumber;
    rectoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.makePageStatic(pageNum);
    });
    promptContainer.appendChild(rectoBtn);
  } else if (versoNeedsPrompt) {
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    promptContainer.appendChild(spacer);
  }

  return promptContainer;
}
