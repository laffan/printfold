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
   flowSections()
       │
       ▼
    PageContent[]
       │
       ├──▶ insertBlankPages()
       │
       ▼
    createSpreads()
       │
       ├──▶ mergeStaticSpreads()
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
