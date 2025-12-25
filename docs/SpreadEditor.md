# Spread Editor (`src/components/SpreadEditor/`)

The Spread Editor is a Konva.js-based canvas component for viewing and editing booklet spreads with interactive margin adjustment and page item manipulation.

## Overview

The SpreadEditor provides:
- Visual representation of page spreads
- Interactive margin dragging
- Page item creation and manipulation (text, shapes, images)
- Zoom and pan navigation
- Thumbnail navigation
- Image drop zone

## Module Structure

```
SpreadEditor/
├── component.ts   # Main SpreadEditor class
├── items.ts       # Page item rendering and interaction
├── content.ts     # Page content rendering
├── margins.ts     # Margin guides and dragging
├── thumbnails.ts  # Thumbnail strip rendering
├── types.ts       # Shared types
└── index.ts       # Barrel export
```

## Architecture

```
SpreadEditor
├── stage (Konva.Stage)
│   ├── layer (content layer)
│   │   ├── page backgrounds
│   │   ├── page content (text, images)
│   │   └── page click areas
│   ├── marginLayer
│   │   ├── margin lines
│   │   ├── margin labels
│   │   └── selection indicator
│   └── itemsLayer
│       ├── page items (shapes, text, images)
│       └── transformer
└── thumbnailContainer (DOM)
```

## Main Class (`component.ts`)

### Initialization

#### `mount(): void`

1. Gets container elements
2. Creates Konva stage with layers
3. Creates transformer for item selection
4. Sets up controls, keyboard shortcuts, state listeners
5. Sets up image drop zone
6. Performs initial render

### Rendering

#### `render(): void`

Main render loop:

1. Guard against hidden container
2. Clear layers
3. Get current spread
4. Draw verso page (left)
5. Draw recto page (right)
6. Draw selection indicator
7. Add page click areas
8. Render page items
9. Update spread indicator
10. Render thumbnails

#### `drawPage(pageContent, x, y, dimensions): void`

Renders a single page:

1. Draw background with optional fill
2. Draw page number (if footer disabled)
3. Skip content for blank pages
4. Calculate content area with margins
5. Draw margin guides (if enabled)
6. Draw page content

### Navigation

| Method | Description |
|--------|-------------|
| `navigateToPage(pageNumber)` | Jumps to spread containing page |
| `navigateSpread(delta)` | Moves to previous/next spread |
| `navigateToSpread(index)` | Jumps to specific spread index |

### Zoom and Pan

| Method | Description |
|--------|-------------|
| `setZoom(level)` | Sets zoom level (0.25 to 3.0) |
| `fitToView()` | Fits spread to container with padding |
| Mouse wheel | Zooms at pointer position |
| Middle-click / Shift+click | Pans view |

### Controls

- **Zoom buttons**: `#btn-zoom-in`, `#btn-zoom-out`, `#btn-zoom-fit`
- **Navigation**: `#btn-prev-spread`, `#btn-next-spread`
- **Show margins**: `#chk-show-margins`
- **Add pages**: `#btn-add-signature` (adds full signature), `#btn-add-single-page` (single page)

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow Left/Right | Navigate spreads |
| Delete/Backspace | Delete selected item |
| Escape | Deselect item |
| Cmd/Ctrl+D | Duplicate selected item |

### Image Drop Zone

Accepts images dragged from file list:

```typescript
container.addEventListener('drop', (e) => {
  const fileId = e.dataTransfer.getData('application/x-printfold-image');
  this.addImageToPage(fileId, pageNumber, position);
});
```

## Items Module (`items.ts`)

### Item Creation

#### `createItemNode(item, xOffset, pageNumber, ...): Konva.Node`

Creates Konva nodes for page items:

**Shape Types:**
- `rectangle` → `Konva.Rect`
- `ellipse` → `Konva.Ellipse`
- `circle` → `Konva.Circle`
- `line` → `Konva.Line`
- `arrow` → `Konva.Arrow`

**Other Types:**
- `text` → `Konva.Text`
- `image` → `Konva.Image`

### Fill Application

#### `applyFillToShape(shape, fill, fallbackColor, width, height): void`

Applies FillConfig to Konva shapes:

- **Solid color**: `shape.fill(color)`
- **Linear gradient**: Start/end points based on angle
- **Radial gradient**: Center and radius based on config
- **Pattern**: Loads image and applies as fill pattern

### Event Handlers

Each item node has:

- **click/tap**: Selects item and page
- **dblclick/dbltap**: Text editing (for text items)
- **dragmove**: Updates transformer
- **dragend**: Updates item position in state
- **transformend**: Updates item size/rotation in state

### Text Editing

#### `startTextEditing(textNode, item, ...): void`

Creates textarea overlay for inline text editing:

1. Hides text node
2. Creates positioned textarea
3. Applies matching styles
4. Handles blur → save
5. Escape → cancel, Enter → save

### Rendering Functions

#### `renderPageItems(page, xOffset, dimensions, ...): void`

Renders all items on a page with proper offset.

#### `renderSpanningItems(items, spreadId, dimensions, ...): void`

Renders items that span across the full spread width.

## Content Module (`content.ts`)

#### `drawPageContent(page, contentX, contentY, width, height, layer): void`

Renders text content sections:

- Headings with appropriate font styles
- Paragraphs with word wrap
- Lists with bullets/numbers
- Code blocks with monospace font
- Blockquotes with italic styling
- Horizontal rules

## Margins Module (`margins.ts`)

#### `drawMarginGuides(x, y, dimensions, margins, page, ...): void`

Draws draggable margin indicators:

- Dashed lines at margin boundaries
- Labels showing margin values
- Draggable regions for adjustment
- Cmd/Ctrl key for per-page overrides

#### `getMarginsForPage(pageNumber): Margins`

Returns margins for a page, applying overrides if configured.

## Thumbnails Module (`thumbnails.ts`)

#### `renderThumbnails(container, dimensions, currentIndex, ...): void`

Renders navigation thumbnail strip:

- Thumbnails grouped by signature with dashed outline
- Signature labels (Sig 1, Sig 2, etc.)
- Small page representations with centered layout
- Current spread highlight
- Click to navigate
- Page numbers (back cover shown as "BC" in red for single-signature booklets)

## Types (`types.ts`)

```typescript
interface MarginLine {
  line: Konva.Line;
  type: 'top' | 'bottom' | 'inner' | 'outer';
  pageNumber: number;
}

interface MarginLabel {
  group: Konva.Group;
  type: 'top' | 'bottom' | 'inner' | 'outer';
  pageNumber: number;
}
```

## State Integration

The editor responds to:

```typescript
// Editor state changes
appState.onEditorChange((state, prevState) => {
  if (state.selectedPageNumber !== prevState.selectedPageNumber) {
    this.navigateToPage(state.selectedPageNumber);
  }
  if (state.marginUnit !== prevState.marginUnit) {
    this.render();
  }
  if (state.selectedItemId !== prevState.selectedItemId) {
    this.updateTransformer();
  }
});

// Project changes
appState.onProjectChange(() => {
  this.render();
});
```

## Page Dimensions

Calculated from project settings:

```typescript
getPageDimensions(): { width: number; height: number } {
  // Based on sheetSize and bookletSize
  // Supports: half-letter, quarter-letter, custom
}
```

## Coordinate System

Konva uses top-left origin matching application coordinates:

```
(0,0) ───────────▶ x
  │  ┌──────────────────────────┐
  │  │   Verso    │    Recto    │
  │  │  (left)    │   (right)   │
  ▼  └──────────────────────────┘
  y
```

## Performance Considerations

- Guard against rendering when container is hidden
- Batch draw operations
- Debounced state updates
- Efficient layer management
- Resize observer for container changes
