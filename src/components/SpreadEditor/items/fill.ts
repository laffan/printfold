/**
 * Fill application utilities for Konva shapes
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import type { FillConfig } from '../../../types';

/**
 * Clear all fill-related properties from a shape
 * This ensures switching between fill types doesn't leave stale gradient/pattern data
 */
function clearFillProperties(shape: Konva.Shape): void {
  // Clear solid fill
  shape.fill('');

  // Clear linear gradient properties
  shape.fillLinearGradientStartPoint({ x: 0, y: 0 });
  shape.fillLinearGradientEndPoint({ x: 0, y: 0 });
  shape.fillLinearGradientColorStops([]);

  // Clear radial gradient properties
  shape.fillRadialGradientStartPoint({ x: 0, y: 0 });
  shape.fillRadialGradientEndPoint({ x: 0, y: 0 });
  shape.fillRadialGradientStartRadius(0);
  shape.fillRadialGradientEndRadius(0);
  shape.fillRadialGradientColorStops([]);

  // Clear pattern properties
  shape.fillPatternImage(undefined as unknown as HTMLImageElement);
}

/**
 * Apply fill config to a Konva shape (works for shapes and text)
 */
export function applyFillToShape(
  shape: Konva.Shape,
  fill: FillConfig | undefined,
  fallbackColor: string | undefined,
  width: number,
  height: number
): void {
  // Clear any previous fill properties first
  clearFillProperties(shape);

  // Use fallback if no fill config
  if (!fill) {
    shape.fill(fallbackColor || 'transparent');
    return;
  }

  if (fill.type === 'color') {
    shape.fill(fill.color || 'transparent');
  } else if (fill.type === 'linearGradient' && fill.linearGradient) {
    const angle = (fill.linearGradient.angle * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Calculate gradient endpoints based on angle
    const cx = width / 2;
    const cy = height / 2;
    const length = Math.sqrt(width * width + height * height) / 2;

    const startX = cx - cos * length;
    const startY = cy - sin * length;
    const endX = cx + cos * length;
    const endY = cy + sin * length;

    // Build color stops array for Konva
    const colorStops: Array<number | string> = [];
    for (const stop of fill.linearGradient.stops) {
      colorStops.push(stop.offset);
      colorStops.push(stop.color);
    }

    shape.fillLinearGradientStartPoint({ x: startX, y: startY });
    shape.fillLinearGradientEndPoint({ x: endX, y: endY });
    shape.fillLinearGradientColorStops(colorStops);
  } else if (fill.type === 'radialGradient' && fill.radialGradient) {
    const cx = fill.radialGradient.centerX * width;
    const cy = fill.radialGradient.centerY * height;
    const radius = fill.radialGradient.radius * Math.max(width, height);

    const colorStops: Array<number | string> = [];
    for (const stop of fill.radialGradient.stops) {
      colorStops.push(stop.offset);
      colorStops.push(stop.color);
    }

    shape.fillRadialGradientStartPoint({ x: cx, y: cy });
    shape.fillRadialGradientEndPoint({ x: cx, y: cy });
    shape.fillRadialGradientStartRadius(0);
    shape.fillRadialGradientEndRadius(radius);
    shape.fillRadialGradientColorStops(colorStops);
  } else if (fill.type === 'pattern' && fill.pattern?.imageFileId) {
    const file = appState.getProject().files.find(f => f.id === fill.pattern?.imageFileId);
    if (file) {
      const img = new window.Image();
      img.src = `data:image/png;base64,${file.content}`;
      img.onload = () => {
        shape.fillPatternImage(img);
        shape.fillPatternRepeat(fill.pattern?.repeat || 'repeat');
        shape.fillPatternScale({ x: fill.pattern?.scale || 1, y: fill.pattern?.scale || 1 });
        shape.fillPatternOffset({ x: fill.pattern?.offsetX || 0, y: fill.pattern?.offsetY || 0 });
        shape.fillPatternRotation(fill.pattern?.rotation || 0);
        shape.getLayer()?.batchDraw();
      };
    }
  }
}
