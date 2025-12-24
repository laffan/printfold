/**
 * Google Fonts service for loading and managing web fonts
 */

export interface FontDefinition {
  name: string;
  family: string; // CSS font-family value
  category: 'serif' | 'sans-serif' | 'monospace' | 'display';
  weights?: number[];
}

// List of Google Fonts to make available
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

// System fonts as fallbacks
export const SYSTEM_FONTS: FontDefinition[] = [
  { name: 'Georgia', family: 'Georgia', category: 'serif' },
  { name: 'Times New Roman', family: 'Times New Roman', category: 'serif' },
  { name: 'Palatino', family: 'Palatino Linotype, Palatino', category: 'serif' },
  { name: 'Arial', family: 'Arial', category: 'sans-serif' },
  { name: 'Helvetica', family: 'Helvetica Neue, Helvetica', category: 'sans-serif' },
  { name: 'Verdana', family: 'Verdana', category: 'sans-serif' },
  { name: 'Courier New', family: 'Courier New', category: 'monospace' },
];

class GoogleFontsService {
  private loadedFonts = new Set<string>();
  private loadingFonts = new Map<string, Promise<void>>();
  private fontLoadCallbacks = new Set<() => void>();

  /**
   * Get all available fonts (Google + System)
   */
  getAllFonts(): FontDefinition[] {
    return [...GOOGLE_FONTS, ...SYSTEM_FONTS];
  }

  /**
   * Get fonts by category
   */
  getFontsByCategory(category: FontDefinition['category']): FontDefinition[] {
    return this.getAllFonts().filter(f => f.category === category);
  }

  /**
   * Check if a font is a Google Font
   */
  isGoogleFont(fontName: string): boolean {
    return GOOGLE_FONTS.some(f => f.name === fontName || f.family === fontName);
  }

  /**
   * Check if a font is loaded
   */
  isFontLoaded(fontName: string): boolean {
    return this.loadedFonts.has(fontName) || !this.isGoogleFont(fontName);
  }

  /**
   * Load a single Google Font
   */
  async loadFont(fontName: string): Promise<void> {
    const font = GOOGLE_FONTS.find(f => f.name === fontName || f.family === fontName);
    if (!font) return; // System font or not found

    if (this.loadedFonts.has(font.name)) return;

    // Check if already loading
    if (this.loadingFonts.has(font.name)) {
      return this.loadingFonts.get(font.name);
    }

    const loadPromise = this.doLoadFont(font);
    this.loadingFonts.set(font.name, loadPromise);

    try {
      await loadPromise;
      this.loadedFonts.add(font.name);
      this.notifyFontLoaded();
    } finally {
      this.loadingFonts.delete(font.name);
    }
  }

  /**
   * Load multiple fonts at once
   */
  async loadFonts(fontNames: string[]): Promise<void> {
    const googleFonts = fontNames
      .map(name => GOOGLE_FONTS.find(f => f.name === name || f.family === name))
      .filter((f): f is FontDefinition => f !== undefined)
      .filter(f => !this.loadedFonts.has(f.name));

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
      this.loadedFonts.add(font.name);
    }
    this.notifyFontLoaded();
  }

  /**
   * Preload all Google Fonts (for font preview in dropdowns)
   */
  async preloadAllFonts(): Promise<void> {
    const fontNames = GOOGLE_FONTS.map(f => f.name);
    await this.loadFonts(fontNames);
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
    const font = this.getAllFonts().find(f => f.name === fontName || f.family === fontName);
    if (!font) return fontName;

    const fallback = font.category === 'serif' ? 'serif' :
                     font.category === 'monospace' ? 'monospace' : 'sans-serif';

    return `"${font.family}", ${fallback}`;
  }

  private async doLoadFont(font: FontDefinition): Promise<void> {
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

export const googleFonts = new GoogleFontsService();
