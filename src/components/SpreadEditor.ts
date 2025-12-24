/**
 * SpreadEditor Component
 * Canvas-based editor for viewing and editing booklet spreads using Konva.js
 */

import Konva from 'konva';
import { appState } from '../services/state';
import type { Spread, PageContent, Margins, FontStyle } from '../types';
import { SHEET_SIZES } from '../types';

interface MarginLine {
  line: Konva.Line;
  type: 'top' | 'bottom' | 'inner' | 'outer' | 'header' | 'footer';
  pageNumber: number;
}

export class SpreadEditor {
  private container!: HTMLElement;
  private stage!: Konva.Stage;
  private layer!: Konva.Layer;
  private marginLayer!: Konva.Layer;

  private currentSpreadIndex = 0;
  private zoomLevel = 1;
  private showMargins = true;
  private marginLines: MarginLine[] = [];
  private isDraggingMargin = false;
  private dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | 'header' | 'footer' | null = null;
  private dragPageNumber: number | null = null;
  private isLocalChange = false;
  private stateUnsubscribe: (() => void) | null = null;

  mount(): void {
    this.container = document.getElementById('konva-container')!;

    // Create Konva stage
    this.stage = new Konva.Stage({
      container: 'konva-container',
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    });

    this.layer = new Konva.Layer();
    this.marginLayer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.add(this.marginLayer);

    // Set up event handlers
    this.setupControls();
    this.setupResizeObserver();
    this.setupKeyboardShortcuts();
    this.setupStateListeners();

    // Initial render
    this.render();
  }

  private projectUnsubscribe: (() => void) | null = null;

  private setupStateListeners(): void {
    // Listen for selectedPageNumber changes to navigate to that page
    this.stateUnsubscribe = appState.onEditorChange((state, prevState) => {
      if (state.selectedPageNumber !== null && state.selectedPageNumber !== prevState.selectedPageNumber) {
        this.navigateToPage(state.selectedPageNumber);
      }
    });

    // Note: We don't listen for layoutOptions/fontOptions/headerFooter changes here
    // because those trigger reflows, and App.ts calls spreadEditor.render() after reflow completes.
    // Rendering here before reflow would show trimmed/clipped content.
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
  }

  private setupResizeObserver(): void {
    const resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    resizeObserver.observe(this.container);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Track Cmd/Ctrl key for local margin changes
      if (e.key === 'Meta' || e.key === 'Control') {
        this.isLocalChange = true;
      }

      // Arrow keys for navigation
      if (e.key === 'ArrowLeft') {
        this.navigateSpread(-1);
      } else if (e.key === 'ArrowRight') {
        this.navigateSpread(1);
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        this.isLocalChange = false;
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
    const project = appState.getProject();
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

    this.currentSpreadIndex = Math.max(0, Math.min(totalSpreads - 1, this.currentSpreadIndex + delta));
    this.updateSpreadIndicator();
    this.render();
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

    this.layer.destroyChildren();
    this.marginLayer.destroyChildren();
    this.marginLines = [];

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

    this.layer.draw();
    this.marginLayer.draw();
    this.updateSpreadIndicator();
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

  private drawPage(
    pageContent: PageContent,
    x: number,
    y: number,
    dimensions: { width: number; height: number }
  ): void {
    const project = appState.getProject();
    const margins = this.getMarginsForPage(pageContent.pageNumber);

    // Draw page background
    this.drawPageOutline(x, y, dimensions.width, dimensions.height);

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

    if (pageContent.isBlank) {
      const blankText = new Konva.Text({
        x: x + dimensions.width / 2,
        y: y + dimensions.height / 2,
        text: '[Blank Page]',
        fontSize: 12,
        fill: '#cccccc',
        fontStyle: 'italic',
        align: 'center',
      });
      blankText.offsetX(blankText.width() / 2);
      this.layer.add(blankText);
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
      this.drawMarginGuides(x, y, dimensions, margins, pageContent);
    }

    // Draw content
    this.drawPageContent(pageContent, contentX, contentY, contentWidth, contentHeight);
  }

  private drawMarginGuides(
    x: number,
    y: number,
    dimensions: { width: number; height: number },
    margins: Margins,
    pageContent: PageContent
  ): void {
    // Margin fill
    const marginColor = 'rgba(74, 158, 255, 0.08)';
    const lineColor = 'rgba(74, 158, 255, 0.4)';
    const lineWidth = 1;

    // For recto (right page): inner margin is on LEFT (spine), outer on RIGHT
    // For verso (left page): outer margin is on LEFT, inner on RIGHT (spine)
    const leftMargin = pageContent.isRecto ? margins.inner : margins.outer;
    const rightMargin = pageContent.isRecto ? margins.outer : margins.inner;

    // Top margin
    const topRect = new Konva.Rect({
      x,
      y,
      width: dimensions.width,
      height: margins.top,
      fill: marginColor,
    });
    this.marginLayer.add(topRect);

    const topLine = new Konva.Line({
      points: [x, y + margins.top, x + dimensions.width, y + margins.top],
      stroke: lineColor,
      strokeWidth: lineWidth,
      dash: [4, 4],
      hitStrokeWidth: 20,
    });
    this.marginLayer.add(topLine);
    this.addMarginDragHandler(topLine, 'top', pageContent.pageNumber);

    // Bottom margin
    const bottomRect = new Konva.Rect({
      x,
      y: y + dimensions.height - margins.bottom,
      width: dimensions.width,
      height: margins.bottom,
      fill: marginColor,
    });
    this.marginLayer.add(bottomRect);

    const bottomLine = new Konva.Line({
      points: [x, y + dimensions.height - margins.bottom, x + dimensions.width, y + dimensions.height - margins.bottom],
      stroke: lineColor,
      strokeWidth: lineWidth,
      dash: [4, 4],
      hitStrokeWidth: 20,
    });
    this.marginLayer.add(bottomLine);
    this.addMarginDragHandler(bottomLine, 'bottom', pageContent.pageNumber);

    // Inner margin (spine side) - always uses margins.inner
    // Recto: spine on LEFT, Verso: spine on RIGHT
    const innerRectX = pageContent.isRecto ? x : x + dimensions.width - margins.inner;
    const innerRect = new Konva.Rect({
      x: innerRectX,
      y,
      width: margins.inner,
      height: dimensions.height,
      fill: marginColor,
    });
    this.marginLayer.add(innerRect);

    const innerLineX = pageContent.isRecto ? x + margins.inner : x + dimensions.width - margins.inner;
    const innerLine = new Konva.Line({
      points: [innerLineX, y, innerLineX, y + dimensions.height],
      stroke: lineColor,
      strokeWidth: lineWidth,
      dash: [4, 4],
      hitStrokeWidth: 20,
    });
    this.marginLayer.add(innerLine);
    this.addMarginDragHandler(innerLine, 'inner', pageContent.pageNumber);

    // Outer margin (outside edge) - always uses margins.outer
    // Recto: outer on RIGHT, Verso: outer on LEFT
    const outerRectX = pageContent.isRecto ? x + dimensions.width - margins.outer : x;
    const outerRect = new Konva.Rect({
      x: outerRectX,
      y,
      width: margins.outer,
      height: dimensions.height,
      fill: marginColor,
    });
    this.marginLayer.add(outerRect);

    const outerLineX = pageContent.isRecto ? x + dimensions.width - margins.outer : x + margins.outer;
    const outerLine = new Konva.Line({
      points: [outerLineX, y, outerLineX, y + dimensions.height],
      stroke: lineColor,
      strokeWidth: lineWidth,
      dash: [4, 4],
      hitStrokeWidth: 20,
    });
    this.marginLayer.add(outerLine);
    this.addMarginDragHandler(outerLine, 'outer', pageContent.pageNumber);

    // Header/Footer rendering and drag lines (orange)
    const project = appState.getProject();
    const headerFooterLineColor = 'rgba(255, 140, 0, 0.5)';

    // Use existing leftMargin/rightMargin for positioning header/footer content
    const contentWidth = dimensions.width - leftMargin - rightMargin;
    const contentX = x + leftMargin;

    // Header (if enabled)
    if (project.headerFooter.header.enabled) {
      const headerHeight = project.headerFooter.header.height;
      const headerY = y + margins.top;
      const headerLineY = headerY + headerHeight;

      // Draw header content
      this.drawHeaderFooterContent(
        project.headerFooter.header,
        pageContent.isRecto,
        pageContent.pageNumber,
        contentX,
        headerY + headerHeight / 2 - 5,
        contentWidth
      );

      // Draw header drag line (at bottom of header area)
      const headerLine = new Konva.Line({
        points: [x, headerLineY, x + dimensions.width, headerLineY],
        stroke: headerFooterLineColor,
        strokeWidth: 1,
        dash: [2, 2],
        hitStrokeWidth: 15,
      });
      this.marginLayer.add(headerLine);
      this.addHeaderFooterDragHandler(headerLine, 'header', pageContent.pageNumber, headerY);
    }

    // Footer (if enabled)
    if (project.headerFooter.footer.enabled) {
      const footerHeight = project.headerFooter.footer.height;
      const footerLineY = y + dimensions.height - margins.bottom - footerHeight;
      const footerContentY = footerLineY + footerHeight / 2 - 5;

      // Draw footer content
      this.drawHeaderFooterContent(
        project.headerFooter.footer,
        pageContent.isRecto,
        pageContent.pageNumber,
        contentX,
        footerContentY,
        contentWidth
      );

      // Draw footer drag line (at top of footer area)
      const footerLine = new Konva.Line({
        points: [x, footerLineY, x + dimensions.width, footerLineY],
        stroke: headerFooterLineColor,
        strokeWidth: 1,
        dash: [2, 2],
        hitStrokeWidth: 15,
      });
      this.marginLayer.add(footerLine);
      this.addHeaderFooterDragHandler(footerLine, 'footer', pageContent.pageNumber, y + dimensions.height - margins.bottom);
    }
  }

  private drawHeaderFooterContent(
    config: { verso: { left: string; center: string; right: string }; recto: { left: string; center: string; right: string }; font: FontStyle },
    isRecto: boolean,
    pageNumber: number,
    x: number,
    y: number,
    width: number
  ): void {
    const positions = isRecto ? config.recto : config.verso;
    const font = config.font;

    // Replace template variables
    const replaceVars = (text: string): string => {
      return text.replace(/\{\{pageNumber\}\}/g, pageNumber.toString());
    };

    // Draw left-aligned text
    if (positions.left) {
      const text = new Konva.Text({
        x,
        y,
        text: replaceVars(positions.left),
        fontSize: font.fontSize,
        fontFamily: font.fontFamily,
        fill: font.color,
        align: 'left',
      });
      this.layer.add(text);
    }

    // Draw center-aligned text
    if (positions.center) {
      const text = new Konva.Text({
        x: x + width / 2,
        y,
        text: replaceVars(positions.center),
        fontSize: font.fontSize,
        fontFamily: font.fontFamily,
        fill: font.color,
        align: 'center',
      });
      text.offsetX(text.width() / 2);
      this.layer.add(text);
    }

    // Draw right-aligned text
    if (positions.right) {
      const text = new Konva.Text({
        x: x + width,
        y,
        text: replaceVars(positions.right),
        fontSize: font.fontSize,
        fontFamily: font.fontFamily,
        fill: font.color,
        align: 'right',
      });
      text.offsetX(text.width());
      this.layer.add(text);
    }
  }

  private addHeaderFooterDragHandler(
    line: Konva.Line,
    type: 'header' | 'footer',
    pageNumber: number,
    baseY: number
  ): void {
    line.on('mouseenter', () => {
      this.stage.container().style.cursor = 'ns-resize';
      line.stroke('rgba(255, 140, 0, 0.9)');
      line.strokeWidth(2);
      this.marginLayer.draw();
    });

    line.on('mouseleave', () => {
      if (!this.isDraggingMargin) {
        this.stage.container().style.cursor = 'default';
        line.stroke('rgba(255, 140, 0, 0.5)');
        line.strokeWidth(1);
        this.marginLayer.draw();
      }
    });

    line.on('mousedown', (e) => {
      e.cancelBubble = true;
      this.isDraggingMargin = true;
      this.dragMarginType = type;
      this.dragPageNumber = pageNumber;

      const startPos = this.stage.getPointerPosition();
      const project = appState.getProject();
      const startHeight = type === 'header'
        ? project.headerFooter.header.height
        : project.headerFooter.footer.height;
      const startPoints = [...line.points()];

      let currentHeight = startHeight;

      const moveHandler = () => {
        if (!this.isDraggingMargin) return;

        const pos = this.stage.getPointerPosition();
        if (!pos || !startPos) return;

        const dy = (pos.y - startPos.y) / this.zoomLevel;

        // Header: dragging down increases height (line moves down)
        // Footer: dragging up increases height (line moves up)
        if (type === 'header') {
          currentHeight = Math.max(12, Math.min(72, startHeight + dy));
          line.points([startPoints[0], startPoints[1] + dy, startPoints[2], startPoints[3] + dy]);
        } else {
          // Footer line is at top of footer area - line should follow cursor (+ dy)
          // but height increases when dragging up (- dy for height calc)
          currentHeight = Math.max(12, Math.min(72, startHeight - dy));
          line.points([startPoints[0], startPoints[1] + dy, startPoints[2], startPoints[3] + dy]);
        }

        this.marginLayer.draw();
      };

      const upHandler = () => {
        this.isDraggingMargin = false;
        this.dragMarginType = null;
        this.dragPageNumber = null;
        this.stage.container().style.cursor = 'default';
        this.stage.off('mousemove', moveHandler);
        this.stage.off('mouseup mouseleave', upHandler);

        // Save the new height
        if (type === 'header') {
          appState.updateHeaderFooter({
            header: { ...project.headerFooter.header, height: currentHeight },
          });
        } else {
          appState.updateHeaderFooter({
            footer: { ...project.headerFooter.footer, height: currentHeight },
          });
        }
      };

      this.stage.on('mousemove', moveHandler);
      this.stage.on('mouseup mouseleave', upHandler);
    });
  }

  private addMarginDragHandler(
    line: Konva.Line,
    type: 'top' | 'bottom' | 'inner' | 'outer',
    pageNumber: number
  ): void {
    const hitArea = 10;

    line.on('mouseenter', () => {
      const cursor = type === 'top' || type === 'bottom' ? 'ns-resize' : 'ew-resize';
      this.stage.container().style.cursor = cursor;
      line.stroke('rgba(74, 158, 255, 0.8)');
      line.strokeWidth(2);
      this.marginLayer.draw();
    });

    line.on('mouseleave', () => {
      if (!this.isDraggingMargin) {
        this.stage.container().style.cursor = 'default';
        line.stroke('rgba(74, 158, 255, 0.4)');
        line.strokeWidth(1);
        this.marginLayer.draw();
      }
    });

    line.on('mousedown', (e) => {
      e.cancelBubble = true;
      this.isDraggingMargin = true;
      this.dragMarginType = type;
      this.dragPageNumber = pageNumber;

      const startPos = this.stage.getPointerPosition();
      const project = appState.getProject();
      const startMargins = { ...this.getMarginsForPage(pageNumber) };
      const spread = this.getCurrentSpread();
      const isRecto = spread?.recto?.pageNumber === pageNumber;

      // Store original line points to apply delta directly
      const startPoints = [...line.points()];

      // Track the current margin value during drag (visual only)
      let currentMarginValue = startMargins[type];

      const moveHandler = () => {
        if (!this.isDraggingMargin) return;

        const pos = this.stage.getPointerPosition();
        if (!pos || !startPos) return;

        const dx = (pos.x - startPos.x) / this.zoomLevel;
        const dy = (pos.y - startPos.y) / this.zoomLevel;

        // Update line position by applying delta to original points
        if (type === 'top') {
          currentMarginValue = Math.max(0, startMargins.top + dy);
          line.points([startPoints[0], startPoints[1] + dy, startPoints[2], startPoints[3] + dy]);
        } else if (type === 'bottom') {
          currentMarginValue = Math.max(0, startMargins.bottom - dy);
          line.points([startPoints[0], startPoints[1] - dy, startPoints[2], startPoints[3] - dy]);
        } else if (type === 'inner') {
          // Inner margin: dragging the line toward the spine shrinks margin, away from spine expands it
          // For recto: inner line is on LEFT. Drag LEFT (toward spine) = shrink, drag RIGHT = expand
          // For verso: inner line is on RIGHT. Drag RIGHT (toward spine) = shrink, drag LEFT = expand
          currentMarginValue = Math.max(0, startMargins.inner + (isRecto ? -dx : dx));
          line.points([startPoints[0] + dx, startPoints[1], startPoints[2] + dx, startPoints[3]]);
        } else if (type === 'outer') {
          // Outer margin: dragging toward the outer edge shrinks margin, toward content expands it
          // For recto: outer line is on RIGHT. Drag RIGHT (toward edge) = shrink, drag LEFT = expand
          // For verso: outer line is on LEFT. Drag LEFT (toward edge) = shrink, drag RIGHT = expand
          currentMarginValue = Math.max(0, startMargins.outer + (isRecto ? dx : -dx));
          line.points([startPoints[0] + dx, startPoints[1], startPoints[2] + dx, startPoints[3]]);
        }

        this.marginLayer.draw();
      };

      const upHandler = () => {
        this.isDraggingMargin = false;
        this.dragMarginType = null;
        this.dragPageNumber = null;
        this.stage.container().style.cursor = 'default';
        this.stage.off('mousemove', moveHandler);
        this.stage.off('mouseup mouseleave', upHandler);

        console.log('[SpreadEditor] Margin drag ended, type:', type, 'value:', currentMarginValue);

        // Now apply the margin change to state (triggers reflow)
        if (this.isLocalChange) {
          // Local change - update margin override for this page only
          const overrides = [...project.layoutOptions.marginOverrides];
          const existingIndex = overrides.findIndex(o => o.pageNumber === pageNumber);
          const override = { pageNumber, margins: { [type]: currentMarginValue } };

          if (existingIndex >= 0) {
            overrides[existingIndex] = {
              ...overrides[existingIndex],
              margins: { ...overrides[existingIndex].margins, [type]: currentMarginValue },
            };
          } else {
            overrides.push(override);
          }

          console.log('[SpreadEditor] Updating local margin overrides');
          appState.updateLayoutOptions({ marginOverrides: overrides });
        } else {
          // Global change
          console.log('[SpreadEditor] Updating global margins');
          appState.updateLayoutOptions({
            margins: { ...project.layoutOptions.margins, [type]: currentMarginValue },
          });
        }
      };

      this.stage.on('mousemove', moveHandler);
      this.stage.on('mouseup mouseleave', upHandler);
    });

    this.marginLines.push({ line, type, pageNumber });
  }

  private getMarginsForPage(pageNumber: number): Margins {
    const project = appState.getProject();
    const baseMargins = project.layoutOptions.margins;
    const override = project.layoutOptions.marginOverrides.find(o => o.pageNumber === pageNumber);

    if (override) {
      return { ...baseMargins, ...override.margins };
    }
    return baseMargins;
  }

  private drawPageContent(
    page: PageContent,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const project = appState.getProject();
    let currentY = y;

    for (const section of page.sections) {
      const fontStyle = this.getFontStyleForSection(section.type, section.level);
      const lineHeight = project.layoutOptions.lineHeight * fontStyle.fontSize;

      // Add spacing before headings
      if (section.type === 'heading') {
        switch (section.level) {
          case 1:
            currentY += project.layoutOptions.spacingAboveH1;
            break;
          case 2:
            currentY += project.layoutOptions.spacingAboveH2;
            break;
          case 3:
            currentY += project.layoutOptions.spacingAboveH3;
            break;
        }
      }

      // Handle image placeholders
      if (section.type === 'image') {
        const imageFile = section.imageRef ? appState.getImageByName(section.imageRef) : null;

        if (imageFile) {
          const imgX = x;
          const imgY = currentY;
          const maxImgWidth = width; // Full content width

          // Create placeholder while image loads
          const placeholder = new Konva.Rect({
            x: imgX,
            y: imgY,
            width: maxImgWidth,
            height: 100,
            fill: '#f8f8f8',
            stroke: '#ddd',
            strokeWidth: 1,
          });
          this.layer.add(placeholder);

          // Load and display image asynchronously with correct aspect ratio
          const img = new window.Image();
          img.onload = () => {
            placeholder.destroy();

            // Calculate size: full width, auto height maintaining aspect ratio
            const aspectRatio = img.width / img.height;
            const displayWidth = maxImgWidth;
            const displayHeight = displayWidth / aspectRatio;

            const konvaImage = new Konva.Image({
              x: imgX,
              y: imgY,
              width: displayWidth,
              height: displayHeight,
              image: img,
            });
            this.layer.add(konvaImage);

            // Add caption if present
            if (section.content && section.content.trim()) {
              const captionText = new Konva.Text({
                x: imgX,
                y: imgY + displayHeight + 4,
                text: section.content,
                fontSize: 9,
                fontStyle: 'italic',
                fill: '#666666',
                width: displayWidth,
                align: 'center',
              });
              this.layer.add(captionText);
            }

            this.layer.draw();
          };
          img.src = `data:image/png;base64,${imageFile.content}`;

          currentY += 120; // Will be adjusted when image loads
        } else {
          // Draw placeholder
          const placeholder = new Konva.Rect({
            x,
            y: currentY,
            width: Math.min(width, 200),
            height: 100,
            fill: '#f0f0f0',
            stroke: '#cccccc',
            strokeWidth: 1,
            dash: [4, 4],
          });
          this.layer.add(placeholder);

          const placeholderText = new Konva.Text({
            x: x + 10,
            y: currentY + 40,
            text: `Image not uploaded: ${section.imageRef || 'unknown'}`,
            fontSize: 10,
            fill: '#999999',
            width: Math.min(width, 200) - 20,
            wrap: 'word',
            align: 'center',
          });
          this.layer.add(placeholderText);
          currentY += 110;
        }
        continue;
      }

      // Draw text content
      const lines = (section as { lines?: string[] }).lines || [section.content];

      for (const line of lines) {
        if (currentY > y + height) break;

        const text = new Konva.Text({
          x,
          y: currentY,
          text: line,
          fontSize: fontStyle.fontSize,
          fontFamily: fontStyle.fontFamily,
          fontStyle: fontStyle.fontStyle === 'italic' ? 'italic' : 'normal',
          fill: fontStyle.color,
          width,
          wrap: 'none',
          ellipsis: true,
        });

        if (fontStyle.fontWeight === 'bold') {
          text.fontStyle('bold');
        }

        this.layer.add(text);
        currentY += lineHeight;
      }

      // Add paragraph spacing
      currentY += project.layoutOptions.paragraphSpacing;
    }
  }

  private getFontStyleForSection(type: string, level?: number): FontStyle {
    const project = appState.getProject();
    const fonts = project.fontOptions;

    switch (type) {
      case 'heading':
        return fonts[`h${level || 1}` as keyof typeof fonts] as FontStyle;
      case 'code':
        return fonts.code;
      case 'blockquote':
        return fonts.blockquote;
      default:
        return fonts.body;
    }
  }
}
