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

  // Paragraph spacing
  bindNumberInput('opt-paragraph-spacing', (value) => {
    appState.updateLayoutOptions({ paragraphSpacing: value });
  }, debounce);

  // Show footnotes as endnotes
  bindCheckbox('opt-show-endnotes', (checked) => {
    appState.updateLayoutOptions({ showFootnotesAsEndnotes: checked });
    const sub = document.getElementById('endnote-placement-options');
    if (sub) sub.style.display = checked ? 'block' : 'none';
  });

  // Endnote placement (radio group)
  const placementRadios = document.querySelectorAll<HTMLInputElement>(
    'input[name="opt-endnote-placement"]'
  );
  placementRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      const value = radio.value as 'document' | 'chapter';
      appState.updateLayoutOptions({ endnotePlacement: value });
    });
  });

  // Note: Line Height is now controlled per-element in the Styles tab
}
