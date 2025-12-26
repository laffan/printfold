# Page State Refactor Plan

## Overview

Refactor the page model to have three explicit states: **available**, **text**, and **static**.

### Visual Indicators (Thumbnail Page Numbers)

| State | Background Color | Meaning |
|-------|------------------|---------|
| `available` | Medium gray (`#6b7280`) | Empty, can receive text or shapes |
| `text` | Light gray (`#9ca3af`) | Has markdown content |
| `static` | Orange (`#ea580c`) | Has shapes, draggable |

## Current Model (Problems)

- `staticSpreads` array holds user-created static spreads separately
- Static spreads are merged at the END of content spreads only
- `isStatic` flag is set by textFlow for back cover, not for user customization
- No way to insert static pages at arbitrary positions
- Adding shapes to pages doesn't claim them as static

## New Model

### Page States

| State | Description | Text Flow | Draggable | Deletable |
|-------|-------------|-----------|-----------|-----------|
| `available` | Empty page, no shapes or text | Can receive text | No | No (structural) |
| `text` | Page with flowed markdown content | Receives text | No | No (reduce content) |
| `static` | Page with shapes/items, blocks text | Skipped | Yes | Yes (Remove Page) |

### State Transitions

```
available ──[add shape]──> static
available ──[text flows in]──> text
static ──[Reset Page State button]──> available
text ──[add shape]──> text (shapes allowed on text pages)
text ──[remove content]──> available (when page becomes empty after reflow)
```

## Implementation Steps

### Phase 1: Types

**File: `src/types/index.ts`**

```typescript
// Add page state enum
export type PageState = 'available' | 'text' | 'static';

// Update PageContent
export interface PageContent {
  id: string;
  pageNumber: number;
  pageState: PageState;  // NEW
  sections: DocumentSection[];
  // ... rest unchanged
  items?: PageItem[];
  backgroundFill?: FillConfig;
  // Deprecate but keep for backward compat:
  isBlank: boolean;
  isStatic: boolean;
}
```

### Phase 2: State Management

**File: `src/services/state.ts`**

New/Updated Methods:

```typescript
// Insert a new static page after the specified page number
// Shifts all subsequent pages forward
insertStaticPage(afterPageNumber: number): void

// Remove a static page completely
// Shifts all subsequent pages backward
removeStaticPage(pageNumber: number): void

// Reset a static page to available (clears items)
resetPageState(pageNumber: number): void

// Move a static page from one position to another
// For drag/drop reordering
moveStaticPage(fromPageNumber: number, toPageNumber: number): void

// Update addItemToPage to claim available pages as static
addItemToPage(pageNumber: number, item: PageItem): void {
  // If page is 'available', change to 'static'
  // Add item to page
}
```

Remove:
- `staticSpreads` array (migrate to inline pages)
- `addStaticSpread`, `addStaticPage`, `addStaticSignature` methods
- `mergeStaticSpreads` related logic

### Phase 3: Text Flow Engine

**File: `src/services/textFlow.ts`**

Update `reflow()`:

1. Accept existing page structure (with static pages marked)
2. Flow text only into `available` pages, skip `static` pages
3. Mark filled pages as `text`, empty pages as `available`
4. Preserve static page positions and items

```typescript
reflow(markdown: string, existingPages?: PageState[]): FlowResult {
  // 1. Get existing page states (static pages to preserve)
  // 2. Parse markdown into sections
  // 3. Flow sections into available slots, skipping static pages
  // 4. Mark pages with content as 'text'
  // 5. Mark empty pages as 'available'
  // 6. Return updated structure
}
```

Key change: Instead of appending static spreads at the end, static pages are **inline** and text flows around them.

### Phase 4: UI Updates

**File: `src/index.html`**

```html
<!-- Rename button -->
<button id="btn-add-static-page">+ Static Page</button>
```

**File: `src/components/OptionsPanel/selectedPage.ts`**

Add buttons when a static page is selected:
```html
<button id="btn-remove-page">Remove Page</button>
<button id="btn-reset-page-state">Reset Page State</button>
```

**File: `src/components/SpreadEditor/thumbnails.ts`**

- Make pages with `pageState === 'static'` draggable
- Show orange background for static pages
- Implement drop zones between pages
- On drop: call `moveStaticPage()` and trigger reflow

### Phase 5: Drag/Drop Implementation

**Drag behavior:**
- Only static pages are draggable
- Visual: Orange outline, cursor: grab

**Drop zones:**
- Between any two pages (shown as insertion line)
- On top of another static page (swaps positions)
- On top of a text page (inserts before, text reflows)

**On drop:**
1. Call `moveStaticPage(from, to)`
2. Trigger reflow to update text around new position

### Phase 6: Signature Handling

Signatures remain as units. When inserting/removing pages:
- Total page count changes
- Signatures may need additional available/padding pages
- Reflow handles this automatically

## Migration Path

For existing projects with `staticSpreads`:
1. During load, convert `staticSpreads` to inline pages with `pageState: 'static'`
2. Place them at their original positions (after content)
3. Remove `staticSpreads` from project

## Edge Cases

1. **Back cover**: Just a page, follows same rules (starts as available)
2. **Shapes on text pages**: Allowed, but shapes may not relate to text after reflow
3. **Empty static page**: Stays static until explicit "Reset Page State"
4. **Signature boundaries**: Handled by signature creation logic (padding as needed)

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `PageState` type, update `PageContent` |
| `src/services/state.ts` | Add new methods, remove `staticSpreads` |
| `src/services/textFlow.ts` | Skip static pages during flow |
| `src/components/SpreadEditor/thumbnails.ts` | Drag/drop for static pages |
| `src/components/OptionsPanel/selectedPage.ts` | Remove/Reset buttons |
| `src/index.html` | Rename button |
| `src/services/zipHandler.ts` | Handle migration from old format |

## Testing Checklist

- [ ] Create a new project, verify pages start as 'available'
- [ ] Add markdown, verify pages become 'text'
- [ ] Add shape to available page, verify it becomes 'static'
- [ ] Add shape to text page, verify shapes display correctly
- [ ] Insert static page via button, verify it appears at correct position
- [ ] Drag static page to new position, verify text reflows
- [ ] Remove static page, verify pages shift correctly
- [ ] Reset static page state, verify it becomes available and text can flow in
- [ ] Load old project with `staticSpreads`, verify migration works
