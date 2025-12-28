/**
 * Custom Font Dropdown Component
 *
 * Supports two modes:
 * - 'styles': For markdown styles (body, headings, etc.) - uses web-safe fonts (web) or system fonts (Electron)
 * - 'items': For static page items - uses Google Fonts + web-safe fonts (rendered to images)
 *
 * Features:
 * - Search filter for large font lists
 * - Async font preview loading (shows font names in their own typeface)
 * - Categorized sections (Serif, Sans-serif, Monospace)
 */

import { fontService, FontDefinition, WEB_SAFE_FONTS, GOOGLE_FONTS } from '../services/fontService';
import { env } from '../services/environment';

export type FontDropdownMode = 'styles' | 'items';

export class FontDropdown {
  private container: HTMLElement;
  private button: HTMLElement;
  private dropdown: HTMLElement;
  private searchInput: HTMLInputElement | null = null;
  private optionsContainer: HTMLElement;
  private isOpen = false;
  private selectedFont: string;
  private onChange: (fontFamily: string) => void;
  private mode: FontDropdownMode;
  private unsubscribeFontLoad: (() => void) | null = null;
  private unsubscribeSystemFonts: (() => void) | null = null;
  private fontPreviewQueue: Map<string, HTMLElement> = new Map();
  private previewCheckInProgress = false;

  constructor(
    selectElement: HTMLSelectElement,
    onChange: (fontFamily: string) => void,
    mode: FontDropdownMode = 'items'
  ) {
    this.selectedFont = selectElement.value || 'Arial';
    this.onChange = onChange;
    this.mode = mode;

    // Create custom dropdown structure
    this.container = document.createElement('div');
    this.container.className = 'font-dropdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'font-dropdown-button';
    this.button = button;

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'font-dropdown-menu';

    // Add search input for large font lists
    if (this.shouldShowSearch()) {
      const searchWrapper = document.createElement('div');
      searchWrapper.className = 'font-dropdown-search';

      this.searchInput = document.createElement('input');
      this.searchInput.type = 'text';
      this.searchInput.placeholder = 'Search fonts...';
      this.searchInput.className = 'font-dropdown-search-input';

      this.searchInput.addEventListener('input', () => {
        this.filterFonts(this.searchInput?.value || '');
      });

      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.close();
        }
      });

      searchWrapper.appendChild(this.searchInput);
      this.dropdown.appendChild(searchWrapper);
    }

    this.optionsContainer = document.createElement('div');
    this.optionsContainer.className = 'font-dropdown-options';
    this.dropdown.appendChild(this.optionsContainer);

    this.container.appendChild(this.button);
    this.container.appendChild(this.dropdown);

    // Replace select element with custom dropdown
    selectElement.parentNode?.insertBefore(this.container, selectElement);
    selectElement.style.display = 'none';

    // Build dropdown content
    this.buildDropdownContent();
    this.updateButtonDisplay();

    // Event listeners
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.close();
      }
    });

    // Keyboard navigation
    this.button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowDown' && !this.isOpen) {
        e.preventDefault();
        this.open();
      }
    });

    // Listen for font loads to update display
    if (this.mode === 'items') {
      this.unsubscribeFontLoad = fontService.onFontLoaded(() => {
        this.updateButtonDisplay();
      });
    }

    // Listen for system fonts to load (Electron only)
    if (env.isElectron && this.mode === 'styles') {
      this.unsubscribeSystemFonts = fontService.onSystemFontsLoaded(() => {
        this.buildDropdownContent();
        this.updateButtonDisplay();
      });

      // Trigger system font loading
      fontService.loadSystemFonts();
    }
  }

  private shouldShowSearch(): boolean {
    // Show search for system fonts in Electron or for items mode
    return env.isElectron || this.mode === 'items';
  }

  private getFonts(): FontDefinition[] {
    if (this.mode === 'styles') {
      return fontService.getStyleFonts();
    }
    return fontService.getItemFonts();
  }

  private buildDropdownContent(): void {
    this.optionsContainer.innerHTML = '';
    this.fontPreviewQueue.clear();

    const fonts = this.getFonts();

    if (this.mode === 'items') {
      // For items, show Google Fonts first, then web-safe fonts
      const googleHeader = document.createElement('div');
      googleHeader.className = 'font-dropdown-header';
      googleHeader.textContent = 'Google Fonts';
      this.optionsContainer.appendChild(googleHeader);

      for (const font of GOOGLE_FONTS) {
        this.optionsContainer.appendChild(this.createFontOption(font, true));
      }

      const systemHeader = document.createElement('div');
      systemHeader.className = 'font-dropdown-header';
      systemHeader.textContent = 'Web-safe Fonts';
      this.optionsContainer.appendChild(systemHeader);

      for (const font of WEB_SAFE_FONTS) {
        this.optionsContainer.appendChild(this.createFontOption(font, false));
      }
    } else {
      // For styles, group by category
      const categories: { [key: string]: FontDefinition[] } = {
        'Sans-serif': [],
        'Serif': [],
        'Monospace': [],
        'Display': [],
      };

      for (const font of fonts) {
        const cat = font.category === 'sans-serif' ? 'Sans-serif' :
                    font.category === 'serif' ? 'Serif' :
                    font.category === 'monospace' ? 'Monospace' : 'Display';
        categories[cat].push(font);
      }

      for (const [category, categoryFonts] of Object.entries(categories)) {
        if (categoryFonts.length === 0) continue;

        const header = document.createElement('div');
        header.className = 'font-dropdown-header';
        header.textContent = category;
        this.optionsContainer.appendChild(header);

        for (const font of categoryFonts) {
          this.optionsContainer.appendChild(this.createFontOption(font, false));
        }
      }
    }

    // Start async font preview loading
    this.startFontPreviewLoading();
  }

  private createFontOption(font: FontDefinition, isGoogleFont: boolean): HTMLElement {
    const option = document.createElement('div');
    option.className = 'font-dropdown-option';
    option.dataset.value = font.family;
    option.dataset.name = font.name.toLowerCase();
    option.textContent = font.name;

    // For system fonts in Electron or web-safe fonts, try to show in font face immediately
    if (!isGoogleFont) {
      option.style.fontFamily = `"${font.family}", ${font.category}`;
    } else {
      // For Google fonts, queue for async loading
      this.fontPreviewQueue.set(font.name, option);
    }

    if (font.family === this.selectedFont || font.name === this.selectedFont) {
      option.classList.add('selected');
    }

    option.addEventListener('click', () => {
      this.selectFont(font.family);
    });

    // Load Google font on hover
    if (isGoogleFont) {
      option.addEventListener('mouseenter', () => {
        fontService.loadGoogleFont(font.name).then(() => {
          option.style.fontFamily = fontService.getFontFamily(font.name);
        });
      });
    }

    return option;
  }

  private startFontPreviewLoading(): void {
    if (this.previewCheckInProgress || this.fontPreviewQueue.size === 0) return;

    this.previewCheckInProgress = true;

    // Load fonts in batches to avoid overwhelming the browser
    const loadBatch = async () => {
      const batchSize = 5;
      const entries = Array.from(this.fontPreviewQueue.entries()).slice(0, batchSize);

      if (entries.length === 0) {
        this.previewCheckInProgress = false;
        return;
      }

      for (const [fontName, element] of entries) {
        this.fontPreviewQueue.delete(fontName);

        // Try to load the font
        try {
          await fontService.loadGoogleFont(fontName);
          element.style.fontFamily = fontService.getFontFamily(fontName);
        } catch {
          // Font loading failed, keep default style
        }
      }

      // Continue with next batch after a small delay
      if (this.fontPreviewQueue.size > 0) {
        requestAnimationFrame(() => loadBatch());
      } else {
        this.previewCheckInProgress = false;
      }
    };

    requestAnimationFrame(() => loadBatch());
  }

  private filterFonts(query: string): void {
    const lowerQuery = query.toLowerCase();
    const options = this.optionsContainer.querySelectorAll('.font-dropdown-option');
    const headers = this.optionsContainer.querySelectorAll('.font-dropdown-header');

    // Track which headers have visible children
    const visibleCategories = new Set<Element>();

    options.forEach((option) => {
      const el = option as HTMLElement;
      const name = el.dataset.name || '';
      const visible = name.includes(lowerQuery);
      el.style.display = visible ? '' : 'none';

      if (visible) {
        // Find the preceding header
        let prev = el.previousElementSibling;
        while (prev && !prev.classList.contains('font-dropdown-header')) {
          prev = prev.previousElementSibling;
        }
        if (prev) visibleCategories.add(prev);
      }
    });

    // Show/hide headers based on whether they have visible children
    headers.forEach((header) => {
      (header as HTMLElement).style.display = visibleCategories.has(header) ? '' : 'none';
    });
  }

  private selectFont(fontFamily: string): void {
    this.selectedFont = fontFamily;
    this.updateButtonDisplay();
    this.updateSelectedOption();
    this.close();
    this.onChange(fontFamily);
  }

  private updateButtonDisplay(): void {
    const allFonts = [...GOOGLE_FONTS, ...WEB_SAFE_FONTS];
    const font = allFonts.find(f => f.family === this.selectedFont || f.name === this.selectedFont);

    if (font) {
      this.button.textContent = font.name;
      if (fontService.isGoogleFont(font.name)) {
        // For Google fonts, only show in font face if loaded
        if (fontService.isGoogleFontLoaded(font.name)) {
          this.button.style.fontFamily = fontService.getFontFamily(font.name);
        } else {
          this.button.style.fontFamily = '';
        }
      } else {
        this.button.style.fontFamily = fontService.getFontFamily(font.name);
      }
    } else {
      // System font or unknown font
      this.button.textContent = this.selectedFont;
      this.button.style.fontFamily = `"${this.selectedFont}", sans-serif`;
    }
  }

  private updateSelectedOption(): void {
    const options = this.optionsContainer.querySelectorAll('.font-dropdown-option');
    options.forEach((opt) => {
      const el = opt as HTMLElement;
      if (el.dataset.value === this.selectedFont) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.isOpen = true;
    this.container.classList.add('open');

    // Focus search input if present
    if (this.searchInput) {
      this.searchInput.value = '';
      this.filterFonts('');
      setTimeout(() => this.searchInput?.focus(), 0);
    }

    // Scroll selected option into view
    const selected = this.optionsContainer.querySelector('.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  private close(): void {
    this.isOpen = false;
    this.container.classList.remove('open');
  }

  setValue(fontFamily: string): void {
    this.selectedFont = fontFamily;
    this.updateButtonDisplay();
    this.updateSelectedOption();
  }

  destroy(): void {
    if (this.unsubscribeFontLoad) {
      this.unsubscribeFontLoad();
    }
    if (this.unsubscribeSystemFonts) {
      this.unsubscribeSystemFonts();
    }
  }
}

/**
 * Initialize a font dropdown from a select element
 */
export function createFontDropdown(
  selectId: string,
  onChange: (fontFamily: string) => void,
  mode: FontDropdownMode = 'items'
): FontDropdown | null {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return null;
  return new FontDropdown(select, onChange, mode);
}

/**
 * Create a styles font dropdown (web-safe for web, system fonts for Electron)
 */
export function createStylesFontDropdown(
  selectId: string,
  onChange: (fontFamily: string) => void
): FontDropdown | null {
  return createFontDropdown(selectId, onChange, 'styles');
}

/**
 * Create an items font dropdown (Google Fonts + web-safe fonts)
 */
export function createItemsFontDropdown(
  selectId: string,
  onChange: (fontFamily: string) => void
): FontDropdown | null {
  return createFontDropdown(selectId, onChange, 'items');
}
