# Options Panel (`src/components/OptionsPanel/`)

The Options Panel provides all configuration controls for the booklet project, organized into collapsible sections.

## Overview

The OptionsPanel manages settings for:
- Output options (sheet size, booklet size, signatures)
- Layout options (margins, spacing, alignment)
- Font options (families, sizes, colors)
- Header/Footer configuration
- Selected page properties
- Item editing

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
├── editPage.ts         # Page item editing controls
└── index.ts            # Barrel export
```

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
| `opt-header-font` | Header font |
| `opt-footer-font` | Footer font |

### Font Size Controls

| ID | Applies To |
|----|------------|
| `opt-font-size-body` | Body text |
| `opt-font-size-h1` | H1 headings |
| `opt-font-size-h2` | H2 headings |
| `opt-font-size-h3` | H3 headings |
| `opt-header-font-size` | Header text |
| `opt-footer-font-size` | Footer text |

### Color Controls

| ID | Applies To |
|----|------------|
| `opt-color-body` | Body text color |
| `opt-color-headings` | All heading colors |
| `opt-header-color` | Header text color |
| `opt-footer-color` | Footer text color |

### Font Preloading

```typescript
preloadFonts(): void {
  googleFonts.preloadAllFonts();
}
```

## Header/Footer Options (`headerFooterOptions.ts`)

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

Buttons to add new items:
- Text (`#btn-add-text`)
- Rectangle (`#btn-add-rect`)
- Ellipse (`#btn-add-ellipse`)
- Circle (`#btn-add-circle`)
- Line (`#btn-add-line`)
- Arrow (`#btn-add-arrow`)

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
- Color
- Text alignment

### Shape Item Properties

- Fill type and configuration
- Stroke color
- Stroke width

### Z-Order Controls

- Bring to Front
- Send to Back
- Move Forward
- Move Backward

### Delete Button

Removes selected item from page.

## CSS Classes

Expected panel structure:

```html
<div class="panel-options" data-panel="output">
  <div class="panel-header collapsible">Output</div>
  <div class="panel-content">
    <!-- controls -->
  </div>
</div>
```

## Input Cap Structure

```html
<div class="input-with-cap">
  <input type="number" id="opt-margin-top" step="0.01" min="0">
  <span class="input-cap" data-for="opt-margin-top">in</span>
</div>
```
