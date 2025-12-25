# Environment Abstraction (`src/services/environment.ts`)

The Environment module provides a unified API for platform-specific operations, abstracting differences between Web and Electron environments.

## Overview

The module implements the Strategy pattern with two environment implementations:
- `WebEnvironment` - Browser-based operations
- `ElectronEnvironment` - Native Electron operations

## Architecture

```
           EnvironmentAPI (interface)
                  │
        ┌─────────┴─────────┐
        │                   │
WebEnvironment      ElectronEnvironment
        │                   │
   Browser APIs         window.electronAPI
```

## Environment API Interface

```typescript
interface EnvironmentAPI {
  isElectron: boolean;

  // File operations
  openFiles(options?: OpenFilesOptions): Promise<ProjectFile[] | null>;
  saveFile(options: SaveFileOptions): Promise<boolean>;
  downloadFile(filename: string, content: Uint8Array | Blob): void;

  // Printing
  print(content?: Uint8Array): Promise<void>;

  // Templates
  loadTemplate(templateId: string): Promise<unknown>;
  listTemplates(): Promise<string[]>;
}
```

## Options Types

```typescript
interface FileFilter {
  name: string;        // Display name (e.g., "Markdown Files")
  extensions: string[]; // Extensions (e.g., ["md", "txt"])
}

interface OpenFilesOptions {
  filters?: FileFilter[];
  multiple?: boolean;
}

interface SaveFileOptions {
  defaultName?: string;
  filters?: FileFilter[];
  content: Uint8Array | string;
}
```

## Web Environment

### File Opening

Uses HTML `<input type="file">`:

```typescript
const input = document.createElement('input');
input.type = 'file';
input.multiple = true;
input.accept = '.md,.png,.jpg';
input.click();
```

**File Reading:**
- Text files → `FileReader.readAsText()`
- Binary files → `FileReader.readAsDataURL()` → base64 extraction

### File Saving

**Modern Browsers (File System Access API):**
```typescript
const handle = await window.showSaveFilePicker({
  suggestedName: 'file.pdf',
  types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] }}]
});
const writable = await handle.createWritable();
await writable.write(content);
await writable.close();
```

**Fallback (Download):**
```typescript
const blob = new Blob([content]);
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

### Printing

Opens PDF in new window for printing:

```typescript
const blob = new Blob([pdfBytes], { type: 'application/pdf' });
const url = URL.createObjectURL(blob);
const printWindow = window.open(url, '_blank');
printWindow.onload = () => printWindow.print();
```

## Electron Environment

The Electron environment delegates to `window.electronAPI`, which is exposed by Electron's preload script.

### File Operations

```typescript
async openFiles(options): Promise<ProjectFile[] | null> {
  return this.api.openFiles(options);
}

async saveFile(options): Promise<boolean> {
  return this.api.saveFile(options);
}
```

### Printing

Uses native Electron printing:

```typescript
async print(): Promise<void> {
  await this.api.print();
}
```

## Environment Detection

```typescript
function getEnvironment(): EnvironmentAPI {
  if (window.electronAPI?.isElectron) {
    return new ElectronEnvironment();
  }
  return new WebEnvironment();
}
```

## Exported Singleton

The module exports a convenience object:

```typescript
export const env = {
  get isElectron(): boolean {
    return getEnvironment().isElectron;
  },
  openFiles: (options?) => getEnvironment().openFiles(options),
  saveFile: (options) => getEnvironment().saveFile(options),
  downloadFile: (filename, content) => getEnvironment().downloadFile(filename, content),
  print: (content?) => getEnvironment().print(content),
  loadTemplate: (templateId) => getEnvironment().loadTemplate(templateId),
  listTemplates: () => getEnvironment().listTemplates(),
};
```

## Usage Examples

### Opening Files

```typescript
import { env } from '../services/environment';

const files = await env.openFiles({
  filters: [
    { name: 'Markdown', extensions: ['md'] },
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
  ],
  multiple: true
});

if (files) {
  for (const file of files) {
    console.log(`Loaded: ${file.name} (${file.type})`);
  }
}
```

### Saving Files

```typescript
// Save PDF
const pdfBytes = await pdfGenerator.generate();
await env.saveFile({
  defaultName: 'booklet.pdf',
  filters: [{ name: 'PDF', extensions: ['pdf'] }],
  content: pdfBytes
});

// Save ZIP project
const zipBytes = await zipHandler.export();
await env.saveFile({
  defaultName: 'project.zip',
  filters: [{ name: 'PrintFold Project', extensions: ['zip'] }],
  content: zipBytes
});
```

### Environment Check

```typescript
if (env.isElectron) {
  // Use native features
  console.log('Running in Electron');
} else {
  // Use web fallbacks
  console.log('Running in browser');
}
```

## Template System

Templates are loaded from the `/templates/` directory:

```typescript
// Load specific template
const template = await env.loadTemplate('zine');

// List available templates
const templates = await env.listTemplates();
// ['default', 'zine', 'chapbook']
```

## Type Declarations

For TypeScript, Electron API is declared in `src/types/electron.d.ts`:

```typescript
interface Window {
  electronAPI?: {
    isElectron: boolean;
    openFiles: (options: OpenFilesOptions) => Promise<...>;
    saveFile: (options: SaveFileOptions) => Promise<boolean>;
    print: () => Promise<void>;
  };
}
```
