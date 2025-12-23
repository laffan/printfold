/**
 * OptionsPanel Component
 * Handles all output, layout, header/footer, and font options
 */

import { appState } from '../services/state';
import type { OutputOptions, LayoutOptions, FontOptions, HeaderFooterOptions } from '../types';

export class OptionsPanel {
  private updateTimeout: number | null = null;

  mount(): void {
    this.setupOutputOptions();
    this.setupLayoutOptions();
    this.setupHeaderFooterOptions();
    this.setupFontOptions();
    this.syncFromState();

    // Listen for state changes to update UI
    appState.onProjectChange(() => {
      this.syncFromState();
    });
  }

  private setupOutputOptions(): void {
    // Sheet size
    this.bindSelect('opt-sheet-size', (value) => {
      appState.updateOutputOptions({ sheetSize: value as OutputOptions['sheetSize'] });
    });

    // Booklet size
    this.bindSelect('opt-booklet-size', (value) => {
      appState.updateOutputOptions({ bookletSize: value as OutputOptions['bookletSize'] });

      // Show/hide custom size inputs
      const customGroup = document.getElementById('custom-size-group')!;
      customGroup.style.display = value === 'custom' ? 'block' : 'none';
    });

    // Custom dimensions
    this.bindNumberInput('opt-custom-width', (value) => {
      appState.updateOutputOptions({ customWidth: value });
    });

    this.bindNumberInput('opt-custom-height', (value) => {
      appState.updateOutputOptions({ customHeight: value });
    });

    // Pages per signature
    this.bindSelect('opt-pages-per-sig', (value) => {
      appState.updateOutputOptions({ pagesPerSignature: parseInt(value) as OutputOptions['pagesPerSignature'] });
    });
  }

  private setupLayoutOptions(): void {
    // Margins
    this.bindNumberInput('opt-margin-top', (value) => {
      const margins = { ...appState.getProject().layoutOptions.margins, top: value };
      appState.updateLayoutOptions({ margins });
    });

    this.bindNumberInput('opt-margin-bottom', (value) => {
      const margins = { ...appState.getProject().layoutOptions.margins, bottom: value };
      appState.updateLayoutOptions({ margins });
    });

    this.bindNumberInput('opt-margin-inner', (value) => {
      const margins = { ...appState.getProject().layoutOptions.margins, inner: value };
      appState.updateLayoutOptions({ margins });
    });

    this.bindNumberInput('opt-margin-outer', (value) => {
      const margins = { ...appState.getProject().layoutOptions.margins, outer: value };
      appState.updateLayoutOptions({ margins });
    });

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
  }

  private setupFontOptions(): void {
    // Body font
    this.bindSelect('opt-font-body', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        body: { ...fonts.body, fontFamily: value },
      });
    });

    // Body size
    this.bindNumberInput('opt-font-size-body', (value) => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        body: { ...fonts.body, fontSize: value },
      });
    });

    // Heading font
    this.bindSelect('opt-font-h1', (value) => {
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

  private debounceUpdate(fn: () => void): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = window.setTimeout(fn, 150);
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

    // Layout options
    this.setInputValue('opt-margin-top', project.layoutOptions.margins.top.toString());
    this.setInputValue('opt-margin-bottom', project.layoutOptions.margins.bottom.toString());
    this.setInputValue('opt-margin-inner', project.layoutOptions.margins.inner.toString());
    this.setInputValue('opt-margin-outer', project.layoutOptions.margins.outer.toString());
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

    // Font options
    this.setSelectValue('opt-font-body', project.fontOptions.body.fontFamily);
    this.setInputValue('opt-font-size-body', project.fontOptions.body.fontSize.toString());
    this.setSelectValue('opt-font-h1', project.fontOptions.h1.fontFamily);
    this.setInputValue('opt-font-size-h1', project.fontOptions.h1.fontSize.toString());
    this.setInputValue('opt-font-size-h2', project.fontOptions.h2.fontSize.toString());
    this.setInputValue('opt-font-size-h3', project.fontOptions.h3.fontSize.toString());
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
