/**
 * OptionsPanel Output Options Module
 * Handles output-related options (sheet size, booklet size, pages per signature)
 */

import { appState } from '../../services/state';
import type { OutputOptions } from '../../types';
import { SHEET_SIZES } from '../../types';
import { bindSelect, bindNumberInput, bindCheckbox, type DebounceCallback } from './helpers';

/**
 * Set up output options event handlers
 */
export function setupOutputOptions(debounce: (fn: DebounceCallback) => void): void {
  // Sheet size
  bindSelect('opt-sheet-size', (value) => {
    appState.updateOutputOptions({ sheetSize: value as OutputOptions['sheetSize'] });
    updateFillSpaceVisibility();
  }, debounce);

  // Booklet size
  bindSelect('opt-booklet-size', (value) => {
    appState.updateOutputOptions({ bookletSize: value as OutputOptions['bookletSize'] });

    // Show/hide custom size inputs
    const customGroup = document.getElementById('custom-size-group')!;
    customGroup.style.display = value === 'custom' ? 'block' : 'none';

    updateFillSpaceVisibility();
  }, debounce);

  // Custom dimensions
  bindNumberInput('opt-custom-width', (value) => {
    appState.updateOutputOptions({ customWidth: value });
  }, debounce);

  bindNumberInput('opt-custom-height', (value) => {
    appState.updateOutputOptions({ customHeight: value });
    updateFillSpaceVisibility();
  }, debounce);

  // Fill available space
  bindCheckbox('opt-fill-space', (checked) => {
    appState.updateOutputOptions({ fillAvailableSpace: checked });
  });

  // Pages per signature
  bindSelect('opt-pages-per-sig', (value) => {
    appState.updateOutputOptions({ pagesPerSignature: parseInt(value) as OutputOptions['pagesPerSignature'] });
  }, debounce);
}

/**
 * Calculate the page height for the current booklet size
 */
export function getPageHeight(): number {
  const project = appState.getProject();
  const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];

  if (project.outputOptions.bookletSize === 'custom') {
    return project.outputOptions.customHeight || sheetSize.height;
  } else if (project.outputOptions.bookletSize.startsWith('quarter-')) {
    return sheetSize.height / 2;
  } else {
    return sheetSize.height;
  }
}

/**
 * Update the visibility of the fill space option based on whether it's applicable
 */
export function updateFillSpaceVisibility(): void {
  const project = appState.getProject();
  const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];
  const pageHeight = getPageHeight();

  // Calculate how many rows could fit
  const maxRows = Math.floor(sheetSize.height / pageHeight);
  const fillSpaceGroup = document.getElementById('fill-space-group');
  const fillSpaceHint = document.getElementById('fill-space-hint');

  if (fillSpaceGroup) {
    // Show option if at least 2 rows can fit
    if (maxRows >= 2) {
      fillSpaceGroup.style.display = 'block';
      if (fillSpaceHint) {
        fillSpaceHint.textContent = `Print ${maxRows} rows per sheet, then cut`;
      }
    } else {
      fillSpaceGroup.style.display = 'none';
      // Disable fill space if it was enabled but no longer applicable
      if (project.outputOptions.fillAvailableSpace) {
        appState.updateOutputOptions({ fillAvailableSpace: false });
      }
    }
  }
}
