/**
 * OptionsPanel Component
 * Handles all output, layout, header/footer, and font options
 */

import { appState } from '../services/state';
import { googleFonts } from '../services/googleFonts';
import { FontDropdown, createFontDropdown } from './FontDropdown';
import type { OutputOptions, LayoutOptions, FontOptions, HeaderFooterOptions, MarginUnit } from '../types';
import { convertFromPoints, UNIT_CONVERSIONS, SHEET_SIZES, calculateSpreadRowsPerSheet } from '../types';

export class OptionsPanel {
  private updateTimeout: number | null = null;
  private fontDropdowns: Map<string, FontDropdown> = new Map();

  mount(): void {
    this.setupOutputOptions();
    this.setupLayoutOptions();
    this.setupHeaderFooterOptions();
    this.setupFontOptions();
    this.setupSelectedPagePanel();
    this.initFontDropdowns();
    this.syncFromState();

    // Listen for state changes to update UI
    appState.onProjectChange(() => {
      this.syncFromState();
      this.updateSelectedPagePanel();
    });

    // Listen for editor state changes (selected page)
    appState.onEditorChange((state, prevState) => {
      if (state.selectedPageNumber !== prevState.selectedPageNumber ||
          state.selectedPagePosition !== prevState.selectedPagePosition) {
        this.updateSelectedPagePanel();
      }
    });

    // Start preloading fonts
    googleFonts.preloadAllFonts();
  }

  /**
   * Initialize custom font dropdowns
   */
  private initFontDropdowns(): void {
    // Body font dropdown
    const bodyDropdown = createFontDropdown('opt-font-body', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        body: { ...fonts.body, fontFamily: value },
      });
    });
    if (bodyDropdown) this.fontDropdowns.set('opt-font-body', bodyDropdown);

    // Heading font dropdown
    const headingDropdown = createFontDropdown('opt-font-h1', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        h1: { ...fonts.h1, fontFamily: value },
        h2: { ...fonts.h2, fontFamily: value },
        h3: { ...fonts.h3, fontFamily: value },
        h4: { ...fonts.h4, fontFamily: value },
        h5: { ...fonts.h5, fontFamily: value },
        h6: { ...fonts.h6, fontFamily: value },
      });
    });
    if (headingDropdown) this.fontDropdowns.set('opt-font-h1', headingDropdown);

    // Header font dropdown
    const headerDropdown = createFontDropdown('opt-header-font', (value) => {
      const header = appState.getProject().headerFooter.header;
      appState.updateHeaderFooter({
        header: { ...header, font: { ...header.font, fontFamily: value } },
      });
    });
    if (headerDropdown) this.fontDropdowns.set('opt-header-font', headerDropdown);

    // Footer font dropdown
    const footerDropdown = createFontDropdown('opt-footer-font', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, font: { ...footer.font, fontFamily: value } },
      });
    });
    if (footerDropdown) this.fontDropdowns.set('opt-footer-font', footerDropdown);
  }

  private setupOutputOptions(): void {
    // Sheet size
    this.bindSelect('opt-sheet-size', (value) => {
      appState.updateOutputOptions({ sheetSize: value as OutputOptions['sheetSize'] });
      this.updateFillSpaceVisibility();
    });

    // Booklet size
    this.bindSelect('opt-booklet-size', (value) => {
      appState.updateOutputOptions({ bookletSize: value as OutputOptions['bookletSize'] });

      // Show/hide custom size inputs
      const customGroup = document.getElementById('custom-size-group')!;
      customGroup.style.display = value === 'custom' ? 'block' : 'none';

      this.updateFillSpaceVisibility();
    });

    // Custom dimensions
    this.bindNumberInput('opt-custom-width', (value) => {
      appState.updateOutputOptions({ customWidth: value });
    });

    this.bindNumberInput('opt-custom-height', (value) => {
      appState.updateOutputOptions({ customHeight: value });
      this.updateFillSpaceVisibility();
    });

    // Fill available space
    this.bindCheckbox('opt-fill-space', (checked) => {
      appState.updateOutputOptions({ fillAvailableSpace: checked });
    });

    // Pages per signature
    this.bindSelect('opt-pages-per-sig', (value) => {
      appState.updateOutputOptions({ pagesPerSignature: parseInt(value) as OutputOptions['pagesPerSignature'] });
    });
  }

  /**
   * Calculate the page height for the current booklet size
   */
  private getPageHeight(): number {
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
  private updateFillSpaceVisibility(): void {
    const project = appState.getProject();
    const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];
    const pageHeight = this.getPageHeight();

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

  private setupLayoutOptions(): void {
    // Unit dropdown
    const unitSelect = document.getElementById('opt-margin-unit') as HTMLSelectElement;
    if (unitSelect) {
      unitSelect.value = appState.getEditor().marginUnit;
      unitSelect.addEventListener('change', () => {
        const unit = unitSelect.value as MarginUnit;
        appState.updateEditor({ marginUnit: unit });
        this.updateMarginInputs(); // Update displayed values
      });
    }

    // Margins - convert from display units to points when saving
    this.bindMarginInput('opt-margin-top', 'top');
    this.bindMarginInput('opt-margin-bottom', 'bottom');
    this.bindMarginInput('opt-margin-inner', 'inner');
    this.bindMarginInput('opt-margin-outer', 'outer');

    // Empty page before H1
    this.bindCheckbox('opt-empty-before-h1', (checked) => {
      appState.updateLayoutOptions({ emptyPageBeforeH1: checked });
    });

    // Spacing above H1
    this.bindNumberInput('opt-spacing-h1', (value) => {
      appState.updateLayoutOptions({ spacingAboveH1: value });
    });

    // Line height
    this.bindNumberInput('opt-line-height', (value) => {
      appState.updateLayoutOptions({ lineHeight: value });
    });

    // Paragraph spacing
    this.bindNumberInput('opt-paragraph-spacing', (value) => {
      appState.updateLayoutOptions({ paragraphSpacing: value });
    });
  }

  private setupHeaderFooterOptions(): void {
    // Header enabled
    this.bindCheckbox('opt-header-enabled', (checked) => {
      const header = { ...appState.getProject().headerFooter.header, enabled: checked };
      appState.updateHeaderFooter({ header });

      // Show/hide header options
      document.getElementById('header-options')!.style.display = checked ? 'block' : 'none';
    });

    // Header content
    this.bindTextInput('opt-header-left', (value) => {
      const headerFooter = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        header: {
          ...headerFooter.header,
          verso: { ...headerFooter.header.verso, left: value },
          recto: { ...headerFooter.header.recto, left: value },
        },
      });
    });

    this.bindTextInput('opt-header-center', (value) => {
      const headerFooter = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        header: {
          ...headerFooter.header,
          verso: { ...headerFooter.header.verso, center: value },
          recto: { ...headerFooter.header.recto, center: value },
        },
      });
    });

    this.bindTextInput('opt-header-right', (value) => {
      const headerFooter = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        header: {
          ...headerFooter.header,
          verso: { ...headerFooter.header.verso, right: value },
          recto: { ...headerFooter.header.recto, right: value },
        },
      });
    });

    // Footer enabled
    this.bindCheckbox('opt-footer-enabled', (checked) => {
      const footer = { ...appState.getProject().headerFooter.footer, enabled: checked };
      appState.updateHeaderFooter({ footer });

      // Show/hide footer options
      document.getElementById('footer-options')!.style.display = checked ? 'block' : 'none';
    });

    // Footer content (verso)
    this.bindTextInput('opt-footer-verso-left', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, verso: { ...footer.verso, left: value } },
      });
    });

    this.bindTextInput('opt-footer-verso-center', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, verso: { ...footer.verso, center: value } },
      });
    });

    this.bindTextInput('opt-footer-verso-right', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, verso: { ...footer.verso, right: value } },
      });
    });

    // Footer content (recto)
    this.bindTextInput('opt-footer-recto-left', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, recto: { ...footer.recto, left: value } },
      });
    });

    this.bindTextInput('opt-footer-recto-center', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, recto: { ...footer.recto, center: value } },
      });
    });

    this.bindTextInput('opt-footer-recto-right', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, recto: { ...footer.recto, right: value } },
      });
    });

    // Header font options (font family handled by custom dropdown)
    this.bindNumberInput('opt-header-font-size', (value) => {
      const header = appState.getProject().headerFooter.header;
      appState.updateHeaderFooter({
        header: { ...header, font: { ...header.font, fontSize: value } },
      });
    });

    this.bindColorInput('opt-header-color', (value) => {
      const header = appState.getProject().headerFooter.header;
      appState.updateHeaderFooter({
        header: { ...header, font: { ...header.font, color: value } },
      });
    });

    // Footer font options (font family handled by custom dropdown)
    this.bindNumberInput('opt-footer-font-size', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, font: { ...footer.font, fontSize: value } },
      });
    });

    this.bindColorInput('opt-footer-color', (value) => {
      const footer = appState.getProject().headerFooter.footer;
      appState.updateHeaderFooter({
        footer: { ...footer, font: { ...footer.font, color: value } },
      });
    });
  }

  private setupFontOptions(): void {
    // Body font family handled by custom dropdown

    // Body size
    this.bindNumberInput('opt-font-size-body', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        body: { ...fonts.body, fontSize: value },
      });
    });

    // Body color
    this.bindColorInput('opt-color-body', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        body: { ...fonts.body, color: value },
      });
    });

    // Line height (in fonts section)
    this.bindNumberInput('opt-line-height-fonts', (value) => {
      appState.updateLayoutOptions({ lineHeight: value });
    });

    // Justify
    this.bindCheckbox('opt-justify', (checked) => {
      appState.updateLayoutOptions({ textAlign: checked ? 'justify' : 'left' });
    });

    // Heading font family handled by custom dropdown

    // H1 size
    this.bindNumberInput('opt-font-size-h1', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        h1: { ...fonts.h1, fontSize: value },
      });
    });

    // H2 size
    this.bindNumberInput('opt-font-size-h2', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        h2: { ...fonts.h2, fontSize: value },
      });
    });

    // H3 size
    this.bindNumberInput('opt-font-size-h3', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        h3: { ...fonts.h3, fontSize: value },
      });
    });

    // Heading color
    this.bindColorInput('opt-color-headings', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        h1: { ...fonts.h1, color: value },
        h2: { ...fonts.h2, color: value },
        h3: { ...fonts.h3, color: value },
        h4: { ...fonts.h4, color: value },
        h5: { ...fonts.h5, color: value },
        h6: { ...fonts.h6, color: value },
      });
    });
  }

  private bindColorInput(id: string, onChange: (value: string) => void): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) return;

    element.addEventListener('input', () => {
      this.debounceUpdate(() => onChange(element.value));
    });
  }

  private bindSelect(id: string, onChange: (value: string) => void): void {
    const element = document.getElementById(id) as HTMLSelectElement;
    if (!element) return;

    element.addEventListener('change', () => {
      this.debounceUpdate(() => onChange(element.value));
    });
  }

  private bindNumberInput(id: string, onChange: (value: number) => void): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) return;

    element.addEventListener('input', () => {
      const value = parseFloat(element.value);
      if (!isNaN(value)) {
        this.debounceUpdate(() => onChange(value));
      }
    });
  }

  private bindTextInput(id: string, onChange: (value: string) => void): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) return;

    element.addEventListener('input', () => {
      this.debounceUpdate(() => onChange(element.value));
    });
  }

  private bindCheckbox(id: string, onChange: (checked: boolean) => void): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) return;

    element.addEventListener('change', () => {
      onChange(element.checked);
    });
  }

  /**
   * Bind a margin input with unit conversion
   */
  private bindMarginInput(id: string, marginKey: 'top' | 'bottom' | 'inner' | 'outer'): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) return;

    element.addEventListener('input', () => {
      const displayValue = parseFloat(element.value);
      if (isNaN(displayValue)) return;

      // Convert from display unit to points
      const unit = appState.getEditor().marginUnit;
      const conv = UNIT_CONVERSIONS[unit];
      const pointsValue = displayValue / conv.factor;

      this.debounceUpdate(() => {
        const margins = { ...appState.getProject().layoutOptions.margins, [marginKey]: pointsValue };
        appState.updateLayoutOptions({ margins });
      });
    });
  }

  /**
   * Update all margin inputs to reflect the current unit
   */
  private updateMarginInputs(): void {
    const project = appState.getProject();
    const unit = appState.getEditor().marginUnit;

    this.setMarginInputValue('opt-margin-top', project.layoutOptions.margins.top, unit);
    this.setMarginInputValue('opt-margin-bottom', project.layoutOptions.margins.bottom, unit);
    this.setMarginInputValue('opt-margin-inner', project.layoutOptions.margins.inner, unit);
    this.setMarginInputValue('opt-margin-outer', project.layoutOptions.margins.outer, unit);
  }

  /**
   * Set a margin input value converted to the specified unit
   */
  private setMarginInputValue(id: string, pointsValue: number, unit: MarginUnit): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (!element) return;

    const displayValue = convertFromPoints(pointsValue, unit);
    element.value = displayValue.toString();
  }

  private debounceUpdate(fn: () => void): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = window.setTimeout(fn, 150);
  }

  /**
   * Set up the selected page panel event handlers
   */
  private setupSelectedPagePanel(): void {
    // Delete page button (for blank/static pages)
    document.getElementById('btn-delete-page')?.addEventListener('click', () => {
      const editorState = appState.getEditor();
      if (editorState.selectedPageNumber !== null) {
        appState.removeBlankPage(editorState.selectedPageNumber);
        // Clear selection
        appState.updateEditor({ selectedPageNumber: null, selectedPagePosition: null });
      }
    });

    // Add blank page after button (for content pages)
    document.getElementById('btn-add-blank-after')?.addEventListener('click', () => {
      const editorState = appState.getEditor();
      if (editorState.selectedPageNumber !== null) {
        appState.addBlankPage(editorState.selectedPageNumber);
      }
    });
  }

  /**
   * Update the selected page panel based on current selection
   */
  private updateSelectedPagePanel(): void {
    const editorState = appState.getEditor();
    const project = appState.getProject();
    const panel = document.getElementById('selected-page-panel');

    if (!panel) return;

    // Hide panel if no page selected
    if (editorState.selectedPageNumber === null || editorState.selectedPagePosition === null) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';

    // Find the selected page
    let selectedPage = null;
    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        if (editorState.selectedPagePosition === 'verso' &&
            spread.verso?.pageNumber === editorState.selectedPageNumber) {
          selectedPage = spread.verso;
          break;
        }
        if (editorState.selectedPagePosition === 'recto' &&
            spread.recto?.pageNumber === editorState.selectedPageNumber) {
          selectedPage = spread.recto;
          break;
        }
      }
      if (selectedPage) break;
    }

    // Update info
    document.getElementById('selected-page-number')!.textContent =
      editorState.selectedPageNumber.toString();
    document.getElementById('selected-page-position')!.textContent =
      editorState.selectedPagePosition === 'verso' ? 'Left (verso)' : 'Right (recto)';

    // Determine page type and show appropriate actions
    const staticActions = document.getElementById('static-page-actions')!;
    const normalActions = document.getElementById('normal-page-actions')!;

    // Blank pages are considered "static" from user's perspective
    const isBlankOrStatic = selectedPage?.isBlank || selectedPage?.isStatic;

    if (isBlankOrStatic) {
      document.getElementById('selected-page-type')!.textContent = 'Blank';
      staticActions.style.display = 'flex';
      normalActions.style.display = 'none';
    } else {
      document.getElementById('selected-page-type')!.textContent = 'Content';
      staticActions.style.display = 'none';
      normalActions.style.display = 'flex';
    }
  }

  private syncFromState(): void {
    const project = appState.getProject();

    // Output options
    this.setSelectValue('opt-sheet-size', project.outputOptions.sheetSize);
    this.setSelectValue('opt-booklet-size', project.outputOptions.bookletSize);
    this.setInputValue('opt-custom-width', project.outputOptions.customWidth?.toString() || '');
    this.setInputValue('opt-custom-height', project.outputOptions.customHeight?.toString() || '');
    this.setSelectValue('opt-pages-per-sig', project.outputOptions.pagesPerSignature.toString());

    // Show/hide custom size
    document.getElementById('custom-size-group')!.style.display =
      project.outputOptions.bookletSize === 'custom' ? 'block' : 'none';

    // Fill available space
    this.setCheckboxValue('opt-fill-space', project.outputOptions.fillAvailableSpace);
    this.updateFillSpaceVisibility();

    // Layout options - margins are converted to display unit
    const unit = appState.getEditor().marginUnit;
    this.setSelectValue('opt-margin-unit', unit);
    this.setMarginInputValue('opt-margin-top', project.layoutOptions.margins.top, unit);
    this.setMarginInputValue('opt-margin-bottom', project.layoutOptions.margins.bottom, unit);
    this.setMarginInputValue('opt-margin-inner', project.layoutOptions.margins.inner, unit);
    this.setMarginInputValue('opt-margin-outer', project.layoutOptions.margins.outer, unit);
    this.setCheckboxValue('opt-empty-before-h1', project.layoutOptions.emptyPageBeforeH1);
    this.setInputValue('opt-spacing-h1', project.layoutOptions.spacingAboveH1.toString());
    this.setInputValue('opt-line-height', project.layoutOptions.lineHeight.toString());
    this.setInputValue('opt-paragraph-spacing', project.layoutOptions.paragraphSpacing.toString());

    // Header/footer options
    this.setCheckboxValue('opt-header-enabled', project.headerFooter.header.enabled);
    document.getElementById('header-options')!.style.display =
      project.headerFooter.header.enabled ? 'block' : 'none';

    this.setCheckboxValue('opt-footer-enabled', project.headerFooter.footer.enabled);
    document.getElementById('footer-options')!.style.display =
      project.headerFooter.footer.enabled ? 'block' : 'none';

    this.setInputValue('opt-footer-verso-left', project.headerFooter.footer.verso.left);
    this.setInputValue('opt-footer-verso-center', project.headerFooter.footer.verso.center);
    this.setInputValue('opt-footer-verso-right', project.headerFooter.footer.verso.right);
    this.setInputValue('opt-footer-recto-left', project.headerFooter.footer.recto.left);
    this.setInputValue('opt-footer-recto-center', project.headerFooter.footer.recto.center);
    this.setInputValue('opt-footer-recto-right', project.headerFooter.footer.recto.right);

    // Font options (font families use custom dropdowns)
    this.fontDropdowns.get('opt-font-body')?.setValue(project.fontOptions.body.fontFamily);
    this.setInputValue('opt-font-size-body', project.fontOptions.body.fontSize.toString());
    this.setColorValue('opt-color-body', project.fontOptions.body.color);
    this.setInputValue('opt-line-height-fonts', project.layoutOptions.lineHeight.toString());
    this.setCheckboxValue('opt-justify', project.layoutOptions.textAlign === 'justify');

    this.fontDropdowns.get('opt-font-h1')?.setValue(project.fontOptions.h1.fontFamily);
    this.setInputValue('opt-font-size-h1', project.fontOptions.h1.fontSize.toString());
    this.setInputValue('opt-font-size-h2', project.fontOptions.h2.fontSize.toString());
    this.setInputValue('opt-font-size-h3', project.fontOptions.h3.fontSize.toString());
    this.setColorValue('opt-color-headings', project.fontOptions.h1.color);

    // Header/footer font options (font families use custom dropdowns)
    this.fontDropdowns.get('opt-header-font')?.setValue(project.headerFooter.header.font.fontFamily);
    this.setInputValue('opt-header-font-size', project.headerFooter.header.font.fontSize.toString());
    this.setColorValue('opt-header-color', project.headerFooter.header.font.color);
    this.fontDropdowns.get('opt-footer-font')?.setValue(project.headerFooter.footer.font.fontFamily);
    this.setInputValue('opt-footer-font-size', project.headerFooter.footer.font.fontSize.toString());
    this.setColorValue('opt-footer-color', project.headerFooter.footer.font.color);
  }

  private setColorValue(id: string, value: string): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (element && element.value !== value) {
      element.value = value;
    }
  }

  private setSelectValue(id: string, value: string): void {
    const element = document.getElementById(id) as HTMLSelectElement;
    if (element && element.value !== value) {
      element.value = value;
    }
  }

  private setInputValue(id: string, value: string): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (element && element.value !== value) {
      element.value = value;
    }
  }

  private setCheckboxValue(id: string, checked: boolean): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (element && element.checked !== checked) {
      element.checked = checked;
    }
  }
}
