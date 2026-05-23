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
│                     WelcomeScreen                            │
│        (file-first gate: New / Open / Recents)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
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
                                                  │
                                                  ▼
                                  ┌─────────────────────────────┐
                                  │  projectFile  recentProjects │
                                  │   (auto-save + recents)     │
                                  └─────────────────────────────┘
```

### Project Lifecycle (file-first)

PrintFold enforces that every project has a backing `.printfold` file
on disk before the editor opens. On launch, the WelcomeScreen is the
only UI: the user must pick **New Project**, **Open Project**, or a
**Recent Project** entry. After that selection:

1. `projectFile` records the destination (Electron path or web
   `FileSystemFileHandle`).
2. The editor mounts and listens for state changes.
3. Every change schedules a debounced write (600ms) back to that file
   via `ZipHandler.export()` → `projectFile.write()`.
4. `recentProjects` records the entry so it appears the next time the
   welcome screen is shown.

The header `Projects…` button reopens the WelcomeScreen at any time to
switch projects. Browsers without the File System Access API fall back
to a manual Save button that re-downloads the project.

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
- **Custom fonts** (user-uploaded `.ttf` / `.otf` / `.woff` files in the Fonts tab): registered via `@font-face` and shown at the top of every font dropdown
- System font discovery (Electron via IPC with fallback to web-safe fonts)
- Google Font loading with caching
- **Font file embedding** for PDFs — Electron uses paths from the system database; custom fonts embed straight from their in-memory bytes (works on web too)
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

Handles project import/export. The on-disk format is a ZIP archive
with a `.printfold` extension (so the OS can register a file
association). Internally the format is unchanged.

**Key Responsibilities:**
- Project serialization
- File organization (`text/`, `images/`, `fonts/`, `static/`)
- Manifest generation (per-page state + items + fills + custom backgrounds)
- Legacy format support
- Two-phase import: wait for the first reflow to publish signatures,
  layer the saved per-page metadata, and re-flow text around any pages
  that transitioned to a non-text state

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
- Welcome-screen-driven project lifecycle (New / Open / Recent)
- Auto-save loop (debounced writes to the bound `.printfold` file)
- Header button handlers (Projects, Save fallback, Export)
- Tab and panel management
- State listener setup
- Reflow triggering

### Welcome Screen (`WelcomeScreen.ts`)

The first thing the user sees on launch. Enforces the file-first flow:
the editor stays hidden until the user creates or opens a project, so
every change always has a backing `.printfold` file on disk.

- `New Project` → prompts for a save location, creates the empty file
  immediately, opens the editor.
- `Open Project` → prompts for a `.printfold` file to load.
- `Recent Projects` → list backed by `recentProjects.ts`; clicking a
  row reopens the project directly.

### Project File / Recents Services

- [`projectFile.ts`](./projectFile.md): tracks the active destination
  (Electron path or `FileSystemFileHandle`) and performs writes for the
  auto-save loop.
- [`recentProjects.ts`](./recentProjects.md): per-environment recents
  persistence. Electron stores paths in `userData/recents.json`; Web
  stores `FileSystemFileHandle`s in IndexedDB with display metadata in
  `localStorage`.

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

### Project Files (`.printfold`)

Projects are stored as `.printfold` files — a ZIP archive with a custom
extension so the OS can register a file association. The on-disk
layout is unchanged from the previous `.zip` format: `project.json`
manifest at the root, plus `text/`, `images/`, `fonts/`, and `static/`
subfolders.

**Lifecycle:**

1. The WelcomeScreen gates entry to the editor. Users pick **New
   Project**, **Open Project**, or a **Recent Project** entry.
2. *New Project*: the user picks a save location; an empty
   `.printfold` file is created on disk immediately.
3. *Open Project* / *Recent*: the file's bytes are loaded through
   `ZipHandler.import()`.
4. Once the editor mounts, every state change schedules a debounced
   write (600ms) to the bound destination.
5. The header shows a `Saving…` / `Saved` indicator. Atomic writes
   (Electron writes to `.tmp` then renames) prevent corruption.

**Recents storage:**

- *Electron*: `userData/recents.json` (file paths).
- *Web (Chromium)*: `FileSystemFileHandle`s in IndexedDB + display
  metadata (name, lastOpened) in `localStorage`. Permissions are
  re-requested when a stale handle is reused.
- *Web (Safari/Firefox)*: no silent writes are possible. The welcome
  screen still works, but a banner appears and the manual **Save**
  button (re-download flow) is shown in the header.

### Files Area

The left-hand Files panel is split into three tabs:

| Tab | Accepted files | Behavior |
|-----|----------------|----------|
| **Text** | `.md` | Concatenated in tab order for the markdown flow; drag rows to reorder |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.webp` | Drag thumbnails onto static pages to place; also usable as page backgrounds and pattern fills |
| **Fonts** | `.ttf`, `.otf`, `.woff` | Each file is registered via `@font-face` and appears at the top of every font dropdown under a "Custom Fonts" heading; usable in body/headings/headers/footers and on static-page text items |

Files in every tab can be dragged into the panel or added via the
"+ Files" button. Selecting a font shows a sample preview (Aa, pangram,
digits) in the preview pane below the list.

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
| Text Flow | Polygon-shaped region (corner + smooth vertices) that pulls a slice of the markdown flow through it — see [Text Flow Items](#text-flow-items) |

**Common Properties:** Position (x, y), size, rotation, opacity

**Effects (available for all items):**
- **Fill** - Solid color, linear gradient, radial gradient, or pattern, plus an **Offset** that extends or shrinks the filled region perpendicular to the path
- **Stroke** - Border with customizable color, width, and **Offset** (positive = outside the path, negative = inside)
- **Shadow** - Drop shadow with color, blur, offset, and opacity (text-flow items skip this)
- **Array** - Create multiple copies with multi-dimensional offset support

### Text Flow Items

A Text Flow item is a polygon-shaped region on a static page that receives a slice of the surrounding markdown flow — like a mini-page embedded in the spread.

**Creating:** Toolbar "Text Flow Region" button (above the spread editor). The initial shape is a rectangle that can be reshaped into any polygon.

**Vertex editing (when item is selected):**
- Drag an anchor handle to move that vertex; the item's bounding box reframes on release so the polygon stays fully contained.
- Click within ~8pt of an edge to insert a new vertex; a faint ghost dot previews the position.
- Alt/Option + click on an anchor to remove it (minimum 3 vertices).
- Cmd/Ctrl + click on an anchor toggles between **corner** and **smooth** (cubic-bezier). Smooth points show two draggable tangent handles connected by dashed lines.

**Text flow:** Built by `textFlow/slotFlow.ts`. When any static page has text-flow items, the engine builds a sequence of slots (full text pages + per-region mini-slots) and pours markdown sections into them in document order. For polygon regions it lays out lines individually, using the polygon's horizontal extent at each y as the per-line width — so wrapping follows the silhouette, including curved edges. Curved polygons are flattened (~24 samples per edge) for the scanline intersection.

**Effects:** Background **Fill** (solid color) plus a **Text Color** override that recolors every flowed line. Stroke follows the polygon path. Both Fill and Stroke have **Offset** controls that maintain constant perpendicular distance from the original path (proper miter-joined polygon offset, clamped at 8× the offset distance for very sharp corners). Curved polygons are flattened before offsetting, so the offset outline is a fine polyline that hugs the original curve.

### Fill System

Text, shapes, and page backgrounds support multiple fill types:

1. **Solid Color**: Single hex color
2. **Linear Gradient**: Angle-based with color stops
3. **Radial Gradient**: Center, radius, color stops
4. **Pattern**: Image-based repeating pattern

All fill types render correctly in both the canvas editor and PDF export (using Konva pre-rendering for complex fills). Text-flow items currently use solid color only.

### Array Feature

The Array effect creates multiple copies of an item with configurable offsets:

- **Multi-dimensional**: Each dimension creates copies with its own count and offset
- **Stacking**: Copies appear below the original item (first copy on top)
- **Multiplicative**: Dimensions multiply (e.g., 3×2 = 6 total copies in a grid)
- **Example**: Dimension 1 (count=3, x=30) + Dimension 2 (count=2, y=40) creates a 3×2 grid

### Footnotes

Footnotes use GFM syntax — `[^id]` for references and `[^id]: body` for
definitions. The "Footnotes" section in the Document tab controls
placement:

- **Off (default)**: footnotes render at the bottom of the page that
  holds their reference, separated by a short rule. Pagination
  iteratively shrinks the content area for pages that carry footnotes
  until the per-page reservation converges, so body text reflows around
  the footnote block.
- **On (Show footnotes as endnotes)**: footnotes are collected as
  endnotes; placement is either at the end of the document or at the
  end of each H1-delimited chapter. A hard page break precedes each
  endnote group.

References appear as superscript numbers inline. Numbering is sequential
through the document (a reference to the same id repeats the same
number). The body styling of footnote/endnote text is controlled by the
**Footnote** entry in the Styles tab, which appears whenever the
markdown contains a definition.

Reservations are monotonically non-decreasing across reflow iterations
so a marker sitting exactly at a page boundary can't oscillate between
"on this page" and "pushed to the next page" — once a page has
reserved footnote space, it keeps it for the rest of the reflow.

Key files: `services/textFlow/footnotes.ts` (extraction, numbering,
reservation height, endnote section synthesis),
`services/textFlow/TextFlowEngine.ts` (iterative reflow loop),
`components/SpreadEditor/content.ts` and
`services/pdfGenerator/PDFGenerator.ts` (footnote block + superscript
rendering).

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
│   ├── WelcomeScreen.ts      # File-first launch screen (New/Open/Recents)
│   ├── FileList.ts
│   ├── FilePreview.ts
│   ├── FontDropdown.ts
│   ├── PDFPreview.ts
│   ├── FillPicker/
│   │   ├── index.ts                  # Re-exports: FillPicker, createFillPicker,
│   │   │                              # ColorPicker, createColorPicker
│   │   └── fillpicker/
│   │       ├── index.ts              # Module barrel + ColorPicker wrapper
│   │       │                          # (color-only FillPicker used app-wide for
│   │       │                          # plain hex color fields)
│   │       ├── FillPicker.ts         # Main component class
│   │       ├── colorUtils.ts         # Color conversion utilities
│   │       ├── colorTab.ts           # Solid color picker tab
│   │       ├── gradientTab.ts        # Gradient editor tab
│   │       └── patternTab.ts         # Pattern fill tab
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
│       │   ├── rendering.ts
│       │   ├── textFlowRendering.ts # Konva nodes for text-flow content
│       │   └── vertexHandles.ts     # Polygon vertex/tangent UI
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
│   │   ├── footnotes.ts      # Footnote extraction, numbering, reservation
│   │   ├── measurement.ts    # Text measurement
│   │   ├── pagination.ts     # Page break logic
│   │   ├── slotFlow.ts       # Slot-based flow (text-flow items)
│   │   ├── polygonPath.ts    # Polygon path + offset utilities
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
│   ├── zipHandler.ts         # .printfold (ZIP) read/write
│   ├── projectFile.ts        # Active project file binding (path/handle) + writes
│   ├── recentProjects.ts     # Per-environment recents storage
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
│       ├── welcome.css       # Welcome / startup screen
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
npm run typecheck       # TypeScript checking
npm run dev             # Development server (webpack-dev-server on :3000)
npm run build:web       # Production web build
npm run build:electron  # Production electron build
```

---

## Quick Reference

### Key Files by Feature

| Feature | Files |
|---------|-------|
| Text Layout | `textFlow/` (parsing, measurement, pagination, imposition) |
| Footnotes | `textFlow/footnotes.ts`, `textFlow/TextFlowEngine.ts` (iterative reservation), `SpreadEditor/content.ts` + `pdfGenerator/PDFGenerator.ts` (rendering), `OptionsPanel/layoutOptions.ts` (Document-tab toggle) |
| Text-Flow Items | `textFlow/slotFlow.ts`, `textFlow/polygonPath.ts`, `SpreadEditor/items/textFlowRendering.ts`, `SpreadEditor/items/vertexHandles.ts` |
| PDF Export | `pdfGenerator/`, `pageRenderer.ts` (pre-rendering, fonts, images, itemDrawing) |
| Page Export | `pageExport.ts` (PNG export, image replacement for static pages) |
| Canvas Editor | `SpreadEditor/component.ts`, `SpreadEditor/items/` |
| State Management | `state/` (AppStateCore + method extensions) |
| Page Items | `SpreadEditor/items/`, `OptionsPanel/editPage/` |
| Fills/Gradients | `FillPicker/` (colorTab, gradientTab, patternTab) |
| Color Picker (color-only) | `FillPicker/fillpicker/index.ts` (`ColorPicker` wrapper used everywhere a plain hex color is needed) |
| Cross-page Items | `pageRenderer.ts`, `pdfGenerator/images.ts`, `pdfGenerator/itemDrawing.ts` |
| Fonts | `fontService.ts`, `OptionsPanel/fontOptions.ts`, `pdfGenerator/fonts.ts`, `FontDropdown.ts` |
| Custom Fonts (uploads) | `services/fontService.ts` (registry + `@font-face`), `components/FileList.ts` (Fonts tab), `services/zipHandler.ts` (`fonts/` folder) |
| Project I/O | `zipHandler.ts` |
| Project Lifecycle | `WelcomeScreen.ts`, `App.ts` (auto-save loop), `projectFile.ts`, `recentProjects.ts` |
| Settings UI | `OptionsPanel/` |
| Styles Tab Accordion | `OptionsPanel/stylesTab.ts` (signature-gated rebuild, per-section `accordion-section`) |
| Styles | `styles/modules/` (12 modular CSS files) |

### Important Constants

| Constant | Value | Location |
|----------|-------|----------|
| Points per inch | 72 | Used throughout |
| Default margins | 54pt (0.75") | `state/defaults.ts` |
| Reflow debounce | 0ms + RAF | `state/AppStateCore.ts` |
| Input debounce | 150ms | `OptionsPanel/helpers.ts` |
