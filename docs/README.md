# PrintFold Technical Documentation

PrintFold is an Electron/Web application for creating printable booklets from Markdown content. This documentation provides a comprehensive technical overview for developers.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Services](#core-services)
3. [UI Components](#ui-components)
4. [Type System](#type-system)
5. [Data Flow](#data-flow)
6. [Feature Guide](#feature-guide)
7. [Development Guide](#development-guide)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        App.ts                                │
│                   (Main Orchestrator)                        │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│    FileList     │ │  SpreadEditor   │ │    OptionsPanel     │
│   FilePreview   │ │   (Konva.js)    │ │   (All Settings)    │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      AppState                                │
│              (Centralized State Management)                  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│  TextFlowEngine │ │  PDFGenerator   │ │    ZipHandler       │
│ (Layout Engine) │ │  (PDF Export)   │ │  (Project I/O)      │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
```

### Key Technologies

| Component | Technology |
|-----------|------------|
| Canvas Editor | Konva.js |
| PDF Generation | pdf-lib + fontkit |
| Markdown Parsing | marked |
| ZIP Handling | JSZip |
| Fonts | System fonts (Electron) / Web-safe fonts (Web) + Google Fonts for items |
| Build | Vite + TypeScript |
| Runtime | Electron / Web |

---

## Core Services

### [State Management (`state.ts`)](./state.md)

Centralized state management using event emitter pattern.

**Key Responsibilities:**
- Project state (files, settings, signatures)
- Editor state (selection, zoom, active tab)
- File management (add, remove, reorder)
- Static spreads and page items
- Reflow orchestration

**Quick Reference:**
```typescript
import { appState } from '../services/state';

// Read state
const project = appState.getProject();
const editor = appState.getEditor();

// Update state
appState.updateLayoutOptions({ margins: { top: 72, ... } });
appState.addItemToPage(pageNumber, item);

// Subscribe to changes
const unsubscribe = appState.onProjectChange((state, prev) => { ... });
```

---

### [Text Flow Engine (`textFlow.ts`)](./textFlow.md)

Parses Markdown and flows text across pages respecting layout constraints.

**Key Responsibilities:**
- Markdown parsing to sections
- Text measurement and wrapping
- Page break logic (H1 starts on recto)
- Spread and signature creation
- Static spread merging
- Imposition calculation

**Quick Reference:**
```typescript
import { textFlowEngine, clearMeasurementCache } from '../services/textFlow';

clearMeasurementCache(); // After font changes
const result = textFlowEngine.reflow(markdownContent);
// result.pages, result.spreads, result.signatures
```

---

### [PDF Generator (`pdfGenerator.ts`)](./pdfGenerator.md)

Creates print-ready PDFs with booklet imposition.

**Key Responsibilities:**
- PDF document creation
- Booklet imposition layout
- Multi-row sheet support
- Page content rendering (text and items)
- Header/footer generation
- Print marks (cut lines, fold indicators)
- Cross-page item rendering with proper clipping
- Pre-rendering items via Konva for gradient/font support
- **Font embedding** (Electron): Actual system fonts embedded with subsetting
- **Font fallback** (Web): Standard PDF fonts (Times, Helvetica, Courier)
- **Render text as images** mode: Optional fallback that renders all pages as 300 DPI images for guaranteed visual fidelity when fonts don't render correctly

**Quick Reference:**
```typescript
import { PDFGenerator } from '../services/pdfGenerator';

const generator = new PDFGenerator();
const pdfBytes = await generator.generate();
```

---

### [Font Service (`fontService.ts`)](./fontService.md)

Manages fonts for both web and Electron environments with separate font lists for different use cases.

**Key Responsibilities:**
- **Style fonts** (body, headings): Web-safe fonts (web) or system fonts (Electron)
- **Item fonts** (text objects on static pages): Google Fonts + web-safe fonts
- System font discovery (Electron via IPC with fallback to web-safe fonts)
- Google Font loading with caching
- **Font file embedding** for PDFs (Electron only, using paths from system database)
- Font availability checking

**Packaged App Notes:**
Packaged Electron apps use explicit shell/PATH configuration for reliable font discovery. On macOS, font file paths are extracted directly from `system_profiler` output for accurate font-to-file matching.

**Quick Reference:**
```typescript
import { fontService } from '../services/fontService';

// Get fonts for different contexts
const styleFonts = fontService.getStyleFonts();   // For body/headings
const itemFonts = fontService.getItemFonts();     // For text items on static pages

// Load Google fonts for items
await fontService.loadGoogleFont('Playfair Display');

// Font file embedding (Electron only)
if (fontService.canEmbedFonts()) {
  const fontData = await fontService.loadFontFileData('Georgia');
  // Returns { regular?: Uint8Array, bold?: Uint8Array, italic?: Uint8Array, boldItalic?: Uint8Array }
}
```

---

### [ZIP Handler (`zipHandler.ts`)](./zipHandler.md)

Handles project import/export as ZIP archives.

**Key Responsibilities:**
- Project serialization
- File organization (text/, images/, static/)
- Manifest generation
- Legacy format support

**Quick Reference:**
```typescript
import { ZipHandler } from '../services/zipHandler';

const handler = new ZipHandler();
const zipBytes = await handler.export();
await handler.import(base64Content);
```

---

### [Environment (`environment.ts`)](./environment.md)

Abstracts platform differences between Web and Electron.

**Key Responsibilities:**
- File open/save dialogs
- Download handling
- Print functionality
- Template loading

**Quick Reference:**
```typescript
import { env } from '../services/environment';

if (env.isElectron) { /* native features */ }
const files = await env.openFiles({ multiple: true });
await env.saveFile({ content: bytes, defaultName: 'file.pdf' });
```

---

## UI Components

### [App (`App.ts`)](./App.md)

Main application orchestrator.

**Key Responsibilities:**
- Component initialization and mounting
- Header button handlers (New, Open, Save, Export)
- Tab and panel management
- State listener setup
- Reflow triggering

---

### [Spread Editor (`SpreadEditor/`)](./SpreadEditor.md)

Konva.js-based visual editor for spreads.

**Modules:**
- `component.ts` - Main editor class
- `items.ts` - Page item rendering and interaction
- `selection.ts` - Marquee selection and context menu
- `content.ts` - Text content drawing
- `margins.ts` - Margin guides and dragging
- `thumbnails.ts` - Navigation thumbnails

**Key Features:**
- Interactive page view
- Drag-to-adjust margins
- Item creation and manipulation
- Multi-item selection (marquee, Shift+click, Cmd/Ctrl+A)
- Option+drag to duplicate items
- Copy/paste (Cmd/Ctrl+C/V)
- Right-click context menu with align/distribute
- Zoom and pan
- Keyboard shortcuts

---

### [Options Panel (`OptionsPanel/`)](./OptionsPanel.md)

Settings interface with tabbed organization.

**Tabs:**
- Selected - Item editing and effects
- Styles - Dynamic typography (based on content)
- Document - Layout, margins, info
- Output - Sheet/booklet settings

**Modules:**
- `component.ts` - Main panel class
- `helpers.ts` - Input binding utilities
- `outputOptions.ts` - Sheet/booklet settings
- `layoutOptions.ts` - Margins and spacing
- `fontOptions.ts` - Typography
- `headerFooterOptions.ts` - Headers/footers
- `selectedPage.ts` - Page info display
- `editPage.ts` - Item editing and effects
- `stylesTab.ts` - Dynamic styles generation

---

## Type System

### [Types (`types/index.ts`)](./types.md)

Comprehensive TypeScript definitions for the entire application.

**Categories:**
- Fill types (colors, gradients, patterns)
- Document structure (sections, pages, spreads)
- Page items (text, shapes, images)
- Configuration (output, layout, fonts)
- Project and editor state

---

## Data Flow

### Reflow Cycle

```
User Action (file change, option update)
         │
         ▼
  appState.requestReflow()
         │
         ▼
  App.performReflow()
         │
         ├──▶ clearMeasurementCache()
         │
         ▼
  textFlowEngine.reflow(markdown)
         │
         ├──▶ parseMarkdown() → DocumentSection[]
         ├──▶ flowSections() → PageContent[]
         ├──▶ createSpreads() → Spread[]
         ├──▶ mergeStaticSpreads()
         └──▶ createSignatures() → Signature[]
         │
         ▼
  appState.updateProject({ signatures })
         │
         ├──▶ Notify project listeners
         │
         ▼
  SpreadEditor.render()
         │
         └──▶ Visual update
```

### State Update Flow

```
Component Action
         │
         ▼
  appState.update*()
         │
         ├──▶ Merge new state
         ├──▶ Notify listeners
         │         │
         │         └──▶ OptionsPanel.syncFromState()
         │         └──▶ SpreadEditor.render()
         │
         └──▶ requestReflow() (if layout-affecting)
```

---

## Feature Guide

### Static Spreads

Static spreads exist independently of Markdown content:

1. **Creating**: Click "+ Signature" (adds a full signature worth of spreads) or "+ Page" buttons
2. **Items**: Add text, shapes, images to static pages (including the back cover)
3. **Spanning**: Items can bridge across verso and recto within a spread
4. **Crossing Items**: Items can extend across page boundaries, including across signatures
5. **Export**: Items render correctly with proper clipping at page boundaries
6. **Navigation**: Thumbnails are grouped by signature with visual outlines
7. **Download/Replace**: Static pages can be exported as PNG for external editing and replaced with images
8. **Delete**: Static pages can be deleted to restore them to text flow

### Page Export

Static pages can be exported and replaced for external editing:

**Download Options (in Selected tab for static pages):**
- **Page as PNG (300 DPI)**: Exports the current page at print quality
- **Spread as PNG (300 DPI)**: Exports both pages in the visual spread (only shown when both pages are static)

**Replace Options:**
- **Replace Page**: Upload an image to replace all content on the current page
- **Replace Spread**: Upload an image to replace content across both pages (only shown when both pages are static)

**Blank Templates (in Output tab):**
- **Single Page (PNG)**: Downloads a blank page-sized template at 300 DPI
- **Full Spread (PNG)**: Downloads a blank spread-sized template at 300 DPI

This workflow enables external editing in tools like Photoshop or Procreate, then re-importing the edited content.

### Cross-Page Items

Items that extend past page boundaries are handled specially:

- **Pre-rendering**: Items are pre-rendered using Konva for proper gradient, font, and shadow support
- **Clipping**: Each page clips items to its boundaries using Konva canvas clipping
- **Cross-signature**: Items can bridge pages across different signatures (e.g., page 4 to page 5)
- **Reading order**: Adjacent pages are determined by reading order (page ±1), not physical sheet position

### Page Items

Items can be placed on any page type (static, available, or text pages):

| Type | Properties |
|------|------------|
| Text | Content, font, size, fill (color/gradient/pattern), alignment, stroke |
| Shape | Rectangle, ellipse, circle, line, arrow with fill and stroke |
| Image | Reference to project image file |

**Common Properties:** Position (x, y), size, rotation, opacity

**Effects (available for all items):**
- **Fill** - Solid color, linear gradient, radial gradient, or pattern
- **Stroke** - Border with customizable color and width
- **Shadow** - Drop shadow with color, blur, offset, and opacity
- **Array** - Create multiple copies with multi-dimensional offset support

### Fill System

Text, shapes, and page backgrounds support multiple fill types:

1. **Solid Color**: Single hex color
2. **Linear Gradient**: Angle-based with color stops
3. **Radial Gradient**: Center, radius, color stops
4. **Pattern**: Image-based repeating pattern

All fill types render correctly in both the canvas editor and PDF export (using Konva pre-rendering for complex fills).

### Array Feature

The Array effect creates multiple copies of an item with configurable offsets:

- **Multi-dimensional**: Each dimension creates copies with its own count and offset
- **Stacking**: Copies appear below the original item (first copy on top)
- **Multiplicative**: Dimensions multiply (e.g., 3×2 = 6 total copies in a grid)
- **Example**: Dimension 1 (count=3, x=30) + Dimension 2 (count=2, y=40) creates a 3×2 grid

### Imposition

PDF export handles booklet imposition automatically:

- Pages arranged for duplex printing
- Fold and cut marks added
- Multi-row layout for efficiency (fill mode)
- Signature grouping for binding

---

## Development Guide

### Project Structure

```
src/
├── components/
│   ├── App.ts
│   ├── FileList.ts
│   ├── FilePreview.ts
│   ├── FontDropdown.ts
│   ├── PDFPreview.ts
│   ├── FillPicker/
│   │   ├── index.ts          # Re-exports
│   │   ├── FillPicker.ts     # Main component class
│   │   ├── colorUtils.ts     # Color conversion utilities
│   │   ├── colorTab.ts       # Solid color picker tab
│   │   ├── gradientTab.ts    # Gradient editor tab
│   │   └── patternTab.ts     # Pattern fill tab
│   ├── OptionsPanel/
│   │   ├── component.ts      # Main panel class
│   │   ├── helpers.ts        # Input binding utilities
│   │   ├── editPage/         # Modular edit page functionality
│   │   │   ├── index.ts
│   │   │   ├── shared.ts     # Shared state and helpers
│   │   │   ├── multiSelect.ts
│   │   │   ├── itemCreation.ts
│   │   │   ├── arrayInstances.ts
│   │   │   ├── pageBackground.ts
│   │   │   ├── propertyInputs.ts
│   │   │   ├── panelUpdate.ts
│   │   │   └── setupPanel.ts
│   │   └── ...               # Other option modules
│   └── SpreadEditor/
│       ├── component.ts      # Main editor class
│       ├── component/        # Component utilities
│       │   ├── index.ts
│       │   ├── types.ts      # Local types
│       │   ├── navigation.ts # Page navigation
│       │   └── rendering.ts  # Render helpers
│       ├── items/            # Page item handling
│       │   ├── index.ts
│       │   ├── fill.ts       # Fill application
│       │   ├── textEditing.ts
│       │   ├── nodeCreation.ts
│       │   ├── arrayItems.ts
│       │   └── rendering.ts
│       ├── selection.ts
│       ├── content.ts
│       ├── margins.ts
│       └── thumbnails.ts
├── services/
│   ├── state.ts              # Re-exports from state/
│   ├── state/                # Modular state management
│   │   ├── index.ts
│   │   ├── AppStateCore.ts   # Base class
│   │   ├── defaults.ts       # Default values
│   │   ├── fileManagement.ts
│   │   ├── optionsManagement.ts
│   │   ├── pageOperations.ts
│   │   ├── signatureOperations.ts
│   │   ├── itemOperations.ts
│   │   └── multiSelect.ts
│   ├── textFlow.ts           # Re-exports from textFlow/
│   ├── textFlow/             # Modular text flow engine
│   │   ├── index.ts
│   │   ├── TextFlowEngine.ts # Main engine class
│   │   ├── types.ts
│   │   ├── cache.ts
│   │   ├── parsing.ts        # Markdown parsing
│   │   ├── measurement.ts    # Text measurement
│   │   ├── pagination.ts     # Page break logic
│   │   ├── signatures.ts     # Signature creation
│   │   ├── dimensions.ts     # Size calculations
│   │   └── imposition.ts     # Print imposition
│   ├── pageRenderer.ts       # Konva-based page pre-rendering for PDF
│   ├── pageExport.ts         # Page/spread PNG export and image replacement
│   ├── pdfGenerator.ts       # Re-exports from pdfGenerator/
│   ├── pdfGenerator/         # Modular PDF generation
│   │   ├── index.ts
│   │   ├── PDFGenerator.ts   # Main generator class
│   │   ├── types.ts
│   │   ├── textUtils.ts
│   │   ├── colors.ts
│   │   ├── fonts.ts
│   │   ├── images.ts         # Pre-rendering orchestration
│   │   ├── printMarks.ts
│   │   └── itemDrawing.ts
│   ├── fontService.ts        # Font management (system, web-safe, Google Fonts)
│   ├── zipHandler.ts
│   └── environment.ts
├── styles/
│   ├── main.css              # Imports all modules
│   └── modules/              # Modular CSS
│       ├── base.css          # Variables, reset, app layout
│       ├── header.css        # Header styles
│       ├── buttons.css       # Button components
│       ├── panels.css        # Panel styles
│       ├── layout.css        # Main layout, resizers
│       ├── input-panel.css   # Input column, file lists
│       ├── editor.css        # Spread editor, thumbnails
│       ├── options-panel.css # Options tabs, forms
│       ├── modal.css         # Modal dialogs
│       ├── font-dropdown.css # Font picker
│       ├── fill-picker.css   # Fill picker tabs
│       └── utilities.css     # Responsive, context menu
├── types/
│   └── index.ts
├── index.html
└── index.ts
```

### Adding a New Feature

1. **Define Types**: Add interfaces to `types/index.ts`
2. **Update State**: Add methods to `state.ts`
3. **Implement Logic**: Create/update service
4. **Add UI**: Update relevant component
5. **Connect**: Wire up state listeners and handlers

### Common Patterns

**Debounced Updates:**
```typescript
const debounce = createDebouncer().debounce;
debounce(() => appState.updateLayoutOptions({ ... }));
```

**Unit Conversion:**
```typescript
const displayValue = convertFromPoints(pointsValue, unit);
const pointsValue = displayValue / UNIT_CONVERSIONS[unit].factor;
```

**Font Loading:**
```typescript
await googleFonts.loadFont(fontName);
clearMeasurementCache();
appState.requestReflow();
```

### Testing

```bash
npm run typecheck   # TypeScript checking
npm run dev         # Development server
npm run build       # Production build
```

---

## Quick Reference

### Key Files by Feature

| Feature | Files |
|---------|-------|
| Text Layout | `textFlow/` (parsing, measurement, pagination, imposition) |
| PDF Export | `pdfGenerator/`, `pageRenderer.ts` (pre-rendering, fonts, images, itemDrawing) |
| Page Export | `pageExport.ts` (PNG export, image replacement for static pages) |
| Canvas Editor | `SpreadEditor/component.ts`, `SpreadEditor/items/` |
| State Management | `state/` (AppStateCore + method extensions) |
| Page Items | `SpreadEditor/items/`, `OptionsPanel/editPage/` |
| Fills/Gradients | `FillPicker/` (colorTab, gradientTab, patternTab) |
| Cross-page Items | `pageRenderer.ts`, `pdfGenerator/images.ts`, `pdfGenerator/itemDrawing.ts` |
| Fonts | `fontService.ts`, `OptionsPanel/fontOptions.ts`, `pdfGenerator/fonts.ts` |
| Project I/O | `zipHandler.ts` |
| Settings UI | `OptionsPanel/` |
| Styles | `styles/modules/` (12 modular CSS files) |

### Important Constants

| Constant | Value | Location |
|----------|-------|----------|
| Points per inch | 72 | Used throughout |
| Default margins | 54pt (0.75") | `state/defaults.ts` |
| Reflow debounce | 0ms + RAF | `state/AppStateCore.ts` |
| Input debounce | 150ms | `OptionsPanel/helpers.ts` |
