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
  hasHighlight: boolean;
  hasStrikethrough: boolean;
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
    hasHighlight: false,
    hasStrikethrough: false,
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
    // Detect Obsidian-flavored markdown: highlight (==text==) and strikethrough (~~text~~)
    if (/==.+?==/.test(content)) result.hasHighlight = true;
    if (/~~.+?~~/.test(content)) result.hasStrikethrough = true;
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
          <span class="input-cap" data-for="dyn-font-size-body">pt</span>
        </div>
      </label>
      <label>
        <span>Line Height</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-line-height-body" min="0.8" max="3" step="0.05">
          <span class="input-cap" data-for="dyn-line-height-body">×</span>
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
  if (styles.hasH1) sizeInputs.push('<label><span>H1</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h1" min="12" max="72" step="1"><span class="input-cap" data-for="dyn-font-size-h1">pt</span></div></label>');
  if (styles.hasH2) sizeInputs.push('<label><span>H2</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h2" min="10" max="48" step="1"><span class="input-cap" data-for="dyn-font-size-h2">pt</span></div></label>');
  if (styles.hasH3) sizeInputs.push('<label><span>H3</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h3" min="8" max="36" step="1"><span class="input-cap" data-for="dyn-font-size-h3">pt</span></div></label>');
  if (styles.hasH4) sizeInputs.push('<label><span>H4</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h4" min="8" max="24" step="1"><span class="input-cap" data-for="dyn-font-size-h4">pt</span></div></label>');
  if (styles.hasH5) sizeInputs.push('<label><span>H5</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h5" min="6" max="18" step="1"><span class="input-cap" data-for="dyn-font-size-h5">pt</span></div></label>');
  if (styles.hasH6) sizeInputs.push('<label><span>H6</span><div class="input-with-cap"><input type="number" id="dyn-font-size-h6" min="6" max="16" step="1"><span class="input-cap" data-for="dyn-font-size-h6">pt</span></div></label>');

  section.innerHTML = `
    <h4 class="section-header">Headings</h4>
    <div class="form-group">
      <label>Font Family</label>
      <select id="dyn-font-headings"></select>
    </div>
    <div class="form-group inline-sizes">
      ${sizeInputs.join('')}
    </div>
    <div class="form-group inline-sizes">
      <label>
        <span>Line Height</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-line-height-headings" min="0.8" max="3" step="0.05">
          <span class="input-cap" data-for="dyn-line-height-headings">×</span>
        </div>
      </label>
      <label>
        <span>Color</span>
        <input type="color" id="dyn-color-headings">
      </label>
      <label class="checkbox-label" style="align-self: end; padding-bottom: 6px;">
        <input type="checkbox" id="dyn-headings-bold">
        <span>Bold</span>
      </label>
    </div>
  `;
  return section;
}

/**
 * Create blockquote style section with full text formatting
 */
function createBlockquoteSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">Blockquote</h4>
    <div class="form-group">
      <label>Font Family</label>
      <select id="dyn-font-blockquote"></select>
    </div>
    <div class="form-group inline-sizes">
      <label>
        <span>Size</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-font-size-blockquote" min="6" max="24" step="1">
          <span class="input-cap" data-for="dyn-font-size-blockquote">pt</span>
        </div>
      </label>
      <label>
        <span>Line Height</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-line-height-blockquote" min="0.8" max="3" step="0.05">
          <span class="input-cap" data-for="dyn-line-height-blockquote">×</span>
        </div>
      </label>
      <label>
        <span>Color</span>
        <input type="color" id="dyn-color-blockquote">
      </label>
    </div>
    <div class="form-group" style="display: flex; gap: 16px;">
      <label class="checkbox-label">
        <input type="checkbox" id="dyn-blockquote-italic">
        <span>Italic</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" id="dyn-blockquote-bold">
        <span>Bold</span>
      </label>
    </div>
  `;
  return section;
}

/**
 * Create highlight style section (Obsidian ==text== syntax)
 */
function createHighlightSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">Highlight</h4>
    <div class="form-group inline-sizes" style="grid-template-columns: 1fr 1fr;">
      <label>
        <span>Text Color</span>
        <input type="color" id="dyn-highlight-text-color">
      </label>
      <label>
        <span>Background</span>
        <input type="color" id="dyn-highlight-bg-color">
      </label>
    </div>
  `;
  return section;
}

/**
 * Create strikethrough style section (~~text~~ syntax)
 */
function createStrikethroughSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">Strikethrough</h4>
    <div class="form-group inline-sizes" style="grid-template-columns: 1fr 1fr;">
      <label>
        <span>Text Color</span>
        <input type="color" id="dyn-strikethrough-text-color">
      </label>
      <label>
        <span>Line Color</span>
        <input type="color" id="dyn-strikethrough-line-color">
      </label>
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
          <span class="input-cap" data-for="dyn-${type}-font-size">pt</span>
        </div>
      </label>
      <label>
        <span>Color</span>
        <input type="color" id="dyn-${type}-color">
      </label>
      <label class="checkbox-label" style="align-self: end; padding-bottom: 6px;">
        <input type="checkbox" id="dyn-${type}-bold">
        <span>Bold</span>
      </label>
    </div>
  `;
  return section;
}

/**
 * Set up draggable caps for dynamic inputs
 * This needs to be called after dynamic sections are created
 */
function setupDynamicDraggableCaps(): void {
  const caps = document.querySelectorAll('#styles-content .input-cap[data-for]');

  caps.forEach(cap => {
    const capElement = cap as HTMLElement;
    const inputId = capElement.dataset.for;
    if (!inputId) return;

    const input = document.getElementById(inputId) as HTMLInputElement;
    if (!input) return;

    // Check if already has drag listener
    if (capElement.dataset.dragSetup) return;
    capElement.dataset.dragSetup = 'true';

    let startX = 0;
    let startValue = 0;
    let isDragging = false;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startValue = parseFloat(input.value) || 0;
      capElement.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const step = parseFloat(input.step) || 0.1;
      const sensitivity = step * 2;
      const deltaValue = deltaX * sensitivity;
      let newValue = startValue + deltaValue;

      // Apply min/max constraints
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      if (!isNaN(min)) newValue = Math.max(min, newValue);
      if (!isNaN(max)) newValue = Math.min(max, newValue);

      // Round to step precision
      const precision = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
      newValue = parseFloat(newValue.toFixed(precision));

      input.value = newValue.toString();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const onMouseUp = () => {
      isDragging = false;
      capElement.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    capElement.addEventListener('mousedown', onMouseDown);
  });
}

/**
 * Set up input handlers for style options
 */
function setupInputHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;

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

  // Heading handlers
  setupHeadingHandlers();

  // Blockquote handlers
  setupBlockquoteHandlers();

  // Highlight handlers
  setupHighlightHandlers();

  // Strikethrough handlers
  setupStrikethroughHandlers();

  // Header handlers
  setupHeaderFooterHandlers('header');

  // Footer handlers
  setupHeaderFooterHandlers('footer');
}

/**
 * Set up heading input handlers
 */
function setupHeadingHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;

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

  // Heading line height handler (shared across all heading levels)
  const lineHeightInput = document.getElementById('dyn-line-height-headings') as HTMLInputElement;
  if (lineHeightInput) {
    // Use H1's line height as the representative value, fall back to layout default
    lineHeightInput.value = (fontOptions.h1.lineHeight || appState.getProject().layoutOptions.lineHeight || 1.5).toString();
    lineHeightInput.addEventListener('input', () => {
      const value = parseFloat(lineHeightInput.value);
      if (!isNaN(value)) {
        const fonts = appState.getProject().fontOptions;
        appState.updateFontOptions({
          h1: { ...fonts.h1, lineHeight: value },
          h2: { ...fonts.h2, lineHeight: value },
          h3: { ...fonts.h3, lineHeight: value },
          h4: { ...fonts.h4, lineHeight: value },
          h5: { ...fonts.h5, lineHeight: value },
          h6: { ...fonts.h6, lineHeight: value },
        });
      }
    });
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

  // Heading bold handler
  const boldCheckbox = document.getElementById('dyn-headings-bold') as HTMLInputElement;
  if (boldCheckbox) {
    boldCheckbox.checked = fontOptions.h1.fontWeight === 'bold';
    boldCheckbox.addEventListener('change', () => {
      const fonts = appState.getProject().fontOptions;
      const fontWeight = boldCheckbox.checked ? 'bold' : 'normal';
      appState.updateFontOptions({
        h1: { ...fonts.h1, fontWeight },
        h2: { ...fonts.h2, fontWeight },
        h3: { ...fonts.h3, fontWeight },
        h4: { ...fonts.h4, fontWeight },
        h5: { ...fonts.h5, fontWeight },
        h6: { ...fonts.h6, fontWeight },
      });
    });
  }
}

/**
 * Set up blockquote input handlers
 */
function setupBlockquoteHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;

  const sizeInput = document.getElementById('dyn-font-size-blockquote') as HTMLInputElement;
  const lineHeightInput = document.getElementById('dyn-line-height-blockquote') as HTMLInputElement;
  const colorInput = document.getElementById('dyn-color-blockquote') as HTMLInputElement;
  const italicCheckbox = document.getElementById('dyn-blockquote-italic') as HTMLInputElement;
  const boldCheckbox = document.getElementById('dyn-blockquote-bold') as HTMLInputElement;

  if (sizeInput) {
    sizeInput.value = fontOptions.blockquote.fontSize.toString();
    sizeInput.addEventListener('input', () => {
      const value = parseFloat(sizeInput.value);
      if (!isNaN(value)) {
        const fonts = appState.getProject().fontOptions;
        appState.updateFontOptions({ blockquote: { ...fonts.blockquote, fontSize: value } });
      }
    });
  }

  if (lineHeightInput) {
    lineHeightInput.value = (fontOptions.blockquote.lineHeight || appState.getProject().layoutOptions.lineHeight || 1.5).toString();
    lineHeightInput.addEventListener('input', () => {
      const value = parseFloat(lineHeightInput.value);
      if (!isNaN(value)) {
        const fonts = appState.getProject().fontOptions;
        appState.updateFontOptions({ blockquote: { ...fonts.blockquote, lineHeight: value } });
      }
    });
  }

  if (colorInput) {
    colorInput.value = fontOptions.blockquote.color || '#555555';
    colorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({ blockquote: { ...fonts.blockquote, color: colorInput.value } });
    });
  }

  if (italicCheckbox) {
    italicCheckbox.checked = fontOptions.blockquote.fontStyle === 'italic';
    italicCheckbox.addEventListener('change', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        blockquote: { ...fonts.blockquote, fontStyle: italicCheckbox.checked ? 'italic' : 'normal' }
      });
    });
  }

  if (boldCheckbox) {
    boldCheckbox.checked = fontOptions.blockquote.fontWeight === 'bold';
    boldCheckbox.addEventListener('change', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        blockquote: { ...fonts.blockquote, fontWeight: boldCheckbox.checked ? 'bold' : 'normal' }
      });
    });
  }
}

/**
 * Set up highlight input handlers
 */
function setupHighlightHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;
  const highlight = fontOptions.highlight || { textColor: '#000000', backgroundColor: '#ffff00' };

  const textColorInput = document.getElementById('dyn-highlight-text-color') as HTMLInputElement;
  const bgColorInput = document.getElementById('dyn-highlight-bg-color') as HTMLInputElement;

  if (textColorInput) {
    textColorInput.value = highlight.textColor;
    textColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        highlight: { ...fonts.highlight!, textColor: textColorInput.value }
      });
    });
  }

  if (bgColorInput) {
    bgColorInput.value = highlight.backgroundColor;
    bgColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        highlight: { ...fonts.highlight!, backgroundColor: bgColorInput.value }
      });
    });
  }
}

/**
 * Set up strikethrough input handlers
 */
function setupStrikethroughHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;
  const strikethrough = fontOptions.strikethrough || { textColor: '#888888', lineColor: '#888888' };

  const textColorInput = document.getElementById('dyn-strikethrough-text-color') as HTMLInputElement;
  const lineColorInput = document.getElementById('dyn-strikethrough-line-color') as HTMLInputElement;

  if (textColorInput) {
    textColorInput.value = strikethrough.textColor;
    textColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        strikethrough: { ...fonts.strikethrough!, textColor: textColorInput.value }
      });
    });
  }

  if (lineColorInput) {
    lineColorInput.value = strikethrough.lineColor;
    lineColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({
        strikethrough: { ...fonts.strikethrough!, lineColor: lineColorInput.value }
      });
    });
  }
}

/**
 * Set up header/footer input handlers
 */
function setupHeaderFooterHandlers(type: 'header' | 'footer'): void {
  const headerFooter = appState.getProject().headerFooter;
  const config = headerFooter[type];

  const sizeInput = document.getElementById(`dyn-${type}-font-size`) as HTMLInputElement;
  const colorInput = document.getElementById(`dyn-${type}-color`) as HTMLInputElement;
  const boldCheckbox = document.getElementById(`dyn-${type}-bold`) as HTMLInputElement;

  if (sizeInput) {
    sizeInput.value = (config.font.fontSize || 10).toString();
    sizeInput.addEventListener('input', () => {
      const value = parseFloat(sizeInput.value);
      if (!isNaN(value)) {
        const hf = appState.getProject().headerFooter;
        appState.updateHeaderFooter({
          [type]: { ...hf[type], font: { ...hf[type].font, fontSize: value } }
        });
      }
    });
  }

  if (colorInput) {
    colorInput.value = config.font.color || '#666666';
    colorInput.addEventListener('input', () => {
      const hf = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        [type]: { ...hf[type], font: { ...hf[type].font, color: colorInput.value } }
      });
    });
  }

  if (boldCheckbox) {
    boldCheckbox.checked = config.font.fontWeight === 'bold';
    boldCheckbox.addEventListener('change', () => {
      const hf = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        [type]: { ...hf[type], font: { ...hf[type].font, fontWeight: boldCheckbox.checked ? 'bold' : 'normal' } }
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

  // Blockquote font dropdown
  const blockquoteDropdown = createFontDropdown('dyn-font-blockquote', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({ blockquote: { ...fonts.blockquote, fontFamily: value } });
  });
  if (blockquoteDropdown) {
    blockquoteDropdown.setValue(fontOptions.blockquote.fontFamily);
    dynamicFontDropdowns.set('blockquote', blockquoteDropdown);
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
      setupDynamicDraggableCaps();
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

  // Add blockquote section if blockquotes are detected
  if (styles.hasBlockquote) {
    container.appendChild(createBlockquoteSection());
  }

  // Add highlight section if highlights are detected
  if (styles.hasHighlight) {
    container.appendChild(createHighlightSection());
  }

  // Add strikethrough section if strikethroughs are detected
  if (styles.hasStrikethrough) {
    container.appendChild(createStrikethroughSection());
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
  setupDynamicDraggableCaps();
}
