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

  if (markdownFiles.length > 0) {
    result.hasBody = true;
  }

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
            case 'paragraph': result.hasBody = true; break;
            case 'list': result.hasList = true; break;
            case 'code': result.hasCode = true; break;
            case 'blockquote': result.hasBlockquote = true; break;
          }
        }
      }
    }
  }

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
    if (/==.+?==/.test(content)) result.hasHighlight = true;
    if (/~~.+?~~/.test(content)) result.hasStrikethrough = true;
  }

  return result;
}

/**
 * Generate standard text formatting controls HTML
 * Standard layout:
 * - Row 1: Font dropdown
 * - Row 2: Size, Line Height, Letter Spacing
 * - Row 3: Style buttons (B/I/U/S)
 * - Row 4: Color, Background, Alignment
 */
function generateTextFormatControls(prefix: string, options: {
  showAlignment?: boolean;
  showBackground?: boolean;
  showLetterSpacing?: boolean;
} = {}): string {
  const { showAlignment = true, showBackground = true, showLetterSpacing = true } = options;

  return `
    <div class="form-group">
      <label>Font</label>
      <select id="${prefix}-font"></select>
    </div>
    <div class="form-group inline-sizes">
      <label>
        <span>Size</span>
        <div class="input-with-cap">
          <input type="number" id="${prefix}-size" min="6" max="72" step="1">
          <span class="input-cap" data-for="${prefix}-size">pt</span>
        </div>
      </label>
      <label>
        <span>Line Ht</span>
        <div class="input-with-cap">
          <input type="number" id="${prefix}-line-height" min="0.8" max="3" step="0.05">
          <span class="input-cap" data-for="${prefix}-line-height">×</span>
        </div>
      </label>
      ${showLetterSpacing ? `
      <label>
        <span>Spacing</span>
        <div class="input-with-cap">
          <input type="number" id="${prefix}-letter-spacing" min="-2" max="10" step="0.1">
          <span class="input-cap" data-for="${prefix}-letter-spacing">px</span>
        </div>
      </label>
      ` : ''}
    </div>
    <div class="form-group style-controls-row">
      <div class="control-group">
        <span>Style</span>
        <div class="btn-group">
          <button id="${prefix}-bold" class="btn btn-icon btn-small" title="Bold"><b>B</b></button>
          <button id="${prefix}-italic" class="btn btn-icon btn-small" title="Italic"><i>I</i></button>
          <button id="${prefix}-underline" class="btn btn-icon btn-small" title="Underline"><u>U</u></button>
          <button id="${prefix}-strikethrough" class="btn btn-icon btn-small" title="Strikethrough"><s>S</s></button>
        </div>
      </div>
    </div>
    <div class="form-group style-controls-row">
      <label>
        <span>Color</span>
        <input type="color" id="${prefix}-color">
      </label>
      ${showBackground ? `
      <label>
        <span>Bg</span>
        <input type="color" id="${prefix}-background">
      </label>
      ` : ''}
      ${showAlignment ? `
      <div class="control-group">
        <span>Align</span>
        <div class="btn-group">
          <button id="${prefix}-align-left" class="btn btn-icon btn-small" title="Left">◀</button>
          <button id="${prefix}-align-center" class="btn btn-icon btn-small" title="Center">●</button>
          <button id="${prefix}-align-right" class="btn btn-icon btn-small" title="Right">▶</button>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

/**
 * Create body text style section
 */
function createBodySection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">Body Text</h4>
    ${generateTextFormatControls('dyn-body')}
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
  if (styles.hasH1) sizeInputs.push('<label><span>H1</span><div class="input-with-cap"><input type="number" id="dyn-heading-size-h1" min="12" max="72" step="1"><span class="input-cap" data-for="dyn-heading-size-h1">pt</span></div></label>');
  if (styles.hasH2) sizeInputs.push('<label><span>H2</span><div class="input-with-cap"><input type="number" id="dyn-heading-size-h2" min="10" max="48" step="1"><span class="input-cap" data-for="dyn-heading-size-h2">pt</span></div></label>');
  if (styles.hasH3) sizeInputs.push('<label><span>H3</span><div class="input-with-cap"><input type="number" id="dyn-heading-size-h3" min="8" max="36" step="1"><span class="input-cap" data-for="dyn-heading-size-h3">pt</span></div></label>');
  if (styles.hasH4) sizeInputs.push('<label><span>H4</span><div class="input-with-cap"><input type="number" id="dyn-heading-size-h4" min="8" max="24" step="1"><span class="input-cap" data-for="dyn-heading-size-h4">pt</span></div></label>');
  if (styles.hasH5) sizeInputs.push('<label><span>H5</span><div class="input-with-cap"><input type="number" id="dyn-heading-size-h5" min="6" max="18" step="1"><span class="input-cap" data-for="dyn-heading-size-h5">pt</span></div></label>');
  if (styles.hasH6) sizeInputs.push('<label><span>H6</span><div class="input-with-cap"><input type="number" id="dyn-heading-size-h6" min="6" max="16" step="1"><span class="input-cap" data-for="dyn-heading-size-h6">pt</span></div></label>');

  section.innerHTML = `
    <h4 class="section-header">Headings</h4>
    <div class="form-group">
      <label>Font</label>
      <select id="dyn-heading-font"></select>
    </div>
    <div class="form-group inline-sizes">
      ${sizeInputs.join('')}
    </div>
    <div class="form-group inline-sizes">
      <label>
        <span>Line Ht</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-heading-line-height" min="0.8" max="3" step="0.05">
          <span class="input-cap" data-for="dyn-heading-line-height">×</span>
        </div>
      </label>
      <label>
        <span>Spacing</span>
        <div class="input-with-cap">
          <input type="number" id="dyn-heading-letter-spacing" min="-2" max="10" step="0.1">
          <span class="input-cap" data-for="dyn-heading-letter-spacing">px</span>
        </div>
      </label>
    </div>
    <div class="form-group style-controls-row">
      <div class="control-group">
        <span>Style</span>
        <div class="btn-group">
          <button id="dyn-heading-bold" class="btn btn-icon btn-small" title="Bold"><b>B</b></button>
          <button id="dyn-heading-italic" class="btn btn-icon btn-small" title="Italic"><i>I</i></button>
          <button id="dyn-heading-underline" class="btn btn-icon btn-small" title="Underline"><u>U</u></button>
          <button id="dyn-heading-strikethrough" class="btn btn-icon btn-small" title="Strikethrough"><s>S</s></button>
        </div>
      </div>
    </div>
    <div class="form-group style-controls-row">
      <label>
        <span>Color</span>
        <input type="color" id="dyn-heading-color">
      </label>
      <label>
        <span>Bg</span>
        <input type="color" id="dyn-heading-background">
      </label>
      <div class="control-group">
        <span>Align</span>
        <div class="btn-group">
          <button id="dyn-heading-align-left" class="btn btn-icon btn-small" title="Left">◀</button>
          <button id="dyn-heading-align-center" class="btn btn-icon btn-small" title="Center">●</button>
          <button id="dyn-heading-align-right" class="btn btn-icon btn-small" title="Right">▶</button>
        </div>
      </div>
    </div>
  `;
  return section;
}

/**
 * Create blockquote style section
 */
function createBlockquoteSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">Blockquote</h4>
    ${generateTextFormatControls('dyn-blockquote')}
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
  const prefix = `dyn-${type}`;
  const section = document.createElement('div');
  section.className = 'options-section';
  section.innerHTML = `
    <h4 class="section-header">${label} Text</h4>
    ${generateTextFormatControls(prefix, { showBackground: false, showLetterSpacing: false })}
  `;
  return section;
}

/**
 * Set up draggable caps for dynamic inputs
 */
function setupDynamicDraggableCaps(): void {
  const caps = document.querySelectorAll('#styles-content .input-cap[data-for]');

  caps.forEach(cap => {
    const capElement = cap as HTMLElement;
    const inputId = capElement.dataset.for;
    if (!inputId) return;

    const input = document.getElementById(inputId) as HTMLInputElement;
    if (!input) return;

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

      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      if (!isNaN(min)) newValue = Math.max(min, newValue);
      if (!isNaN(max)) newValue = Math.min(max, newValue);

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
 * Set up standard text format handlers for a section
 */
function setupTextFormatHandlers(
  prefix: string,
  getStyle: () => { fontSize: number; lineHeight?: number; letterSpacing?: number; color: string; fontWeight: string; fontStyle: string; textAlign?: string; backgroundColor?: string; textDecoration?: string },
  updateStyle: (updates: Partial<ReturnType<typeof getStyle>>) => void
): void {
  // Size
  const sizeInput = document.getElementById(`${prefix}-size`) as HTMLInputElement;
  if (sizeInput) {
    sizeInput.value = getStyle().fontSize.toString();
    sizeInput.addEventListener('input', () => {
      const value = parseFloat(sizeInput.value);
      if (!isNaN(value)) updateStyle({ fontSize: value });
    });
  }

  // Line Height
  const lineHeightInput = document.getElementById(`${prefix}-line-height`) as HTMLInputElement;
  if (lineHeightInput) {
    lineHeightInput.value = (getStyle().lineHeight || appState.getProject().layoutOptions.lineHeight || 1.5).toString();
    lineHeightInput.addEventListener('input', () => {
      const value = parseFloat(lineHeightInput.value);
      if (!isNaN(value)) updateStyle({ lineHeight: value });
    });
  }

  // Letter Spacing
  const letterSpacingInput = document.getElementById(`${prefix}-letter-spacing`) as HTMLInputElement;
  if (letterSpacingInput) {
    letterSpacingInput.value = (getStyle().letterSpacing || 0).toString();
    letterSpacingInput.addEventListener('input', () => {
      const value = parseFloat(letterSpacingInput.value);
      if (!isNaN(value)) updateStyle({ letterSpacing: value });
    });
  }

  // Color
  const colorInput = document.getElementById(`${prefix}-color`) as HTMLInputElement;
  if (colorInput) {
    colorInput.value = getStyle().color || '#000000';
    colorInput.addEventListener('input', () => updateStyle({ color: colorInput.value }));
  }

  // Background - use 'change' event to avoid premature picker closing
  const bgInput = document.getElementById(`${prefix}-background`) as HTMLInputElement;
  if (bgInput) {
    bgInput.value = getStyle().backgroundColor || '#ffffff';
    bgInput.addEventListener('change', () => updateStyle({ backgroundColor: bgInput.value }));
  }

  // Alignment buttons
  const alignments = ['left', 'center', 'right'] as const;
  alignments.forEach(align => {
    const btn = document.getElementById(`${prefix}-align-${align}`);
    if (btn) {
      if (getStyle().textAlign === align) btn.classList.add('active');
      btn.addEventListener('click', () => {
        alignments.forEach(a => document.getElementById(`${prefix}-align-${a}`)?.classList.remove('active'));
        btn.classList.add('active');
        updateStyle({ textAlign: align });
      });
    }
  });

  // Bold button
  const boldBtn = document.getElementById(`${prefix}-bold`);
  if (boldBtn) {
    if (getStyle().fontWeight === 'bold') boldBtn.classList.add('active');
    boldBtn.addEventListener('click', () => {
      const isActive = boldBtn.classList.toggle('active');
      updateStyle({ fontWeight: isActive ? 'bold' : 'normal' });
    });
  }

  // Italic button
  const italicBtn = document.getElementById(`${prefix}-italic`);
  if (italicBtn) {
    if (getStyle().fontStyle === 'italic') italicBtn.classList.add('active');
    italicBtn.addEventListener('click', () => {
      const isActive = italicBtn.classList.toggle('active');
      updateStyle({ fontStyle: isActive ? 'italic' : 'normal' });
    });
  }

  // Underline button
  const underlineBtn = document.getElementById(`${prefix}-underline`);
  if (underlineBtn) {
    const currentDeco = getStyle().textDecoration || 'none';
    if (currentDeco.includes('underline')) underlineBtn.classList.add('active');
    underlineBtn.addEventListener('click', () => {
      const isActive = underlineBtn.classList.toggle('active');
      const strikeBtn = document.getElementById(`${prefix}-strikethrough`);
      const hasStrike = strikeBtn?.classList.contains('active');
      updateStyle({ textDecoration: getTextDecoration(isActive, hasStrike) });
    });
  }

  // Strikethrough button
  const strikeBtn = document.getElementById(`${prefix}-strikethrough`);
  if (strikeBtn) {
    const currentDeco = getStyle().textDecoration || 'none';
    if (currentDeco.includes('line-through')) strikeBtn.classList.add('active');
    strikeBtn.addEventListener('click', () => {
      const isActive = strikeBtn.classList.toggle('active');
      const underBtn = document.getElementById(`${prefix}-underline`);
      const hasUnderline = underBtn?.classList.contains('active');
      updateStyle({ textDecoration: getTextDecoration(hasUnderline, isActive) });
    });
  }
}

/**
 * Helper to compute textDecoration value from underline and strikethrough states
 */
function getTextDecoration(underline: boolean | undefined, strikethrough: boolean | undefined): 'none' | 'underline' | 'line-through' | 'underline line-through' {
  if (underline && strikethrough) return 'underline line-through';
  if (underline) return 'underline';
  if (strikethrough) return 'line-through';
  return 'none';
}

/**
 * Extract only FontStyle-compatible properties from updates
 * Note: textAlign and backgroundColor are now part of FontStyle
 */
function extractFontStyleUpdates(updates: Record<string, any>): Partial<import('../../types').FontStyle> {
  // All properties are now valid FontStyle properties
  return updates;
}

/**
 * Set up all input handlers
 */
function setupInputHandlers(): void {
  // Body text
  setupTextFormatHandlers(
    'dyn-body',
    () => appState.getProject().fontOptions.body as any,
    (updates) => {
      const fonts = appState.getProject().fontOptions;
      const fontUpdates = extractFontStyleUpdates(updates);
      appState.updateFontOptions({ body: { ...fonts.body, ...fontUpdates } });
      // Also update layout line height if it changes
      if (updates.lineHeight !== undefined) {
        appState.updateLayoutOptions({ lineHeight: updates.lineHeight });
      }
    }
  );

  // Headings
  setupHeadingHandlers();

  // Blockquote
  setupTextFormatHandlers(
    'dyn-blockquote',
    () => appState.getProject().fontOptions.blockquote as any,
    (updates) => {
      const fonts = appState.getProject().fontOptions;
      const fontUpdates = extractFontStyleUpdates(updates);
      appState.updateFontOptions({ blockquote: { ...fonts.blockquote, ...fontUpdates } });
    }
  );

  // Highlight
  setupHighlightHandlers();

  // Strikethrough
  setupStrikethroughHandlers();

  // Header/Footer
  setupHeaderFooterHandlers('header');
  setupHeaderFooterHandlers('footer');
}

/**
 * Set up heading handlers (special case with per-level sizes)
 */
function setupHeadingHandlers(): void {
  const fontOptions = appState.getProject().fontOptions;
  const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

  // Per-level size inputs
  for (const level of headingLevels) {
    const sizeInput = document.getElementById(`dyn-heading-size-${level}`) as HTMLInputElement;
    if (sizeInput) {
      sizeInput.value = fontOptions[level].fontSize.toString();
      sizeInput.addEventListener('input', () => {
        const value = parseFloat(sizeInput.value);
        if (!isNaN(value)) {
          const fonts = appState.getProject().fontOptions;
          appState.updateFontOptions({ [level]: { ...fonts[level], fontSize: value } });
        }
      });
    }
  }

  // Shared controls
  const sharedProps = ['lineHeight', 'letterSpacing', 'color', 'textAlign', 'fontWeight', 'fontStyle'] as const;

  // Line Height
  const lineHeightInput = document.getElementById('dyn-heading-line-height') as HTMLInputElement;
  if (lineHeightInput) {
    lineHeightInput.value = (fontOptions.h1.lineHeight || appState.getProject().layoutOptions.lineHeight || 1.5).toString();
    lineHeightInput.addEventListener('input', () => {
      const value = parseFloat(lineHeightInput.value);
      if (!isNaN(value)) updateAllHeadings({ lineHeight: value });
    });
  }

  // Letter Spacing
  const letterSpacingInput = document.getElementById('dyn-heading-letter-spacing') as HTMLInputElement;
  if (letterSpacingInput) {
    letterSpacingInput.value = (fontOptions.h1.letterSpacing || 0).toString();
    letterSpacingInput.addEventListener('input', () => {
      const value = parseFloat(letterSpacingInput.value);
      if (!isNaN(value)) updateAllHeadings({ letterSpacing: value });
    });
  }

  // Color
  const colorInput = document.getElementById('dyn-heading-color') as HTMLInputElement;
  if (colorInput) {
    colorInput.value = fontOptions.h1.color || '#000000';
    colorInput.addEventListener('input', () => updateAllHeadings({ color: colorInput.value }));
  }

  // Alignment
  const alignments = ['left', 'center', 'right'] as const;
  const currentAlign = fontOptions.h1.textAlign || 'left';
  alignments.forEach(align => {
    const btn = document.getElementById(`dyn-heading-align-${align}`);
    if (btn) {
      // Set initial active state
      if (currentAlign === align) btn.classList.add('active');
      btn.addEventListener('click', () => {
        alignments.forEach(a => document.getElementById(`dyn-heading-align-${a}`)?.classList.remove('active'));
        btn.classList.add('active');
        updateAllHeadings({ textAlign: align });
      });
    }
  });

  // Bold
  const boldBtn = document.getElementById('dyn-heading-bold');
  if (boldBtn) {
    if (fontOptions.h1.fontWeight === 'bold') boldBtn.classList.add('active');
    boldBtn.addEventListener('click', () => {
      const isActive = boldBtn.classList.toggle('active');
      updateAllHeadings({ fontWeight: isActive ? 'bold' : 'normal' });
    });
  }

  // Italic
  const italicBtn = document.getElementById('dyn-heading-italic');
  if (italicBtn) {
    if (fontOptions.h1.fontStyle === 'italic') italicBtn.classList.add('active');
    italicBtn.addEventListener('click', () => {
      const isActive = italicBtn.classList.toggle('active');
      updateAllHeadings({ fontStyle: isActive ? 'italic' : 'normal' });
    });
  }

  // Underline
  const underlineBtn = document.getElementById('dyn-heading-underline');
  if (underlineBtn) {
    const currentDeco = fontOptions.h1.textDecoration || 'none';
    if (currentDeco.includes('underline')) underlineBtn.classList.add('active');
    underlineBtn.addEventListener('click', () => {
      const isActive = underlineBtn.classList.toggle('active');
      const strikeBtn = document.getElementById('dyn-heading-strikethrough');
      const hasStrike = strikeBtn?.classList.contains('active');
      updateAllHeadings({ textDecoration: getTextDecoration(isActive, hasStrike) });
    });
  }

  // Strikethrough
  const strikeBtn = document.getElementById('dyn-heading-strikethrough');
  if (strikeBtn) {
    const currentDeco = fontOptions.h1.textDecoration || 'none';
    if (currentDeco.includes('line-through')) strikeBtn.classList.add('active');
    strikeBtn.addEventListener('click', () => {
      const isActive = strikeBtn.classList.toggle('active');
      const underBtn = document.getElementById('dyn-heading-underline');
      const hasUnderline = underBtn?.classList.contains('active');
      updateAllHeadings({ textDecoration: getTextDecoration(hasUnderline, isActive) });
    });
  }

  // Background color
  const bgInput = document.getElementById('dyn-heading-background') as HTMLInputElement;
  if (bgInput) {
    bgInput.value = fontOptions.h1.backgroundColor || '#ffffff';
    bgInput.addEventListener('change', () => updateAllHeadings({ backgroundColor: bgInput.value }));
  }

  function updateAllHeadings(updates: Partial<typeof fontOptions.h1>) {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({
      h1: { ...fonts.h1, ...updates },
      h2: { ...fonts.h2, ...updates },
      h3: { ...fonts.h3, ...updates },
      h4: { ...fonts.h4, ...updates },
      h5: { ...fonts.h5, ...updates },
      h6: { ...fonts.h6, ...updates },
    });
  }
}

/**
 * Set up highlight handlers
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
      appState.updateFontOptions({ highlight: { ...fonts.highlight!, textColor: textColorInput.value } });
    });
  }

  if (bgColorInput) {
    bgColorInput.value = highlight.backgroundColor;
    bgColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({ highlight: { ...fonts.highlight!, backgroundColor: bgColorInput.value } });
    });
  }
}

/**
 * Set up strikethrough handlers
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
      appState.updateFontOptions({ strikethrough: { ...fonts.strikethrough!, textColor: textColorInput.value } });
    });
  }

  if (lineColorInput) {
    lineColorInput.value = strikethrough.lineColor;
    lineColorInput.addEventListener('input', () => {
      const fonts = appState.getProject().fontOptions;
      appState.updateFontOptions({ strikethrough: { ...fonts.strikethrough!, lineColor: lineColorInput.value } });
    });
  }
}

/**
 * Set up header/footer handlers
 */
function setupHeaderFooterHandlers(type: 'header' | 'footer'): void {
  const prefix = `dyn-${type}`;

  setupTextFormatHandlers(
    prefix,
    () => appState.getProject().headerFooter[type].font as any,
    (updates) => {
      const hf = appState.getProject().headerFooter;
      appState.updateHeaderFooter({
        [type]: { ...hf[type], font: { ...hf[type].font, ...updates } }
      });
    }
  );
}

/**
 * Set up font dropdowns
 */
function setupFontDropdowns(): void {
  const fontOptions = appState.getProject().fontOptions;
  const headerFooter = appState.getProject().headerFooter;

  // Body
  const bodyDropdown = createFontDropdown('dyn-body-font', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({ body: { ...fonts.body, fontFamily: value } });
  });
  if (bodyDropdown) {
    bodyDropdown.setValue(fontOptions.body.fontFamily);
    dynamicFontDropdowns.set('body', bodyDropdown);
  }

  // Headings
  const headingsDropdown = createFontDropdown('dyn-heading-font', (value) => {
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

  // Blockquote
  const blockquoteDropdown = createFontDropdown('dyn-blockquote-font', (value) => {
    const fonts = appState.getProject().fontOptions;
    appState.updateFontOptions({ blockquote: { ...fonts.blockquote, fontFamily: value } });
  });
  if (blockquoteDropdown) {
    blockquoteDropdown.setValue(fontOptions.blockquote.fontFamily);
    dynamicFontDropdowns.set('blockquote', blockquoteDropdown);
  }

  // Header
  const headerDropdown = createFontDropdown('dyn-header-font', (value) => {
    const hf = appState.getProject().headerFooter;
    appState.updateHeaderFooter({ header: { ...hf.header, font: { ...hf.header.font, fontFamily: value } } });
  });
  if (headerDropdown) {
    headerDropdown.setValue(headerFooter.header.font.fontFamily || 'Arial');
    dynamicFontDropdowns.set('header', headerDropdown);
  }

  // Footer
  const footerDropdown = createFontDropdown('dyn-footer-font', (value) => {
    const hf = appState.getProject().headerFooter;
    appState.updateHeaderFooter({ footer: { ...hf.footer, font: { ...hf.footer.font, fontFamily: value } } });
  });
  if (footerDropdown) {
    footerDropdown.setValue(headerFooter.footer.font.fontFamily || 'Arial');
    dynamicFontDropdowns.set('footer', footerDropdown);
  }
}

/**
 * Update the Styles tab content
 */
export function updateStylesTab(): void {
  const noMarkdownMsg = document.getElementById('styles-no-markdown');
  const container = document.getElementById('styles-content');

  if (!container) return;

  dynamicFontDropdowns.forEach(dropdown => dropdown.destroy?.());
  dynamicFontDropdowns.clear();
  container.innerHTML = '';

  const styles = detectUsedStyles();
  const headerFooter = appState.getProject().headerFooter;
  const hasMarkdown = appState.getProject().files.some(f => f.type === 'markdown');

  if (!hasMarkdown) {
    if (noMarkdownMsg) noMarkdownMsg.style.display = 'block';
    if (headerFooter.header.enabled) container.appendChild(createHeaderFooterSection('header'));
    if (headerFooter.footer.enabled) container.appendChild(createHeaderFooterSection('footer'));
    if (headerFooter.header.enabled || headerFooter.footer.enabled) {
      setupInputHandlers();
      setupFontDropdowns();
      setupDynamicDraggableCaps();
    }
    return;
  }

  if (noMarkdownMsg) noMarkdownMsg.style.display = 'none';

  if (styles.hasBody) container.appendChild(createBodySection());

  const hasAnyHeading = styles.hasH1 || styles.hasH2 || styles.hasH3 || styles.hasH4 || styles.hasH5 || styles.hasH6;
  if (hasAnyHeading) container.appendChild(createHeadingsSection(styles));

  if (styles.hasBlockquote) container.appendChild(createBlockquoteSection());
  if (styles.hasHighlight) container.appendChild(createHighlightSection());
  if (styles.hasStrikethrough) container.appendChild(createStrikethroughSection());

  if (headerFooter.header.enabled) container.appendChild(createHeaderFooterSection('header'));
  if (headerFooter.footer.enabled) container.appendChild(createHeaderFooterSection('footer'));

  setupInputHandlers();
  setupFontDropdowns();
  setupDynamicDraggableCaps();
}
