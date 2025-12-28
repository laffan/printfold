# Font Service (`src/services/fontService.ts`)

The Font Service manages fonts for both web and Electron environments, with separate font lists for different use cases and support for embedding actual system fonts into PDFs.

## Overview

The `FontService` class provides centralized font management that adapts to the runtime environment:

- **Web**: Uses web-safe fonts for styles, Google Fonts for static page items
- **Electron**: Uses system fonts for styles, Google Fonts + web-safe fonts for items, and can embed actual font files into PDFs

## Font Categories

### Style Fonts (Body, Headings, etc.)

Used for markdown content styling. These fonts must render reliably in PDFs.

**Web Environment:**
Web-safe fonts that are available on most systems:

| Category | Fonts |
|----------|-------|
| Serif | Georgia, Times New Roman, Palatino, Garamond, Baskerville, Book Antiqua, Cambria |
| Sans-serif | Arial, Helvetica, Verdana, Tahoma, Trebuchet MS, Lucida Sans, Segoe UI, Calibri, Candara, Optima, Futura, Gill Sans, Century Gothic |
| Monospace | Courier New, Courier, Lucida Console, Monaco, Consolas, Menlo |

**Electron Environment:**
System fonts are discovered dynamically via IPC, providing access to all installed fonts on the user's system.

### Item Fonts (Text Objects on Static Pages)

Used for text items placed on static pages. These are rendered as images via Konva, so CORS limitations don't apply.

**Available:**
- 40+ Google Fonts (DM Sans, Inter, Playfair Display, etc.)
- All web-safe fonts

## Key Methods

### Font Lists

| Method | Description |
|--------|-------------|
| `getStyleFonts()` | Returns fonts for markdown styles (web-safe or system fonts) |
| `getItemFonts()` | Returns fonts for static page items (Google + web-safe) |
| `isElectron()` | Checks if running in Electron environment |
| `hasSystemFonts()` | Returns true if system fonts are loaded (Electron only) |

### Font Loading

#### `loadSystemFonts(): Promise<void>`

Loads available system fonts from Electron via IPC. Called automatically on startup in Electron.

#### `loadGoogleFont(fontName: string): Promise<void>`

Loads a single Google Font for use in static page items.

#### `loadGoogleFonts(fontNames: string[]): Promise<void>`

Batch loads multiple Google Fonts in a single request.

### Font File Embedding (Electron Only)

For PDF generation in Electron, actual system fonts can be embedded to ensure exact visual fidelity.

#### `canEmbedFonts(): boolean`

Returns `true` if font file embedding is available (Electron with IPC support).

#### `loadFontFileData(fontFamily: string): Promise<FontFileData | null>`

Loads font file data for all variants of a font family.

**Returns:**
```typescript
interface FontFileData {
  regular?: Uint8Array;    // Normal weight, normal style
  bold?: Uint8Array;       // Bold weight, normal style
  italic?: Uint8Array;     // Normal weight, italic style
  boldItalic?: Uint8Array; // Bold weight, italic style
}
```

**Process:**
1. Extracts primary font name from CSS font-family (handles values like `"Georgia, serif"`)
2. Requests font files from Electron main process via IPC
3. Converts base64 font data to Uint8Array for pdf-lib
4. Caches results for subsequent requests

### Font Family String

#### `getFontFamily(fontName: string): string`

Returns CSS font-family value with appropriate category fallback.

**Example:**
```typescript
fontService.getFontFamily('Georgia');
// Returns: '"Georgia", serif'

fontService.getFontFamily('Arial');
// Returns: '"Arial", sans-serif'
```

## Electron IPC Integration

### System Font Discovery

The Electron main process discovers system fonts using platform-specific methods:

| Platform | Method |
|----------|--------|
| macOS | `system_profiler SPFontsDataType` or `fc-list` |
| Windows | PowerShell with `System.Drawing.Text.InstalledFontCollection` |
| Linux | `fc-list : family` |

### Font File Reading

For PDF embedding, font files are located from system font directories:

| Platform | Directories |
|----------|-------------|
| macOS | `/Library/Fonts`, `/System/Library/Fonts`, `~/Library/Fonts` |
| Windows | `C:\Windows\Fonts`, `%LOCALAPPDATA%\Microsoft\Windows\Fonts` |
| Linux | `/usr/share/fonts`, `/usr/local/share/fonts`, `~/.fonts`, `~/.local/share/fonts` |

Font variants are detected from filenames (e.g., `GeorgiaBold.ttf`, `Georgia-Italic.ttf`).

## PDF Font Embedding Flow

```
PDFGenerator.generate()
      │
      ├──▶ Register fontkit with pdfDoc
      │
      ├──▶ buildFontCache()
      │         │
      │         ├──▶ Create fallback fonts (standard PDF fonts)
      │         │         └──▶ TimesRoman, Helvetica, Courier families
      │         │
      │         └──▶ If canEmbedFonts() (Electron):
      │                   │
      │                   ├──▶ collectFontFamilies() from project
      │                   │         └──▶ body, h1-h6, code, blockquote, header, footer
      │                   │
      │                   └──▶ For each family:
      │                             │
      │                             ├──▶ fontService.loadFontFileData()
      │                             │         └──▶ Load TTF/OTF from system
      │                             │
      │                             └──▶ pdfDoc.embedFont() with { subset: true }
      │                                       └──▶ Only include used glyphs
      │
      └──▶ Use embedded fonts for text rendering
```

## Font Subsetting

When embedding fonts, the `{ subset: true }` option is used to include only the glyphs that are actually used in the document. This dramatically reduces PDF file size:

- Without subsetting: Full font file embedded (~30MB for complex fonts)
- With subsetting: Only used characters (~50-200KB typical)

## Usage Examples

### Style Fonts (Markdown Content)

```typescript
import { fontService } from '../services/fontService';

// Get available style fonts
const fonts = fontService.getStyleFonts();

// In Electron, wait for system fonts to load
if (fontService.isElectron()) {
  await fontService.loadSystemFonts();
}

// Use in font dropdown
fonts.forEach(font => {
  console.log(`${font.name}: ${font.family} (${font.category})`);
});
```

### Item Fonts (Static Page Text)

```typescript
// Get fonts for text items
const itemFonts = fontService.getItemFonts();

// Load a specific Google font
await fontService.loadGoogleFont('Playfair Display');

// Check if loaded
if (fontService.isGoogleFontLoaded('Playfair Display')) {
  // Safe to use in canvas
}
```

### PDF Font Embedding

```typescript
// In PDFGenerator (Electron only)
if (fontService.canEmbedFonts()) {
  const fontData = await fontService.loadFontFileData('Georgia');

  if (fontData?.regular) {
    const font = await pdfDoc.embedFont(fontData.regular, { subset: true });
    // Use font for text rendering
  }
}
```

## Font Definition Interface

```typescript
interface FontDefinition {
  name: string;      // Display name (e.g., "Georgia")
  family: string;    // CSS font-family value (e.g., "Georgia")
  category: 'serif' | 'sans-serif' | 'monospace' | 'display';
  weights?: number[];  // Available weights (Google Fonts only)
  loaded?: boolean;    // For async loading status
}
```

## Legacy Compatibility

For gradual migration, a `googleFonts` export provides backwards-compatible methods:

```typescript
import { googleFonts } from '../services/fontService';

// Legacy methods still work
googleFonts.getAllFonts();
googleFonts.loadFont('Roboto');
googleFonts.getFontFamily('Roboto');
```

## Error Handling

- System font discovery failures fall back to web-safe fonts
- Missing font files log warnings and fall back to standard PDF fonts
- Unsupported font formats (TTC collections) are skipped with warning
- Google Font loading failures are caught and logged

## Key Differences from Web-Only Approach

| Aspect | Web | Electron |
|--------|-----|----------|
| Style font source | Web-safe fonts | System fonts |
| PDF body text | Standard PDF fonts (Times/Helvetica/Courier) | Actual embedded fonts |
| PDF file size | Small (no custom fonts) | Optimized with subsetting |
| Visual fidelity | Category-based fallback | Exact font matching |
