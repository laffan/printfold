/**
 * FillPicker Module
 * Re-exports from modular implementation
 */

export { FillPicker } from './FillPicker';
export { hsvToHex, hexToHsv, lerpColor } from './colorUtils';
export { renderColorTab, drawSatValCanvas } from './colorTab';
export { renderGradientTab, drawGradientCanvas, interpolateGradientColor } from './gradientTab';
export { renderPatternTab } from './patternTab';

import { FillPicker, FillPickerOptions } from './FillPicker';
import type { FillConfig } from '../../../types';

/**
 * Factory function to create a FillPicker instance
 */
export function createFillPicker(
  container: HTMLElement,
  initialFill: FillConfig,
  onChange: (fill: FillConfig) => void,
  options?: FillPickerOptions
): FillPicker {
  return new FillPicker(container, initialFill, onChange, options);
}

/**
 * Thin wrapper around FillPicker that exposes a plain hex-color API.
 * Used for fields that only support solid colors (text/background/stroke/
 * shadow/crop-mark, etc.) so they get the same swatch + popover UX as
 * the Page Fill picker.
 */
export class ColorPicker {
  private picker: FillPicker;

  constructor(
    container: HTMLElement,
    initialColor: string,
    onChange: (color: string) => void
  ) {
    this.picker = new FillPicker(
      container,
      { type: 'color', color: initialColor || '#000000' },
      (fill) => {
        if (fill.type === 'color' && fill.color) onChange(fill.color);
      },
      { allowedTabs: ['color'] }
    );
  }

  setColor(color: string): void {
    this.picker.setFill({ type: 'color', color: color || '#000000' });
  }

  destroy(): void {
    this.picker.destroy();
  }
}

/**
 * Factory for the color-only wrapper.
 */
export function createColorPicker(
  container: HTMLElement,
  initialColor: string,
  onChange: (color: string) => void
): ColorPicker {
  return new ColorPicker(container, initialColor, onChange);
}
