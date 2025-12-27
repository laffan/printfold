/**
 * SpreadEditor Margins Module
 * Handles margin guides, drag handlers, and header/footer rendering
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, Margins, FontStyle } from '../../types';
import { formatMarginValue } from '../../types';
import type { MarginLine, MarginLabel } from './types';

/**
 * Draw margin guides for a page
 */
export function drawMarginGuides(
  x: number,
  y: number,
  dimensions: { width: number; height: number },
  margins: Margins,
  pageContent: PageContent,
  layer: Konva.Layer,
  marginLayer: Konva.Layer,
  marginLines: MarginLine[],
  marginLabels: MarginLabel[],
  zoomLevel: number,
  stage: Konva.Stage,
  isDraggingMarginRef: { value: boolean },
  getCurrentSpreadFn: () => any
): void {
  // Margin fill
  const marginColor = 'rgba(74, 158, 255, 0.08)';
  const lineColor = 'rgba(74, 158, 255, 0.4)';
  const lineWidth = 1;
  const labelColor = 'rgba(74, 158, 255, 0.7)';
  const labelFontSize = 9;
  const unit = appState.getEditor().marginUnit;

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
  marginLayer.add(topRect);

  const topLine = new Konva.Line({
    points: [x, y + margins.top, x + dimensions.width, y + margins.top],
    stroke: lineColor,
    strokeWidth: lineWidth,
    dash: [4, 4],
    hitStrokeWidth: 20,
  });
  marginLayer.add(topLine);
  addMarginDragHandler(topLine, 'top', pageContent.pageNumber, marginLines, marginLabels, zoomLevel, stage, isDraggingMarginRef, getCurrentSpreadFn);

  // Top margin label
  const topLabel = new Konva.Text({
    x: x + dimensions.width / 2,
    y: y + margins.top / 2 - labelFontSize / 2,
    text: formatMarginValue(margins.top, unit),
    fontSize: labelFontSize,
    fill: labelColor,
    align: 'center',
  });
  topLabel.offsetX(topLabel.width() / 2);
  marginLayer.add(topLabel);
  marginLabels.push({ text: topLabel, type: 'top', pageNumber: pageContent.pageNumber });

  // Bottom margin
  const bottomRect = new Konva.Rect({
    x,
    y: y + dimensions.height - margins.bottom,
    width: dimensions.width,
    height: margins.bottom,
    fill: marginColor,
  });
  marginLayer.add(bottomRect);

  const bottomLine = new Konva.Line({
    points: [x, y + dimensions.height - margins.bottom, x + dimensions.width, y + dimensions.height - margins.bottom],
    stroke: lineColor,
    strokeWidth: lineWidth,
    dash: [4, 4],
    hitStrokeWidth: 20,
  });
  marginLayer.add(bottomLine);
  addMarginDragHandler(bottomLine, 'bottom', pageContent.pageNumber, marginLines, marginLabels, zoomLevel, stage, isDraggingMarginRef, getCurrentSpreadFn);

  // Bottom margin label
  const bottomLabel = new Konva.Text({
    x: x + dimensions.width / 2,
    y: y + dimensions.height - margins.bottom / 2 - labelFontSize / 2,
    text: formatMarginValue(margins.bottom, unit),
    fontSize: labelFontSize,
    fill: labelColor,
    align: 'center',
  });
  bottomLabel.offsetX(bottomLabel.width() / 2);
  marginLayer.add(bottomLabel);
  marginLabels.push({ text: bottomLabel, type: 'bottom', pageNumber: pageContent.pageNumber });

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
  marginLayer.add(innerRect);

  const innerLineX = pageContent.isRecto ? x + margins.inner : x + dimensions.width - margins.inner;
  const innerLine = new Konva.Line({
    points: [innerLineX, y, innerLineX, y + dimensions.height],
    stroke: lineColor,
    strokeWidth: lineWidth,
    dash: [4, 4],
    hitStrokeWidth: 20,
  });
  marginLayer.add(innerLine);
  addMarginDragHandler(innerLine, 'inner', pageContent.pageNumber, marginLines, marginLabels, zoomLevel, stage, isDraggingMarginRef, getCurrentSpreadFn);

  // Inner margin label (rotated vertically)
  const innerLabelX = pageContent.isRecto ? x + margins.inner / 2 : x + dimensions.width - margins.inner / 2;
  const innerLabel = new Konva.Text({
    x: innerLabelX,
    y: y + dimensions.height / 2,
    text: formatMarginValue(margins.inner, unit),
    fontSize: labelFontSize,
    fill: labelColor,
    rotation: -90,
  });
  innerLabel.offsetX(innerLabel.width() / 2);
  innerLabel.offsetY(innerLabel.height() / 2);
  marginLayer.add(innerLabel);
  marginLabels.push({ text: innerLabel, type: 'inner', pageNumber: pageContent.pageNumber });

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
  marginLayer.add(outerRect);

  const outerLineX = pageContent.isRecto ? x + dimensions.width - margins.outer : x + margins.outer;
  const outerLine = new Konva.Line({
    points: [outerLineX, y, outerLineX, y + dimensions.height],
    stroke: lineColor,
    strokeWidth: lineWidth,
    dash: [4, 4],
    hitStrokeWidth: 20,
  });
  marginLayer.add(outerLine);
  addMarginDragHandler(outerLine, 'outer', pageContent.pageNumber, marginLines, marginLabels, zoomLevel, stage, isDraggingMarginRef, getCurrentSpreadFn);

  // Outer margin label (rotated vertically)
  const outerLabelX = pageContent.isRecto ? x + dimensions.width - margins.outer / 2 : x + margins.outer / 2;
  const outerLabel = new Konva.Text({
    x: outerLabelX,
    y: y + dimensions.height / 2,
    text: formatMarginValue(margins.outer, unit),
    fontSize: labelFontSize,
    fill: labelColor,
    rotation: -90,
  });
  outerLabel.offsetX(outerLabel.width() / 2);
  outerLabel.offsetY(outerLabel.height() / 2);
  marginLayer.add(outerLabel);
  marginLabels.push({ text: outerLabel, type: 'outer', pageNumber: pageContent.pageNumber });

  // Header/Footer rendering and drag lines (orange)
  const project = appState.getProject();
  const headerFooterLineColor = 'rgba(255, 140, 0, 0.5)';

  // Use existing leftMargin/rightMargin for positioning header/footer content
  const contentWidth = dimensions.width - leftMargin - rightMargin;
  const contentX = x + leftMargin;

  // Header (if enabled) - lives INSIDE the top margin area
  if (project.headerFooter.header.enabled) {
    const headerHeight = project.headerFooter.header.height;
    const headerFontSize = project.headerFooter.header.font.fontSize;
    // Header line is at the margin boundary (where content starts)
    const headerLineY = y + margins.top;
    // Header text sits on the line, extending upward into the margin
    const headerTextY = headerLineY - headerFontSize - 2;

    // Draw header content - text sits on the orange line (inside margin area)
    drawHeaderFooterContent(
      project.headerFooter.header,
      pageContent.isRecto,
      pageContent.pageNumber,
      contentX,
      headerTextY,
      contentWidth,
      layer
    );

    // Draw header drag line (at margin boundary - controls how far up text extends into margin)
    const headerLine = new Konva.Line({
      points: [x, headerLineY, x + dimensions.width, headerLineY],
      stroke: headerFooterLineColor,
      strokeWidth: 1,
      dash: [2, 2],
      hitStrokeWidth: 15,
    });
    marginLayer.add(headerLine);
    // Pass the top of header area for drag calculations
    addHeaderFooterDragHandler(headerLine, 'header', pageContent.pageNumber, headerLineY - headerHeight, zoomLevel, stage, marginLayer, isDraggingMarginRef);
  }

  // Footer (if enabled) - lives INSIDE the bottom margin area
  if (project.headerFooter.footer.enabled) {
    const footerHeight = project.headerFooter.footer.height;
    // Footer line is at the margin boundary (where content ends)
    const footerLineY = y + dimensions.height - margins.bottom;

    // Draw footer content - text sits on the orange line (inside margin area)
    drawHeaderFooterContent(
      project.headerFooter.footer,
      pageContent.isRecto,
      pageContent.pageNumber,
      contentX,
      footerLineY + 2, // Position text just below the line (inside margin)
      contentWidth,
      layer
    );

    // Draw footer drag line (at margin boundary - controls how far down text extends into margin)
    const footerLine = new Konva.Line({
      points: [x, footerLineY, x + dimensions.width, footerLineY],
      stroke: headerFooterLineColor,
      strokeWidth: 1,
      dash: [2, 2],
      hitStrokeWidth: 15,
    });
    marginLayer.add(footerLine);
    // Pass the bottom of footer area for drag calculations
    addHeaderFooterDragHandler(footerLine, 'footer', pageContent.pageNumber, footerLineY + footerHeight, zoomLevel, stage, marginLayer, isDraggingMarginRef);
  }
}

/**
 * Draw header or footer content
 */
export function drawHeaderFooterContent(
  config: { verso: { left: string; center: string; right: string }; recto: { left: string; center: string; right: string }; font: FontStyle },
  isRecto: boolean,
  pageNumber: number,
  x: number,
  y: number,
  width: number,
  layer: Konva.Layer
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
    layer.add(text);
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
    layer.add(text);
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
    layer.add(text);
  }
}

/**
 * Add drag handler for header/footer lines
 */
function addHeaderFooterDragHandler(
  line: Konva.Line,
  type: 'header' | 'footer',
  pageNumber: number,
  baseY: number,
  zoomLevel: number,
  stage: Konva.Stage,
  marginLayer: Konva.Layer,
  isDraggingMarginRef: { value: boolean }
): void {
  line.on('mouseenter', () => {
    stage.container().style.cursor = 'ns-resize';
    line.stroke('rgba(255, 140, 0, 0.9)');
    line.strokeWidth(2);
    marginLayer.draw();
  });

  line.on('mouseleave', () => {
    if (!isDraggingMarginRef.value) {
      stage.container().style.cursor = 'default';
      line.stroke('rgba(255, 140, 0, 0.5)');
      line.strokeWidth(1);
      marginLayer.draw();
    }
  });

  line.on('mousedown', (e) => {
    e.cancelBubble = true;
    isDraggingMarginRef.value = true;

    const startPos = stage.getPointerPosition();
    const project = appState.getProject();
    const startHeight = type === 'header'
      ? project.headerFooter.header.height
      : project.headerFooter.footer.height;
    const startPoints = [...line.points()];

    let currentHeight = startHeight;

    const moveHandler = () => {
      if (!isDraggingMarginRef.value) return;

      const pos = stage.getPointerPosition();
      if (!pos || !startPos) return;

      const dy = (pos.y - startPos.y) / zoomLevel;

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

      marginLayer.draw();
    };

    const upHandler = () => {
      isDraggingMarginRef.value = false;
      stage.container().style.cursor = 'default';
      stage.off('mousemove', moveHandler);
      stage.off('mouseup mouseleave', upHandler);

      // Get fresh project state for the update
      const currentProject = appState.getProject();

      // Save the new height
      if (type === 'header') {
        appState.updateHeaderFooter({
          header: { ...currentProject.headerFooter.header, height: currentHeight },
        });
      } else {
        appState.updateHeaderFooter({
          footer: { ...currentProject.headerFooter.footer, height: currentHeight },
        });
      }
    };

    stage.on('mousemove', moveHandler);
    stage.on('mouseup mouseleave', upHandler);
  });
}

/**
 * Add drag handler for margin lines
 */
function addMarginDragHandler(
  line: Konva.Line,
  type: 'top' | 'bottom' | 'inner' | 'outer',
  pageNumber: number,
  marginLines: MarginLine[],
  marginLabels: MarginLabel[],
  zoomLevel: number,
  stage: Konva.Stage,
  isDraggingMarginRef: { value: boolean },
  getCurrentSpreadFn: () => any
): void {
  const marginLayer = line.getLayer()!;

  line.on('mouseenter', () => {
    const cursor = type === 'top' || type === 'bottom' ? 'ns-resize' : 'ew-resize';
    stage.container().style.cursor = cursor;
    line.stroke('rgba(74, 158, 255, 0.8)');
    line.strokeWidth(2);
    marginLayer.draw();
  });

  line.on('mouseleave', () => {
    if (!isDraggingMarginRef.value) {
      stage.container().style.cursor = 'default';
      line.stroke('rgba(74, 158, 255, 0.4)');
      line.strokeWidth(1);
      marginLayer.draw();
    }
  });

  line.on('mousedown', (e) => {
    e.cancelBubble = true;
    isDraggingMarginRef.value = true;

    const startPos = stage.getPointerPosition();
    const project = appState.getProject();
    const startMargins = { ...getMarginsForPage(pageNumber) };
    const spread = getCurrentSpreadFn();
    const isRecto = spread?.recto?.pageNumber === pageNumber;

    // Store original line points to apply delta directly
    const startPoints = [...line.points()];

    // Track the current margin value during drag (visual only)
    let currentMarginValue = startMargins[type];

    const moveHandler = () => {
      if (!isDraggingMarginRef.value) return;

      const pos = stage.getPointerPosition();
      if (!pos || !startPos) return;

      const dx = (pos.x - startPos.x) / zoomLevel;
      const dy = (pos.y - startPos.y) / zoomLevel;

      // Update line position by applying delta to original points
      if (type === 'top') {
        currentMarginValue = Math.max(0, startMargins.top + dy);
        line.points([startPoints[0], startPoints[1] + dy, startPoints[2], startPoints[3] + dy]);
      } else if (type === 'bottom') {
        // Bottom margin: line follows cursor (+ dy), but margin value is inverse
        // Dragging down (+ dy) shrinks margin, dragging up (- dy) grows margin
        currentMarginValue = Math.max(0, startMargins.bottom - dy);
        line.points([startPoints[0], startPoints[1] + dy, startPoints[2], startPoints[3] + dy]);
      } else if (type === 'inner') {
        // Inner margin: dragging the line toward content shrinks margin, away from content expands it
        // For recto: inner line is on LEFT. Drag LEFT = shrink margin, drag RIGHT = expand
        // For verso: inner line is on RIGHT. Drag RIGHT = shrink margin, drag LEFT = expand
        currentMarginValue = Math.max(0, startMargins.inner + (isRecto ? dx : -dx));
        line.points([startPoints[0] + dx, startPoints[1], startPoints[2] + dx, startPoints[3]]);
      } else if (type === 'outer') {
        // Outer margin: dragging the line toward content shrinks margin, away from content expands it
        // For recto: outer line is on RIGHT. Drag RIGHT = shrink margin, drag LEFT = expand
        // For verso: outer line is on LEFT. Drag LEFT = shrink margin, drag RIGHT = expand
        currentMarginValue = Math.max(0, startMargins.outer + (isRecto ? -dx : dx));
        line.points([startPoints[0] + dx, startPoints[1], startPoints[2] + dx, startPoints[3]]);
      }

      // Update labels and sidebar in real-time
      updateMarginDuringDrag(type, currentMarginValue, marginLabels, marginLayer);
      marginLayer.draw();
    };

    const upHandler = (evt: Konva.KonvaEventObject<MouseEvent>) => {
      isDraggingMarginRef.value = false;
      stage.container().style.cursor = 'default';
      stage.off('mousemove', moveHandler);
      stage.off('mouseup mouseleave', upHandler);

      // Get fresh project state for the update
      const currentProject = appState.getProject();

      // Check if Cmd/Ctrl is held at the moment of release for local changes
      // This is more reliable than tracking keydown/keyup separately
      const isLocalChange = evt.evt?.metaKey || evt.evt?.ctrlKey || false;

      // Now apply the margin change to state (triggers reflow)
      if (isLocalChange) {
        // Local change - update margin override for this page only
        const overrides = [...currentProject.layoutOptions.marginOverrides];
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

        appState.updateLayoutOptions({ marginOverrides: overrides });
      } else {
        // Global change
        appState.updateLayoutOptions({
          margins: { ...currentProject.layoutOptions.margins, [type]: currentMarginValue },
        });
      }
    };

    stage.on('mousemove', moveHandler);
    stage.on('mouseup mouseleave', upHandler);
  });

  marginLines.push({ line, type, pageNumber });
}

/**
 * Get margins for a specific page, considering overrides
 */
export function getMarginsForPage(pageNumber: number): Margins {
  const project = appState.getProject();
  const baseMargins = project.layoutOptions.margins;
  const override = project.layoutOptions.marginOverrides.find(o => o.pageNumber === pageNumber);

  if (override) {
    return { ...baseMargins, ...override.margins };
  }
  return baseMargins;
}

/**
 * Update margin display during drag (labels and sidebar inputs)
 */
export function updateMarginDuringDrag(
  marginType: 'top' | 'bottom' | 'inner' | 'outer',
  value: number,
  marginLabels: MarginLabel[],
  marginLayer: Konva.Layer
): void {
  const unit = appState.getEditor().marginUnit;
  const formattedValue = formatMarginValue(value, unit);

  // Update all labels of this type (both pages of the spread show the same value for global margins)
  for (const label of marginLabels) {
    if (label.type === marginType) {
      label.text.text(formattedValue);
      // Re-center horizontal labels
      if (marginType === 'top' || marginType === 'bottom') {
        label.text.offsetX(label.text.width() / 2);
      } else {
        // Vertical labels need both offsets updated
        label.text.offsetX(label.text.width() / 2);
      }
    }
  }

  // Update sidebar input
  const inputId = `opt-margin-${marginType}`;
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (input) {
    const conv = { pt: 1, 'in': 1/72, cm: 2.54/72, px: 96/72 }[unit];
    const decimals = { pt: 0, 'in': 2, cm: 2, px: 0 }[unit];
    const displayValue = Math.round(value * conv * Math.pow(10, decimals)) / Math.pow(10, decimals);
    input.value = displayValue.toString();
  }
}
