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
| PDF Generation | pdf-lib |
| Markdown Parsing | marked |
| ZIP Handling | JSZip |
| Fonts | Google Fonts API |
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
- Page content rendering
- Header/footer generation
- Print marks (cut lines, fold indicators)
- Cross-page item clipping

**Quick Reference:**
```typescript
import { PDFGenerator } from '../services/pdfGenerator';

const generator = new PDFGenerator();
const pdfBytes = await generator.generate();
```

---

### [Google Fonts Service (`googleFonts.ts`)](./googleFonts.md)

Manages web font loading from Google Fonts.

**Key Responsibilities:**
- Font catalog (40+ Google Fonts + system fonts)
- Async font loading with caching
- Font availability checking
- Load event notifications

**Quick Reference:**
```typescript
import { googleFonts } from '../services/googleFonts';

await googleFonts.loadFont('Playfair Display');
const fonts = googleFonts.getAllFonts();
googleFonts.onFontLoaded(() => { /* re-render */ });
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
- `items.ts` - Page item rendering
- `content.ts` - Text content drawing
- `margins.ts` - Margin guides and dragging
- `thumbnails.ts` - Navigation thumbnails

**Key Features:**
- Interactive page view
- Drag-to-adjust margins
- Item creation and manipulation
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
3. **Spanning**: Items can bridge across verso and recto
4. **Export**: Items render correctly with cross-page clipping
5. **Navigation**: Thumbnails are grouped by signature with visual outlines

### Page Items

Items can be placed on static/blank pages:

| Type | Properties |
|------|------------|
| Text | Content, font, size, fill (color/gradient/pattern), alignment, stroke |
| Shape | Rectangle, ellipse, circle, line, arrow with fill and stroke |
| Image | Reference to project image file |

**Common Properties:** Position (x, y), size, rotation, opacity

**Effects (available for all items):**
- **Stroke** - Border with customizable color and width
- **Shadow** - Drop shadow with color, blur, offset, and opacity
- **Array** - Create multiple instances with offset and per-instance fill customization

### Fill System

Shapes and page backgrounds support multiple fill types:

1. **Solid Color**: Single hex color
2. **Linear Gradient**: Angle-based with color stops
3. **Radial Gradient**: Center, radius, color stops
4. **Pattern**: Image-based repeating pattern

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
│   ├── OptionsPanel/
│   └── SpreadEditor/
├── services/
│   ├── state.ts
│   ├── textFlow.ts
│   ├── pdfGenerator.ts
│   ├── googleFonts.ts
│   ├── zipHandler.ts
│   └── environment.ts
├── styles/
│   └── main.css
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
| Text Layout | `textFlow.ts`, `types/index.ts` |
| PDF Export | `pdfGenerator.ts` |
| Canvas Editor | `SpreadEditor/` |
| State Management | `state.ts` |
| Page Items | `SpreadEditor/items.ts`, `editPage.ts` |
| Fills/Gradients | `FillPicker/`, `types/index.ts` |
| Fonts | `googleFonts.ts`, `fontOptions.ts` |
| Project I/O | `zipHandler.ts` |
| Settings UI | `OptionsPanel/` |

### Important Constants

| Constant | Value | Location |
|----------|-------|----------|
| Points per inch | 72 | Used throughout |
| Default margins | 54pt (0.75") | `state.ts` |
| Reflow debounce | 0ms + RAF | `state.ts` |
| Input debounce | 150ms | `helpers.ts` |
