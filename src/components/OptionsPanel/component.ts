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
} from './helpers';
import { setupOutputOptions, updateFillSpaceVisibility } from './outputOptions';
import { setupLayoutOptions } from './layoutOptions';
import { setupHeaderFooterOptions } from './headerFooterOptions';
import { initFontDropdowns, setupFontOptions, preloadFonts } from './fontOptions';
import { setupSelectedPagePanel, updateSelectedPagePanel } from './selectedPage';
import { setupEditPagePanel, updateEditPagePanel, updateEditSelectedSection } from './editPage';

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
    initFontDropdowns(this.fontDropdowns);
    this.syncFromState();

    // Listen for state changes to update UI
    appState.onProjectChange(() => {
      this.syncFromState();
      updateSelectedPagePanel();
      updateEditSelectedSection();
    });

    // Listen for editor state changes (selected page, selected item)
    appState.onEditorChange((state, prevState) => {
      if (state.selectedPageNumber !== prevState.selectedPageNumber ||
          state.selectedPagePosition !== prevState.selectedPagePosition) {
        updateSelectedPagePanel();
        updateEditPagePanel();
      }
      if (state.selectedItemId !== prevState.selectedItemId) {
        updateEditSelectedSection();
      }
    });

    // Start preloading fonts
    preloadFonts();
  }

  private syncFromState(): void {
    const project = appState.getProject();

    // Output options
    setSelectValue('opt-sheet-size', project.outputOptions.sheetSize);
    setSelectValue('opt-booklet-size', project.outputOptions.bookletSize);
    setInputValue('opt-custom-width', project.outputOptions.customWidth?.toString() || '');
    setInputValue('opt-custom-height', project.outputOptions.customHeight?.toString() || '');
    setSelectValue('opt-pages-per-sig', project.outputOptions.pagesPerSignature.toString());

    // Show/hide custom size
    document.getElementById('custom-size-group')!.style.display =
      project.outputOptions.bookletSize === 'custom' ? 'block' : 'none';

    // Fill available space
    setCheckboxValue('opt-fill-space', project.outputOptions.fillAvailableSpace);
    updateFillSpaceVisibility();

    // Layout options - margins are converted to display unit
    const unit = appState.getEditor().marginUnit;
    setSelectValue('opt-margin-unit', unit);
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
  }
}
