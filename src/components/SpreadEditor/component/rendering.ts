/**
 * Rendering utilities for the SpreadEditor
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import type { PageContent, FillConfig } from '../../../types';

/**
 * Draw a page outline
 */
export function drawPageOutline(
  layer: Konva.Layer,
  x: number,
  y: number,
  width: number,
  height: number
): void {
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
  layer.add(page);
}

/**
 * Draw a transparent placeholder for booklet edges
 */
export function drawTransparentPlaceholder(
  layer: Konva.Layer,
  x: number,
  y: number,
  width: number,
  height: number
): void {
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
  layer.add(placeholder);

  const label = new Konva.Text({
    x: x + width / 2,
    y: y + height / 2,
    text: '(outside cover)',
    fontSize: 11,
    fill: '#888888',
    align: 'center',
  });
  label.offsetX(label.width() / 2);
  label.offsetY(label.height() / 2);
  layer.add(label);
}

/**
 * Draw a page background with optional fill
 */
export function drawPageBackground(
  layer: Konva.Layer,
  x: number,
  y: number,
  width: number,
  height: number,
  backgroundFill?: FillConfig
): Konva.Rect {
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
          layer.batchDraw();
        };
      }
    }
  } else {
    page.fill('#ffffff');
  }

  layer.add(page);
  return page;
}

/**
 * Draw the selected page indicator bar
 */
export function drawSelectedPageIndicator(
  marginLayer: Konva.Layer,
  selectedPosition: 'verso' | 'recto' | null,
  selectedPageNumber: number | null,
  versoPageNumber: number | null,
  rectoPageNumber: number | null,
  pageDimensions: { width: number; height: number }
): void {
  if (!selectedPosition || !selectedPageNumber) return;

  const isVersoSelected = selectedPosition === 'verso' && versoPageNumber === selectedPageNumber;
  const isRectoSelected = selectedPosition === 'recto' && rectoPageNumber === selectedPageNumber;

  if (!isVersoSelected && !isRectoSelected) return;

  const x = isVersoSelected ? 0 : pageDimensions.width;
  const barHeight = 5;

  const selectionBar = new Konva.Rect({
    x: x,
    y: pageDimensions.height,
    width: pageDimensions.width,
    height: barHeight,
    fill: '#22c55e',
    listening: false,
  });
  marginLayer.add(selectionBar);
}
