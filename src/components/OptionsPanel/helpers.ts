/**
 * OptionsPanel Helpers Module
 * Helper functions for binding inputs and state sync
 */

import { appState } from '../../services/state';
import type { MarginUnit } from '../../types';
import { convertFromPoints, UNIT_CONVERSIONS } from '../../types';

export type DebounceCallback = () => void;

/**
 * Create a debounced update function
 */
export function createDebouncer(): {
  debounce: (fn: DebounceCallback) => void;
} {
  let updateTimeout: number | null = null;

  return {
    debounce: (fn: DebounceCallback) => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      updateTimeout = window.setTimeout(fn, 150);
    },
  };
}

/**
 * Bind a select element to a callback
 */
export function bindSelect(id: string, onChange: (value: string) => void, debounce: (fn: DebounceCallback) => void): void {
  const element = document.getElementById(id) as HTMLSelectElement;
  if (!element) return;

  element.addEventListener('change', () => {
    debounce(() => onChange(element.value));
  });
}

/**
 * Bind a number input to a callback
 */
export function bindNumberInput(id: string, onChange: (value: number) => void, debounce: (fn: DebounceCallback) => void): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (!element) return;

  element.addEventListener('input', () => {
    const value = parseFloat(element.value);
    if (!isNaN(value)) {
      debounce(() => onChange(value));
    }
  });
}

/**
 * Bind a text input to a callback
 */
export function bindTextInput(id: string, onChange: (value: string) => void, debounce: (fn: DebounceCallback) => void): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (!element) return;

  element.addEventListener('input', () => {
    debounce(() => onChange(element.value));
  });
}

/**
 * Bind a checkbox to a callback
 */
export function bindCheckbox(id: string, onChange: (checked: boolean) => void): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (!element) return;

  element.addEventListener('change', () => {
    onChange(element.checked);
  });
}

/**
 * Bind a color input to a callback
 */
export function bindColorInput(id: string, onChange: (value: string) => void, debounce: (fn: DebounceCallback) => void): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (!element) return;

  element.addEventListener('input', () => {
    debounce(() => onChange(element.value));
  });
}

/**
 * Bind a margin input with unit conversion
 */
export function bindMarginInput(id: string, marginKey: 'top' | 'bottom' | 'inner' | 'outer', debounce: (fn: DebounceCallback) => void): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (!element) return;

  element.addEventListener('input', () => {
    const displayValue = parseFloat(element.value);
    if (isNaN(displayValue)) return;

    // Convert from display unit to points
    const unit = appState.getEditor().marginUnit;
    const conv = UNIT_CONVERSIONS[unit];
    const pointsValue = displayValue / conv.factor;

    debounce(() => {
      const margins = { ...appState.getProject().layoutOptions.margins, [marginKey]: pointsValue };
      appState.updateLayoutOptions({ margins });
    });
  });
}

/**
 * Set a select element value
 */
export function setSelectValue(id: string, value: string): void {
  const element = document.getElementById(id) as HTMLSelectElement;
  if (element && element.value !== value) {
    element.value = value;
  }
}

/**
 * Set an input element value
 */
export function setInputValue(id: string, value: string): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (element && element.value !== value) {
    element.value = value;
  }
}

/**
 * Set a checkbox value
 */
export function setCheckboxValue(id: string, checked: boolean): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (element && element.checked !== checked) {
    element.checked = checked;
  }
}

/**
 * Set a color input value
 */
export function setColorValue(id: string, value: string): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (element && element.value !== value) {
    element.value = value;
  }
}

/**
 * Set a margin input value converted to the specified unit
 */
export function setMarginInputValue(id: string, pointsValue: number, unit: MarginUnit): void {
  const element = document.getElementById(id) as HTMLInputElement;
  if (!element) return;

  const displayValue = convertFromPoints(pointsValue, unit);
  element.value = displayValue.toString();
}

/**
 * Update all margin inputs to reflect the current unit
 */
export function updateMarginInputs(): void {
  const project = appState.getProject();
  const unit = appState.getEditor().marginUnit;

  setMarginInputValue('opt-margin-top', project.layoutOptions.margins.top, unit);
  setMarginInputValue('opt-margin-bottom', project.layoutOptions.margins.bottom, unit);
  setMarginInputValue('opt-margin-inner', project.layoutOptions.margins.inner, unit);
  setMarginInputValue('opt-margin-outer', project.layoutOptions.margins.outer, unit);
}
