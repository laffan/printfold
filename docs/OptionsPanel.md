# Options Panel (`src/components/OptionsPanel/`)

The Options Panel provides all configuration controls for the booklet project, organized into a tabbed interface.

## Overview

The OptionsPanel is organized into four tabs:
- **Selected** - Item editing and page properties
- **Styles** - Typography settings (dynamic based on content)
- **Document** - Layout, margins, and document info
- **Output** - Sheet size, booklet size, signatures

## Module Structure

```
OptionsPanel/
├── component.ts        # Main OptionsPanel class
├── helpers.ts          # Input binding utilities
├── outputOptions.ts    # Sheet and booklet settings
├── layoutOptions.ts    # Margins and spacing
├── fontOptions.ts      # Typography settings
├── headerFooterOptions.ts  # Header/footer configuration
├── selectedPage.ts     # Selected page info display
├── editPage/           # Modular item-editing controls
│   ├── index.ts
│   ├── shared.ts            # Picker / dropdown singletons + tab helpers
│   ├── itemCreation.ts      # Toolbar "add item" actions
│   ├── setupPanel.ts        # Toolbar + delete/z-order/background wiring
│   ├── panelUpdate.ts       # Reflects selected-item state into inputs
│   ├── propertyInputs.ts    # Bidirectional input → state binding
│   ├── multiSelect.ts       # Align/distribute/group helpers
│   ├── arrayInstances.ts    # Array dimension UI
│   ├── pageBackground.ts    # Page background fill picker
│   ├── customBackground.ts  # Custom background image management
│   └── applyRangeModal.ts   # "Apply to range" prompt
├── stylesTab.ts        # Dynamic styles tab
└── index.ts            # Barrel export
```

## Tab Structure

### Selected Tab

Contains:
- **Edit Selected Section** - Properties for selected items (position, size, type-specific options)
- **Effects Section** - Fill (with offset + text-color override for text-flow), stroke (with offset), shadow, and array effects. Shadow is hidden for text-flow items.
- **Page Background Section** - Background fill for static pages
- **Download / Replace Section** - Export and replace static page content (static pages only)
- **Delete Static Page** - Remove static page and restore to text flow (static pages only)

### Styles Tab

Dynamically generated based on markdown content:
- Only shows style options for elements actually used in the document
- Displays "No markdown content" message when no text files are present
- Header/footer styles appear only when enabled in Document tab

**Detected styles:**
- Body text (if any text content exists)
- Headings H1-H6 (only levels actually used)
- Header text (if header enabled)
- Footer text (if footer enabled)

### Document Tab

Contains:
- **Info Section** - Page count, spreads, signatures, sheets
- **Layout Section** - Margins, spacing, alignment
- **Headers & Footers Section** - Enable toggles and content fields (styling in Styles tab)

### Output Tab

Contains:
- **Sheet & Booklet Section** - Paper size, booklet size, signatures
- **Creep Compensation** - Adjustment for paper thickness in signatures
- **Print Settings Section** - Duplex offset for printer alignment, crop marks customization
- **Download Blanks Section** - Export blank page/spread templates for external editing

## Main Class (`component.ts`)

### Initialization

#### `mount(): void`

1. Creates debouncer for input updates
2. Sets up all option modules
3. Initializes font dropdowns
4. Sets up measurement unit handler
5. Configures draggable caps
6. Syncs UI from state
7. Subscribes to state changes

### State Synchronization

#### `syncFromState(): void`

Updates all UI controls from current project state:

- Measurement unit select
- Output options (sizes, signature pages)
- Custom size inputs with unit conversion
- Layout options (margins, spacing, line height)
- Header/footer toggles and content
- Font dropdowns and sizes
- Colors

### Measurement Unit

#### `setupMeasurementUnit(): void`

Handles project-wide unit changes:

```typescript
unitSelect.addEventListener('change', () => {
  appState.setMeasurementUnit(unit);
  updateMarginInputs();
  updateInputCapLabels();
  this.updateCustomSizeInputs();
});
```

**Supported Units:**
- `pt` - Points (72 per inch)
- `in` - Inches
- `cm` - Centimeters
- `px` - Pixels (96 DPI)

### State Listeners

```typescript
// Project changes → sync UI
appState.onProjectChange(() => {
  this.syncFromState();
  updateSelectedPagePanel();
  updateEditSelectedSection();
});

// Editor changes → update selection panels
appState.onEditorChange((state, prevState) => {
  if (state.selectedPageNumber !== prevState.selectedPageNumber) {
    updateSelectedPagePanel();
    updateEditPagePanel();
  }
  if (state.selectedItemId !== prevState.selectedItemId) {
    updateEditSelectedSection();
  }
});
```

## Helpers Module (`helpers.ts`)

### Input Binding Functions

| Function | Description |
|----------|-------------|
| `bindSelect(id, onChange, debounce)` | Binds select element |
| `bindNumberInput(id, onChange, debounce)` | Binds number input |
| `bindTextInput(id, onChange, debounce)` | Binds text input |
| `bindCheckbox(id, onChange)` | Binds checkbox (no debounce) |
| `bindColorInput(id, onChange, debounce)` | Binds color picker |
| `bindMarginInput(id, marginKey, debounce)` | Binds margin with unit conversion |

### Value Setting Functions

| Function | Description |
|----------|-------------|
| `setSelectValue(id, value)` | Sets select value |
| `setInputValue(id, value)` | Sets input value |
| `setCheckboxValue(id, checked)` | Sets checkbox state |
| `setColorValue(id, value)` | Sets color input |
| `setMarginInputValue(id, points, unit)` | Sets margin with conversion |

### Draggable Caps

#### `setupDraggableCaps(): void`

Enables drag-to-adjust on input caps (unit labels):

```typescript
// Drag left → decrease value
// Drag right → increase value
// Sensitivity based on input step attribute
```

**Mouse Events:**
- `mousedown` → Start drag, capture start values
- `mousemove` → Calculate delta, update input
- `mouseup` → End drag

#### `updateInputCapLabels(): void`

Updates margin/dimension cap labels when unit changes.

### Debouncer

```typescript
function createDebouncer() {
  return {
    debounce: (fn) => {
      clearTimeout(timeout);
      timeout = setTimeout(fn, 150);
    }
  };
}
```

## Output Options (`outputOptions.ts`)

### Controls

| ID | Type | Description |
|----|------|-------------|
| `opt-sheet-size` | Select | Paper size (letter, A4, legal, tabloid, A3) |
| `opt-booklet-size` | Select | Booklet size (half, quarter, custom) |
| `opt-custom-width` | Number | Custom width in current unit |
| `opt-custom-height` | Number | Custom height in current unit |
| `opt-pages-per-sig` | Select | Pages per signature (4, 8, 12, 16, 20, 24) |
| `opt-fill-space` | Checkbox | Fill available space mode |
| `opt-fold-marks` | Checkbox | Show fold marks on printed PDF |
| `opt-render-text-as-images` | Checkbox | Render all text as images (fallback for font issues) |
| `opt-duplex-offset-x` | Number | Horizontal duplex offset in mm |
| `opt-duplex-offset-y` | Number | Vertical duplex offset in mm |
| `opt-crop-marks` | Checkbox | Show crop marks on printed PDF |
| `opt-crop-mark-color` | Color | Crop mark color (hex) |
| `opt-crop-mark-thickness` | Number | Crop mark thickness in points (0.1-3pt) |

### Duplex Offset

Compensates for printer misalignment when duplex printing. Values are entered in millimeters and stored internally as points.

**Controls:**
- **X Offset**: Horizontal shift applied to odd (back) pages
- **Y Offset**: Vertical shift applied to odd (back) pages

**Usage:**
1. Print a test page using the "Print Test Page" button
2. Measure any misalignment between front and back
3. Enter offset values to compensate

### Crop Marks

Configurable crop marks (cut marks) on printed PDFs for trimming guidance.

**Controls:**
- **Enable/Disable**: Toggle crop marks visibility
- **Color**: Hex color picker (default: black #000000)
- **Thickness**: Line thickness in points (default: 0.5pt, range: 0.1-3pt)

**Note:** Crop marks are independent of fold marks. Both can be enabled/disabled separately.

### Render Text as Images

When enabled, all pages (including text pages) are rendered as high-resolution PNG images at 300 DPI instead of using embedded fonts. This provides a fallback for fonts that don't render correctly with pdf-lib.

**Trade-offs:**
- **Pro**: Guaranteed visual fidelity - text appears exactly as in the editor
- **Pro**: All styling (bold, italic, highlights, strikethrough) renders correctly
- **Con**: Larger PDF file sizes (images instead of text)
- **Con**: Text is not selectable/searchable in the PDF

A warning message appears when this option is enabled to inform users of the file size impact.

### Download Blanks

| Button | Description |
|--------|-------------|
| `btn-download-blank-page` | Downloads blank page PNG at 300 DPI |
| `btn-download-blank-spread` | Downloads blank spread PNG at 300 DPI |

### Setup

```typescript
setupOutputOptions(debounce): void {
  bindSelect('opt-sheet-size', (value) => {
    appState.updateOutputOptions({ sheetSize: value });
  }, debounce);
  // ... other bindings
}
```

## Layout Options (`layoutOptions.ts`)

### Controls

| ID | Type | Description |
|----|------|-------------|
| `opt-margin-*` | Number | Margins (top, bottom, inner, outer) |
| `opt-empty-before-h1` | Checkbox | Blank page before H1 |
| `opt-spacing-h1` | Number | Space above H1 (points) |
| `opt-line-height` | Number | Line height multiplier |
| `opt-paragraph-spacing` | Number | Paragraph gap (points) |

## Font Options (`fontOptions.ts`)

### Font Dropdowns

Custom `FontDropdown` components for font selection:

| ID | Purpose |
|----|---------|
| `opt-font-body` | Body text font |
| `opt-font-h1` | Heading font |

Note: Header/footer font settings are in the **Styles tab** (dynamically created via `stylesTab.ts`).

### Font Size Controls

| ID | Applies To |
|----|------------|
| `opt-font-size-body` | Body text |
| `opt-font-size-h1` | H1 headings |
| `opt-font-size-h2` | H2 headings |
| `opt-font-size-h3` | H3 headings |

Note: Header/footer font size controls are in the **Styles tab**.

### Color Controls

| ID | Applies To |
|----|------------|
| `opt-color-body` | Body text color |
| `opt-color-headings` | All heading colors |

Note: Header/footer color controls are in the **Styles tab**.

### Font Preloading

```typescript
preloadFonts(): void {
  googleFonts.preloadAllFonts();
}
```

## Header/Footer Options (`headerFooterOptions.ts`)

Handles enable toggles and content fields in the **Document tab**.
Font/size/color styling is in the **Styles tab** (see `stylesTab.ts`).

Note: Header/footer content lives inside the margin area and does not affect content dimensions.

### Enable Toggles

| ID | Description |
|----|-------------|
| `opt-header-enabled` | Show/hide header |
| `opt-footer-enabled` | Show/hide footer |

### Content Fields

Headers and footers have 6 text fields each:
- Verso: left, center, right
- Recto: left, center, right

**Placeholder:** `{{pageNumber}}` for page numbers

## Selected Page Panel (`selectedPage.ts`)

### Display

Shows information about the currently selected page:
- Page number
- Position (verso/recto)
- Page type (content/blank/static)

### Background Fill

Uses FillPicker component for page background:
- Solid colors
- Linear gradients
- Radial gradients
- Pattern fills

## Edit Page Panel (`editPage.ts`)

### Item Tools

Buttons in toolbar to add new items:
- Text (`#btn-add-text`)
- Rectangle (`#btn-add-rect`)
- Ellipse (`#btn-add-ellipse`)
- Circle (`#btn-add-circle`)
- Line (`#btn-add-line`)
- Arrow (`#btn-add-arrow`)
- Image (`#btn-add-image`)

### Selected Item Properties

When an item is selected:
- Position (X, Y)
- Size (Width, Height)
- Rotation
- Opacity
- Type-specific properties

### Text Item Properties

- Content textarea
- Font family dropdown
- Font size
- Font weight/style toggles
- Text alignment

### Shape Item Properties

(Shape-specific properties appear here when shapes are selected)

### Effects Section

Toggle-based effects available for all items:

#### Fill Effect
- Enable/disable toggle
- Fill type (solid color, linear gradient, radial gradient, or pattern)
- Type-specific configuration (color picker, gradient editor, pattern settings)

#### Stroke Effect
- Enable/disable toggle
- Stroke color
- Stroke width

#### Shadow Effect
- Enable/disable toggle
- Shadow color
- Blur amount
- X/Y offset
- Opacity

#### Array Effect
Creates multiple copies of an item with multi-dimensional offset support:
- Enable/disable toggle
- Dimension list (each dimension can be added/removed)
- Per-dimension controls:
  - Copy count (2-50)
  - X offset between copies
  - Y offset between copies
- Draggable "Copies" and "pt" caps for easy value adjustment
- Total copy count displayed in header

Dimensions are multiplicative (e.g., 3×2 = 6 total copies). The array uses Konva.Group to group all instances together for unified selection and dragging. Copies stack with the first copy on top.

### Z-Order Controls

- Bring to Front
- Send to Back
- Move Forward
- Move Backward

### Delete Button

Removes selected item from page.

### Download / Replace Section

Shown only when a static page is selected. Allows exporting and replacing page content for external editing.

**Download Options:**
| Button | Description |
|--------|-------------|
| Page as PNG (300 DPI) | Exports current page at print quality |
| Spread as PNG (300 DPI) | Exports both pages in visual spread (only shown when both pages are static) |

**Replace Options:**
| Button | Description |
|--------|-------------|
| Replace Page | Upload image to replace all content on current page |
| Replace Spread | Upload image to replace content across both pages (only shown when both pages are static) |

### Delete Static Page

Button shown at bottom of Selected tab for static pages. Removes all content from the page and restores it to text flow, allowing markdown content to flow into the space.

## CSS Classes

### Tab Structure

```html
<div class="options-tabs">
  <button class="tab-btn active" data-tab="selected">Selected</button>
  <button class="tab-btn" data-tab="styles">Styles</button>
  <button class="tab-btn" data-tab="document">Document</button>
  <button class="tab-btn" data-tab="output">Output</button>
</div>
<div class="options-tab-content">
  <div id="tab-selected" class="tab-panel active">
    <!-- Selected tab content -->
  </div>
  <div id="tab-styles" class="tab-panel">
    <!-- Dynamic styles content -->
  </div>
  <!-- ... other tabs -->
</div>
```

### Section Structure

```html
<div class="options-section">
  <h4 class="section-header">Section Title</h4>
  <!-- controls -->
</div>
```

### Input Cap Structure

```html
<div class="input-with-cap">
  <input type="number" id="opt-margin-top" step="0.01" min="0">
  <span class="input-cap" data-for="opt-margin-top">in</span>
</div>
```

## Styles Tab (`stylesTab.ts`)

The styles tab is dynamically generated based on the markdown content.

### `updateStylesTab(): void`

Called on mount and whenever project changes. The function:

1. Clears existing dynamic content
2. Scans markdown files to detect which elements are used
3. Creates style sections only for detected elements
4. Adds header/footer sections if they're enabled
5. Sets up input handlers and font dropdowns

### Detection Logic

The `detectUsedStyles()` function scans:
- Markdown file content for headings (`# `, `## `, etc.)
- Parsed sections from signatures
- Raw markdown for lists, code blocks, blockquotes
