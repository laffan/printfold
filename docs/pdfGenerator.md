# PDF Generator (`src/services/pdfGenerator.ts`)

The PDF Generator creates print-ready PDF files with booklet imposition using the pdf-lib library.

## Overview

The `PDFGenerator` class generates imposed PDF documents suitable for duplex printing and folding into booklets. It handles text rendering, shapes, images, and print marks.

## Architecture

```
Project State
      │
      ▼
PDFGenerator.generate()
      │
      ├──▶ Create PDFDocument
      ├──▶ Register fontkit (for custom font embedding)
      ├──▶ Build font cache
      │         │
      │         ├──▶ Embed fallback fonts (StandardFonts)
      │         │
      │         └──▶ If Electron: Embed actual system fonts
      │                   ├──▶ Collect font families from project
      │                   ├──▶ Load font files via fontService
      │                   └──▶ Embed with subsetting
      │
      ├──▶ Build global page map (for cross-signature adjacency)
      ├──▶ Pre-render pages with items (via Konva/pageRenderer)
      ├──▶ Embed images
      │
      ▼
For each Signature:
      │
      ├──▶ generateSignatureSheets()
      │         │
      │         ├──▶ Front page (multiple rows if fill mode)
      │         │         └──▶ drawPageContent() for each position
      │         │
      │         └──▶ Back page (same layout, for duplex)
      │                   └──▶ drawPageContent() for each position
      │
      └──▶ addPrintMarks()
              │
              └──▶ Cut marks, fold indicators
      │
      ▼
  Uint8Array (PDF bytes)
```

## Pre-rendering Pipeline

Items on pages are pre-rendered using Konva for high-fidelity output:

```
preRenderStaticPages()
      │
      ├──▶ Build global page map for reading-order adjacency
      │
      ├──▶ For each page (static, available, or text with items):
      │         │
      │         ├──▶ Find reading-order adjacent page (pageNumber ± 1)
      │         ├──▶ Detect crossing items from adjacent page
      │         └──▶ renderPageToImage() via Konva
      │                   │
      │                   ├──▶ Draw background (if any)
      │                   ├──▶ Draw page items with gradients/fonts
      │                   ├──▶ Draw crossing items (offset and clipped)
      │                   └──▶ Export as PNG at 300 DPI
      │
      └──▶ Cache as PDFImage for each page number
```

## Key Methods

### Main Entry Point

#### `generate(): Promise<Uint8Array>`

Generates the complete PDF document.

**Process:**
1. Creates PDFDocument instance
2. Registers fontkit for custom font embedding
3. Builds font cache:
   - Embeds standard fallback fonts (Times Roman, Helvetica, Courier families)
   - In Electron: Embeds actual system fonts with subsetting
4. Builds global page map for cross-signature adjacency lookup
5. Pre-renders pages with items via Konva (preserves gradients, fonts, shadows)
6. Embeds images used in static pages
7. Generates signature sheets with imposition
8. Adds print marks (cut marks, fold indicators)
9. Returns PDF as Uint8Array

### Signature Generation

#### `generateSignatureSheets(pdfDoc, signature, sheetSize, pageWidth, pageHeight): Promise<void>`

Creates imposed sheets for a single signature.

**Key Features:**
- Supports multi-row layouts (`fillAvailableSpace` mode)
- Handles both front and back of sheets
- Passes adjacent page context for spanning items
- Tracks static spreads for spanning item rendering

### Page Drawing

#### `drawPageContent(pdfPage, pageContent, x, y, width, height, project, isRecto, adjacentPage?, spanningItems?)`

Draws a single page at the specified position.

**For static/available pages:**
- Uses pre-rendered image if available (includes items with gradients, fonts, shadows)
- Falls back to direct pdf-lib drawing with clipping if pre-render unavailable

**For text pages:**
- Renders text content via pdf-lib (headings, paragraphs)
- Overlays pre-rendered items image if page has items
- Falls back to direct item drawing with pdf-lib clipping

**Handles:**
- Page backgrounds (solid colors, gradients via pre-render)
- Content sections (headings, paragraphs, images)
- Headers and footers with placeholders (`{{pageNumber}}`)
- Items on any page type (static, available, or text)
- Cross-page items from adjacent pages (using reading-order adjacency)
- Spanning items that bridge verso and recto

#### `drawPageItems(pdfPage, items, pageX, pageY, pageWidth, pageHeight)`

Renders page items (shapes, text, images) on static pages.

**Item Types:**
- **Text**: Font, size, color, alignment, rotation
- **Shapes**: Rectangle, ellipse, circle, line, arrow
- **Images**: Embedded from project files

#### `drawPageItemsClipped(pdfPage, items, pageX, pageY, pageWidth, pageHeight, itemOffsetX, clipWidth)`

Renders items with clipping for cross-page content (fallback when pre-rendering unavailable).

**Features:**
- Calculates visible portion of items
- Applies offset for adjacent page items
- Clips rectangles to visible region
- Used with pdf-lib clipping path for proper boundary enforcement

**Note:** This is primarily a fallback. Items are normally pre-rendered via Konva which provides proper clipping for all shape types including circles and ellipses.

### Print Marks

#### `addPrintMarks(pdfDoc, sheetSize, pageHeight, rowsPerSheet, showFoldMarks, cropMarkOptions?)`

Adds production marks to all pages.

**Parameters:**
- `showFoldMarks` (boolean, default: false) - Whether to show fold marks
- `cropMarkOptions` (optional) - Configuration for crop marks:
  - `showCropMarks` (boolean, default: true) - Whether to show crop marks
  - `cropMarkColor` (string, default: '#000000') - Hex color for crop marks
  - `cropMarkThickness` (number, default: 0.5) - Line thickness in points

**Marks Added:**
- Corner cut marks (L-shaped, configurable color/thickness) - only if `showCropMarks` is true
- Center fold marks (top and bottom, light gray) - only if `showFoldMarks` is true
- Horizontal cut marks for multi-row layouts (configurable color/thickness) - only if `showCropMarks` is true
- Horizontal fold marks at cut lines - only if `showFoldMarks` is true

**Note:** Fold marks are always drawn in light gray (rgb 0.7, 0.7, 0.7) regardless of crop mark color settings.

### Font Handling

The PDF generator supports two font embedding modes:

#### Electron: Actual Font Embedding

In Electron, actual system fonts are embedded into PDFs for exact visual fidelity:

1. **Font Collection**: `collectFontFamilies()` gathers all fonts used in:
   - Body text, headings (h1-h6), code blocks, blockquotes
   - Headers and footers

2. **Font Loading**: For each family, `fontService.loadFontFileData()` loads TTF/OTF files from the system

3. **Font Embedding**: Fonts are embedded using pdf-lib with fontkit:
   ```typescript
   pdfDoc.registerFontkit(fontkit);
   const font = await pdfDoc.embedFont(fontData, { subset: true });
   ```

4. **Subsetting**: The `{ subset: true }` option includes only used glyphs, reducing file size from ~30MB to ~50-200KB

#### Web: Standard PDF Fonts

In web environments, standard PDF fonts provide reliable fallback:

**Font Mapping:**
| Category | PDF Font Family |
|----------|-----------------|
| Serif | TimesRoman, TimesRomanBold, TimesRomanItalic, TimesRomanBoldItalic |
| Sans-serif | Helvetica, HelveticaBold, HelveticaOblique, HelveticaBoldOblique |
| Monospace | Courier, CourierBold, CourierOblique, CourierBoldOblique |

#### Font Cache Structure

```typescript
interface FontCache {
  embedded: Map<string, FontVariants>;  // Actual embedded fonts (Electron)
  fallback: {
    serif: FontVariants;    // TimesRoman family
    sans: FontVariants;     // Helvetica family
    mono: FontVariants;     // Courier family
  };
}

interface FontVariants {
  regular: PDFFont;
  bold?: PDFFont;
  italic?: PDFFont;
  boldItalic?: PDFFont;
}
```

#### `getFont(style: FontStyle, fontCache: FontCache): PDFFont`

Looks up the appropriate font:
1. First checks `embedded` map for exact match (Electron)
2. Falls back to category-based standard fonts

#### `getTextItemFont(textItem: TextPageItem): PDFFont`

Similar lookup for text page items.

### Text Sanitization

#### `sanitizeText(text: string): string`

Converts text to WinAnsi encoding compatible characters.

**Replacements:**
- Smart quotes → straight quotes
- Em/en dashes → hyphens
- Ellipsis → three dots
- Non-breaking space → regular space
- Removes characters outside WinAnsi range

### Color Handling

#### `parseColor(colorStr: string): RGB`

Converts hex color strings to pdf-lib RGB values.

#### `getFillColorFromConfig(fill: FillConfig | undefined, fallbackColor?: string): RGB | undefined`

Extracts color from FillConfig (uses first gradient stop for gradients).

### Image Handling

#### `embedImages(pdfDoc, project): Promise<void>`

Embeds all images used on static pages.

**Process:**
1. Collects image file IDs from all static/blank pages
2. Converts base64 content to Uint8Array
3. Attempts PNG embedding, falls back to JPEG
4. Stores in `imageCache` Map for later use

### Spanning Items

#### `spanningItemToPageItem(item: SpanningItem): PageItem | null`

Converts a SpanningItem to a standard PageItem for rendering.

## Coordinate System

pdf-lib uses bottom-left origin, while the application uses top-left:

```
Application:        PDF:
(0,0)───────▶ x     ▲ y
  │                 │
  │                 │
  ▼ y          (0,0)───────▶ x
```

**Conversion:**
```typescript
const itemPdfY = pageY + pageHeight - item.y - item.height;
```

## Configuration

The generator reads from project state:

```typescript
const project = appState.getProject();
// Use getOrientedSheetSize to respect orientation setting
const sheetSize = getOrientedSheetSize(
  project.outputOptions.sheetSize,
  project.outputOptions.orientation
);
```

## Imposition Layout

For a standard 8-page signature:

```
Front of Sheet 1:
┌─────────┬─────────┐
│  Page 8 │  Page 1 │
└─────────┴─────────┘

Back of Sheet 1:
┌─────────┬─────────┐
│  Page 2 │  Page 7 │
└─────────┴─────────┘
```

## Multi-Row Layout (Fill Available Space)

When `fillAvailableSpace` is enabled:

```
┌─────────┬─────────┐
│  Page 8 │  Page 1 │ Row 1
├─────────┼─────────┤
│  Page 4 │  Page 5 │ Row 2
└─────────┴─────────┘
   Cut marks between rows
```

## Usage Example

```typescript
import { PDFGenerator } from '../services/pdfGenerator';

const generator = new PDFGenerator();

try {
  const pdfBytes = await generator.generate();

  // Save to file
  await env.saveFile({
    defaultName: 'booklet.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    content: pdfBytes
  });
} catch (error) {
  console.error('PDF generation failed:', error);
}
```

## Creep Compensation

When booklets are folded, inner sheets extend slightly past outer sheets due to paper thickness. This is called "creep" or "pushout." Creep compensation progressively narrows inner pages so all edges align when trimmed.

### Configuration

```typescript
outputOptions: {
  creepEnabled: boolean;      // Enable/disable creep compensation
  creepPerSheet: number;      // Points to reduce per nested sheet (default: 4.5pt = 0.0625")
}
```

### How It Works

For a signature with N sheets:
- Outermost sheet (sheet 1): Full page width
- Sheet 2: Reduced by `creepPerSheet`
- Sheet N: Reduced by `creepPerSheet * (N-1)`

Example for 8-page signature (2 sheets) with 4.5pt creep:
```
Sheet 1 (pages 1, 8, 2, 7): Full width
Sheet 2 (pages 3, 6, 4, 5): Width - 4.5pt
```

### Crop Mark Adjustment

When creep is enabled with "Fill available space" mode, crop marks are positioned per-row based on each spread's calculated width, ensuring accurate trimming for different-width sheets.

### Typical Values

| Paper Type | Creep per Sheet |
|------------|-----------------|
| Bond (20lb) | 0.0625" (4.5pt) |
| Text (70lb) | 0.04" (2.9pt) |
| Cover (80lb) | 0.08" (5.8pt) |

**Note:** The actual implementation of creep adjustment is pending. Currently, the UI and settings are in place but page width adjustment is not yet applied during PDF generation.

## Crop Marks Configuration

Crop marks (cut marks) can be customized for color and thickness.

### Configuration

```typescript
outputOptions: {
  showCropMarks?: boolean;      // Enable/disable crop marks (default: true)
  cropMarkColor?: string;       // Hex color (default: '#000000')
  cropMarkThickness?: number;   // Thickness in points (default: 0.5)
}
```

### Mark Placement

- **Corner marks**: L-shaped marks at all four corners of the sheet
- **Row dividers**: Horizontal marks between rows when using "Fill available space" mode

### Use Cases

- **Default (black)**: Standard printing on white paper
- **Light gray**: For proofing on colored paper where black marks would be too prominent
- **Thicker lines**: For easier visibility when cutting by hand
- **Disabled**: When sending to a print shop that adds their own marks

## Duplex Offset

Compensates for printer misalignment when printing double-sided (duplex). Many consumer printers have slight registration errors between front and back sides.

### Configuration

```typescript
outputOptions: {
  duplexOffsetX?: number;  // Horizontal offset in points
  duplexOffsetY?: number;  // Vertical offset in points
}
```

### How It Works

The offset is applied to odd-numbered PDF pages (the back sides when duplex printing):
- **X Offset**: Shifts content horizontally
- **Y Offset**: Shifts content vertically

Positive values shift right/up, negative values shift left/down.

### Workflow

1. **Print Test Page**: Use the "Print Test Page" button to generate a calibration page
2. **Measure Misalignment**: Print the test page duplex and measure any offset between front and back
3. **Enter Offset**: Input the measured values in millimeters (converted to points internally)
4. **Verify**: Print another test page to confirm alignment

### Unit Conversion

Values are entered in millimeters in the UI but stored as points:
```typescript
const pointsValue = mmValue * 72 / 25.4;
```

## Render Text as Images Mode

When `outputOptions.renderTextAsImages` is enabled, ALL pages (including text pages) are rendered as high-resolution PNG images instead of using embedded fonts.

### How It Works

1. **Pre-rendering**: All pages are pre-rendered via Konva at 300 DPI, including:
   - Text content (sections, headings, paragraphs)
   - Rich text styling (bold, italic, highlights, strikethrough)
   - Headers and footers
   - Page items and backgrounds

2. **No Font Embedding**: Fonts are not embedded in the PDF since all text is rasterized

3. **PDF Structure**: Each page contains a single full-page image

### When to Use

- Fonts aren't rendering correctly in the PDF
- Bold/italic variants aren't available for a font
- Complex text styling needs to be preserved exactly

### Trade-offs

| Aspect | Normal Mode | Text as Images |
|--------|-------------|----------------|
| File Size | Small (~50-200KB) | Large (depends on page count) |
| Text Searchable | Yes | No |
| Visual Fidelity | Depends on font availability | Exact match to editor |
| Font Variants | Requires separate font files | Always works |

## Limitations

1. **Rich Text**: Inline formatting (bold within paragraphs) requires "Render text as images" mode for guaranteed fidelity
2. **Images**: Only PNG and JPEG formats supported
3. **Web Font Embedding**: In web environments, body text uses standard PDF fonts (Times, Helvetica, Courier) as fallback

## Resolved Limitations

The following were previously limitations but are now fully supported:

- **Gradients**: Linear and radial gradients render correctly on page items (via Konva pre-rendering)
- **Patterns**: Pattern fills render correctly on shapes (via Konva pre-rendering)
- **Custom Fonts on Items**: Custom fonts on text items render correctly (via Konva pre-rendering)
- **Shadows**: Drop shadows render correctly (via Konva pre-rendering)
- **Cross-page Items**: Items spanning page boundaries render correctly with proper clipping
- **Body Text Fonts (Electron)**: Actual system fonts are now embedded into PDFs with subsetting, ensuring exact visual fidelity between editor and PDF output
