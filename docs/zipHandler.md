# ZIP Handler (`src/services/zipHandler.ts`)

The ZIP Handler manages import and export of PrintFold project files as ZIP archives using the JSZip library.

## Overview

The `ZipHandler` class provides project persistence through a structured ZIP format that includes:
- Project manifest (settings)
- Markdown text files
- Image files
- Static page content

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
└── static/
    ├── page5-abc123.json # Static page items
    └── page6-def456.json
```

## Project Manifest

The `project.json` file contains:

```typescript
interface ProjectManifest {
  version: string;           // Format version ("2.0.0")
  name: string;              // Project name
  projectId: string;         // Unique project ID
  mainDocument: string | null;
  outputOptions: OutputOptions;
  layoutOptions: LayoutOptions;
  fontOptions: FontOptions;
  headerFooter: HeaderFooterOptions;
  blankPages: number[];
  files: ManifestFile[];     // File metadata
  fileOrder: string[];       // Order for concatenation
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
4. Collects static page items and saves to `/static/`
5. Generates manifest with file metadata and order
6. Returns ZIP as Uint8Array

### Import

#### `import(base64Content: string): Promise<void>`

Imports a project from base64-encoded ZIP content.

#### `importFromArrayBuffer(content: ArrayBuffer): Promise<void>`

Main import logic:

**Process:**
1. Loads ZIP archive
2. Parses manifest (supports legacy `printfold.json`)
3. Resets current state
4. Processes files:
   - Text files → `markdown` type
   - Images → base64 encoding
   - Static content → pending items
5. Restores project settings from manifest
6. Adds files (triggers reflow)
7. Applies static items after reflow completes

#### `importFromFile(file: File): Promise<void>`

Imports from a File object (drag-drop or file input).

### Static Page Content

#### `collectStaticPageItems(project): Map<number, PageItem[]>`

Collects all items from static/blank pages for export.

#### `applyStaticItems(): void`

Applies pending static items after import reflow.

**Timing:**
Items are applied after a 100ms delay to allow reflow to complete:
```typescript
setTimeout(() => this.applyStaticItems(), 100);
```

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
interface StaticPageContent {
  pageNumber: number;
  items: PageItem[];
}
```

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
| 2.0.0 | Current format with folder structure |
| 1.x | Legacy format with flat file structure |
