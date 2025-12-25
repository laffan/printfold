/**
 * OptionsPanel Component
 * Main component that orchestrates all options panel functionality
 */

import { appState } from '../../services/state';
import { FontDropdown } from '../FontDropdown';
import {
  createDebouncer,
  setSelectValue,
  setInputValue,
  setCheckboxValue,
  setColorValue,
  setMarginInputValue,
  updateMarginInputs,
  setupDraggableCaps,
  updateInputCapLabels,
} from './helpers';
import { convertFromPoints, UNIT_CONVERSIONS, type MarginUnit } from '../../types';
import { setupOutputOptions, updateFillSpaceVisibility } from './outputOptions';
import { setupLayoutOptions } from './layoutOptions';
import { setupHeaderFooterOptions } from './headerFooterOptions';
import { initFontDropdowns, setupFontOptions, preloadFonts } from './fontOptions';
import { setupSelectedPagePanel, updateSelectedPagePanel } from './selectedPage';
import { setupEditPagePanel, updateEditPagePanel, updateEditSelectedSection, setupMultiSelectControls } from './editPage';
import { updateStylesTab } from './stylesTab';

export class OptionsPanel {
  private fontDropdowns: Map<string, FontDropdown> = new Map();
  private debouncer = createDebouncer();

  mount(): void {
    const { debounce } = this.debouncer;

    setupOutputOptions(debounce);
    setupLayoutOptions(debounce);
    setupHeaderFooterOptions(debounce);
    setupFontOptions(debounce);
    setupSelectedPagePanel();
    setupEditPagePanel(updateEditSelectedSection);
    setupMultiSelectControls();
    initFontDropdowns(this.fontDropdowns);
    this.setupMeasurementUnit();
    setupDraggableCaps();
    this.syncFromState();
    updateStylesTab();

    // Listen for state changes to update UI
    appState.onProjectChange(() => {
      this.syncFromState();
      updateSelectedPagePanel();
      updateEditSelectedSection();
      updateStylesTab();
    });

    // Listen for editor state changes (selected page, selected items)
    appState.onEditorChange((state, prevState) => {
      if (state.selectedPageNumber !== prevState.selectedPageNumber ||
          state.selectedPagePosition !== prevState.selectedPagePosition) {
        updateSelectedPagePanel();
        updateEditPagePanel();
        updateEditSelectedSection();
      }
      // Update when selected items change
      const idsChanged = state.selectedItemIds.length !== prevState.selectedItemIds.length ||
        state.selectedItemIds.some((id, i) => id !== prevState.selectedItemIds[i]);
      if (idsChanged || state.selectedItemId !== prevState.selectedItemId) {
        updateEditSelectedSection();
      }
    });

    // Start preloading fonts
    preloadFonts();
  }

  private setupMeasurementUnit(): void {
    const unitSelect = document.getElementById('opt-measurement-unit') as HTMLSelectElement;
    if (unitSelect) {
      unitSelect.addEventListener('change', () => {
        const unit = unitSelect.value as MarginUnit;
        appState.setMeasurementUnit(unit);
        updateMarginInputs();
        updateInputCapLabels();
        this.updateCustomSizeInputs();
      });
    }
  }

  private updateCustomSizeInputs(): void {
    const project = appState.getProject();
    const unit = appState.getMeasurementUnit();
    const conv = UNIT_CONVERSIONS[unit];

    // Update custom width/height values
    const widthInput = document.getElementById('opt-custom-width') as HTMLInputElement;
    const heightInput = document.getElementById('opt-custom-height') as HTMLInputElement;
    const widthUnit = document.getElementById('custom-width-unit');
    const heightUnit = document.getElementById('custom-height-unit');

    if (project.outputOptions.customWidth && widthInput) {
      const displayValue = convertFromPoints(project.outputOptions.customWidth, unit);
      widthInput.value = displayValue.toString();
    }
    if (project.outputOptions.customHeight && heightInput) {
      const displayValue = convertFromPoints(project.outputOptions.customHeight, unit);
      heightInput.value = displayValue.toString();
    }

    // Update unit labels
    if (widthUnit) widthUnit.textContent = conv.label;
    if (heightUnit) heightUnit.textContent = conv.label;
  }

  private syncFromState(): void {
    const project = appState.getProject();
    const unit = appState.getMeasurementUnit();

    // Measurement unit in Info panel
    setSelectValue('opt-measurement-unit', unit);

    // Output options
    setSelectValue('opt-sheet-size', project.outputOptions.sheetSize);
    setSelectValue('opt-booklet-size', project.outputOptions.bookletSize);
    setSelectValue('opt-pages-per-sig', project.outputOptions.pagesPerSignature.toString());

    // Show/hide custom size
    document.getElementById('custom-size-group')!.style.display =
      project.outputOptions.bookletSize === 'custom' ? 'block' : 'none';

    // Update custom size inputs with unit conversion
    this.updateCustomSizeInputs();

    // Fill available space
    setCheckboxValue('opt-fill-space', project.outputOptions.fillAvailableSpace);
    updateFillSpaceVisibility();

    // Creep compensation
    setCheckboxValue('opt-creep-enabled', project.outputOptions.creepEnabled ?? false);
    const creepSettings = document.getElementById('creep-settings');
    if (creepSettings) {
      creepSettings.style.display = project.outputOptions.creepEnabled ? 'block' : 'none';
    }
    // Convert points back to inches for display
    const creepPerSheetInches = (project.outputOptions.creepPerSheet ?? (0.0625 * 72)) / 72;
    setInputValue('opt-creep-per-sheet', creepPerSheetInches.toFixed(4));

    // Layout options - margins are converted to display unit
    setMarginInputValue('opt-margin-top', project.layoutOptions.margins.top, unit);
    setMarginInputValue('opt-margin-bottom', project.layoutOptions.margins.bottom, unit);
    setMarginInputValue('opt-margin-inner', project.layoutOptions.margins.inner, unit);
    setMarginInputValue('opt-margin-outer', project.layoutOptions.margins.outer, unit);
    setCheckboxValue('opt-empty-before-h1', project.layoutOptions.emptyPageBeforeH1);
    setInputValue('opt-spacing-h1', project.layoutOptions.spacingAboveH1.toString());
    setInputValue('opt-line-height', project.layoutOptions.lineHeight.toString());
    setInputValue('opt-paragraph-spacing', project.layoutOptions.paragraphSpacing.toString());

    // Header/footer options
    setCheckboxValue('opt-header-enabled', project.headerFooter.header.enabled);
    document.getElementById('header-options')!.style.display =
      project.headerFooter.header.enabled ? 'block' : 'none';

    setCheckboxValue('opt-footer-enabled', project.headerFooter.footer.enabled);
    document.getElementById('footer-options')!.style.display =
      project.headerFooter.footer.enabled ? 'block' : 'none';

    setInputValue('opt-footer-verso-left', project.headerFooter.footer.verso.left);
    setInputValue('opt-footer-verso-center', project.headerFooter.footer.verso.center);
    setInputValue('opt-footer-verso-right', project.headerFooter.footer.verso.right);
    setInputValue('opt-footer-recto-left', project.headerFooter.footer.recto.left);
    setInputValue('opt-footer-recto-center', project.headerFooter.footer.recto.center);
    setInputValue('opt-footer-recto-right', project.headerFooter.footer.recto.right);

    // Font options (font families use custom dropdowns)
    this.fontDropdowns.get('opt-font-body')?.setValue(project.fontOptions.body.fontFamily);
    setInputValue('opt-font-size-body', project.fontOptions.body.fontSize.toString());
    setColorValue('opt-color-body', project.fontOptions.body.color);
    setInputValue('opt-line-height-fonts', project.layoutOptions.lineHeight.toString());
    setCheckboxValue('opt-justify', project.layoutOptions.textAlign === 'justify');

    this.fontDropdowns.get('opt-font-h1')?.setValue(project.fontOptions.h1.fontFamily);
    setInputValue('opt-font-size-h1', project.fontOptions.h1.fontSize.toString());
    setInputValue('opt-font-size-h2', project.fontOptions.h2.fontSize.toString());
    setInputValue('opt-font-size-h3', project.fontOptions.h3.fontSize.toString());
    setColorValue('opt-color-headings', project.fontOptions.h1.color);

    // Header/footer font options (font families use custom dropdowns)
    this.fontDropdowns.get('opt-header-font')?.setValue(project.headerFooter.header.font.fontFamily);
    setInputValue('opt-header-font-size', project.headerFooter.header.font.fontSize.toString());
    setColorValue('opt-header-color', project.headerFooter.header.font.color);
    this.fontDropdowns.get('opt-footer-font')?.setValue(project.headerFooter.footer.font.fontFamily);
    setInputValue('opt-footer-font-size', project.headerFooter.footer.font.fontSize.toString());
    setColorValue('opt-footer-color', project.headerFooter.footer.font.color);

    // Update input cap labels to reflect current unit
    updateInputCapLabels();
  }
}
