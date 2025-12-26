/**
 * FillPicker Module
 * Re-exports from modular implementation
 */

export { FillPicker } from './FillPicker';
export { hsvToHex, hexToHsv, lerpColor } from './colorUtils';
export { renderColorTab, drawSatValCanvas } from './colorTab';
export { renderGradientTab, drawGradientCanvas, interpolateGradientColor } from './gradientTab';
export { renderPatternTab } from './patternTab';

import { FillPicker } from './FillPicker';
import type { FillConfig } from '../../../types';

/**
 * Factory function to create a FillPicker instance
 */
export function createFillPicker(
  container: HTMLElement,
  initialFill: FillConfig,
  onChange: (fill: FillConfig) => void
): FillPicker {
  return new FillPicker(container, initialFill, onChange);
}
