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
    const unit = appState.getMeasurementUnit();
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
  const unit = appState.getMeasurementUnit();

  setMarginInputValue('opt-margin-top', project.layoutOptions.margins.top, unit);
  setMarginInputValue('opt-margin-bottom', project.layoutOptions.margins.bottom, unit);
  setMarginInputValue('opt-margin-inner', project.layoutOptions.margins.inner, unit);
  setMarginInputValue('opt-margin-outer', project.layoutOptions.margins.outer, unit);
}

/**
 * Set up draggable caps for all input-cap elements
 * Dragging left decreases the value, dragging right increases it
 */
export function setupDraggableCaps(): void {
  const caps = document.querySelectorAll('.input-cap');

  caps.forEach(cap => {
    const capElement = cap as HTMLElement;
    const inputId = capElement.dataset.for;
    if (!inputId) return;

    const input = document.getElementById(inputId) as HTMLInputElement;
    if (!input) return;

    let startX = 0;
    let startValue = 0;
    let isDragging = false;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startValue = parseFloat(input.value) || 0;
      capElement.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      // Sensitivity: 1 pixel = 0.01 units (adjust as needed)
      const step = parseFloat(input.step) || 0.1;
      const sensitivity = step * 2;
      const deltaValue = deltaX * sensitivity;
      let newValue = startValue + deltaValue;

      // Apply min/max constraints
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      if (!isNaN(min)) newValue = Math.max(min, newValue);
      if (!isNaN(max)) newValue = Math.min(max, newValue);

      // Round to step precision
      const precision = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
      newValue = parseFloat(newValue.toFixed(precision));

      input.value = newValue.toString();
      // Dispatch input event to trigger existing handlers
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const onMouseUp = () => {
      isDragging = false;
      capElement.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    capElement.addEventListener('mousedown', onMouseDown);
  });
}

/**
 * Update all input-cap labels to reflect the current unit
 */
export function updateInputCapLabels(): void {
  const unit = appState.getMeasurementUnit();
  const caps = document.querySelectorAll('.input-cap');

  caps.forEach(cap => {
    const capElement = cap as HTMLElement;
    capElement.textContent = unit;
  });
}
