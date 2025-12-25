# Google Fonts Service (`src/services/googleFonts.ts`)

The Google Fonts service manages loading and availability of web fonts from Google Fonts and system fallbacks.

## Overview

The `GoogleFontsService` class provides a centralized way to load, track, and query fonts for use in the application. It handles asynchronous font loading with caching and notification.

## Font Categories

### Google Fonts

The service includes a curated list of 40+ Google Fonts organized by category:

**Sans-Serif:**
- DM Sans, Inter, Work Sans, Space Grotesk, Syne
- Libre Franklin, Fira Sans, Alegreya Sans, Source Sans Pro
- Roboto, Poppins, Archivo Narrow, Karla, Proza Libre
- IBM Plex Sans, Manrope, Montserrat, Lato, PT Sans
- Chivo, Rubik, Open Sans, Raleway

**Serif:**
- Cormorant, Eczar, Alegreya, Source Serif Pro, Fraunces
- Inknut Antiqua, BioRhyme, Libre Baskerville, Playfair Display
- Lora, Spectral, PT Serif, Cardo, Neuton, Merriweather

**Monospace:**
- Space Mono, Inconsolata

### System Fonts

Fallback system fonts for offline use:

- **Serif**: Georgia, Times New Roman, Palatino
- **Sans-Serif**: Arial, Helvetica, Verdana
- **Monospace**: Courier New

## Key Methods

### Font Queries

| Method | Description |
|--------|-------------|
| `getAllFonts()` | Returns all available fonts (Google + System) |
| `getFontsByCategory(category)` | Filters fonts by category (serif, sans-serif, monospace, display) |
| `isGoogleFont(fontName)` | Checks if a font is from Google Fonts |
| `isFontLoaded(fontName)` | Returns true if font is loaded or is a system font |

### Font Loading

#### `loadFont(fontName: string): Promise<void>`

Loads a single Google Font asynchronously.

**Process:**
1. Checks if already loaded or loading
2. Injects Google Fonts CSS stylesheet
3. Waits for font to be available (using Font Loading API)
4. Notifies listeners when complete

#### `loadFonts(fontNames: string[]): Promise<void>`

Batch loads multiple fonts in a single request.

**Optimization:**
- Combines fonts into single CSS URL
- Parallel loading via single stylesheet
- Uses `Promise.all` for font availability checks

#### `preloadAllFonts(): Promise<void>`

Preloads all Google Fonts for instant availability in font pickers.

### Event Subscription

#### `onFontLoaded(callback: () => void): () => void`

Subscribes to font load events.

**Returns:** Unsubscribe function

**Usage:**
```typescript
const unsubscribe = googleFonts.onFontLoaded(() => {
  // Trigger reflow or re-render
  clearMeasurementCache();
  performReflow();
});
```

### Font Family String

#### `getFontFamily(fontName: string): string`

Returns CSS font-family value with appropriate fallbacks.

**Example:**
```typescript
googleFonts.getFontFamily('Source Serif 4');
// Returns: '"Source Serif 4", serif'

googleFonts.getFontFamily('Roboto');
// Returns: '"Roboto", sans-serif'
```

## Font Definition Interface

```typescript
interface FontDefinition {
  name: string;      // Display name
  family: string;    // CSS font-family value
  category: 'serif' | 'sans-serif' | 'monospace' | 'display';
  weights?: number[];  // Available weights (400, 500, 700, etc.)
}
```

## Loading Mechanism

The service uses Google Fonts CSS2 API:

```
https://fonts.googleapis.com/css2?family=Font+Name:wght@400;700&display=swap
```

**CSS Injection:**
```typescript
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = url;
document.head.appendChild(link);
```

**Font Availability Check:**
```typescript
await document.fonts.load(`16px "${fontFamily}"`);
```

## Caching Strategy

The service maintains:

- `loadedFonts: Set<string>` - Successfully loaded fonts
- `loadingFonts: Map<string, Promise<void>>` - In-progress loads

This prevents duplicate requests and allows awaiting in-progress loads.

## Integration Points

### App.ts

Listens for font loading to trigger reflow:

```typescript
googleFonts.onFontLoaded(() => {
  clearMeasurementCache();
  this.performReflow();
});
```

### FontDropdown Component

Uses the service to populate font options:

```typescript
const fonts = googleFonts.getAllFonts();
const serifFonts = googleFonts.getFontsByCategory('serif');
```

### OptionsPanel

Preloads fonts on mount:

```typescript
preloadFonts(): void {
  googleFonts.preloadAllFonts();
}
```

## Usage Example

```typescript
import { googleFonts } from '../services/googleFonts';

// Load a specific font
await googleFonts.loadFont('Playfair Display');

// Check if loaded
if (googleFonts.isFontLoaded('Playfair Display')) {
  // Safe to use in measurements
}

// Get CSS font-family string
const cssFamily = googleFonts.getFontFamily('Playfair Display');
// '"Playfair Display", serif'
```

## Singleton Pattern

The module exports a singleton instance:

```typescript
export const googleFonts = new GoogleFontsService();
```

## Error Handling

- Failed stylesheet loads are caught and logged
- Font Loading API fallback (setTimeout) for older browsers
- System fonts never fail to "load"
