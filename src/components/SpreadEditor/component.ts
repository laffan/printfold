/**
 * SpreadEditor Component
 * Canvas-based editor for viewing and editing booklet spreads using Konva.js
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, Margins, PageItem, ImagePageItem, FillConfig } from '../../types';
import { getOrientedSheetSize } from '../../types';
import type { MarginLine, MarginLabel } from './types';
import { createItemNode, renderPageItems } from './items';
import { renderThumbnails } from './thumbnails';
import { drawMarginGuides, getMarginsForPage } from './margins';
import { drawPageContent, getFontStyleForSection } from './content';
import { switchToSelectedTab } from '../OptionsPanel/editPage';
import { createSelectionMarquee, showContextMenu, createItemContextMenu, hideContextMenu } from './selection';

// Type for visual spreads (reading order pairs)
interface VisualSpread {
  verso: PageContent | null;
  recto: PageContent | null;
}

export class SpreadEditor {
  private container!: HTMLElement;
  private thumbnailContainer!: HTMLElement;
  private stage!: Konva.Stage;
  private layer!: Konva.Layer;
  private marginLayer!: Konva.Layer;
  private itemsLayer!: Konva.Layer;
  private selectionLayer!: Konva.Layer;
  private transformer!: Konva.Transformer;

  private currentSpreadIndex = 0;
  private zoomLevel = 1;
  private showMargins = true;
  private fitToViewEnabled = true; // Toggle state for fit-to-view mode
  private marginLines: MarginLine[] = [];
  private marginLabels: MarginLabel[] = [];
  private isDraggingMargin = false;
  private dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | 'header' | 'footer' | null = null;
  private dragPageNumber: number | null = null;
  private stateUnsubscribe: (() => void) | null = null;
  private projectUnsubscribe: (() => void) | null = null;
  private itemNodes: Map<string, Konva.Node> = new Map();

  // Selection marquee
  private selectionMarquee!: ReturnType<typeof createSelectionMarquee>;
  private isMarqueeSelecting = false;

  // Option+drag duplication
  private isDuplicatingDrag = false;
  private dragStartPositions: Map<string, { x: number; y: number }> = new Map();

  mount(): void {
    this.container = document.getElementById('konva-container')!;
    this.thumbnailContainer = document.getElementById('spread-thumbnails')!;

    // Create Konva stage
    this.stage = new Konva.Stage({
      container: 'konva-container',
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    });

    this.layer = new Konva.Layer();
    this.marginLayer = new Konva.Layer();
    this.itemsLayer = new Konva.Layer();
    this.selectionLayer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.add(this.marginLayer);
    this.stage.add(this.itemsLayer);
    this.stage.add(this.selectionLayer);

    // Create transformer for item selection
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'],
      boundBoxFunc: (oldBox, newBox) => {
        // Limit resize
        if (newBox.width < 10 || newBox.height < 10) {
          return oldBox;
        }
        return newBox;
      },
    });
    this.itemsLayer.add(this.transformer);

    // Create selection marquee
    this.selectionMarquee = createSelectionMarquee(
      this.selectionLayer,
      this.stage,
      this.itemNodes,
      (itemIds) => this.onMarqueeSelectionComplete(itemIds)
    );

    // Set up event handlers
    this.setupControls();
    this.setupResizeObserver();
    this.setupKeyboardShortcuts();
    this.setupStateListeners();
    this.setupImageDropZone();

    // Defer initial render to ensure container has dimensions
    // and DOM is fully ready
    requestAnimationFrame(() => {
      this.fitToView();
      this.updateFitToViewButton();
      this.render();
    });
  }

  /**
   * Set up drop zone for dragging images from file list
   */
  private setupImageDropZone(): void {
    const container = this.container;

    container.addEventListener('dragover', (e) => {
      const dt = e.dataTransfer;
      if (dt?.types.includes('application/x-printfold-image')) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
        container.classList.add('drop-target');
      }
    });

    container.addEventListener('dragleave', (e) => {
      // Only remove class if leaving the container entirely
      if (!container.contains(e.relatedTarget as Node)) {
        container.classList.remove('drop-target');
      }
    });

    container.addEventListener('drop', (e) => {
      container.classList.remove('drop-target');
      const dt = e.dataTransfer;
      if (!dt?.types.includes('application/x-printfold-image')) return;

      e.preventDefault();
      const fileId = dt.getData('application/x-printfold-image');
      if (!fileId) return;

      // Check if a static/blank page is selected
      const editorState = appState.getEditor();
      if (editorState.selectedPageNumber === null) {
        // Try to find which page was dropped on based on position
        const rect = container.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const pageWidth = this.getPageDimensions().width * this.zoomLevel;
        const spreadWidth = pageWidth * 2;
        const stageX = this.stage.x();

        // Determine if drop is on verso or recto
        const relativeX = (dropX - stageX) / this.zoomLevel;
        const isRecto = relativeX > pageWidth;

        // Get current spread
        const spread = this.getCurrentSpread();
        if (spread) {
          const page = isRecto ? spread.recto : spread.verso;
          if (page && (page.isBlank || page.isStatic)) {
            // Import and dispatch event to add image
            this.addImageToPage(fileId, page.pageNumber, isRecto ? 'recto' : 'verso');
          }
        }
      } else {
        // Use the already selected page
        this.addImageToPage(fileId, editorState.selectedPageNumber, editorState.selectedPagePosition || 'recto');
      }
    });
  }

  /**
   * Add an image from file list to a specific page
   */
  private addImageToPage(fileId: string, pageNumber: number, position: 'verso' | 'recto'): void {
    const file = appState.getProject().files.find(f => f.id === fileId);
    if (!file || file.type !== 'image') return;

    // Check if the page is blank/static
    const project = appState.getProject();
    let targetPage = null;
    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        const page = position === 'verso' ? spread.verso : spread.recto;
        if (page && page.pageNumber === pageNumber) {
          targetPage = page;
          break;
        }
      }
      if (targetPage) break;
    }

    if (!targetPage || (!targetPage.isBlank && !targetPage.isStatic)) return;

    // Select the page
    appState.updateEditor({
      selectedPageNumber: pageNumber,
      selectedPagePosition: position,
    });

    // Load the image to get its natural dimensions for proper aspect ratio
    const img = new window.Image();
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      const defaultWidth = 150;
      const height = defaultWidth / aspectRatio;

      const item: ImagePageItem = {
        id: crypto.randomUUID(),
        type: 'image',
        x: 50,
        y: 50,
        width: defaultWidth,
        height: height,
        rotation: 0,
        opacity: 1,
        imageFileId: fileId,
      };

      appState.addItemToPage(pageNumber, item);
      appState.updateEditor({ selectedItemId: item.id, selectedItemIds: [item.id] });
      switchToSelectedTab();
    };
    img.src = `data:image/png;base64,${file.content}`;
  }

  /**
   * Handle completion of marquee selection
   */
  private onMarqueeSelectionComplete(itemIds: string[]): void {
    if (itemIds.length > 0) {
      // Get the page info from the first selected item's node
      const firstNode = this.itemNodes.get(itemIds[0]);
      if (firstNode) {
        const pageNumber = firstNode.getAttr('pageNumber');
        const xOffset = firstNode.getAttr('xOffset');
        const position = xOffset === 0 ? 'verso' : 'recto';

        // Set page context before selecting items
        appState.updateEditor({
          selectedPageNumber: pageNumber,
          selectedPagePosition: position,
        });
      }

      appState.selectItems(itemIds);
      switchToSelectedTab();
    } else {
      appState.clearSelection();
    }
    this.isMarqueeSelecting = false;

    // Force immediate transformer update with requestAnimationFrame to ensure
    // all state changes have propagated and the canvas is ready
    requestAnimationFrame(() => {
      // Get the nodes to attach to transformer
      const nodes: Konva.Node[] = [];
      for (const itemId of itemIds) {
        const node = this.itemNodes.get(itemId);
        if (node && !node.getAttr('imageLoading')) {
          nodes.push(node);
        }
      }

      if (nodes.length > 0) {
        // Configure and attach transformer
        this.transformer.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']);
        this.transformer.rotateEnabled(true);
        this.transformer.nodes(nodes);
        this.transformer.moveToTop();
      }

      // Force a complete redraw of all layers
      this.stage.batchDraw();
    });
  }

  /**
   * Handle right-click context menu on items
   */
  private showItemContextMenu(e: MouseEvent): void {
    const editorState = appState.getEditor();
    const pageNumber = editorState.selectedPageNumber;
    const itemIds = editorState.selectedItemIds;

    if (pageNumber === null || itemIds.length === 0) return;

    e.preventDefault();
    const menuItems = createItemContextMenu(pageNumber, itemIds);
    showContextMenu(e.clientX, e.clientY, menuItems);
  }

  private setupStateListeners(): void {
    // Listen for editor state changes
    this.stateUnsubscribe = appState.onEditorChange((state, prevState) => {
      // Navigate to selected page
      if (state.selectedPageNumber !== null && state.selectedPageNumber !== prevState.selectedPageNumber) {
        this.navigateToPage(state.selectedPageNumber);
      } else if (state.cursorMark && state.cursorMark !== prevState.cursorMark && state.selectedPageNumber !== null) {
        // Cursor moved within the same page — show the dot without navigating
        this.navigateToPage(state.selectedPageNumber);
      }
      // Re-render when margin unit changes (to update labels)
      if (state.marginUnit !== prevState.marginUnit) {
        this.render();
      }
      // Update transformer when selected items change
      const idsChanged = state.selectedItemIds.length !== prevState.selectedItemIds.length ||
        state.selectedItemIds.some((id, i) => id !== prevState.selectedItemIds[i]);
      if (idsChanged || state.selectedItemId !== prevState.selectedItemId) {
        // Re-render if a polygon text-flow item gained or lost selection, so
        // its vertex handles appear/disappear with the selection state.
        if (this.selectionChangeAffectsPolygonItem(state, prevState)) {
          this.render();
        }
        this.updateTransformer();
      }
    });

    // Listen for project changes to update items and page backgrounds
    this.projectUnsubscribe = appState.onProjectChange(() => {
      this.render();
      // Re-attach transformer to the newly created node after render
      this.updateTransformer();
    });
  }

  /**
   * Navigate to a specific page number
   */
  navigateToPage(pageNumber: number): void {
    const visualSpreads = this.getVisualSpreads();

    // Find the visual spread containing this page
    for (let i = 0; i < visualSpreads.length; i++) {
      const spread = visualSpreads[i];
      if (
        (spread.verso && spread.verso.pageNumber === pageNumber) ||
        (spread.recto && spread.recto.pageNumber === pageNumber)
      ) {
        const didChange = this.currentSpreadIndex !== i;
        if (didChange) {
          this.currentSpreadIndex = i;
          this.updateSpreadIndicator();
          this.render();
        }
        this.flashPage(spread, pageNumber);
        return;
      }
    }
  }

  private flashTimeout: ReturnType<typeof setTimeout> | null = null;

  private flashPage(spread: VisualSpread, pageNumber: number): void {
    const pageDimensions = this.getPageDimensions();
    const isVerso = spread.verso?.pageNumber === pageNumber;
    const pageX = isVerso ? 0 : pageDimensions.width;

    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
    this.layer.find('.cursor-flash').forEach(n => { n.destroy(); });
    this.layer.find('.cursor-dot').forEach(n => { n.destroy(); });

    const flash = new Konva.Rect({
      name: 'cursor-flash',
      x: pageX,
      y: 0,
      width: pageDimensions.width,
      height: pageDimensions.height,
      fill: '#4a9eff',
      opacity: 0.12,
      listening: false,
    });
    this.layer.add(flash);

    const mark = appState.getEditor().cursorMark;
    if (mark && mark.pageNumber === pageNumber) {
      const page = isVerso ? spread.verso : spread.recto;
      if (page) {
        const pos = this.computeCursorPosition(page, pageX, mark.sectionIndex, mark.lineIndex, mark.charInLine);
        if (pos) {
          const dot = new Konva.Circle({
            name: 'cursor-dot',
            x: pos.x,
            y: pos.y,
            radius: 4,
            fill: '#e74c3c',
            opacity: 0.9,
            listening: false,
          });
          this.layer.add(dot);
        }
      }
    }

    this.layer.draw();

    new Konva.Tween({
      node: flash,
      duration: 0.6,
      opacity: 0,
      onFinish: () => {
        flash.destroy();
        this.layer.draw();
      },
    }).play();

    const dotNode = this.layer.findOne('.cursor-dot');
    if (dotNode) {
      setTimeout(() => {
        if (!dotNode.getLayer()) return;
        new Konva.Tween({
          node: dotNode,
          duration: 1.5,
          opacity: 0,
          onFinish: () => {
            dotNode.destroy();
            this.layer.draw();
          },
        }).play();
      }, 800);
    }

    this.flashTimeout = setTimeout(() => {
      this.layer.find('.cursor-flash').forEach(n => { n.destroy(); });
      this.layer.find('.cursor-dot').forEach(n => { n.destroy(); });
      this.layer.draw();
      this.flashTimeout = null;
    }, 3000);
  }

  private computeCursorPosition(
    page: PageContent,
    pageX: number,
    sectionIndex: number,
    lineIndex: number,
    charInLine: number,
  ): { x: number; y: number } | null {
    const project = appState.getProject();
    const margins = getMarginsForPage(page.pageNumber);
    const leftMargin = page.isRecto ? margins.inner : margins.outer;
    const contentX = pageX + leftMargin;
    let currentY = margins.top;

    for (let si = 0; si < page.sections.length; si++) {
      const section = page.sections[si];
      const fontStyle = getFontStyleForSection(section.type, section.level);
      const lineHeight = (fontStyle.lineHeight ?? project.layoutOptions.lineHeight) * fontStyle.fontSize;

      if (section.type === 'heading') {
        switch (section.level) {
          case 1: currentY += project.layoutOptions.spacingAboveH1; break;
          case 2: currentY += project.layoutOptions.spacingAboveH2; break;
          case 3: currentY += project.layoutOptions.spacingAboveH3; break;
        }
      }

      const ms = section as any;
      const plainLines: string[] = ms.lines || [section.content];

      if (si === sectionIndex) {
        const li = Math.min(lineIndex, plainLines.length - 1);
        const lineText = plainLines[li] || '';
        const col = Math.min(charInLine, lineText.length);
        const textBefore = lineText.substring(0, col);
        const xOffset = this.measureText(textBefore, fontStyle);
        return {
          x: contentX + xOffset,
          y: currentY + li * lineHeight + lineHeight / 2,
        };
      }

      currentY += plainLines.length * lineHeight + project.layoutOptions.paragraphSpacing;
    }
    return null;
  }

  private measureText(text: string, style: { fontFamily: string; fontSize: number; fontWeight: string; fontStyle: string }): number {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const quoted = style.fontFamily.includes(' ') ? `"${style.fontFamily}"` : style.fontFamily;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${quoted}`;
    return ctx.measureText(text).width;
  }

  private setupControls(): void {
    // Zoom controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      this.setZoom(Math.min(this.zoomLevel + 0.25, 3), true); // true = manual zoom
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      this.setZoom(Math.max(this.zoomLevel - 0.25, 0.25), true); // true = manual zoom
    });

    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
      this.toggleFitToView();
    });

    // Navigation
    document.getElementById('btn-prev-spread')?.addEventListener('click', () => {
      this.navigateSpread(-1);
    });

    document.getElementById('btn-next-spread')?.addEventListener('click', () => {
      this.navigateSpread(1);
    });

    // Show margins checkbox
    const marginCheckbox = document.getElementById('chk-show-margins') as HTMLInputElement;
    marginCheckbox.checked = this.showMargins;
    marginCheckbox.addEventListener('change', () => {
      this.showMargins = marginCheckbox.checked;
      this.render();
    });

    // Add signature button - adds a complete signature worth of spreads
    document.getElementById('btn-add-signature')?.addEventListener('click', () => {
      appState.addStaticSignature();
    });

    // Add single page button - adds a single blank page
    document.getElementById('btn-add-single-page')?.addEventListener('click', () => {
      appState.addStaticPage('recto');
    });

    // Mouse wheel zoom
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const scaleBy = 1.1;
      const oldScale = this.zoomLevel;

      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale,
      };

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

      this.setZoom(Math.max(0.25, Math.min(3, newScale)), true); // true = manual zoom

      const newPos = {
        x: pointer.x - mousePointTo.x * this.zoomLevel,
        y: pointer.y - mousePointTo.y * this.zoomLevel,
      };
      this.stage.position(newPos);
    });

    // Drag to pan
    let isPanning = false;
    let lastPos = { x: 0, y: 0 };

    this.stage.on('mousedown', (e) => {
      if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.shiftKey)) {
        isPanning = true;
        lastPos = { x: e.evt.clientX, y: e.evt.clientY };
        this.stage.container().style.cursor = 'grabbing';
      }
    });

    this.stage.on('mousemove', (e) => {
      if (isPanning) {
        const dx = e.evt.clientX - lastPos.x;
        const dy = e.evt.clientY - lastPos.y;
        this.stage.x(this.stage.x() + dx);
        this.stage.y(this.stage.y() + dy);
        lastPos = { x: e.evt.clientX, y: e.evt.clientY };
      }
    });

    this.stage.on('mouseup mouseleave', () => {
      isPanning = false;
      this.stage.container().style.cursor = 'default';
    });

    // Click on background to deselect items (not pages - page selection is handled by page click areas)
    this.stage.on('click', (e) => {
      // Deselect item if clicking on stage, layer, or a non-item shape
      const target = e.target;
      const targetLayer = target.getLayer?.();
      const isOnAnyLayer = target === this.stage ||
                           targetLayer === this.layer ||
                           targetLayer === this.marginLayer ||
                           targetLayer === this.itemsLayer ||
                           targetLayer === this.selectionLayer;
      // Walk the ancestor chain — composite items (text-flow groups) carry
      // itemId on the outer group, not on the child shape that catches the
      // click. Without this walk, clicking on a polygon outline or vertex
      // handle would be treated as a background click and clear selection.
      let isItem = false;
      let node: Konva.Node | null = target;
      while (node) {
        if (node.getAttr?.('itemId') !== undefined) { isItem = true; break; }
        node = node.getParent?.() ?? null;
      }
      const isTransformer = target.getParent?.()?.getClassName?.() === 'Transformer';

      if (isOnAnyLayer && !isItem && !isTransformer && !this.isMarqueeSelecting) {
        // Deselect items when clicking on background (unless shift is held)
        if (!e.evt.shiftKey) {
          appState.clearSelection();
          this.updateTransformer();
        }
      }
    });

    // Marquee selection - start on mousedown on empty space
    this.stage.on('mousedown', (e) => {
      // Only start marquee on left click on empty space
      if (e.evt.button !== 0) return;
      if (e.evt.shiftKey) return; // Shift+click is for panning

      const target = e.target;
      // Walk ancestor chain so composite items (text-flow groups) aren't
      // mistaken for background and trigger a marquee.
      let isItem = false;
      let n: Konva.Node | null = target;
      while (n) {
        if (n.getAttr?.('itemId') !== undefined) { isItem = true; break; }
        n = n.getParent?.() ?? null;
      }
      const isTransformer = target.getParent?.()?.getClassName?.() === 'Transformer';

      // Only start marquee when clicking on background layers
      if (!isItem && !isTransformer && target !== this.stage) {
        const pos = this.stage.getPointerPosition();
        if (pos) {
          // Convert to stage coordinates
          const stagePos = {
            x: (pos.x - this.stage.x()) / this.zoomLevel,
            y: (pos.y - this.stage.y()) / this.zoomLevel,
          };
          this.isMarqueeSelecting = true;
          this.selectionMarquee.startMarquee(stagePos.x, stagePos.y);
        }
      }
    });

    // Update marquee on mousemove
    this.stage.on('mousemove', (e) => {
      if (this.isMarqueeSelecting) {
        const pos = this.stage.getPointerPosition();
        if (pos) {
          const stagePos = {
            x: (pos.x - this.stage.x()) / this.zoomLevel,
            y: (pos.y - this.stage.y()) / this.zoomLevel,
          };
          this.selectionMarquee.updateMarquee(stagePos.x, stagePos.y);
        }
      }
    });

    // End marquee on mouseup
    this.stage.on('mouseup', () => {
      if (this.isMarqueeSelecting) {
        this.selectionMarquee.endMarquee();
      }
    });

    // Right-click context menu
    this.stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      const target = e.target;
      const itemId = target.getAttr?.('itemId');

      if (itemId) {
        // If right-clicking on an item, select it if not already selected
        const editorState = appState.getEditor();
        if (!editorState.selectedItemIds.includes(itemId)) {
          appState.selectItem(itemId);
        }
        this.showItemContextMenu(e.evt);
      }
    });
  }

  private setupResizeObserver(): void {
    const resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    resizeObserver.observe(this.container);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const editorState = appState.getEditor();
      const hasSelection = editorState.selectedItemIds.length > 0;

      // Arrow keys for navigation
      if (e.key === 'ArrowLeft') {
        this.navigateSpread(-1);
      } else if (e.key === 'ArrowRight') {
        this.navigateSpread(1);
      }

      // Delete/Backspace to delete selected items
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection && editorState.selectedPageNumber) {
        e.preventDefault();
        appState.deleteSelectedItems();
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        appState.clearSelection();
        hideContextMenu();
      }

      // Copy with Cmd/Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && hasSelection) {
        e.preventDefault();
        appState.copyToClipboard();
      }

      // Paste with Cmd/Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && editorState.clipboard.length > 0 && editorState.selectedPageNumber) {
        e.preventDefault();
        appState.pasteFromClipboard();
        switchToSelectedTab();
      }

      // Duplicate with Cmd/Ctrl+D
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && hasSelection && editorState.selectedPageNumber) {
        e.preventDefault();
        appState.duplicateSelectedItems();
        switchToSelectedTab();
      }

      // Select all with Cmd/Ctrl+A (when on a static page)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && editorState.selectedPageNumber) {
        const project = appState.getProject();
        // Find current page and get all item IDs
        for (const sig of project.signatures) {
          for (const spread of sig.spreads) {
            const page = spread.verso?.pageNumber === editorState.selectedPageNumber ? spread.verso :
                        spread.recto?.pageNumber === editorState.selectedPageNumber ? spread.recto : null;
            if (page && page.items && page.items.length > 0) {
              e.preventDefault();
              const allIds = page.items.map(item => item.id);
              appState.selectItems(allIds);
              switchToSelectedTab();
              return;
            }
          }
        }
      }
    });
  }

  resize(): void {
    // Guard against resizing when container is hidden (prevents canvas errors)
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      return;
    }
    this.stage.width(this.container.clientWidth);
    this.stage.height(this.container.clientHeight);

    // Only auto-fit if fit-to-view mode is enabled
    if (this.fitToViewEnabled) {
      this.fitToView();
    }

    this.render();
  }

  private setZoom(level: number, isManualZoom = false): void {
    this.zoomLevel = level;
    this.stage.scale({ x: level, y: level });
    document.getElementById('zoom-level')!.textContent = `${Math.round(level * 100)}%`;

    // Disable fit-to-view when user manually zooms
    if (isManualZoom && this.fitToViewEnabled) {
      this.fitToViewEnabled = false;
      this.updateFitToViewButton();
    }
  }

  private toggleFitToView(): void {
    this.fitToViewEnabled = !this.fitToViewEnabled;

    if (this.fitToViewEnabled) {
      this.fitToView();
    }

    this.updateFitToViewButton();
  }

  private updateFitToViewButton(): void {
    const button = document.getElementById('btn-zoom-fit');
    if (button) {
      if (this.fitToViewEnabled) {
        button.classList.add('active');
        button.setAttribute('title', 'Fit to View (active)');
      } else {
        button.classList.remove('active');
        button.setAttribute('title', 'Fit to View');
      }
    }
  }

  private isSinglePageLayout(): boolean {
    const bookletType = appState.getProject().outputOptions.bookletType ?? 'booklet';
    return bookletType === 'singleSided';
  }

  private fitToView(): void {
    const pageDimensions = this.getPageDimensions();

    // Calculate spread size
    const spreadWidth = this.isSinglePageLayout() ? pageDimensions.width : pageDimensions.width * 2;
    const spreadHeight = pageDimensions.height;

    // Calculate scale to fit - fill available space (no upper limit)
    const padding = 40;
    const availableWidth = this.container.clientWidth - padding * 2;
    const availableHeight = this.container.clientHeight - padding * 2;

    const scaleX = availableWidth / spreadWidth;
    const scaleY = availableHeight / spreadHeight;
    const scale = Math.min(scaleX, scaleY); // Use whichever fits, allow zoom > 100%

    this.setZoom(scale); // Don't pass isManualZoom, this is automatic

    // Center the spread
    const centerX = (this.container.clientWidth - spreadWidth * scale) / 2;
    const centerY = (this.container.clientHeight - spreadHeight * scale) / 2;
    this.stage.position({ x: centerX, y: centerY });
  }

  private getPageDimensions(): { width: number; height: number } {
    const project = appState.getProject();
    const sheetSize = getOrientedSheetSize(
      project.outputOptions.sheetSize,
      project.outputOptions.orientation
    );
    const baseWidth = sheetSize.width / 2;

    switch (project.outputOptions.bookletSize) {
      case 'custom':
        return {
          width: project.outputOptions.customWidth || baseWidth,
          height: project.outputOptions.customHeight || sheetSize.height,
        };
      case 'half':
        return { width: baseWidth, height: sheetSize.height };
      case 'quarter':
        return { width: baseWidth, height: sheetSize.height / 2 };
      case 'eighth':
        return { width: baseWidth, height: sheetSize.height / 4 };
      case 'sixteenth':
        return { width: baseWidth, height: sheetSize.height / 8 };
      default:
        return { width: baseWidth, height: sheetSize.height };
    }
  }

  /**
   * Get all visual spreads (reading order pairs)
   * Visual spreads show pages in reading order: [null|1], [2|3], [4|5], etc.
   * This correctly represents page transitions across signatures
   */
  private getVisualSpreads(): VisualSpread[] {
    const project = appState.getProject();
    const bookletType = project.outputOptions.bookletType ?? 'booklet';

    // Collect all pages from all signatures
    const allPages: PageContent[] = [];
    project.signatures.forEach(sig => {
      for (const spread of sig.spreads) {
        if (spread.verso) allPages.push(spread.verso);
        if (spread.recto) allPages.push(spread.recto);
      }
    });

    // Sort pages by page number
    allPages.sort((a, b) => a.pageNumber - b.pageNumber);

    if (allPages.length === 0) return [];

    if (bookletType === 'singleSided') {
      return allPages.map(page => ({
        verso: page,
        recto: null,
      }));
    }

    if (bookletType === 'doubleSided') {
      const visualSpreads: VisualSpread[] = [];
      for (let i = 0; i < allPages.length; i += 2) {
        visualSpreads.push({
          verso: allPages[i],
          recto: allPages[i + 1] || null,
        });
      }
      return visualSpreads;
    }

    // Booklet mode: [null|1], [2|3], [4|5], ..., [N|null]
    const maxPageNum = Math.max(...allPages.map(p => p.pageNumber));
    const pageMap = new Map<number, PageContent>();
    for (const page of allPages) {
      pageMap.set(page.pageNumber, page);
    }

    const visualSpreads: VisualSpread[] = [];

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

    return visualSpreads;
  }

  private getCurrentSpread(): VisualSpread | null {
    const visualSpreads = this.getVisualSpreads();

    if (visualSpreads.length === 0) return null;
    return visualSpreads[this.currentSpreadIndex] || visualSpreads[0];
  }

  private navigateSpread(delta: number): void {
    const visualSpreads = this.getVisualSpreads();
    const totalSpreads = visualSpreads.length;

    if (totalSpreads === 0) return;

    const newIndex = Math.max(0, Math.min(totalSpreads - 1, this.currentSpreadIndex + delta));

    // Only update if actually changing spreads
    if (newIndex !== this.currentSpreadIndex) {
      this.currentSpreadIndex = newIndex;
      const newSpread = visualSpreads[newIndex];

      // Update selected page to a page in the new spread (prefer recto, then verso)
      // This ensures thumbnails highlight the correct spread
      const newPageNumber = newSpread?.recto?.pageNumber ?? newSpread?.verso?.pageNumber ?? null;
      const newPosition = newSpread?.recto ? 'recto' : 'verso';

      appState.updateEditor({
        selectedItemId: null,
        selectedItemIds: [],
        selectedPageNumber: newPageNumber,
        selectedPagePosition: newPageNumber ? newPosition : null,
      });
      this.updateSpreadIndicator();
      this.render();
    }
  }

  /**
   * Navigate to a specific spread by index
   */
  navigateToSpread(spreadIndex: number): void {
    const visualSpreads = this.getVisualSpreads();
    const totalSpreads = visualSpreads.length;

    if (spreadIndex >= 0 && spreadIndex < totalSpreads) {
      this.currentSpreadIndex = spreadIndex;
      const newSpread = visualSpreads[spreadIndex];

      // Update selected page to a page in the new spread (prefer recto, then verso)
      const newPageNumber = newSpread?.recto?.pageNumber ?? newSpread?.verso?.pageNumber ?? null;
      const newPosition = newSpread?.recto ? 'recto' : 'verso';

      appState.updateEditor({
        selectedItemId: null,
        selectedItemIds: [],
        selectedPageNumber: newPageNumber,
        selectedPagePosition: newPageNumber ? newPosition : null,
      });
      this.updateSpreadIndicator();
      this.render();
    }
  }

  private updateSpreadIndicator(): void {
    const visualSpreads = this.getVisualSpreads();
    const totalSpreads = visualSpreads.length;
    const indicator = document.getElementById('spread-indicator')!;
    const bookletType = appState.getProject().outputOptions.bookletType ?? 'booklet';
    const idx = this.currentSpreadIndex + 1;
    const total = Math.max(1, totalSpreads);
    if (bookletType === 'singleSided') {
      indicator.textContent = `Page ${idx} of ${total}`;
    } else if (bookletType === 'doubleSided') {
      indicator.textContent = `Sheet ${idx} of ${total}`;
    } else {
      indicator.textContent = `Spread ${idx} of ${total}`;
    }
  }

  render(): void {
    const project = appState.getProject();
    const editorState = appState.getEditor();
    const pageDimensions = this.getPageDimensions();

    // Always render thumbnails even if main canvas isn't ready
    // This ensures sidebar navigation works on initial load
    // Pass selected page number so thumbnails can determine the active visual spread
    renderThumbnails(
      this.thumbnailContainer,
      pageDimensions,
      editorState.selectedPageNumber,
      (pageNumber, position) => this.selectPage(pageNumber, position),
      () => this.updateSpreadIndicator()
    );

    // Guard against rendering main canvas when container is not visible
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      return;
    }

    this.layer.destroyChildren();
    this.marginLayer.destroyChildren();
    this.marginLines = [];
    this.marginLabels = [];

    const spread = this.getCurrentSpread();
    const singlePageLayout = this.isSinglePageLayout();

    if (!spread) {
      // Show empty state
      const emptyWidth = singlePageLayout ? pageDimensions.width / 2 : pageDimensions.width;
      const text = new Konva.Text({
        x: emptyWidth,
        y: pageDimensions.height / 2,
        text: 'Add a markdown file to begin',
        fontSize: 14,
        fill: '#707070',
        align: 'center',
      });
      text.offsetX(text.width() / 2);
      this.layer.add(text);

      // Still draw empty page outlines
      this.drawPageOutline(0, 0, pageDimensions.width, pageDimensions.height);
      if (!singlePageLayout) {
        this.drawPageOutline(pageDimensions.width, 0, pageDimensions.width, pageDimensions.height);
      }

      this.layer.draw();
      this.updateSpreadIndicator();
      return;
    }

    if (singlePageLayout) {
      // Single-sided: draw only verso (the one page in the spread)
      if (spread.verso) {
        this.drawPage(spread.verso, 0, 0, pageDimensions);
      }
    } else {
      // Booklet and double-sided: two-page layout
      if (spread.verso) {
        this.drawPage(spread.verso, 0, 0, pageDimensions);
      } else {
        this.drawTransparentPlaceholder(0, 0, pageDimensions.width, pageDimensions.height);
      }

      if (spread.recto) {
        this.drawPage(spread.recto, pageDimensions.width, 0, pageDimensions);
      } else {
        this.drawTransparentPlaceholder(pageDimensions.width, 0, pageDimensions.width, pageDimensions.height);
      }
    }

    // Draw selected page indicator
    this.drawSelectedPageIndicator(spread, pageDimensions, editorState);

    // Add clickable areas for page selection
    this.addPageClickAreas(spread, pageDimensions);

    this.layer.draw();
    this.marginLayer.draw();

    // Render items on static pages
    this.renderItems();

    this.updateSpreadIndicator();
  }

  /**
   * Draw a solid green bar below the selected page
   */
  private drawSelectedPageIndicator(
    spread: VisualSpread,
    pageDimensions: { width: number; height: number },
    editorState: ReturnType<typeof appState.getEditor>
  ): void {
    const selectedPosition = editorState.selectedPagePosition;
    if (!selectedPosition) return;

    // Check if the selected page is in this spread
    const isVersoSelected = selectedPosition === 'verso' &&
      spread.verso?.pageNumber === editorState.selectedPageNumber;
    const isRectoSelected = selectedPosition === 'recto' &&
      spread.recto?.pageNumber === editorState.selectedPageNumber;

    if (!isVersoSelected && !isRectoSelected) return;

    const x = isVersoSelected ? 0 : pageDimensions.width;
    const barHeight = 5;

    // Draw solid green bar below the page
    const selectionBar = new Konva.Rect({
      x: x,
      y: pageDimensions.height,
      width: pageDimensions.width,
      height: barHeight,
      fill: '#22c55e', // Green color
      listening: false,
    });
    this.marginLayer.add(selectionBar);
  }

  /**
   * Add invisible click areas for page selection
   */
  private addPageClickAreas(
    spread: VisualSpread,
    pageDimensions: { width: number; height: number }
  ): void {
    const singlePage = this.isSinglePageLayout();

    // Verso click area
    if (spread.verso) {
      const versoArea = new Konva.Rect({
        x: 0,
        y: 0,
        width: pageDimensions.width,
        height: pageDimensions.height,
        fill: 'transparent',
        listening: true,
      });
      versoArea.on('click', () => {
        this.selectPage(spread.verso!.pageNumber, 'verso');
      });
      this.layer.add(versoArea);
    }

    // Recto click area (not shown in single-page layout)
    if (!singlePage && spread.recto) {
      const rectoArea = new Konva.Rect({
        x: pageDimensions.width,
        y: 0,
        width: pageDimensions.width,
        height: pageDimensions.height,
        fill: 'transparent',
        listening: true,
      });
      rectoArea.on('click', () => {
        this.selectPage(spread.recto!.pageNumber, 'recto');
      });
      this.layer.add(rectoArea);
    }
  }

  /**
   * Select a page
   */
  private selectPage(pageNumber: number, position: 'verso' | 'recto'): void {
    appState.updateEditor({
      selectedPageNumber: pageNumber,
      selectedPagePosition: position,
      selectedItemId: null,
      selectedItemIds: [],
    });
    this.render();
  }

  /**
   * Render items on static pages in the current spread
   */
  private renderItems(): void {
    const spread = this.getCurrentSpread();
    const pageDimensions = this.getPageDimensions();

    if (!spread) return;

    // Clear existing items (except transformer)
    this.itemNodes.forEach(node => node.destroy());
    this.itemNodes.clear();

    // Also clear any stale children from itemsLayer (except transformer)
    const children = this.itemsLayer.getChildren();
    children.forEach(child => {
      if (child !== this.transformer) {
        child.destroy();
      }
    });

    // Detach transformer from any stale nodes
    this.transformer.nodes([]);

    // Clean up any lingering text editing textareas
    const container = this.stage.container().parentElement;
    if (container) {
      const textareas = container.querySelectorAll('textarea');
      textareas.forEach(ta => ta.remove());
    }

    // Render items on verso page
    if (spread.verso?.items) {
      renderPageItems(
        spread.verso,
        0,
        pageDimensions,
        this.itemNodes,
        this.itemsLayer,
        this.zoomLevel,
        this.stage,
        this.transformer,
        () => this.updateTransformer()
      );
    }

    // Render items on recto page
    if (spread.recto?.items) {
      renderPageItems(
        spread.recto,
        pageDimensions.width,
        pageDimensions,
        this.itemNodes,
        this.itemsLayer,
        this.zoomLevel,
        this.stage,
        this.transformer,
        () => this.updateTransformer()
      );
    }

    // Render crossing items from adjacent pages
    // These are items that extend past the page boundary into the adjacent page
    this.renderCrossingItems(spread, pageDimensions);

    this.itemsLayer.draw();
  }

  /**
   * Render items from adjacent pages that cross into the current page
   * This ensures items spanning page boundaries are fully visible
   */
  private renderCrossingItems(
    spread: VisualSpread,
    pageDimensions: { width: number; height: number }
  ): void {
    const pageWidth = pageDimensions.width;

    // Render verso items that extend into recto (x + width > pageWidth)
    // These items are already rendered at xOffset=0, but we need to ensure
    // the crossing portion is visible above the recto page background
    if (spread.verso?.items && spread.recto) {
      const crossingToRecto = spread.verso.items.filter(item =>
        item.x + item.width > pageWidth
      );

      for (const item of crossingToRecto) {
        // Create a clipped version of the item for the recto side only
        // This renders at xOffset=0 but represents the portion from pageWidth onwards
        const crossingNode = createItemNode(
          item,
          0, // Same xOffset as original - positioned relative to verso
          spread.verso.pageNumber,
          this.zoomLevel,
          this.stage,
          this.itemsLayer,
          this.transformer,
          () => this.updateTransformer()
        );

        if (crossingNode) {
          // Mark as crossing item so it's not registered for selection/interaction
          crossingNode.setAttr('isCrossingItem', true);
          crossingNode.setAttr('originalItemId', item.id);
          // Disable interaction - the original item handles it
          crossingNode.draggable(false);
          crossingNode.listening(false);
          // Move to top so it's visible above the recto page background
          crossingNode.moveToTop();
          this.itemsLayer.add(crossingNode);
        }
      }
    }

    // Render recto items that extend into verso (x < 0)
    // These items are rendered at xOffset=pageWidth, so items with negative x
    // extend into verso territory
    if (spread.recto?.items && spread.verso) {
      const crossingToVerso = spread.recto.items.filter(item => item.x < 0);

      for (const item of crossingToVerso) {
        // Create a version of the item for the verso side
        const crossingNode = createItemNode(
          item,
          pageWidth, // Same xOffset as original - positioned relative to recto
          spread.recto.pageNumber,
          this.zoomLevel,
          this.stage,
          this.itemsLayer,
          this.transformer,
          () => this.updateTransformer()
        );

        if (crossingNode) {
          // Mark as crossing item
          crossingNode.setAttr('isCrossingItem', true);
          crossingNode.setAttr('originalItemId', item.id);
          crossingNode.draggable(false);
          crossingNode.listening(false);
          crossingNode.moveToTop();
          this.itemsLayer.add(crossingNode);
        }
      }
    }
  }

  /**
   * Update the transformer to attach to selected items
   */
  /**
   * Detect whether the selection delta involves a polygon text-flow item —
   * those need a re-render so their vertex handles toggle with selection.
   */
  private selectionChangeAffectsPolygonItem(
    nextState: import('../../types').EditorState,
    prevState: import('../../types').EditorState
  ): boolean {
    const before = new Set(prevState.selectedItemIds);
    const after = new Set(nextState.selectedItemIds);
    const changed: string[] = [];
    for (const id of before) if (!after.has(id)) changed.push(id);
    for (const id of after) if (!before.has(id)) changed.push(id);
    if (changed.length === 0) return false;

    const pageNum = nextState.selectedPageNumber ?? prevState.selectedPageNumber;
    if (pageNum === null) return false;
    for (const id of changed) {
      const item = appState.getItemFromPage(pageNum, id);
      if (item?.type === 'textFlow' && item.flowShape === 'polygon') return true;
    }
    return false;
  }

  private updateTransformer(): void {
    const editorState = appState.getEditor();

    if (editorState.selectedItemIds.length === 0) {
      this.transformer.nodes([]);
      this.itemsLayer.draw();
      return;
    }

    // Collect all valid nodes for selected items
    const nodes: Konva.Node[] = [];
    let hasLineOrArrow = false;

    for (const itemId of editorState.selectedItemIds) {
      const node = this.itemNodes.get(itemId);
      if (node) {
        // Don't attach transformer to images that are still loading
        if (!node.getAttr('imageLoading')) {
          nodes.push(node);
          const className = node.getClassName();
          if (className === 'Line' || className === 'Arrow') {
            hasLineOrArrow = true;
          }
        }
      }
    }

    if (nodes.length > 0) {
      // Configure transformer based on selection
      if (hasLineOrArrow && nodes.length === 1) {
        // Single line/arrow - disable resize, only allow rotate/move
        this.transformer.enabledAnchors([]);
        this.transformer.rotateEnabled(true);
      } else if (nodes.length > 1) {
        // Multiple items - enable all anchors for group transform
        this.transformer.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']);
        this.transformer.rotateEnabled(true);
      } else {
        // Single standard shape
        this.transformer.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']);
        this.transformer.rotateEnabled(true);
      }
      this.transformer.nodes(nodes);
    } else {
      this.transformer.nodes([]);
    }

    this.itemsLayer.draw();
  }

  private drawPageOutline(x: number, y: number, width: number, height: number): void {
    const page = new Konva.Rect({
      x,
      y,
      width,
      height,
      fill: '#ffffff',
      stroke: '#cccccc',
      strokeWidth: 1,
      shadowColor: 'black',
      shadowBlur: 10,
      shadowOpacity: 0.2,
      shadowOffset: { x: 2, y: 2 },
    });
    this.layer.add(page);
  }

  /**
   * Draw a transparent placeholder for booklet edges
   * Shown for first spread verso (before page 1) and last spread recto (after last even page)
   * Uses a subtle transparent overlay to indicate no page exists there
   */
  private drawTransparentPlaceholder(x: number, y: number, width: number, height: number): void {
    // Draw a subtle transparent rectangle with dashed border
    const placeholder = new Konva.Rect({
      x,
      y,
      width,
      height,
      fill: 'rgba(128, 128, 128, 0.1)',
      stroke: '#aaaaaa',
      strokeWidth: 1,
      dash: [8, 4],
    });
    this.layer.add(placeholder);
  }

  private drawPageBackground(x: number, y: number, width: number, height: number, backgroundFill?: FillConfig, transparent?: boolean, pageNumber?: number): void {
    const page = new Konva.Rect({
      x,
      y,
      width,
      height,
      stroke: '#cccccc',
      strokeWidth: 1,
      shadowColor: 'black',
      shadowBlur: 10,
      shadowOpacity: 0.2,
      shadowOffset: { x: 2, y: 2 },
      name: pageNumber !== undefined ? `page-bg-${pageNumber}` : undefined,
    });

    // If transparent is set (for custom background images), use transparent fill
    if (transparent) {
      page.fill('transparent');
    } else if (backgroundFill) {
      // Apply background fill
      if (backgroundFill.type === 'color') {
        page.fill(backgroundFill.color || '#ffffff');
      } else if (backgroundFill.type === 'linearGradient' && backgroundFill.linearGradient) {
        const angle = (backgroundFill.linearGradient.angle * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cx = width / 2;
        const cy = height / 2;
        const length = Math.sqrt(width * width + height * height) / 2;

        const colorStops: Array<number | string> = [];
        for (const stop of backgroundFill.linearGradient.stops) {
          colorStops.push(stop.offset);
          colorStops.push(stop.color);
        }

        page.fillLinearGradientStartPoint({ x: cx - cos * length, y: cy - sin * length });
        page.fillLinearGradientEndPoint({ x: cx + cos * length, y: cy + sin * length });
        page.fillLinearGradientColorStops(colorStops);
      } else if (backgroundFill.type === 'radialGradient' && backgroundFill.radialGradient) {
        const cx = backgroundFill.radialGradient.centerX * width;
        const cy = backgroundFill.radialGradient.centerY * height;
        const radius = backgroundFill.radialGradient.radius * Math.max(width, height);

        const colorStops: Array<number | string> = [];
        for (const stop of backgroundFill.radialGradient.stops) {
          colorStops.push(stop.offset);
          colorStops.push(stop.color);
        }

        page.fillRadialGradientStartPoint({ x: cx, y: cy });
        page.fillRadialGradientEndPoint({ x: cx, y: cy });
        page.fillRadialGradientStartRadius(0);
        page.fillRadialGradientEndRadius(radius);
        page.fillRadialGradientColorStops(colorStops);
      } else if (backgroundFill.type === 'pattern' && backgroundFill.pattern?.imageFileId) {
        const file = appState.getProject().files.find(f => f.id === backgroundFill.pattern?.imageFileId);
        if (file) {
          const img = new window.Image();
          img.src = `data:image/png;base64,${file.content}`;
          img.onload = () => {
            page.fillPatternImage(img);
            page.fillPatternRepeat(backgroundFill.pattern?.repeat || 'repeat');
            page.fillPatternScale({ x: backgroundFill.pattern?.scale || 1, y: backgroundFill.pattern?.scale || 1 });
            this.layer.batchDraw();
          };
        }
      }
    } else {
      page.fill('#ffffff');
    }

    this.layer.add(page);
  }

  private drawPage(
    pageContent: PageContent,
    x: number,
    y: number,
    dimensions: { width: number; height: number }
  ): void {
    const project = appState.getProject();
    const margins = getMarginsForPage(pageContent.pageNumber);

    // Draw page background with optional fill
    // Always apply the background fill - custom background images overlay on top
    // and transparent parts of the image will show the fill through
    this.drawPageBackground(x, y, dimensions.width, dimensions.height,
      pageContent.backgroundFill,
      false,
      pageContent.pageNumber);

    // Draw custom background image if present (sits above fill, below text/items)
    if (pageContent.customBackgroundImageId) {
      const file = project.files.find(f => f.id === pageContent.customBackgroundImageId);
      if (file) {
        // Store values for the closure
        const bgX = x;
        const bgY = y;
        const bgWidth = dimensions.width;
        const bgHeight = dimensions.height;
        const pageNum = pageContent.pageNumber;
        const layerRef = this.layer;

        const img = new window.Image();
        img.onload = () => {
          // Remove any existing custom background for this page
          const existing = layerRef.findOne(`.custom-bg-${pageNum}`);
          if (existing) {
            existing.destroy();
          }

          const konvaImage = new Konva.Image({
            x: bgX,
            y: bgY,
            width: bgWidth,
            height: bgHeight,
            image: img,
            name: `custom-bg-${pageNum}`,
          });

          // Find the page background rect and insert custom background right after it
          const pageBgRect = layerRef.findOne(`.page-bg-${pageNum}`);
          if (pageBgRect) {
            // Get the z-index of the page background and set custom bg to be just above it
            const bgIndex = pageBgRect.zIndex();
            layerRef.add(konvaImage);
            konvaImage.zIndex(bgIndex + 1);
          } else {
            // Fallback: just add to layer
            layerRef.add(konvaImage);
          }

          layerRef.batchDraw();
        };
        img.src = `data:image/png;base64,${file.content}`;
      }
    }

    // Draw page number indicator only if footer is disabled (footer handles page numbers otherwise)
    if (!project.headerFooter.footer.enabled) {
      const pageNum = new Konva.Text({
        x: x + dimensions.width / 2,
        y: y + dimensions.height - 20,
        text: pageContent.pageNumber.toString(),
        fontSize: 10,
        fill: '#aaaaaa',
        align: 'center',
      });
      pageNum.offsetX(pageNum.width() / 2);
      this.layer.add(pageNum);
    }

    // Only text pages render flowed markdown content. Static and available
    // pages are owned by the user (items / background only); rendering
    // their `sections` would draw stale text left over from when the page
    // was previously a text page.
    if (pageContent.pageState !== 'text') {
      return;
    }

    // Calculate content area
    // For recto (right page): inner margin is on LEFT (spine side), outer on RIGHT
    // For verso (left page): outer margin is on LEFT, inner on RIGHT (spine side)
    const leftMargin = pageContent.isRecto ? margins.inner : margins.outer;
    const rightMargin = pageContent.isRecto ? margins.outer : margins.inner;

    const contentX = x + leftMargin;
    const contentY = y + margins.top;
    const contentWidth = dimensions.width - leftMargin - rightMargin;
    const contentHeight = dimensions.height - margins.top - margins.bottom;

    // Draw margin guides if enabled
    if (this.showMargins) {
      const isDraggingRef = { value: this.isDraggingMargin };
      drawMarginGuides(
        x, y, dimensions, margins, pageContent,
        this.layer, this.marginLayer,
        this.marginLines, this.marginLabels,
        this.zoomLevel, this.stage,
        isDraggingRef,
        () => this.getCurrentSpread()
      );
      this.isDraggingMargin = isDraggingRef.value;
    }

    // Draw content
    drawPageContent(pageContent, contentX, contentY, contentWidth, contentHeight, this.layer);
  }
}
