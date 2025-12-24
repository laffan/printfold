/**
 * OptionsPanel Layout Options Module
 * Handles layout-related options (margins, spacing, etc.)
 */

import { appState } from '../../services/state';
import type { MarginUnit } from '../../types';
import { bindNumberInput, bindCheckbox, bindMarginInput, updateMarginInputs, type DebounceCallback } from './helpers';

/**
 * Set up layout options event handlers
 */
export function setupLayoutOptions(debounce: (fn: DebounceCallback) => void): void {
  // Unit dropdown
  const unitSelect = document.getElementById('opt-margin-unit') as HTMLSelectElement;
  if (unitSelect) {
    unitSelect.value = appState.getEditor().marginUnit;
    unitSelect.addEventListener('change', () => {
      const unit = unitSelect.value as MarginUnit;
      appState.updateEditor({ marginUnit: unit });
      updateMarginInputs(); // Update displayed values
    });
  }

  // Margins - convert from display units to points when saving
  bindMarginInput('opt-margin-top', 'top', debounce);
  bindMarginInput('opt-margin-bottom', 'bottom', debounce);
  bindMarginInput('opt-margin-inner', 'inner', debounce);
  bindMarginInput('opt-margin-outer', 'outer', debounce);

  // Empty page before H1
  bindCheckbox('opt-empty-before-h1', (checked) => {
    appState.updateLayoutOptions({ emptyPageBeforeH1: checked });
  });

  // Spacing above H1
  bindNumberInput('opt-spacing-h1', (value) => {
    appState.updateLayoutOptions({ spacingAboveH1: value });
  }, debounce);

  // Line height
  bindNumberInput('opt-line-height', (value) => {
    appState.updateLayoutOptions({ lineHeight: value });
  }, debounce);

  // Paragraph spacing
  bindNumberInput('opt-paragraph-spacing', (value) => {
    appState.updateLayoutOptions({ paragraphSpacing: value });
  }, debounce);
}
