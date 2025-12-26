/**
 * Color utilities for PDF generation
 */

import { rgb } from 'pdf-lib';
import type { FillConfig } from '../../types';

/**
 * Parse a color string to pdf-lib rgb format
 */
export function parseColor(colorStr: string): ReturnType<typeof rgb> {
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return rgb(r, g, b);
  }
  return rgb(0, 0, 0);
}

/**
 * Get fill color from FillConfig (pdf-lib doesn't support gradients, so we use first color)
 */
export function getFillColorFromConfig(
  fill: FillConfig | undefined,
  fallbackColor: string | undefined
): ReturnType<typeof rgb> | undefined {
  if (!fill) {
    return fallbackColor ? parseColor(fallbackColor) : undefined;
  }

  if (fill.type === 'color' && fill.color) {
    return parseColor(fill.color);
  } else if (fill.type === 'linearGradient' && fill.linearGradient?.stops?.length) {
    // Use first gradient stop color as fallback
    return parseColor(fill.linearGradient.stops[0].color);
  } else if (fill.type === 'radialGradient' && fill.radialGradient?.stops?.length) {
    // Use first gradient stop color as fallback
    return parseColor(fill.radialGradient.stops[0].color);
  } else if (fill.type === 'pattern') {
    // Patterns can't be represented in PDF with pdf-lib, use a light gray
    return rgb(0.9, 0.9, 0.9);
  }

  return fallbackColor ? parseColor(fallbackColor) : undefined;
}
