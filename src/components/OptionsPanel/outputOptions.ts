/**
 * OptionsPanel Output Options Module
 * Handles output-related options (sheet size, booklet size, pages per signature)
 */

import { appState } from '../../services/state';
import type { OutputOptions } from '../../types';
import { getOrientedSheetSize, UNIT_CONVERSIONS } from '../../types';
import { bindSelect, bindCheckbox, type DebounceCallback } from './helpers';
import { downloadBlankPage, downloadBlankSpread } from '../../services/pageExport';

/**
 * Set up output options event handlers
 */
export function setupOutputOptions(debounce: (fn: DebounceCallback) => void): void {
  // Sheet size
  bindSelect('opt-sheet-size', (value) => {
    appState.updateOutputOptions({ sheetSize: value as OutputOptions['sheetSize'] });
    updateFillSpaceVisibility();
  }, debounce);

  // Orientation
  bindSelect('opt-orientation', (value) => {
    appState.updateOutputOptions({ orientation: value as OutputOptions['orientation'] });
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

  // Custom dimensions - convert from display unit to points
  const widthInput = document.getElementById('opt-custom-width') as HTMLInputElement;
  if (widthInput) {
    widthInput.addEventListener('input', () => {
      const displayValue = parseFloat(widthInput.value);
      if (isNaN(displayValue)) return;
      const unit = appState.getMeasurementUnit();
      const conv = UNIT_CONVERSIONS[unit];
      const pointsValue = displayValue / conv.factor;
      debounce(() => {
        appState.updateOutputOptions({ customWidth: pointsValue });
      });
    });
  }

  const heightInput = document.getElementById('opt-custom-height') as HTMLInputElement;
  if (heightInput) {
    heightInput.addEventListener('input', () => {
      const displayValue = parseFloat(heightInput.value);
      if (isNaN(displayValue)) return;
      const unit = appState.getMeasurementUnit();
      const conv = UNIT_CONVERSIONS[unit];
      const pointsValue = displayValue / conv.factor;
      debounce(() => {
        appState.updateOutputOptions({ customHeight: pointsValue });
        updateFillSpaceVisibility();
      });
    });
  }

  // Fill available space
  bindCheckbox('opt-fill-space', (checked) => {
    appState.updateOutputOptions({ fillAvailableSpace: checked });
  });

  // Show fold marks
  bindCheckbox('opt-fold-marks', (checked) => {
    appState.updateOutputOptions({ showFoldMarks: checked });
  });

  // Pages per signature
  bindSelect('opt-pages-per-sig', (value) => {
    appState.updateOutputOptions({ pagesPerSignature: parseInt(value) as OutputOptions['pagesPerSignature'] });
  }, debounce);

  // Creep compensation
  const creepEnabledCheckbox = document.getElementById('opt-creep-enabled') as HTMLInputElement;
  const creepSettings = document.getElementById('creep-settings');
  if (creepEnabledCheckbox) {
    creepEnabledCheckbox.addEventListener('change', () => {
      appState.updateOutputOptions({ creepEnabled: creepEnabledCheckbox.checked });
      if (creepSettings) {
        creepSettings.style.display = creepEnabledCheckbox.checked ? 'block' : 'none';
      }
    });
  }

  // Creep per sheet - convert from inches to points
  const creepInput = document.getElementById('opt-creep-per-sheet') as HTMLInputElement;
  if (creepInput) {
    creepInput.addEventListener('input', () => {
      const inchValue = parseFloat(creepInput.value);
      if (isNaN(inchValue)) return;
      // Convert inches to points (1 inch = 72 points)
      const pointsValue = inchValue * 72;
      debounce(() => {
        appState.updateOutputOptions({ creepPerSheet: pointsValue });
      });
    });
  }

  // Download blank page
  document.getElementById('btn-download-blank-page')?.addEventListener('click', () => {
    downloadBlankPage();
  });

  // Download blank spread
  document.getElementById('btn-download-blank-spread')?.addEventListener('click', () => {
    downloadBlankSpread();
  });
}

/**
 * Calculate the page height for the current booklet size
 */
export function getPageHeight(): number {
  const project = appState.getProject();
  const sheetSize = getOrientedSheetSize(
    project.outputOptions.sheetSize,
    project.outputOptions.orientation
  );

  switch (project.outputOptions.bookletSize) {
    case 'custom':
      return project.outputOptions.customHeight || sheetSize.height;
    case 'half':
      return sheetSize.height;
    case 'quarter':
      return sheetSize.height / 2;
    case 'eighth':
      return sheetSize.height / 4;
    case 'sixteenth':
      return sheetSize.height / 8;
    default:
      return sheetSize.height;
  }
}

/**
 * Update the visibility of the fill space option based on whether it's applicable
 */
export function updateFillSpaceVisibility(): void {
  const project = appState.getProject();
  const sheetSize = getOrientedSheetSize(
    project.outputOptions.sheetSize,
    project.outputOptions.orientation
  );
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
