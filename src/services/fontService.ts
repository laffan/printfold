/**
 * Font Service - Manages fonts for both web and Electron environments
 *
 * For Styles (body, headings, etc.): Uses web-safe fonts (web) or system fonts (Electron)
 * For Static Page Items: Uses Google Fonts (rendered to images, no CORS issues)
 */

import { env } from './environment';

export interface FontDefinition {
  name: string;
  family: string; // CSS font-family value
  category: 'serif' | 'sans-serif' | 'monospace' | 'display';
  weights?: number[];
  loaded?: boolean; // For async font loading in Electron
}

// Web-safe fonts that work reliably in PDFs across all platforms
export const WEB_SAFE_FONTS: FontDefinition[] = [
  // Serif fonts
  { name: 'Georgia', family: 'Georgia', category: 'serif' },
  { name: 'Times New Roman', family: 'Times New Roman', category: 'serif' },
  { name: 'Palatino', family: 'Palatino Linotype, Palatino, Book Antiqua', category: 'serif' },
  { name: 'Garamond', family: 'Garamond, EB Garamond', category: 'serif' },
  { name: 'Baskerville', family: 'Baskerville, Baskerville Old Face', category: 'serif' },
  { name: 'Book Antiqua', family: 'Book Antiqua, Palatino', category: 'serif' },
  { name: 'Cambria', family: 'Cambria', category: 'serif' },

  // Sans-serif fonts
  { name: 'Arial', family: 'Arial', category: 'sans-serif' },
  { name: 'Helvetica', family: 'Helvetica Neue, Helvetica', category: 'sans-serif' },
  { name: 'Verdana', family: 'Verdana', category: 'sans-serif' },
  { name: 'Tahoma', family: 'Tahoma', category: 'sans-serif' },
  { name: 'Trebuchet MS', family: 'Trebuchet MS', category: 'sans-serif' },
  { name: 'Lucida Sans', family: 'Lucida Sans Unicode, Lucida Grande', category: 'sans-serif' },
  { name: 'Segoe UI', family: 'Segoe UI', category: 'sans-serif' },
  { name: 'Calibri', family: 'Calibri', category: 'sans-serif' },
  { name: 'Candara', family: 'Candara', category: 'sans-serif' },
  { name: 'Optima', family: 'Optima', category: 'sans-serif' },
  { name: 'Futura', family: 'Futura', category: 'sans-serif' },
  { name: 'Gill Sans', family: 'Gill Sans, Gill Sans MT', category: 'sans-serif' },
  { name: 'Century Gothic', family: 'Century Gothic', category: 'sans-serif' },

  // Monospace fonts
  { name: 'Courier New', family: 'Courier New', category: 'monospace' },
  { name: 'Courier', family: 'Courier', category: 'monospace' },
  { name: 'Lucida Console', family: 'Lucida Console', category: 'monospace' },
  { name: 'Monaco', family: 'Monaco', category: 'monospace' },
  { name: 'Consolas', family: 'Consolas', category: 'monospace' },
  { name: 'Menlo', family: 'Menlo', category: 'monospace' },
];

// Google Fonts for static page items (rendered to images, no CORS issues)
export const GOOGLE_FONTS: FontDefinition[] = [
  // Sans-serif fonts
  { name: 'DM Sans', family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Inter', family: 'Inter', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Work Sans', family: 'Work Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Space Grotesk', family: 'Space Grotesk', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Syne', family: 'Syne', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Libre Franklin', family: 'Libre Franklin', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Fira Sans', family: 'Fira Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Alegreya Sans', family: 'Alegreya Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Source Sans Pro', family: 'Source Sans 3', category: 'sans-serif', weights: [400, 600, 700] },
  { name: 'Roboto', family: 'Roboto', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Poppins', family: 'Poppins', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Archivo Narrow', family: 'Archivo Narrow', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Karla', family: 'Karla', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Proza Libre', family: 'Proza Libre', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'IBM Plex Sans', family: 'IBM Plex Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Manrope', family: 'Manrope', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Montserrat', family: 'Montserrat', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Lato', family: 'Lato', category: 'sans-serif', weights: [400, 700] },
  { name: 'PT Sans', family: 'PT Sans', category: 'sans-serif', weights: [400, 700] },
  { name: 'Chivo', family: 'Chivo', category: 'sans-serif', weights: [400, 700] },
  { name: 'Rubik', family: 'Rubik', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Open Sans', family: 'Open Sans', category: 'sans-serif', weights: [400, 600, 700] },
  { name: 'Raleway', family: 'Raleway', category: 'sans-serif', weights: [400, 500, 700] },

  // Serif fonts
  { name: 'Cormorant', family: 'Cormorant', category: 'serif', weights: [400, 500, 700] },
  { name: 'Eczar', family: 'Eczar', category: 'serif', weights: [400, 500, 700] },
  { name: 'Alegreya', family: 'Alegreya', category: 'serif', weights: [400, 500, 700] },
  { name: 'Source Serif Pro', family: 'Source Serif 4', category: 'serif', weights: [400, 600, 700] },
  { name: 'Fraunces', family: 'Fraunces', category: 'serif', weights: [400, 500, 700] },
  { name: 'Inknut Antiqua', family: 'Inknut Antiqua', category: 'serif', weights: [400, 500, 700] },
  { name: 'BioRhyme', family: 'BioRhyme', category: 'serif', weights: [400, 700] },
  { name: 'Libre Baskerville', family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { name: 'Playfair Display', family: 'Playfair Display', category: 'serif', weights: [400, 500, 700] },
  { name: 'Lora', family: 'Lora', category: 'serif', weights: [400, 500, 700] },
  { name: 'Spectral', family: 'Spectral', category: 'serif', weights: [400, 500, 700] },
  { name: 'PT Serif', family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { name: 'Cardo', family: 'Cardo', category: 'serif', weights: [400, 700] },
  { name: 'Neuton', family: 'Neuton', category: 'serif', weights: [400, 700] },
  { name: 'Merriweather', family: 'Merriweather', category: 'serif', weights: [400, 700] },

  // Monospace fonts
  { name: 'Space Mono', family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { name: 'Inconsolata', family: 'Inconsolata', category: 'monospace', weights: [400, 700] },
];

class FontService {
  private loadedGoogleFonts = new Set<string>();
  private loadingGoogleFonts = new Map<string, Promise<void>>();
  private fontLoadCallbacks = new Set<() => void>();

  // System fonts (for Electron)
  private systemFonts: FontDefinition[] = [];
  private systemFontsLoaded = false;
  private systemFontsLoading = false;
  private systemFontLoadCallbacks = new Set<() => void>();

  // Track which fonts have been checked for availability
  private fontPreviewLoaded = new Map<string, boolean>();

  /**
   * Get fonts for markdown styles (body, headings, etc.)
   * Uses web-safe fonts for web, system fonts for Electron
   */
  getStyleFonts(): FontDefinition[] {
    if (env.isElectron && this.systemFontsLoaded) {
      return this.systemFonts;
    }
    return WEB_SAFE_FONTS;
  }

  /**
   * Get fonts for static page items (text objects)
   * Uses Google Fonts + web-safe fonts (rendered to images, no CORS)
   */
  getItemFonts(): FontDefinition[] {
    return [...GOOGLE_FONTS, ...WEB_SAFE_FONTS];
  }

  /**
   * Check if running in Electron
   */
  isElectron(): boolean {
    return env.isElectron;
  }

  /**
   * Check if system fonts are available (Electron only)
   */
  hasSystemFonts(): boolean {
    return this.systemFontsLoaded;
  }

  /**
   * Load system fonts from Electron (async)
   */
  async loadSystemFonts(): Promise<void> {
    if (!env.isElectron || this.systemFontsLoaded || this.systemFontsLoading) {
      return;
    }

    this.systemFontsLoading = true;

    try {
      const fonts = await window.electronAPI?.getSystemFonts?.();
      if (fonts && Array.isArray(fonts)) {
        this.systemFonts = fonts.map((fontName: string) => ({
          name: fontName,
          family: fontName,
          category: this.guessFontCategory(fontName),
          loaded: false,
        }));
        this.systemFontsLoaded = true;
        this.notifySystemFontsLoaded();
      }
    } catch (error) {
      console.error('Failed to load system fonts:', error);
      // Fall back to web-safe fonts
    } finally {
      this.systemFontsLoading = false;
    }
  }

  /**
   * Guess font category based on name
   */
  private guessFontCategory(fontName: string): 'serif' | 'sans-serif' | 'monospace' | 'display' {
    const lower = fontName.toLowerCase();

    if (lower.includes('mono') || lower.includes('code') || lower.includes('console') ||
        lower.includes('courier') || lower.includes('menlo') || lower.includes('consolas')) {
      return 'monospace';
    }

    if (lower.includes('serif') || lower.includes('times') || lower.includes('georgia') ||
        lower.includes('garamond') || lower.includes('baskerville') || lower.includes('bodoni') ||
        lower.includes('palatino') || lower.includes('cambria')) {
      return 'serif';
    }

    if (lower.includes('display') || lower.includes('decorative') || lower.includes('script') ||
        lower.includes('hand') || lower.includes('brush') || lower.includes('comic')) {
      return 'display';
    }

    return 'sans-serif';
  }

  /**
   * Subscribe to system fonts load event
   */
  onSystemFontsLoaded(callback: () => void): () => void {
    this.systemFontLoadCallbacks.add(callback);
    return () => this.systemFontLoadCallbacks.delete(callback);
  }

  private notifySystemFontsLoaded(): void {
    for (const callback of this.systemFontLoadCallbacks) {
      callback();
    }
  }

  /**
   * Check if a font is a Google Font
   */
  isGoogleFont(fontName: string): boolean {
    return GOOGLE_FONTS.some(f => f.name === fontName || f.family === fontName);
  }

  /**
   * Check if a Google font is loaded
   */
  isGoogleFontLoaded(fontName: string): boolean {
    return this.loadedGoogleFonts.has(fontName) || !this.isGoogleFont(fontName);
  }

  /**
   * Load a single Google Font (for static page items)
   */
  async loadGoogleFont(fontName: string): Promise<void> {
    const font = GOOGLE_FONTS.find(f => f.name === fontName || f.family === fontName);
    if (!font) return; // Not a Google font

    if (this.loadedGoogleFonts.has(font.name)) return;

    // Check if already loading
    if (this.loadingGoogleFonts.has(font.name)) {
      return this.loadingGoogleFonts.get(font.name);
    }

    const loadPromise = this.doLoadGoogleFont(font);
    this.loadingGoogleFonts.set(font.name, loadPromise);

    try {
      await loadPromise;
      this.loadedGoogleFonts.add(font.name);
      this.notifyFontLoaded();
    } finally {
      this.loadingGoogleFonts.delete(font.name);
    }
  }

  /**
   * Load multiple Google fonts at once
   */
  async loadGoogleFonts(fontNames: string[]): Promise<void> {
    const googleFonts = fontNames
      .map(name => GOOGLE_FONTS.find(f => f.name === name || f.family === name))
      .filter((f): f is FontDefinition => f !== undefined)
      .filter(f => !this.loadedGoogleFonts.has(f.name));

    if (googleFonts.length === 0) return;

    // Build Google Fonts URL for batch loading
    const families = googleFonts.map(f => {
      const weights = f.weights?.join(';') || '400;700';
      return `family=${encodeURIComponent(f.family)}:wght@${weights}`;
    }).join('&');

    const url = `https://fonts.googleapis.com/css2?${families}&display=swap`;

    await this.injectStylesheet(url);

    // Wait for fonts to actually be available
    await Promise.all(googleFonts.map(f => this.waitForFont(f.family)));

    for (const font of googleFonts) {
      this.loadedGoogleFonts.add(font.name);
    }
    this.notifyFontLoaded();
  }

  /**
   * Preload all Google Fonts (for font preview in item dropdowns)
   */
  async preloadAllGoogleFonts(): Promise<void> {
    const fontNames = GOOGLE_FONTS.map(f => f.name);
    await this.loadGoogleFonts(fontNames);
  }

  /**
   * Subscribe to font load events
   */
  onFontLoaded(callback: () => void): () => void {
    this.fontLoadCallbacks.add(callback);
    return () => this.fontLoadCallbacks.delete(callback);
  }

  /**
   * Get CSS font-family value with fallbacks
   */
  getFontFamily(fontName: string): string {
    const allFonts = [...GOOGLE_FONTS, ...WEB_SAFE_FONTS, ...this.systemFonts];
    const font = allFonts.find(f => f.name === fontName || f.family === fontName);
    if (!font) return fontName;

    const fallback = font.category === 'serif' ? 'serif' :
                     font.category === 'monospace' ? 'monospace' : 'sans-serif';

    return `"${font.family}", ${fallback}`;
  }

  /**
   * Check if a font is available in the browser (for preview)
   */
  async checkFontAvailable(fontFamily: string): Promise<boolean> {
    if (this.fontPreviewLoaded.has(fontFamily)) {
      return this.fontPreviewLoaded.get(fontFamily) || false;
    }

    // Use Font Loading API if available
    if ('fonts' in document) {
      try {
        const result = await document.fonts.check(`16px "${fontFamily}"`);
        this.fontPreviewLoaded.set(fontFamily, result);
        return result;
      } catch {
        return false;
      }
    }

    return true; // Assume available if we can't check
  }

  private async doLoadGoogleFont(font: FontDefinition): Promise<void> {
    const weights = font.weights?.join(';') || '400;700';
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${weights}&display=swap`;

    await this.injectStylesheet(url);
    await this.waitForFont(font.family);
  }

  private injectStylesheet(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already injected
      const existing = document.querySelector(`link[href="${url}"]`);
      if (existing) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load font: ${url}`));
      document.head.appendChild(link);
    });
  }

  private waitForFont(fontFamily: string): Promise<void> {
    return new Promise((resolve) => {
      // Use the Font Loading API if available
      if ('fonts' in document) {
        document.fonts.load(`16px "${fontFamily}"`).then(() => resolve());
      } else {
        // Fallback: wait a bit and hope it's loaded
        setTimeout(resolve, 100);
      }
    });
  }

  private notifyFontLoaded(): void {
    for (const callback of this.fontLoadCallbacks) {
      callback();
    }
  }
}

export const fontService = new FontService();

// Legacy compatibility exports for gradual migration
export const googleFonts = {
  getAllFonts: () => fontService.getItemFonts(),
  getFontsByCategory: (category: FontDefinition['category']) =>
    fontService.getItemFonts().filter(f => f.category === category),
  isGoogleFont: (fontName: string) => fontService.isGoogleFont(fontName),
  isFontLoaded: (fontName: string) => fontService.isGoogleFontLoaded(fontName),
  loadFont: (fontName: string) => fontService.loadGoogleFont(fontName),
  loadFonts: (fontNames: string[]) => fontService.loadGoogleFonts(fontNames),
  preloadAllFonts: () => fontService.preloadAllGoogleFonts(),
  onFontLoaded: (callback: () => void) => fontService.onFontLoaded(callback),
  getFontFamily: (fontName: string) => fontService.getFontFamily(fontName),
};
