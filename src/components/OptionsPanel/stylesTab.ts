/**
 * OptionsPanel Styles Tab Module
 * Dynamically generates style options based on markdown content
 */

import { appState } from '../../services/state';
import { createFontDropdown, FontDropdown } from '../FontDropdown';

// Track dynamically created font dropdowns
const dynamicFontDropdowns: Map<string, FontDropdown> = new Map();

interface DetectedStyles {
  hasBody: boolean;
  hasH1: boolean;
  hasH2: boolean;
  hasH3: boolean;
  hasH4: boolean;
  hasH5: boolean;
  hasH6: boolean;
  hasList: boolean;
  hasCode: boolean;
  hasBlockquote: boolean;
}

/**
 * Analyze markdown content to detect which styles are used
 */
function detectUsedStyles(): DetectedStyles {
  const project = appState.getProject();
  const markdownFiles = project.files.filter(f => f.type === 'markdown');

  const result: DetectedStyles = {
    hasBody: false,
    hasH1: false,
    hasH2: false,
    hasH3: false,
    hasH4: false,
    hasH5: false,
    hasH6: false,
    hasList: false,
    hasCode: false,
    hasBlockquote: false,
  };

  // If there are markdown files, we have body text
  if (markdownFiles.length > 0) {
    result.hasBody = true;
  }

  // Scan sections from all signatures
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const pages = [spread.verso, spread.recto].filter(Boolean);
      for (const page of pages) {
        if (!page || !page.sections) continue;
        for (const section of page.sections) {
          switch (section.type) {
            case 'heading':
              if (section.level === 1) result.hasH1 = true;
              else if (section.level === 2) result.hasH2 = true;
              else if (section.level === 3) result.hasH3 = true;
              else if (section.level === 4) result.hasH4 = true;
              else if (section.level === 5) result.hasH5 = true;
              else if (section.level === 6) result.hasH6 = true;
              break;
            case 'paragraph':
              result.hasBody = true;
              break;
            case 'list':
              result.hasList = true;
              break;
            case 'code':
              result.hasCode = true;
              break;
            case 'blockquote':
              result.hasBlockquote = true;
              break;
          }
        }
      }
    }
  }

  // Also scan raw markdown for elements that might not be in sections yet
  for (const file of markdownFiles) {
    const content = file.content;
    if (/^# /m.test(content)) result.hasH1 = true;
    if (/^## /m.test(content)) result.hasH2 = true;
    if (/^### /m.test(content)) result.hasH3 = true;
    if (/^#### /m.test(content)) result.hasH4 = true;
    if (/^##### /m.test(content)) result.hasH5 = true;
    if (/^###### /m.test(content)) result.hasH6 = true;
    if (/^[\*\-\+] /m.test(content) || /^\d+\. /m.test(content)) result.hasList = true;
    if (/```/.test(content) || /^    /m.test(content)) result.hasCode = true;
    if (/^> /m.test(content)) result.hasBlockquote = true;
  }

  return result;
}

/**
 * Create body text style section
 */
function createBodySection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">Body Text</h4>
    <div class="form-group">
      <label>Font Family</label>
      <select id="dyn-font-body"></select>
    </div>
    <div class="form-group inline-sizes">
      <label>
        <span>Size</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-font-size-body" min="6" max="24" step="1">
          <span class="input-cap">pt</span>
        </div>
      </label>
      <label>
        <span>Line Height</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-line-height-body" min="1" max="3" step="0.1">
          <span class="input-cap">×</span>
        </div>
      </label>
      <label>
        <span>Color</span>
        <input type="color" id="dyn-color-body">
      </label>
    </div>
  `;
  return section;
}

/**
 * Create headings section with detected heading levels
 */
function createHeadingsSection(styles: DetectedStyles): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';

  // Build size inputs for only detected heading levels
  const sizeInputs: string[] = [];
  if (styles.hasH1) sizeInputs.push('<label><span>H1</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h1" min="12" max="72"><span class="input-cap">pt</span></div></label>');
  if (styles.hasH2) sizeInputs.push('<label><span>H2</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h2" min="10" max="48"><span class="input-cap">pt</span></div></label>');
  if (styles.hasH3) sizeInputs.push('<label><span>H3</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h3" min="8" max="36"><span class="input-cap">pt</span></div></label>');
  if (styles.hasH4) sizeInputs.push('<label><span>H4</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h4" min="8" max="24"><span class="input-cap">pt</span></div></label>');
  if (styles.hasH5) sizeInputs.push('<label><span>H5</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h5" min="6" max="18"><span class="input-cap">pt</span></div></label>');
  if (styles.hasH6) sizeInputs.push('<label><span>H6</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h6" min="6" max="16"><span class="input-cap">pt</span></div></label>');

  section.innerHTML = `
    <h4 class="section-header">Headings</h4>
    <div class="form-group">
      <label>Font Family</label>
      <select id="dyn-font-headings"></select>
    </div>
    <div class="form-group inline-sizes">
      ${sizeInputs.join('')}
    </div>
    <div class="form-group">
      <label>Color</label>
      <input type="color" id="dyn-color-headings">
    </div>
  `;
  return section;
}

/**
 * Create header/footer style section
 */
function createHeaderFooterSection(type: 'header' | 'footer'): HTMLElement {
  const label = type === 'header' ? 'Header' : 'Footer';
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">${label} Text</h4>
    <div class="form-group">
      <label>Font Family</label>
      <select id="dyn-${type}-font"></select>
    </div>
    <div class="form-group inline-sizes">
      <label>
        <span>Size</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-${type}-font-size" min="6" max="24" step="1">
          <span class="input-cap">pt</span>
        </div>
      </label>
      <label>
        <span>Color</span>
        <input type="color" id="dyn-${type}-color">
      </label>
    </div>
  `;
  return section;
}

/**
 * Set up input handlers for style options
 */
function setupInputHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;
  const headerFooter = appState.getProject().headerFooter;

  // Body text handlers
  const bodySizeInput = document.getElementById('dyn-font-size-body') as HTMLInputElement;
  const bodyColorInput = document.getElementById('dyn-color-body') as HTMLInputElement;
  const bodyLineHeightInput = document.getElementById('dyn-line-height-body') as HTMLInputElement;

  if (bodySizeInput) {
    bodySizeInput.value = fontOptions.body.fontSize.toString();
    bodySizeInput.addEventListener('input', () => {
      const value = parseFloat(bodySizeInput.value);
      if (!isNaN(value)) {
        const fonts = appState.getProject().fontOptions;
        appState.updateFontOptions({ body: { ...fonts.body, fontSize: value } });
      }
    });
  }

  if (bodyColorInput) {
    bodyColorInput.value = fontOptions.body.color || '#000000';
    bodyColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({ body: { ...fonts.body, color: bodyColorInput.value } });
    });
  }

  if (bodyLineHeightInput) {
    bodyLineHeightInput.value = (appState.getProject().layoutOptions.lineHeight || 1.5).toString();
    bodyLineHeightInput.addEventListener('input', () => {
      const value = parseFloat(bodyLineHeightInput.value);
      if (!isNaN(value)) {
        appState.updateLayoutOptions({ lineHeight: value });
      }
    });
  }

  // Heading size handlers
  const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
  for (const level of headingLevels) {
    const sizeInput = document.getElementById(`dyn-font-size-${level}`) as HTMLInputElement;
    if (sizeInput) {
      const levelFont = fontOptions[level];
      sizeInput.value = levelFont.fontSize.toString();
      sizeInput.addEventListener('input', () => {
        const value = parseFloat(sizeInput.value);
        if (!isNaN(value)) {
          const fonts = appState.getProject().fontOptions;
          appState.updateFontOptions({ [level]: { ...fonts[level], fontSize: value } });
        }
      });
    }
  }

  // Heading color handler
  const headingColorInput = document.getElementById('dyn-color-headings') as HTMLInputElement;
  if (headingColorInput) {
    headingColorInput.value = fontOptions.h1.color || '#000000';
    headingColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      const color = headingColorInput.value;
      appState.updateFontOptions({
        h1: { ...fonts.h1, color },
        h2: { ...fonts.h2, color },
        h3: { ...fonts.h3, color },
        h4: { ...fonts.h4, color },
        h5: { ...fonts.h5, color },
        h6: { ...fonts.h6, color },
      });
    });
  }

  // Header handlers
  const headerSizeInput = document.getElementById('dyn-header-font-size') as HTMLInputElement;
  const headerColorInput = document.getElementById('dyn-header-color') as HTMLInputElement;

  if (headerSizeInput) {
    headerSizeInput.value = (headerFooter.header.font.fontSize || 10).toString();
    headerSizeInput.addEventListener('input', () => {
      const value = parseFloat(headerSizeInput.value);
      if (!isNaN(value)) {
        const hf = appState.getProject().headerFooter;
        appState.updateHeaderFooter({
          header: { ...hf.header, font: { ...hf.header.font, fontSize: value } }
        });
      }
    });
  }

  if (headerColorInput) {
    headerColorInput.value = headerFooter.header.font.color || '#666666';
    headerColorInput.addEventListener('input', () => {
      const hf = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        header: { ...hf.header, font: { ...hf.header.font, color: headerColorInput.value } }
      });
    });
  }

  // Footer handlers
  const footerSizeInput = document.getElementById('dyn-footer-font-size') as HTMLInputElement;
  const footerColorInput = document.getElementById('dyn-footer-color') as HTMLInputElement;

  if (footerSizeInput) {
    footerSizeInput.value = (headerFooter.footer.font.fontSize || 10).toString();
    footerSizeInput.addEventListener('input', () => {
      const value = parseFloat(footerSizeInput.value);
      if (!isNaN(value)) {
        const hf = appState.getProject().headerFooter;
        appState.updateHeaderFooter({
          footer: { ...hf.footer, font: { ...hf.footer.font, fontSize: value } }
        });
      }
    });
  }

  if (footerColorInput) {
    footerColorInput.value = headerFooter.footer.font.color || '#666666';
    footerColorInput.addEventListener('input', () => {
      const hf = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        footer: { ...hf.footer, font: { ...hf.footer.font, color: footerColorInput.value } }
      });
    });
  }
}

/**
 * Set up font dropdowns for style sections
 */
function setupFontDropdowns(): void {
  const fontOptions = appState.getProject().fontOptions;
  const headerFooter = appState.getProject().headerFooter;

  // Body font dropdown
  const bodyDropdown = createFontDropdown('dyn-font-body', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({ body: { ...fonts.body, fontFamily: value } });
  });
  if (bodyDropdown) {
    bodyDropdown.setValue(fontOptions.body.fontFamily);
    dynamicFontDropdowns.set('body', bodyDropdown);
  }

  // Headings font dropdown
  const headingsDropdown = createFontDropdown('dyn-font-headings', (value) => {
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
  if (headingsDropdown) {
    headingsDropdown.setValue(fontOptions.h1.fontFamily);
    dynamicFontDropdowns.set('headings', headingsDropdown);
  }

  // Header font dropdown
  const headerDropdown = createFontDropdown('dyn-header-font', (value) => {
    const hf = appState.getProject().headerFooter;
    appState.updateHeaderFooter({
      header: { ...hf.header, font: { ...hf.header.font, fontFamily: value } }
    });
  });
  if (headerDropdown) {
    headerDropdown.setValue(headerFooter.header.font.fontFamily || 'Arial');
    dynamicFontDropdowns.set('header', headerDropdown);
  }

  // Footer font dropdown
  const footerDropdown = createFontDropdown('dyn-footer-font', (value) => {
    const hf = appState.getProject().headerFooter;
    appState.updateHeaderFooter({
      footer: { ...hf.footer, font: { ...hf.footer.font, fontFamily: value } }
    });
  });
  if (footerDropdown) {
    footerDropdown.setValue(headerFooter.footer.font.fontFamily || 'Arial');
    dynamicFontDropdowns.set('footer', footerDropdown);
  }
}

/**
 * Update the Styles tab content based on current markdown content
 */
export function updateStylesTab(): void {
  const noMarkdownMsg = document.getElementById('styles-no-markdown');
  const container = document.getElementById('styles-content');

  if (!container) return;

  // Clean up old dropdowns
  dynamicFontDropdowns.forEach(dropdown => dropdown.destroy?.());
  dynamicFontDropdowns.clear();
  container.innerHTML = '';

  const styles = detectUsedStyles();
  const headerFooter = appState.getProject().headerFooter;

  // Check if we have any markdown content
  const hasMarkdown = appState.getProject().files.some(f => f.type === 'markdown');

  if (!hasMarkdown) {
    if (noMarkdownMsg) noMarkdownMsg.style.display = 'block';

    // Still show header/footer if enabled
    if (headerFooter.header.enabled) {
      container.appendChild(createHeaderFooterSection('header'));
    }
    if (headerFooter.footer.enabled) {
      container.appendChild(createHeaderFooterSection('footer'));
    }

    if (headerFooter.header.enabled || headerFooter.footer.enabled) {
      setupInputHandlers();
      setupFontDropdowns();
    }
    return;
  }

  // Hide the no markdown message
  if (noMarkdownMsg) noMarkdownMsg.style.display = 'none';

  // Add body section if there's text content
  if (styles.hasBody) {
    container.appendChild(createBodySection());
  }

  // Add headings section if any heading level is used
  const hasAnyHeading = styles.hasH1 || styles.hasH2 || styles.hasH3 || styles.hasH4 || styles.hasH5 || styles.hasH6;
  if (hasAnyHeading) {
    container.appendChild(createHeadingsSection(styles));
  }

  // Add header/footer sections if enabled
  if (headerFooter.header.enabled) {
    container.appendChild(createHeaderFooterSection('header'));
  }
  if (headerFooter.footer.enabled) {
    container.appendChild(createHeaderFooterSection('footer'));
  }

  // Set up handlers
  setupInputHandlers();
  setupFontDropdowns();
}
