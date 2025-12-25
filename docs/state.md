# State Management (`src/services/state.ts`)

The state management module provides centralized, reactive state for the entire PrintFold application using an event emitter pattern.

## Overview

The `AppState` class manages two distinct state trees:
- **Project State** (`BookletProject`): Persistent data that gets saved/loaded with projects
- **Editor State** (`EditorState`): Transient UI state that doesn't persist

## Architecture

```
AppState (singleton)
├── Project State
│   ├── files (ProjectFile[])
│   ├── outputOptions
│   ├── layoutOptions
│   ├── fontOptions
│   ├── headerFooter
│   ├── signatures (computed from reflow)
│   ├── blankPages
│   └── staticSpreads
└── Editor State
    ├── selectedPageNumber
    ├── selectedSpreadNumber
    ├── selectedPagePosition (verso/recto)
    ├── selectedItemId
    ├── zoomLevel
    ├── activeTab
    └── marginUnit
```

## Key Methods

### State Access

| Method | Description |
|--------|-------------|
| `getProject()` | Returns the current BookletProject state |
| `getEditor()` | Returns the current EditorState |
| `updateProject(updates)` | Merges updates into project state and notifies listeners |
| `updateEditor(updates)` | Merges updates into editor state and notifies listeners |

### File Management

| Method | Description |
|--------|-------------|
| `addFiles(files)` | Adds or replaces files, auto-selects main document, triggers reflow |
| `removeFile(fileId)` | Removes a file and triggers reflow |
| `updateFile(fileId, updates)` | Updates file properties, triggers reflow for markdown files |
| `reorderFiles(fileIds)` | Reorders files (affects markdown concatenation order) |
| `setMainDocument(fileId)` | Sets the primary markdown document |
| `getFile(fileId)` | Retrieves a file by ID |
| `getImageByName(name)` | Finds an image file by name (case-insensitive) |

### Options Updates

| Method | Description |
|--------|-------------|
| `updateOutputOptions(updates)` | Updates sheet/booklet size, pages per signature, etc. |
| `updateLayoutOptions(updates)` | Updates margins, spacing, line height |
| `updateFontOptions(updates)` | Updates font families, sizes, colors |
| `updateHeaderFooter(updates)` | Updates header/footer configuration |
| `setMeasurementUnit(unit)` | Sets project-wide measurement unit (pt, in, cm, px) |

### Static Spreads

Static spreads exist independently of markdown content, allowing users to create blank pages with custom items.

| Method | Description |
|--------|-------------|
| `addStaticSignature()` | Creates a full signature worth of static spreads |
| `addStaticSpread()` | Creates a new static spread with verso and recto pages |
| `addStaticPage(position)` | Adds a single static page (verso or recto) |
| `removeStaticSpread(spreadId)` | Removes a static spread by ID |
| `getStaticSpreads()` | Returns all static spreads |

### Page Items

Items (text, shapes, images) can be placed on static/blank pages.

| Method | Description |
|--------|-------------|
| `addItemToPage(pageNumber, item)` | Adds an item to a specific page |
| `updateItemOnPage(pageNumber, itemId, updates)` | Updates item properties |
| `deleteItemFromPage(pageNumber, itemId)` | Removes an item from a page |
| `getItemFromPage(pageNumber, itemId)` | Retrieves an item by ID |
| `updatePageBackground(pageNumber, fill)` | Sets page background fill |

### Z-Order Management

| Method | Description |
|--------|-------------|
| `bringItemToFront(pageNumber, itemId)` | Moves item to highest z-index |
| `sendItemToBack(pageNumber, itemId)` | Moves item to lowest z-index |
| `moveItemForward(pageNumber, itemId)` | Moves item one step up |
| `moveItemBackward(pageNumber, itemId)` | Moves item one step down |

### Spanning Items

Spanning items bridge across both pages of a static spread.

| Method | Description |
|--------|-------------|
| `addSpanningItemToSpread(spreadId, item)` | Adds a spanning item |
| `updateSpanningItem(spreadId, itemId, updates)` | Updates spanning item properties |
| `deleteSpanningItem(spreadId, itemId)` | Removes a spanning item |

### Subscriptions

| Method | Description |
|--------|-------------|
| `onProjectChange(handler)` | Subscribe to project state changes; returns unsubscribe function |
| `onEditorChange(handler)` | Subscribe to editor state changes; returns unsubscribe function |
| `onReflowRequest(handler)` | Subscribe to reflow requests; returns unsubscribe function |
| `requestReflow()` | Triggers a debounced reflow request |

### Persistence

| Method | Description |
|--------|-------------|
| `toJSON()` | Serializes project state to JSON string |
| `fromJSON(json)` | Loads project state from JSON string |
| `reset()` | Resets to empty project state |

## Event Flow

```
User Action
    │
    ▼
State Update (updateProject/updateEditor)
    │
    ├──▶ Notify Listeners (onProjectChange/onEditorChange)
    │         │
    │         └──▶ UI Components re-render
    │
    └──▶ Request Reflow (for layout-affecting changes)
              │
              └──▶ TextFlowEngine.reflow()
                        │
                        └──▶ Signatures updated
                                  │
                                  └──▶ SpreadEditor.render()
```

## Default Values

The module exports default configuration objects:
- `defaultOutputOptions` - Letter size, half-letter booklet, 4 pages/signature
- `defaultLayoutOptions` - Standard margins (0.75" top/bottom, 0.5" outer, 0.75" inner)
- `defaultFontOptions` - Source Serif 4 for body, Source Sans 3 for headings
- `defaultHeaderFooter` - Footer enabled with page numbers, header disabled
- `defaultEditorState` - No selection, 100% zoom, editor tab active

## Usage Example

```typescript
import { appState } from '../services/state';

// Subscribe to project changes
const unsubscribe = appState.onProjectChange((project, prevProject) => {
  console.log('Project changed:', project);
});

// Update margins
appState.updateLayoutOptions({
  margins: { top: 72, bottom: 72, inner: 72, outer: 54 }
});

// Add a file
appState.addFiles([{
  id: crypto.randomUUID(),
  name: 'chapter1.md',
  type: 'markdown',
  content: '# Chapter 1\n\nContent here...',
  isBase64: false,
  lastModified: Date.now()
}]);

// Clean up
unsubscribe();
```

## Singleton Pattern

The module exports a singleton instance `appState` that should be used throughout the application:

```typescript
export const appState = new AppState();
```
