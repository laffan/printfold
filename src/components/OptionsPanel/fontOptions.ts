/**
 * OptionsPanel Font Options Module
 * Handles font configuration (body, headings)
 */

import { appState } from '../../services/state';
import { fontService } from '../../services/fontService';
import { FontDropdown, createStylesFontDropdown } from '../FontDropdown';
import { bindNumberInput, bindColorInput, bindCheckbox, type DebounceCallback } from './helpers';

/**
 * Initialize custom font dropdowns - uses 'styles' mode for web-safe/system fonts
 */
export function initFontDropdowns(fontDropdowns: Map<string, FontDropdown>): void {
  // Body font dropdown - uses styles mode (web-safe for web, system fonts for Electron)
  const bodyDropdown = createStylesFontDropdown('opt-font-body', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      body: { ...fonts.body, fontFamily: value },
    });
  });
  if (bodyDropdown) fontDropdowns.set('opt-font-body', bodyDropdown);

  // Heading font dropdown - uses styles mode
  const headingDropdown = createStylesFontDropdown('opt-font-h1', (value) => {
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

  // Note: Line Height is now controlled per-element in the Styles tab

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
 * Start preloading Google fonts for static page items
 * (Styles use web-safe fonts that don't need preloading)
 */
export function preloadFonts(): void {
  fontService.preloadAllGoogleFonts();
}
