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
├── selection.ts   # Marquee selection and context menu
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
│   ├── itemsLayer
│   │   ├── page items (shapes, text, images)
│   │   └── transformer
│   └── selectionLayer
│       └── marquee selection rectangle
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
| Delete/Backspace | Delete selected items |
| Escape | Deselect items, hide context menu |
| Cmd/Ctrl+C | Copy selected items to clipboard |
| Cmd/Ctrl+V | Paste items from clipboard |
| Cmd/Ctrl+D | Duplicate selected items |
| Cmd/Ctrl+A | Select all items on current page |

### Selection Handling

#### Marquee Selection (Drag-to-Select)

Click and drag on empty space to create a selection marquee. All items that intersect with the marquee rectangle will be selected when the mouse is released.

```typescript
// Marquee coordinates use getClientRect() for reliable intersection
const marqueeClientRect = marquee.rect.getClientRect();
itemNodes.forEach((node, id) => {
  const nodeClientRect = node.getClientRect();
  if (intersects(marqueeClientRect, nodeClientRect)) {
    selectedIds.push(id);
  }
});
```

#### Multi-Item Selection

- **Shift+Click**: Add/remove items from selection
- **Marquee**: Select multiple items by drawing a rectangle
- **Cmd/Ctrl+A**: Select all items on current page

#### Multi-Item Drag

When multiple items are selected, dragging any selected item moves all items together. The transformer is temporarily detached during drag to prevent visual jittering.

```typescript
// Store initial positions for synchronized movement
dragStartNodePositions.set(id, { x: node.x(), y: node.y() });

// Apply delta to all selected items during drag
const dx = node.x() - initialDragPos.x;
const dy = node.y() - initialDragPos.y;
dragStartNodePositions.forEach((startPos, id) => {
  otherNode.x(startPos.x + dx);
  otherNode.y(startPos.y + dy);
});
```

#### Option+Drag (Duplicate)

Hold Option/Alt while dragging to duplicate items:

1. Ghost outlines appear at original positions (dashed blue rectangles)
2. Dragged items become semi-transparent (50% opacity)
3. On release, copies are created at the drop position
4. Original items remain at their original positions
5. The new copies become selected

### Context Menu

Right-click on selected items to show context menu with options:
- Duplicate
- Copy
- Delete
- Align options (when multiple items selected)
- Distribute options (when 3+ items selected)

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

- **click/tap**: Selects item and page (Shift+click for additive selection)
- **dblclick/dbltap**: Text editing (for text items)
- **dragstart**: Stores initial positions; if Option/Alt held, prepares for duplication with visual feedback
- **dragmove**: Synchronizes all selected items' positions during multi-item drag
- **dragend**: Updates item positions in state; creates copies for Option+drag
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

## Selection Module (`selection.ts`)

Handles marquee selection and context menus.

### Marquee Selection

#### `createSelectionMarquee(layer, stage, itemNodes, onComplete): MarqueeHandlers`

Creates a draggable selection rectangle:

```typescript
interface MarqueeHandlers {
  startMarquee(x: number, y: number): void;
  updateMarquee(x: number, y: number): void;
  endMarquee(): void;
}
```

The marquee uses `getClientRect()` for intersection detection, which ensures correct behavior across zoom levels and pan positions.

### Context Menu

#### `showContextMenu(x: number, y: number, items: MenuItem[]): void`

Displays a context menu at the specified screen position.

#### `hideContextMenu(): void`

Hides the active context menu.

#### `createItemContextMenu(pageNumber: number, itemIds: string[]): MenuItem[]`

Creates menu items for selected items:

- **Single item**: Duplicate, Copy, Delete
- **Multiple items**: Above + Align (Left, Center, Right, Top, Middle, Bottom) + Distribute (Horizontal, Vertical)

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
  // Multi-item selection support
  const idsChanged = state.selectedItemIds.length !== prevState.selectedItemIds.length ||
    state.selectedItemIds.some((id, i) => id !== prevState.selectedItemIds[i]);
  if (idsChanged || state.selectedItemId !== prevState.selectedItemId) {
    this.updateTransformer();
  }
});

// Project changes
appState.onProjectChange(() => {
  this.render();
  this.updateTransformer(); // Re-attach after new nodes created
});
```

### Selection State

The editor tracks selection in `EditorState`:

```typescript
interface EditorState {
  selectedItemId: string | null;      // Primary selected item (for backwards compat)
  selectedItemIds: string[];          // All selected items (multi-selection)
  clipboard: PageItem[];              // Items copied via Cmd/Ctrl+C
  // ...
}
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
