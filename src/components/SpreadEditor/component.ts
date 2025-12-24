/**
 * SpreadEditor Component
 * Canvas-based editor for viewing and editing booklet spreads using Konva.js
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { Spread, PageContent, Margins, PageItem, ImagePageItem, FillConfig } from '../../types';
import { SHEET_SIZES } from '../../types';
import type { MarginLine, MarginLabel } from './types';
import { createItemNode, renderPageItems } from './items';
import { renderThumbnails } from './thumbnails';
import { drawMarginGuides, getMarginsForPage } from './margins';
import { drawPageContent } from './content';

export class SpreadEditor {
  private container!: HTMLElement;
  private thumbnailContainer!: HTMLElement;
  private stage!: Konva.Stage;
  private layer!: Konva.Layer;
  private marginLayer!: Konva.Layer;
  private itemsLayer!: Konva.Layer;
  private transformer!: Konva.Transformer;

  private currentSpreadIndex = 0;
  private zoomLevel = 1;
  private showMargins = true;
  private marginLines: MarginLine[] = [];
  private marginLabels: MarginLabel[] = [];
  private isDraggingMargin = false;
  private dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | 'header' | 'footer' | null = null;
  private dragPageNumber: number | null = null;
  private stateUnsubscribe: (() => void) | null = null;
  private projectUnsubscribe: (() => void) | null = null;
  private itemNodes: Map<string, Konva.Node> = new Map();

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
    this.stage.add(this.layer);
    this.stage.add(this.marginLayer);
    this.stage.add(this.itemsLayer);

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

    // Set up event handlers
    this.setupControls();
    this.setupResizeObserver();
    this.setupKeyboardShortcuts();
    this.setupStateListeners();
    this.setupImageDropZone();

    // Initial render
    this.render();
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
      if (!editorState.selectedPageNumber) {
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

    // Add the image item
    const item: ImagePageItem = {
      id: crypto.randomUUID(),
      type: 'image',
      x: 50,
      y: 50,
      width: 150,
      height: 100,
      rotation: 0,
      opacity: 1,
      imageFileId: fileId,
    };

    appState.addItemToPage(pageNumber, item);
    appState.updateEditor({ selectedItemId: item.id });
  }

  private setupStateListeners(): void {
    // Listen for editor state changes
    this.stateUnsubscribe = appState.onEditorChange((state, prevState) => {
      // Navigate to selected page
      if (state.selectedPageNumber !== null && state.selectedPageNumber !== prevState.selectedPageNumber) {
        this.navigateToPage(state.selectedPageNumber);
      }
      // Re-render when margin unit changes (to update labels)
      if (state.marginUnit !== prevState.marginUnit) {
        this.render();
      }
      // Update transformer when selected item changes
      if (state.selectedItemId !== prevState.selectedItemId) {
        this.updateTransformer();
      }
    });

    // Listen for project changes to update items
    this.projectUnsubscribe = appState.onProjectChange(() => {
      this.renderItems();
      this.updateTransformer();
    });
  }

  /**
   * Navigate to a specific page number
   */
  navigateToPage(pageNumber: number): void {
    const project = appState.getProject();
    const allSpreads = project.signatures.flatMap(sig => sig.spreads);

    // Find the spread containing this page
    for (let i = 0; i < allSpreads.length; i++) {
      const spread = allSpreads[i];
      if (
        (spread.verso && spread.verso.pageNumber === pageNumber) ||
        (spread.recto && spread.recto.pageNumber === pageNumber)
      ) {
        if (this.currentSpreadIndex !== i) {
          this.currentSpreadIndex = i;
          this.updateSpreadIndicator();
          this.render();
        }
        return;
      }
    }
  }

  private setupControls(): void {
    // Zoom controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      this.setZoom(Math.min(this.zoomLevel + 0.25, 3));
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      this.setZoom(Math.max(this.zoomLevel - 0.25, 0.25));
    });

    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
      this.fitToView();
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

    // Add blank page button
    document.getElementById('btn-add-blank-page')?.addEventListener('click', () => {
      const spread = this.getCurrentSpread();
      if (spread?.recto) {
        appState.addBlankPage(spread.recto.pageNumber);
      }
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

      this.setZoom(Math.max(0.25, Math.min(3, newScale)));

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
      const isStageOrLayer = target === this.stage || target.getLayer() === this.layer || target.getLayer() === this.marginLayer;
      const isItem = target.getAttr('itemId') !== undefined;

      if (isStageOrLayer && !isItem) {
        // Only deselect the item, not the page (page selection handled by page click areas)
        appState.updateEditor({ selectedItemId: null });
        this.updateTransformer();
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

      // Arrow keys for navigation
      if (e.key === 'ArrowLeft') {
        this.navigateSpread(-1);
      } else if (e.key === 'ArrowRight') {
        this.navigateSpread(1);
      }

      // Delete/Backspace to delete selected item
      if ((e.key === 'Delete' || e.key === 'Backspace') && editorState.selectedItemId && editorState.selectedPageNumber) {
        e.preventDefault();
        appState.deleteItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        appState.updateEditor({ selectedItemId: null });
      }

      // Duplicate with Cmd/Ctrl+D
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && editorState.selectedItemId && editorState.selectedPageNumber) {
        e.preventDefault();
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
    this.fitToView();
    this.render();
  }

  private setZoom(level: number): void {
    this.zoomLevel = level;
    this.stage.scale({ x: level, y: level });
    document.getElementById('zoom-level')!.textContent = `${Math.round(level * 100)}%`;
  }

  private fitToView(): void {
    const pageDimensions = this.getPageDimensions();

    // Calculate spread size
    const spreadWidth = pageDimensions.width * 2;
    const spreadHeight = pageDimensions.height;

    // Calculate scale to fit
    const padding = 40;
    const availableWidth = this.container.clientWidth - padding * 2;
    const availableHeight = this.container.clientHeight - padding * 2;

    const scaleX = availableWidth / spreadWidth;
    const scaleY = availableHeight / spreadHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    this.setZoom(scale);

    // Center the spread
    const centerX = (this.container.clientWidth - spreadWidth * scale) / 2;
    const centerY = (this.container.clientHeight - spreadHeight * scale) / 2;
    this.stage.position({ x: centerX, y: centerY });
  }

  private getPageDimensions(): { width: number; height: number } {
    const project = appState.getProject();
    const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];

    if (project.outputOptions.bookletSize === 'custom') {
      return {
        width: project.outputOptions.customWidth || sheetSize.width / 2,
        height: project.outputOptions.customHeight || sheetSize.height,
      };
    }

    if (project.outputOptions.bookletSize.startsWith('quarter-')) {
      return {
        width: sheetSize.width / 2,
        height: sheetSize.height / 2,
      };
    }

    return {
      width: sheetSize.width / 2,
      height: sheetSize.height,
    };
  }

  private getCurrentSpread(): Spread | null {
    const project = appState.getProject();
    const allSpreads = project.signatures.flatMap(sig => sig.spreads);

    if (allSpreads.length === 0) return null;
    return allSpreads[this.currentSpreadIndex] || allSpreads[0];
  }

  private navigateSpread(delta: number): void {
    const project = appState.getProject();
    const totalSpreads = project.signatures.reduce((sum, sig) => sum + sig.spreads.length, 0);

    if (totalSpreads === 0) return;

    const newIndex = Math.max(0, Math.min(totalSpreads - 1, this.currentSpreadIndex + delta));

    // Only update if actually changing spreads
    if (newIndex !== this.currentSpreadIndex) {
      this.currentSpreadIndex = newIndex;
      // Clear item selection when navigating to a different spread
      appState.updateEditor({ selectedItemId: null });
      this.updateSpreadIndicator();
      this.render();
    }
  }

  /**
   * Navigate to a specific spread by index
   */
  navigateToSpread(spreadIndex: number): void {
    const project = appState.getProject();
    const totalSpreads = project.signatures.reduce((sum, sig) => sum + sig.spreads.length, 0);

    if (spreadIndex >= 0 && spreadIndex < totalSpreads) {
      this.currentSpreadIndex = spreadIndex;
      // Clear item selection when navigating
      appState.updateEditor({ selectedItemId: null });
      this.updateSpreadIndicator();
      this.render();
    }
  }

  private updateSpreadIndicator(): void {
    const project = appState.getProject();
    const totalSpreads = project.signatures.reduce((sum, sig) => sum + sig.spreads.length, 0);
    const indicator = document.getElementById('spread-indicator')!;
    indicator.textContent = `Spread ${this.currentSpreadIndex + 1} of ${Math.max(1, totalSpreads)}`;
  }

  render(): void {
    // Guard against rendering when container is not visible (prevents canvas errors)
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      return;
    }

    const project = appState.getProject();
    const editorState = appState.getEditor();

    this.layer.destroyChildren();
    this.marginLayer.destroyChildren();
    this.marginLines = [];
    this.marginLabels = [];

    const spread = this.getCurrentSpread();
    const pageDimensions = this.getPageDimensions();

    if (!spread) {
      // Show empty state
      const text = new Konva.Text({
        x: pageDimensions.width,
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
      this.drawPageOutline(pageDimensions.width, 0, pageDimensions.width, pageDimensions.height);

      this.layer.draw();
      this.updateSpreadIndicator();
      return;
    }

    // Draw verso (left) page
    if (spread.verso) {
      this.drawPage(spread.verso, 0, 0, pageDimensions);
    } else {
      this.drawPageOutline(0, 0, pageDimensions.width, pageDimensions.height);
    }

    // Draw recto (right) page
    if (spread.recto) {
      this.drawPage(spread.recto, pageDimensions.width, 0, pageDimensions);
    } else {
      this.drawPageOutline(pageDimensions.width, 0, pageDimensions.width, pageDimensions.height);
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

    // Render thumbnails
    renderThumbnails(
      this.thumbnailContainer,
      pageDimensions,
      this.currentSpreadIndex,
      (pageNumber, position) => this.selectPage(pageNumber, position),
      (index) => { this.currentSpreadIndex = index; },
      () => this.updateSpreadIndicator()
    );
  }

  /**
   * Draw a solid green bar below the selected page
   */
  private drawSelectedPageIndicator(
    spread: Spread,
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
    spread: Spread,
    pageDimensions: { width: number; height: number }
  ): void {
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

    // Recto click area
    if (spread.recto) {
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
    });
    this.render();
  }

  /**
   * Render items on static pages in the current spread
   */
  private renderItems(): void {
    const project = appState.getProject();
    const allSpreads = project.signatures.flatMap(sig => sig.spreads);
    const spread = allSpreads[this.currentSpreadIndex];
    const pageDimensions = this.getPageDimensions();

    if (!spread) return;

    // Clear existing items (except transformer)
    this.itemNodes.forEach(node => node.destroy());
    this.itemNodes.clear();

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

    this.itemsLayer.draw();
  }

  /**
   * Update the transformer to attach to the selected item
   */
  private updateTransformer(): void {
    const editorState = appState.getEditor();

    if (!editorState.selectedItemId) {
      this.transformer.nodes([]);
      this.itemsLayer.draw();
      return;
    }

    const node = this.itemNodes.get(editorState.selectedItemId);
    if (node) {
      // Don't attach transformer to images that are still loading
      if (node.getAttr('imageLoading')) {
        this.transformer.nodes([]);
      } else {
        // Configure transformer based on shape type
        const className = node.getClassName();
        if (className === 'Line' || className === 'Arrow') {
          // Lines and arrows need special handling - disable resize, only allow rotate/move
          this.transformer.enabledAnchors([]);
          this.transformer.rotateEnabled(true);
        } else {
          // Standard shapes get full anchor set
          this.transformer.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']);
          this.transformer.rotateEnabled(true);
        }
        this.transformer.nodes([node]);
      }
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

  private drawPageBackground(x: number, y: number, width: number, height: number, backgroundFill?: FillConfig): void {
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
    });

    // Apply background fill
    if (backgroundFill) {
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
    this.drawPageBackground(x, y, dimensions.width, dimensions.height, pageContent.backgroundFill);

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

    // Skip content rendering for blank pages (items are rendered separately)
    if (pageContent.isBlank) {
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
