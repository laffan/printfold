# Text Flow Engine (`src/services/textFlow.ts`)

The Text Flow Engine is responsible for laying out markdown content across pages, creating spreads, and organizing them into printable signatures.

## Overview

The `TextFlowEngine` class parses markdown, measures text, and flows content across pages while respecting layout constraints like margins, headers/footers, and page breaks.

## Architecture

```
Markdown Content
       │
       ▼
   parseMarkdown()
       │
       ▼
  DocumentSection[]
       │
       ▼
   ┌───┴───┐
   │       │
   ▼       ▼  (only when a static page has text-flow items)
flowSections()    flowSectionsIntoSlots()
   │                       │
   │                       ▼
   │             text-page slots + per-region mini-slots
   │                       │
   │                       ▼
   │                 materializeSlots()
   │                       │
   ▼                       ▼
  PageContent[]  ───►  PageContent[] + updated static pages
       │
       ├──▶ insertBlankPages()
       │
       ▼
   mergeStaticPagesInPlace()
       │
       ▼
   createSignatures()
       │
       ▼
    Signature[]
```

## Key Methods

### Main Entry Point

#### `reflow(markdown: string): FlowResult`

The primary method that orchestrates the entire text flow process.

**Returns:**
```typescript
interface FlowResult {
  pages: PageContent[];      // Individual pages with content
  spreads: Spread[];         // Paired verso/recto pages
  signatures: Signature[];   // Groups of spreads for printing
  totalPages: number;        // Total page count
}
```

### Markdown Parsing

#### `parseMarkdown(markdown: string): DocumentSection[]`

Converts markdown text into structured sections using the `marked` library.

**Supported Section Types:**
- `heading` (h1-h6)
- `paragraph`
- `image` (extracted from `![alt](src)` syntax)
- `list` (ordered and unordered)
- `code` (code blocks)
- `blockquote`
- `hr` (horizontal rules)

### Text Measurement

#### `measureTextWidth(text: string, fontStyle: FontStyle): number`

Measures text width using Canvas 2D API with caching for performance.

**Caching Strategy:**
- Cache key: `${text}|${fontFamily}|${fontSize}|${fontWeight}`
- Call `clearMeasurementCache()` when fonts change

#### `wrapText(text: string, maxWidth: number, fontStyle: FontStyle): string[]`

Wraps text to fit within a specified width, handling:
- Word boundaries
- Long words (character-level breaking)
- 2% safety margin for rendering differences

#### `measureSection(section: DocumentSection, contentWidth: number): MeasuredSection`

Calculates the height needed for a section including:
- Spacing above headings
- Line heights
- Paragraph spacing

### Page Layout

#### `calculatePageDimensions(): { width, height, contentWidth, contentHeight }`

Computes page dimensions based on:
- Sheet size (letter, A4, legal, tabloid, A3)
- Booklet size (half-letter, quarter-letter, custom, etc.)
- Margins

Note: Header/footer content lives inside the margin area and does not affect content dimensions.

#### `flowSections(sections: DocumentSection[], pageDimensions): PageContent[]`

Distributes sections across pages with:
- Page break before H1 (if `emptyPageBeforeH1` is enabled)
- H1 starts on recto (right) page
- Paragraph splitting when content spans pages
- Overflow handling for oversized content

#### `getMarginsForPage(pageNumber: number): Margins`

Returns margins for a specific page, applying page-specific overrides if configured.

### Slot-Based Flow (`slotFlow.ts`)

Used when at least one static page hosts a text-flow item. The engine
builds a sequence of slots (full text pages + per-item mini-slots) and
fills them with sections in document order, so the embedded text-flow
regions receive the appropriate slice of the markdown.

#### `buildInitialSlots(staticPages, fullPageDim): FlowSlot[]`

Walks from page 1 up to the highest static page number. For each
position it adds either a full-page text slot or, when a static page
hosts text-flow items, one slot per item (sorted top-to-bottom).
Polygon items contribute `polygonItem` slots carrying the flattened
silhouette; rectangular items contribute regular `item` slots.

#### `flowSectionsIntoSlots(ctx, sections, initialSlots, fullPageDim, staticPages, fontOptions, layoutOptions): FlowSlot[]`

Pours sections through the slot sequence in order. For text-page slots
the algorithm matches `flowSections` (paragraph splitting, H1 page
breaks, etc.). For polygon slots it lays out lines one at a time:
at each y position the polygon's horizontal extent (left → right
intersections) becomes the line's available width, so wrapping
respects the silhouette — including curved edges, which are flattened
ahead of time via `polygonPath.flattenPolygon`. The slot list
auto-extends with text-page slots as long as content remains.

#### `materializeSlots(filledSlots, staticPages): { textPages, updatedStaticPages }`

Turns text-page slots into `PageContent` entries and writes per-item
flowed content back onto the host static pages — `flowedSections` for
rectangular items and `flowedPolygonLines` for polygons.

### Polygon Path Utilities (`polygonPath.ts`)

Geometry helpers shared by the editor, the pre-renderer, and the
slot-based flow.

#### `buildPolygonPath(points: PolygonPoint[], width, height): string`

Builds an SVG path string (`M ... L ... C ... Z`) for a polygon whose
vertices may be sharp corners (straight `L`) or smooth bezier points
(`C` with `handleIn` / `handleOut`).

#### `flattenPolygon(points: PolygonPoint[], width, height): { x; y }[]`

Samples each bezier edge into ~24 line segments, yielding a dense
polyline that approximates the original curve. Used by the flow
engine for scanline intersection without solving cubics analytically,
and by the offset helpers below.

#### `offsetFlatPolygon(points: { x; y }[], offset, miterLimit = 8): { x; y }[]`

True Minkowski-style polygon offset: every edge is shifted along its
outward normal by `offset`, and adjacent shifted edges meet on the
vertex's angle bisector (so the perpendicular distance stays constant
regardless of vertex angle). Winding is detected from the signed area
so both CW and CCW polygons work; very sharp miters are clamped at
`miterLimit × |offset|` from the vertex. This is what the **Fill
Offset** and **Stroke Offset** controls call into.

#### `defaultSmoothHandles(prev, cur, next): { handleIn, handleOut }`

Synthesizes natural tangent handles when a corner is toggled to a
smooth point (Cmd/Ctrl + click in the editor). Direction is parallel
to the line from the previous to the next neighbor; magnitude is
~1/3 of the edge length on each side.

### Page Organization

#### `insertBlankPages(pages: PageContent[], blankPageNumbers: number[]): PageContent[]`

Inserts user-specified blank pages at designated positions.

#### `createSpreads(pages: PageContent[]): Spread[]`

Groups pages into spreads (verso + recto pairs), padding to even page count.

#### `mergeStaticSpreads(contentSpreads: Spread[], staticSpreads: StaticSpread[]): Spread[]`

Appends static spreads (created without markdown) after content spreads, assigning appropriate page numbers.

#### `createSignatures(spreads: Spread[]): Signature[]`

Groups spreads into signatures based on `pagesPerSignature` setting, padding as needed.

### Imposition

#### `calculateImposition(signature: Signature): ImpositionSheet[]`

Calculates the page arrangement for booklet printing.

**Returns:**
```typescript
interface ImpositionSheet {
  sheetNumber: number;
  front: { left: number; right: number };  // Page numbers
  back: { left: number; right: number };   // Page numbers
}
```

**Imposition Logic:**
For an 8-page signature, sheets are arranged so when folded and nested:
- Sheet 1 Front: pages 8 | 1
- Sheet 1 Back: pages 2 | 7
- Sheet 2 Front: pages 6 | 3
- Sheet 2 Back: pages 4 | 5

## Helper Functions

### `clearMeasurementCache(): void`

Exported function to clear the text measurement cache. Call when:
- Fonts change
- Font sizes change
- Before reflow after font loading

## Font Handling

The engine retrieves font styles from project state:

| Section Type | Font Source |
|--------------|-------------|
| Headings (h1-h6) | `fontOptions.h1` through `fontOptions.h6` |
| Body text | `fontOptions.body` |
| Code blocks | `fontOptions.code` |
| Blockquotes | `fontOptions.blockquote` |

## HTML Entity Decoding

The `decodeHtmlEntities()` method handles:
- Smart quotes: `&lsquo;`, `&rsquo;`, `&ldquo;`, `&rdquo;`
- Dashes: `&mdash;`, `&ndash;`
- Ellipsis: `&hellip;`
- Common entities: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&nbsp;`
- Numeric entities: `&#60;`, `&#x3C;`

## Configuration Dependencies

The engine reads from project state:

```typescript
this.fontOptions = project.fontOptions;
this.layoutOptions = project.layoutOptions;
this.outputOptions = project.outputOptions;
this.headerFooter = project.headerFooter;
```

## Usage Example

```typescript
import { textFlowEngine, clearMeasurementCache } from '../services/textFlow';

// Clear cache before reflow (e.g., after font loading)
clearMeasurementCache();

// Perform reflow
const result = textFlowEngine.reflow(markdownContent);

// Access results
console.log(`Total pages: ${result.totalPages}`);
console.log(`Signatures: ${result.signatures.length}`);

// Calculate imposition for printing
for (const signature of result.signatures) {
  const sheets = textFlowEngine.calculateImposition(signature);
  // Use sheets for PDF generation
}
```

## Singleton Pattern

The module exports a singleton instance:

```typescript
export const textFlowEngine = new TextFlowEngine();
```
