# Type Definitions (`src/types/index.ts`)

This module contains all TypeScript interfaces and types used throughout the PrintFold application.

## Overview

The types are organized into categories:
- Fill and styling types
- File and content types
- Page layout types
- Project configuration types
- Editor state types
- Utility functions

---

## Fill Types

### FillType

```typescript
type FillType = 'color' | 'linearGradient' | 'radialGradient' | 'pattern';
```

### GradientStop

```typescript
interface GradientStop {
  offset: number;  // 0-1 position along gradient
  color: string;   // Hex color
}
```

### LinearGradientConfig

```typescript
interface LinearGradientConfig {
  angle: number;         // Degrees, 0 = left to right
  stops: GradientStop[];
}
```

### RadialGradientConfig

```typescript
interface RadialGradientConfig {
  centerX: number;       // 0-1, relative to shape
  centerY: number;       // 0-1, relative to shape
  radius: number;        // 0-1, relative to shape size
  stops: GradientStop[];
}
```

### PatternConfig

```typescript
interface PatternConfig {
  imageFileId: string;   // Reference to project file
  repeat: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;      // Degrees
}
```

### FillConfig

```typescript
interface FillConfig {
  type: FillType;
  color?: string;
  linearGradient?: LinearGradientConfig;
  radialGradient?: RadialGradientConfig;
  pattern?: PatternConfig;
}
```

### createDefaultFill(type: FillType): FillConfig

Helper function to create default fill configurations.

---

## File Types

### ProjectFile

```typescript
interface ProjectFile {
  id: string;
  name: string;
  type: 'markdown' | 'image' | 'archive' | 'font' | 'unknown';
  content: string;       // Text content or base64 (binary types)
  isBase64: boolean;
  lastModified: number;
}
```

The `font` type holds user-uploaded `.ttf`, `.otf`, or `.woff` files
that have been dragged into the Files area. They're surfaced through
the Fonts tab and registered with `fontService` so the family can be
selected from any font dropdown and embedded into exported PDFs.

---

## Document Structure

### DocumentSection

```typescript
interface DocumentSection {
  id: string;
  type: 'heading' | 'paragraph' | 'image' | 'list' | 'code' | 'blockquote' | 'hr';
  level?: number;        // For headings (1-6)
  content: string;
  rawMarkdown: string;
  imageRef?: string;     // Image filename reference
}
```

---

## Page Layout

### PageContent

```typescript
interface PageContent {
  id: string;
  pageNumber: number;
  sections: DocumentSection[];
  overflow?: DocumentSection[];  // Content that didn't fit
  isBlank: boolean;
  isRecto: boolean;              // Right-hand page
  isStatic: boolean;             // Static pages don't receive text flow
  items?: PageItem[];            // Items placed on static pages
  backgroundFill?: FillConfig;
}
```

### Spread

```typescript
interface Spread {
  id: string;
  spreadNumber: number;
  verso: PageContent | null;     // Left page (even)
  recto: PageContent | null;     // Right page (odd)
}
```

### Signature

```typescript
interface Signature {
  id: string;
  signatureNumber: number;
  spreads: Spread[];
  pageCount: number;
}
```

---

## Page Items

### PageItemType

```typescript
type PageItemType = 'text' | 'shape' | 'image' | 'textFlow';
```

### PageItemBase

```typescript
interface PageItemBase {
  id: string;
  type: PageItemType;
  x: number;             // Points from left edge
  y: number;             // Points from top of page
  width: number;
  height: number;
  rotation?: number;     // Degrees
  opacity?: number;      // 0-1, defaults to 1
  zIndex?: number;       // Layer order
  // Shadow properties
  hasShadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  // Stroke/fill offset (perpendicular distance from the path).
  // Positive expands outward, negative pulls inward, 0 keeps the stroke /
  // fill on the path. Only applies when stroke / fill is enabled.
  strokeOffset?: number;
  fillOffset?: number;
  // Array duplication - multi-dimensional support
  arrayDimensions?: ArrayDimension[];  // Each dimension creates copies with its own offset
}
```

### ArrayDimension

```typescript
interface ArrayDimension {
  id: string;          // Unique identifier for this dimension
  count: number;       // Number of copies in this dimension (minimum 2)
  offsetX: number;     // X offset between copies in this dimension
  offsetY: number;     // Y offset between copies in this dimension
}
```

The array feature supports multi-dimensional duplication:
- Each dimension defines a count and offset (X, Y)
- Dimensions are multiplicative: 3×2 = 6 total copies
- Copies render in reverse order (first copy on top, later copies below)
- Example: Dimension 1 (count=3, x=30, y=0) + Dimension 2 (count=2, x=0, y=40) creates a 3×2 grid

### TextPageItem

```typescript
interface TextPageItem extends PageItemBase {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;         // Deprecated: use fill
  textAlign: 'left' | 'center' | 'right';
  fill?: FillConfig;     // Supports gradients and patterns
  hasFill?: boolean;     // Whether fill is enabled (default: true)
  strokeColor?: string;
  strokeWidth?: number;
  hasStroke?: boolean;   // Whether stroke is enabled (default: false)
}
```

### ShapePageItem

```typescript
interface ShapePageItem extends PageItemBase {
  type: 'shape';
  shapeType: 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow';
  fillColor?: string;    // Deprecated: use fill
  fill?: FillConfig;
  hasFill?: boolean;     // Whether fill is enabled (default: true for shapes, false for lines)
  strokeColor?: string;
  strokeWidth?: number;
  hasStroke?: boolean;   // Whether stroke is enabled (default: true)
}
```

### ImagePageItem

```typescript
interface ImagePageItem extends PageItemBase {
  type: 'image';
  imageFileId: string;   // Reference to project file
}
```

### TextFlowPageItem

A region on a static page that pulls a slice of the surrounding
markdown flow through it (a "mini-page"). Always rendered as a polygon
internally — `flowShape: 'square'` exists for backward compatibility
with older serialized projects; new items are created with
`flowShape: 'polygon'` and a rectangular `polygonPoints` set.

```typescript
interface TextFlowPageItem extends PageItemBase {
  type: 'textFlow';
  flowShape: 'square' | 'polygon';
  padding?: number;              // Inner padding (points) for square mode
  fill?: FillConfig;             // Background fill (solid color used)
  hasFill?: boolean;
  hasStroke?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  textColor?: string;            // Overrides per-section color on flowed text
  polygonPoints?: PolygonPoint[]; // Required for flowShape === 'polygon'
  // Populated by the text-flow engine on every reflow:
  flowedSections?: DocumentSection[]; // Square: same shape as PageContent.sections
  flowedPolygonLines?: PolygonFlowLine[]; // Polygon: pre-positioned lines
}
```

### PolygonPoint

Normalized vertex (x, y in [0, 1] relative to the item's bounding box).
A vertex may be a sharp corner (default) or a smooth cubic-bezier
point with tangent handles; handles are stored in the same normalized
space as the anchor itself.

```typescript
interface PolygonPoint {
  x: number;
  y: number;
  cornerType?: 'corner' | 'smooth';
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}
```

### PolygonFlowLine

One laid-out line of text inside a polygon-shaped text-flow region.
The polygon flow algorithm positions each line individually because
the available width changes with vertical position.

```typescript
interface PolygonFlowLine {
  text: string;
  x: number;                       // Item-local top-left
  y: number;
  sectionType: DocumentSection['type'];
  sectionLevel?: number;
}
```

### PageItem

```typescript
type PageItem = TextPageItem | ShapePageItem | ImagePageItem | TextFlowPageItem;
```

---

## Static Spreads

### StaticSpread

```typescript
interface StaticSpread {
  id: string;
  index: number;                    // Position in static spreads list
  verso: PageContent | null;
  recto: PageContent | null;
  spanningItems?: SpanningItem[];   // Items bridging both pages
}
```

### SpanningItem

```typescript
interface SpanningItem extends PageItemBase {
  // Position relative to full spread (verso left = 0, extends to 2×pageWidth)
  type: PageItemType;
  // Type-specific properties (same as PageItem variants)
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  shapeType?: 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow';
  fillColor?: string;
  fill?: FillConfig;
  strokeColor?: string;
  strokeWidth?: number;
  imageFileId?: string;
}
```

---

## Layout Configuration

### Margins

```typescript
interface Margins {
  top: number;
  bottom: number;
  inner: number;    // Spine side
  outer: number;    // Edge side
}
```

### PageMarginOverride

```typescript
interface PageMarginOverride {
  pageNumber: number;
  margins: Partial<Margins>;
}
```

### LayoutOptions

```typescript
interface LayoutOptions {
  margins: Margins;
  marginOverrides: PageMarginOverride[];
  emptyPageBeforeH1: boolean;
  spacingAboveH1: number;
  spacingAboveH2: number;
  spacingAboveH3: number;
  paragraphSpacing: number;
  lineHeight: number;
  textAlign: 'left' | 'justify';
}
```

---

## Output Configuration

### OutputOptions

```typescript
interface OutputOptions {
  sheetSize: 'letter' | 'a4' | 'legal' | 'tabloid' | 'a3';
  bookletSize: 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'custom';
  customWidth?: number;
  customHeight?: number;
  pagesPerSignature: 4 | 8 | 12 | 16 | 20 | 24;
  orientation: 'portrait' | 'landscape';
  fillAvailableSpace: boolean;
  showFoldMarks: boolean;       // Show fold marks on PDF (light gray)
  creepEnabled?: boolean;       // Enable creep compensation
  creepPerSheet?: number;       // Points to reduce per nested sheet
  renderTextAsImages?: boolean; // Render all pages as images (font fallback mode)
}
```

**Booklet Size Values:**
| Value | Description |
|-------|-------------|
| half | 1/2 of sheet height |
| quarter | 1/4 of sheet height |
| eighth | 1/8 of sheet height |
| sixteenth | 1/16 of sheet height |
| custom | User-specified dimensions |

### calculateSpreadRowsPerSheet

```typescript
function calculateSpreadRowsPerSheet(
  sheetSize: { width: number; height: number },
  pageHeight: number,
  fillEnabled: boolean
): number;
```

Returns number of spread rows that fit on a sheet (1 if fill mode disabled).

---

## Typography

### FontStyle

```typescript
interface FontStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: number;
}
```

### FontOptions

```typescript
interface FontOptions {
  body: FontStyle;
  h1: FontStyle;
  h2: FontStyle;
  h3: FontStyle;
  h4: FontStyle;
  h5: FontStyle;
  h6: FontStyle;
  code: FontStyle;
  blockquote: FontStyle;
}
```

---

## Header/Footer

### HeaderFooterContent

```typescript
interface HeaderFooterContent {
  left: string;
  center: string;
  right: string;
}
```

### HeaderFooterOptions

```typescript
interface HeaderFooterOptions {
  header: {
    enabled: boolean;
    height: number;
    verso: HeaderFooterContent;
    recto: HeaderFooterContent;
    showOnFirstPage: boolean;
    font: FontStyle;
  };
  footer: {
    enabled: boolean;
    height: number;
    verso: HeaderFooterContent;
    recto: HeaderFooterContent;
    showOnFirstPage: boolean;
    font: FontStyle;
  };
}
```

---

## Project State

### BookletProject

```typescript
interface BookletProject {
  id: string;
  name: string;
  files: ProjectFile[];
  mainDocument: string | null;
  measurementUnit: MarginUnit;
  outputOptions: OutputOptions;
  layoutOptions: LayoutOptions;
  fontOptions: FontOptions;
  headerFooter: HeaderFooterOptions;
  signatures: Signature[];
  blankPages: number[];
  staticSpreads?: StaticSpread[];
}
```

---

## Editor State

### EditorState

```typescript
interface EditorState {
  selectedPageNumber: number | null;
  selectedSpreadNumber: number | null;
  selectedPagePosition: 'verso' | 'recto' | null;
  selectedItemId: string | null;
  isDraggingMargin: boolean;
  dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | null;
  isLocalMarginChange: boolean;    // Cmd key held
  zoomLevel: number;
  activeTab: 'editor' | 'preview';
  marginUnit: MarginUnit;
}
```

---

## Units

### MarginUnit

```typescript
type MarginUnit = 'pt' | 'in' | 'cm' | 'px';
```

### UNIT_CONVERSIONS

```typescript
const UNIT_CONVERSIONS: Record<MarginUnit, {
  factor: number;    // Points → unit multiplier
  decimals: number;  // Display precision
  label: string;     // Display suffix
}>;
```

| Unit | Factor | Decimals | Label |
|------|--------|----------|-------|
| pt | 1 | 0 | "pt" |
| in | 1/72 | 2 | '"' |
| cm | 2.54/72 | 2 | "cm" |
| px | 96/72 | 0 | "px" |

### convertFromPoints

```typescript
function convertFromPoints(points: number, unit: MarginUnit): number;
```

### formatMarginValue

```typescript
function formatMarginValue(points: number, unit: MarginUnit): string;
```

Returns formatted string like `"0.75"` or `"54pt"`.

---

## Sheet Sizes

### SHEET_SIZES

```typescript
const SHEET_SIZES: Record<string, { width: number; height: number }>;
```

Sheet sizes are stored in **portrait orientation** (width < height).

| Size | Width | Height | Notes |
|------|-------|--------|-------|
| letter | 612 | 792 | 8.5" × 11" |
| a4 | 595.28 | 841.89 | 210mm × 297mm |
| legal | 612 | 1008 | 8.5" × 14" |
| tabloid | 792 | 1224 | 11" × 17" |
| a3 | 841.89 | 1190.55 | 297mm × 420mm |

All dimensions in points (72 points = 1 inch).

### getOrientedSheetSize

```typescript
function getOrientedSheetSize(
  sheetSize: string,
  orientation: 'portrait' | 'landscape'
): { width: number; height: number };
```

Returns sheet dimensions with width/height swapped for landscape orientation. Use this helper instead of accessing `SHEET_SIZES` directly when orientation matters.

---

## Events

### AppEventType

```typescript
type AppEventType =
  | 'file-added'
  | 'file-removed'
  | 'file-updated'
  | 'options-changed'
  | 'layout-changed'
  | 'reflow-needed'
  | 'reflow-complete'
  | 'page-selected'
  | 'margin-drag-start'
  | 'margin-drag-end';
```

### AppEvent

```typescript
interface AppEvent {
  type: AppEventType;
  payload?: unknown;
}
```

---

## Template

### BookletTemplate

```typescript
interface BookletTemplate {
  id: string;
  name: string;
  description: string;
  outputOptions: Partial<OutputOptions>;
  layoutOptions: Partial<LayoutOptions>;
  fontOptions: Partial<FontOptions>;
  headerFooter: Partial<HeaderFooterOptions>;
}
```
