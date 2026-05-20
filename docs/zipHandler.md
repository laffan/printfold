# ZIP Handler (`src/services/zipHandler.ts`)

The ZIP Handler manages import and export of PrintFold project files as ZIP archives using the JSZip library.

## Overview

The `ZipHandler` class provides project persistence through a structured ZIP format that includes:
- Project manifest (settings)
- Markdown text files
- Image files
- Custom font files (`.ttf` / `.otf` / `.woff`)
- Static page content (state, items, backgrounds)

## Archive Structure

```
project.zip
├── project.json           # Project manifest
├── text/
│   ├── chapter1.md       # Markdown files
│   └── chapter2.md
├── images/
│   ├── cover.png         # Image files
│   └── diagram.jpg
├── fonts/
│   ├── MyHeadline.ttf    # User-uploaded custom fonts
│   └── BodyFont.woff
└── static/
    ├── page5-abc123.json # Per-page state, items, fills, custom backgrounds
    └── page6-def456.json
```

## Project Manifest

The `project.json` file contains:

```typescript
interface ProjectManifest {
  version: string;           // Format version ("2.1.0")
  name: string;              // Project name
  projectId: string;
  mainDocument: string | null;
  measurementUnit?: MarginUnit; // 'pt' | 'in' | 'cm' | 'px' (added in 2.1)
  outputOptions: OutputOptions;
  layoutOptions: LayoutOptions;
  fontOptions: FontOptions;
  headerFooter: HeaderFooterOptions;
  blankPages: number[];
  files: ManifestFile[];     // Metadata for every saved markdown / image / font
  fileOrder: string[];       // Markdown file IDs in concatenation order
}
```

## Key Methods

### Export

#### `export(): Promise<Uint8Array>`

Exports the current project to a ZIP archive.

**Process:**
1. Creates ZIP with folder structure
2. Adds markdown files to `/text/`
3. Adds images (base64 → binary) to `/images/`
4. Adds custom fonts (base64 → binary) to `/fonts/`
5. Collects per-page data (state, items, background fill, custom
   background id) for any page that isn't a pristine text page, and
   writes each to `/static/`
6. Generates manifest with file metadata and order
7. Returns ZIP as Uint8Array

### Import

#### `import(base64Content: string): Promise<void>`

Imports a project from base64-encoded ZIP content.

#### `importFromArrayBuffer(content: ArrayBuffer): Promise<void>`

Main import logic:

**Process:**
1. Load ZIP archive
2. Parse manifest (supports legacy `printfold.json`)
3. Reset current state
4. Process files in parallel:
   - `text/*.md` → `markdown` type
   - `images/*` → `image` type (base64-encoded in memory)
   - `fonts/*` → `font` type (base64-encoded in memory; the App's
     project listener picks these up and calls
     `fontService.registerCustomFont`)
   - `static/*.json` → pending per-page data (state, items,
     `backgroundFill`, `customBackgroundImageId`)
5. Restore project settings from manifest
6. `appState.addFiles(files)` — adds files, which queues the first
   reflow. Markdown is flowed into plain text pages at this point;
   the saved static-page metadata hasn't been applied yet.
7. If any `static/*.json` data was found:
   - `await waitForSignatures()` — resolves the moment the first
     reflow publishes a non-empty `signatures` array (via a one-shot
     `onProjectChange` listener), eliminating the 100 ms timer that
     used to race the reflow.
   - `applyStaticPageData()` writes the saved state back through
     `setPageState`, `setPageBackgroundFill`, `setCustomBackground`,
     and `addItemToPage`. It returns `true` when at least one page
     actually transitioned out of `text` state.
   - If `applyStaticPageData` reported a state transition,
     `requestReflow()` runs a *second* reflow so the markdown
     re-flows around the newly-marked static pages.  When only items
     or backgrounds were added to pages whose state didn't change,
     the second reflow is skipped — `captureStaticPages` wouldn't
     preserve `text`-state pages, so a re-run would silently drop
     the items we just restored.

#### `importFromFile(file: File): Promise<void>`

Imports from a File object (drag-drop or file input).

### Static Page Content

#### `collectStaticPageData(project): Map<number, StaticPageData>`

Walks every page in every signature and captures the full `StaticPageData`
record for any page that has non-`text` state, any items, a background
fill, or a custom background image. (Text pages with placed items are
included too, so reopening the project doesn't drop them.)

#### `applyStaticPageData(): boolean`

Writes pending per-page data back through the state API and returns
whether any page state transitioned out of `text` (the import flow
uses this to decide whether to fire a second reflow).

## File Type Detection

```typescript
private getFileType(ext: string): ProjectFile['type'] {
  switch (ext) {
    case 'md': return 'markdown';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif': return 'image';
    case 'zip': return 'archive';
    case 'ttf':
    case 'otf':
    case 'woff': return 'font';
    default: return 'unknown';
  }
}
```

## File Manifest Entry

```typescript
interface ManifestFile {
  id: string;           // Unique file ID
  name: string;         // Original filename
  type: string;         // File type
  path: string;         // Path within ZIP
  lastModified: number; // Timestamp
}
```

## Static Page Content Format

```typescript
interface StaticPageData {
  pageNumber: number;
  pageState: 'static' | 'available' | 'text';
  items: PageItem[];
  backgroundFill?: FillConfig;
  customBackgroundImageId?: string;
}
```

Legacy files that only carried `{ pageNumber, items }` are upgraded on
import by defaulting `pageState` to `'static'`.

**Filename Format:** `page{number}-{hash}.json`

## Binary Conversion Utilities

#### `base64ToArrayBuffer(base64: string): ArrayBuffer`

Converts base64 string to ArrayBuffer for ZIP inclusion.

#### `arrayBufferToBase64(buffer: ArrayBuffer): string`

Converts ArrayBuffer to base64 for in-memory storage.

## Legacy Support

The handler supports older project formats:
- `printfold.json` manifest filename
- Files in root directory (no folder structure)
- Missing `fileOrder` property

## Usage Example

### Export

```typescript
import { ZipHandler } from '../services/zipHandler';

const zipHandler = new ZipHandler();
const zipContent = await zipHandler.export();

// Save to file
await env.saveFile({
  defaultName: 'my-booklet.zip',
  filters: [{ name: 'PrintFold Project', extensions: ['zip'] }],
  content: zipContent
});
```

### Import

```typescript
// From file input
const file = event.target.files[0];
await zipHandler.importFromFile(file);

// From base64 (e.g., from environment API)
await zipHandler.import(base64Content);
```

## File Order Preservation

The manifest stores file order to maintain markdown concatenation sequence:

```typescript
// Export: capture current order
fileOrder: project.files
  .filter(f => f.type === 'markdown')
  .map(f => f.id)

// Import: restore order
files.sort((a, b) => {
  const indexA = manifest.fileOrder.indexOf(a.id);
  const indexB = manifest.fileOrder.indexOf(b.id);
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;
  return indexA - indexB;
});
```

## Version History

| Version | Changes |
|---------|---------|
| 2.1.0 | Current format. `measurementUnit` in the manifest, `fonts/` folder for custom fonts, `static/*.json` carries full `StaticPageData` (state + items + backgroundFill + customBackgroundImageId), import waits on the first reflow before applying per-page data |
| 2.0.0 | Folder structure (`text/`, `images/`, `static/`); manifest renamed to `project.json` |
| 1.x | Legacy format with flat file structure and `printfold.json` manifest |
