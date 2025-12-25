# App Component (`src/components/App.ts`)

The App component is the main orchestrator that initializes all UI components and handles global application interactions.

## Overview

The `App` class serves as the application entry point, responsible for:
- Initializing and mounting all child components
- Setting up header button handlers
- Managing tab navigation
- Configuring panel resizers
- Connecting state listeners

## Architecture

```
App
├── FileList          # Left panel: file management
├── FilePreview       # Left panel: markdown preview
├── SpreadEditor      # Center: Konva canvas editor
├── PDFPreview        # Center: PDF preview tab
├── OptionsPanel      # Right panel: all settings
├── ZipHandler        # Project import/export
└── PDFGenerator      # PDF generation
```

## Initialization

#### `init(): void`

Main initialization sequence:

1. **Component Creation**
   ```typescript
   this.fileList = new FileList();
   this.filePreview = new FilePreview();
   this.spreadEditor = new SpreadEditor();
   this.pdfPreview = new PDFPreview();
   this.optionsPanel = new OptionsPanel();
   ```

2. **Component Mounting**
   - Each component attaches to its DOM container
   - Sets up internal event handlers

3. **Component Connection**
   - FileList → FilePreview (file selection)

4. **Global Setup**
   - Header buttons (New, Open, Save, Export)
   - Tab switching
   - Collapsible panels
   - State listeners
   - Resizers

5. **Initial Reflow**
   - Processes any existing content

## Header Buttons

### New Button (`#btn-new`)
- Confirms with user
- Resets application state
- Triggers reflow

### Open Button (`#btn-open`)
- Opens file dialog via environment API
- Supports: `.zip`, `.json`, `.md`, `.png`, `.jpg`, `.jpeg`, `.webp`
- ZIP files → imported via ZipHandler
- Other files → added directly to state

### Save Button (`#btn-save`)
- Exports project via ZipHandler
- Saves as `.zip` file

### Export Button (`#btn-export`)
- Generates PDF via PDFGenerator
- Saves as `.pdf` file
- Shows error alert on failure

## Tab Management

Tabs switch between Editor and Preview views:

```html
<div class="tab active" data-tab="editor">Editor</div>
<div class="tab" data-tab="preview">Preview</div>
```

**Behavior:**
- Updates tab `active` class and `aria-selected`
- Shows/hides corresponding `.tab-panel`
- Updates editor state
- Triggers appropriate resize/refresh

## Collapsible Panels

### Options Panels
- Info and Output panels start expanded
- Other panels start collapsed
- Click header to toggle

### Preview Panel
- When collapsed, Files panel expands

## Resizers

### Column Resizers (horizontal)
- `input-editor`: Between file list and editor
- `editor-options`: Between editor and options

### Panel Resizers (vertical)
- `files-preview`: Between files and preview panels

**Implementation:**
- Mouse down captures start position and sizes
- Mouse move calculates delta and applies new sizes
- Mouse up removes event listeners
- Minimum sizes enforced (200px columns, 100px/50px panels)

## State Listeners

#### Reflow Request
```typescript
appState.onReflowRequest(() => {
  this.performReflow();
});
```

#### Project Change
```typescript
appState.onProjectChange((project) => {
  this.updateDocumentInfo(project);
});
```

#### Font Loading
Debounced reflow when fonts finish loading:
```typescript
googleFonts.onFontLoaded(() => {
  clearMeasurementCache();
  this.performReflow();
});
```

#### Navigation Events
Custom event for page navigation:
```typescript
window.addEventListener('navigate-to-page', (e) => {
  this.spreadEditor.navigateToPage(e.detail.pageNumber);
});
```

## Reflow Process

#### `performReflow(): void`

1. Clears measurement cache
2. Concatenates all markdown files
3. Calls `textFlowEngine.reflow()`
4. Updates project with new signatures
5. Renders spread editor
6. Updates document info display

**Key Feature:** Reflow runs even without markdown files to process static spreads.

## Document Info Update

#### `updateDocumentInfo(project: BookletProject): void`

Updates the info panel statistics:
- Page count
- Spread count
- Signature count
- Sheet count (signatures × sheets per signature)

```typescript
document.getElementById('info-pages')!.textContent = pageCount.toString();
document.getElementById('info-spreads')!.textContent = spreadCount.toString();
document.getElementById('info-signatures')!.textContent = signatureCount.toString();
document.getElementById('info-sheets')!.textContent = sheetCount.toString();
```

## Component Communication

```
FileList ──select──▶ FilePreview
    │
    └──files change──▶ AppState ──reflow──▶ TextFlowEngine
                          │                       │
                          │                       ▼
                          │               SpreadEditor.render()
                          │
                          └──change──▶ OptionsPanel.syncFromState()
```

## Usage

```typescript
import { App } from './components/App';

// In main entry point
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
```

## CSS Dependencies

The App component expects these CSS classes:
- `.tab`, `.tab.active`
- `.tab-panel`, `.tab-panel.active`
- `.panel-options`, `.panel-info`, `.panel-preview`, `.panel-files`
- `.panel-header.collapsible`
- `.collapsed`, `.expanded`
- `.column-resizer`, `.panel-resizer`
- `.column-input`, `.column-editor`, `.column-options`
