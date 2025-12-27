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
      ├──▶ Embed fonts (StandardFonts)
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
2. Embeds standard fonts (Times Roman family + Courier)
3. Builds global page map for cross-signature adjacency lookup
4. Pre-renders pages with items via Konva (preserves gradients, fonts, shadows)
5. Embeds images used in static pages
6. Generates signature sheets with imposition
7. Adds print marks (cut marks, fold indicators)
8. Returns PDF as Uint8Array

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

#### `addPrintMarks(pdfDoc, sheetSize, pageHeight, rowsPerSheet)`

Adds production marks to all pages.

**Marks Added:**
- Corner cut marks (L-shaped)
- Center fold line (top and bottom)
- Horizontal cut marks for multi-row layouts

### Font Handling

#### `getFont(style: FontStyle): PDFFont`

Maps FontStyle to embedded PDF fonts.

**Font Mapping:**
| Style | PDF Font |
|-------|----------|
| Normal | TimesRoman |
| Bold | TimesRomanBold |
| Italic | TimesRomanItalic |
| Bold Italic | TimesRomanBoldItalic |
| Monospace | Courier |

#### `getTextItemFont(textItem: TextPageItem): PDFFont`

Similar mapping for text page items.

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
const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];
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

## Limitations

1. **Fonts**: Body text uses standard PDF fonts; custom fonts on items are pre-rendered as images
2. **Rich Text**: No inline formatting (bold within paragraphs) for body text
3. **Images**: Only PNG and JPEG formats supported

## Resolved Limitations

The following were previously limitations but are now fully supported via Konva pre-rendering:

- **Gradients**: Linear and radial gradients render correctly on page items
- **Patterns**: Pattern fills render correctly on shapes
- **Custom Fonts**: Custom fonts on text items render correctly
- **Shadows**: Drop shadows render correctly
- **Cross-page Items**: Items spanning page boundaries render correctly with proper clipping
