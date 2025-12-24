/**
 * OptionsPanel Header/Footer Options Module
 * Handles header and footer configuration
 */

import { appState } from '../../services/state';
import { bindTextInput, bindCheckbox, bindNumberInput, bindColorInput, type DebounceCallback } from './helpers';

/**
 * Set up header/footer options event handlers
 */
export function setupHeaderFooterOptions(debounce: (fn: DebounceCallback) => void): void {
  // Header enabled
  bindCheckbox('opt-header-enabled', (checked) => {
    const header = { ...appState.getProject().headerFooter.header, enabled: checked };
    appState.updateHeaderFooter({ header });

    // Show/hide header options
    document.getElementById('header-options')!.style.display = checked ? 'block' : 'none';
  });

  // Header content
  bindTextInput('opt-header-left', (value) => {
    const headerFooter = appState.getProject().headerFooter;
    appState.updateHeaderFooter({
      header: {
        ...headerFooter.header,
        verso: { ...headerFooter.header.verso, left: value },
        recto: { ...headerFooter.header.recto, left: value },
      },
    });
  }, debounce);

  bindTextInput('opt-header-center', (value) => {
    const headerFooter = appState.getProject().headerFooter;
    appState.updateHeaderFooter({
      header: {
        ...headerFooter.header,
        verso: { ...headerFooter.header.verso, center: value },
        recto: { ...headerFooter.header.recto, center: value },
      },
    });
  }, debounce);

  bindTextInput('opt-header-right', (value) => {
    const headerFooter = appState.getProject().headerFooter;
    appState.updateHeaderFooter({
      header: {
        ...headerFooter.header,
        verso: { ...headerFooter.header.verso, right: value },
        recto: { ...headerFooter.header.recto, right: value },
      },
    });
  }, debounce);

  // Footer enabled
  bindCheckbox('opt-footer-enabled', (checked) => {
    const footer = { ...appState.getProject().headerFooter.footer, enabled: checked };
    appState.updateHeaderFooter({ footer });

    // Show/hide footer options
    document.getElementById('footer-options')!.style.display = checked ? 'block' : 'none';
  });

  // Footer content (verso)
  bindTextInput('opt-footer-verso-left', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, verso: { ...footer.verso, left: value } },
    });
  }, debounce);

  bindTextInput('opt-footer-verso-center', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, verso: { ...footer.verso, center: value } },
    });
  }, debounce);

  bindTextInput('opt-footer-verso-right', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, verso: { ...footer.verso, right: value } },
    });
  }, debounce);

  // Footer content (recto)
  bindTextInput('opt-footer-recto-left', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, recto: { ...footer.recto, left: value } },
    });
  }, debounce);

  bindTextInput('opt-footer-recto-center', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, recto: { ...footer.recto, center: value } },
    });
  }, debounce);

  bindTextInput('opt-footer-recto-right', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, recto: { ...footer.recto, right: value } },
    });
  }, debounce);

  // Header font options (font family handled by custom dropdown)
  bindNumberInput('opt-header-font-size', (value) => {
    const header = appState.getProject().headerFooter.header;
    appState.updateHeaderFooter({
      header: { ...header, font: { ...header.font, fontSize: value } },
    });
  }, debounce);

  bindColorInput('opt-header-color', (value) => {
    const header = appState.getProject().headerFooter.header;
    appState.updateHeaderFooter({
      header: { ...header, font: { ...header.font, color: value } },
    });
  }, debounce);

  // Footer font options (font family handled by custom dropdown)
  bindNumberInput('opt-footer-font-size', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, font: { ...footer.font, fontSize: value } },
    });
  }, debounce);

  bindColorInput('opt-footer-color', (value) => {
    const footer = appState.getProject().headerFooter.footer;
    appState.updateHeaderFooter({
      footer: { ...footer, font: { ...footer.font, color: value } },
    });
  }, debounce);
}
