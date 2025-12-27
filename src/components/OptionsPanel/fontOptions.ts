/**
 * OptionsPanel Font Options Module
 * Handles font configuration (body, headings)
 */

import { appState } from '../../services/state';
import { googleFonts } from '../../services/googleFonts';
import { FontDropdown, createFontDropdown } from '../FontDropdown';
import { bindNumberInput, bindColorInput, bindCheckbox, type DebounceCallback } from './helpers';

/**
 * Initialize custom font dropdowns
 */
export function initFontDropdowns(fontDropdowns: Map<string, FontDropdown>): void {
  // Body font dropdown
  const bodyDropdown = createFontDropdown('opt-font-body', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      body: { ...fonts.body, fontFamily: value },
    });
  });
  if (bodyDropdown) fontDropdowns.set('opt-font-body', bodyDropdown);

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
  if (headingDropdown) fontDropdowns.set('opt-font-h1', headingDropdown);

  // Header/footer font dropdowns are now in the Styles tab (dynamically created)
}

/**
 * Set up font options event handlers
 */
export function setupFontOptions(debounce: (fn: DebounceCallback) => void): void {
  // Body font family handled by custom dropdown

  // Body size
  bindNumberInput('opt-font-size-body', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      body: { ...fonts.body, fontSize: value },
    });
  }, debounce);

  // Body color
  bindColorInput('opt-color-body', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      body: { ...fonts.body, color: value },
    });
  }, debounce);

  // Line height (in fonts section)
  bindNumberInput('opt-line-height-fonts', (value) => {
    appState.updateLayoutOptions({ lineHeight: value });
  }, debounce);

  // Justify
  bindCheckbox('opt-justify', (checked) => {
    appState.updateLayoutOptions({ textAlign: checked ? 'justify' : 'left' });
  });

  // Heading font family handled by custom dropdown

  // H1 size
  bindNumberInput('opt-font-size-h1', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      h1: { ...fonts.h1, fontSize: value },
    });
  }, debounce);

  // H2 size
  bindNumberInput('opt-font-size-h2', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      h2: { ...fonts.h2, fontSize: value },
    });
  }, debounce);

  // H3 size
  bindNumberInput('opt-font-size-h3', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      h3: { ...fonts.h3, fontSize: value },
    });
  }, debounce);

  // Heading color
  bindColorInput('opt-color-headings', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      h1: { ...fonts.h1, color: value },
      h2: { ...fonts.h2, color: value },
      h3: { ...fonts.h3, color: value },
      h4: { ...fonts.h4, color: value },
      h5: { ...fonts.h5, color: value },
      h6: { ...fonts.h6, color: value },
    });
  }, debounce);
}

/**
 * Start preloading fonts
 */
export function preloadFonts(): void {
  googleFonts.preloadAllFonts();
}
