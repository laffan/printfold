/**
 * Custom Font Dropdown Component
 * Displays font names in their own typeface with proper styling
 */

import { googleFonts, GOOGLE_FONTS, SYSTEM_FONTS, FontDefinition } from '../services/googleFonts';

export class FontDropdown {
  private container: HTMLElement;
  private button: HTMLElement;
  private dropdown: HTMLElement;
  private isOpen = false;
  private selectedFont: string;
  private onChange: (fontFamily: string) => void;
  private unsubscribeFontLoad: (() => void) | null = null;

  constructor(
    selectElement: HTMLSelectElement,
    onChange: (fontFamily: string) => void
  ) {
    this.selectedFont = selectElement.value || GOOGLE_FONTS[0].family;
    this.onChange = onChange;

    // Create custom dropdown structure
    this.container = document.createElement('div');
    this.container.className = 'font-dropdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'font-dropdown-button';
    this.button = button;

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'font-dropdown-menu';

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
    this.unsubscribeFontLoad = googleFonts.onFontLoaded(() => {
      this.updateButtonDisplay();
    });
  }

  private buildDropdownContent(): void {
    this.dropdown.innerHTML = '';

    // Google Fonts section
    const googleHeader = document.createElement('div');
    googleHeader.className = 'font-dropdown-header';
    googleHeader.textContent = 'Google Fonts';
    this.dropdown.appendChild(googleHeader);

    for (const font of GOOGLE_FONTS) {
      this.dropdown.appendChild(this.createFontOption(font));
    }

    // System Fonts section
    const systemHeader = document.createElement('div');
    systemHeader.className = 'font-dropdown-header';
    systemHeader.textContent = 'System Fonts';
    this.dropdown.appendChild(systemHeader);

    for (const font of SYSTEM_FONTS) {
      this.dropdown.appendChild(this.createFontOption(font));
    }
  }

  private createFontOption(font: FontDefinition): HTMLElement {
    const option = document.createElement('div');
    option.className = 'font-dropdown-option';
    option.dataset.value = font.family;
    option.textContent = font.name;
    option.style.fontFamily = googleFonts.getFontFamily(font.name);

    if (font.family === this.selectedFont) {
      option.classList.add('selected');
    }

    option.addEventListener('click', () => {
      this.selectFont(font.family);
    });

    option.addEventListener('mouseenter', () => {
      // Ensure font is loaded when hovering
      googleFonts.loadFont(font.name);
    });

    return option;
  }

  private selectFont(fontFamily: string): void {
    this.selectedFont = fontFamily;
    this.updateButtonDisplay();
    this.updateSelectedOption();
    this.close();
    this.onChange(fontFamily);
  }

  private updateButtonDisplay(): void {
    const font = [...GOOGLE_FONTS, ...SYSTEM_FONTS].find(
      f => f.family === this.selectedFont
    );

    if (font) {
      this.button.textContent = font.name;
      this.button.style.fontFamily = googleFonts.getFontFamily(font.name);
    } else {
      this.button.textContent = this.selectedFont;
      this.button.style.fontFamily = this.selectedFont;
    }
  }

  private updateSelectedOption(): void {
    const options = this.dropdown.querySelectorAll('.font-dropdown-option');
    options.forEach(opt => {
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
    this.dropdown.style.display = 'block';

    // Scroll selected option into view
    const selected = this.dropdown.querySelector('.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  private close(): void {
    this.isOpen = false;
    this.container.classList.remove('open');
    this.dropdown.style.display = 'none';
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
  }
}

/**
 * Initialize a font dropdown from a select element
 */
export function createFontDropdown(
  selectId: string,
  onChange: (fontFamily: string) => void
): FontDropdown | null {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return null;
  return new FontDropdown(select, onChange);
}
