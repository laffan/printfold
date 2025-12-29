/**
 * Environment abstraction layer for Electron/Web compatibility
 */

import type { ProjectFile } from '../types';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveFileOptions {
  defaultName?: string;
  filters?: FileFilter[];
  content: Uint8Array | string;
}

export interface OpenFilesOptions {
  filters?: FileFilter[];
  multiple?: boolean;
}

export interface EnvironmentAPI {
  isElectron: boolean;

  // File operations
  openFiles(options?: OpenFilesOptions): Promise<ProjectFile[] | null>;
  saveFile(options: SaveFileOptions): Promise<boolean>;
  downloadFile(filename: string, content: Uint8Array | Blob): void | Promise<void>;

  // Printing
  print(content?: Uint8Array): Promise<void>;

  // Templates
  loadTemplate(templateId: string): Promise<unknown>;
  listTemplates(): Promise<string[]>;
}

class WebEnvironment implements EnvironmentAPI {
  isElectron = false;

  async openFiles(options?: OpenFilesOptions): Promise<ProjectFile[] | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = options?.multiple ?? true;

      // Build accept string from filters
      const extensions = options?.filters?.flatMap(f => f.extensions) ?? ['md', 'png', 'jpg', 'jpeg', 'webp', 'zip'];
      input.accept = extensions.map(ext => `.${ext}`).join(',');

      input.onchange = async () => {
        if (!input.files?.length) {
          resolve(null);
          return;
        }

        const files: ProjectFile[] = [];

        for (const file of Array.from(input.files)) {
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const isText = ext === 'md';

          const content = await this.readFileContent(file, isText);

          files.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: this.getFileType(ext),
            content,
            isBase64: !isText,
            lastModified: file.lastModified,
          });
        }

        resolve(files);
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  private readFileContent(file: File, asText: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (asText) {
          resolve(reader.result as string);
        } else {
          // Extract base64 from data URL
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        }
      };
      reader.onerror = reject;

      if (asText) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  private getFileType(ext: string): ProjectFile['type'] {
    switch (ext) {
      case 'md':
        return 'markdown';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
        return 'image';
      case 'zip':
        return 'archive';
      default:
        return 'unknown';
    }
  }

  async saveFile(options: SaveFileOptions): Promise<boolean> {
    // Try File System Access API first (modern browsers)
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: options.defaultName,
          types: options.filters?.map(f => ({
            description: f.name,
            accept: { 'application/octet-stream': f.extensions.map(e => `.${e}`) },
          })),
        });

        const writable = await fileHandle.createWritable();
        const content = typeof options.content === 'string'
          ? new TextEncoder().encode(options.content)
          : options.content;
        // Use the Uint8Array's underlying buffer for the write
        const buffer = content instanceof Uint8Array ? content.buffer : content;
        await writable.write(buffer as unknown as FileSystemWriteChunkType);
        await writable.close();
        return true;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return false;
        // Fall through to download method
      }
    }

    // Fallback to download
    const content = typeof options.content === 'string'
      ? new Blob([options.content], { type: 'text/plain' })
      : new Blob([options.content as BlobPart], { type: 'application/octet-stream' });

    this.downloadFile(options.defaultName || 'file', content);
    return true;
  }

  downloadFile(filename: string, content: Uint8Array | Blob): void {
    const blob = content instanceof Blob ? content : new Blob([content as BlobPart]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async print(content?: Uint8Array): Promise<void> {
    if (content) {
      // Open PDF in new window for printing
      const blob = new Blob([content as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } else {
      window.print();
    }
  }

  async loadTemplate(templateId: string): Promise<unknown> {
    const response = await fetch(`./templates/${templateId}.json`);
    if (!response.ok) {
      throw new Error(`Template not found: ${templateId}`);
    }
    return response.json();
  }

  async listTemplates(): Promise<string[]> {
    try {
      const response = await fetch('./templates/index.json');
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Fallback to default templates
    }
    return ['default', 'zine', 'chapbook'];
  }
}

class ElectronEnvironment implements EnvironmentAPI {
  isElectron = true;

  private get api() {
    return window.electronAPI!;
  }

  async openFiles(options?: OpenFilesOptions): Promise<ProjectFile[] | null> {
    const result = await this.api.openFiles({
      filters: options?.filters,
      multiple: options?.multiple ?? true,
    });

    if (!result) return null;

    return result.map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type as ProjectFile['type'],
      content: file.content,
      isBase64: file.isBase64,
      lastModified: Date.now(),
    }));
  }

  async saveFile(options: SaveFileOptions): Promise<boolean> {
    const content = typeof options.content === 'string'
      ? options.content
      : options.content;

    return this.api.saveFile({
      defaultName: options.defaultName,
      filters: options.filters,
      content,
    });
  }

  async downloadFile(filename: string, content: Uint8Array | Blob): Promise<void> {
    // In Electron, we use the save dialog instead
    let contentArray: Uint8Array;
    if (content instanceof Blob) {
      const arrayBuffer = await content.arrayBuffer();
      contentArray = new Uint8Array(arrayBuffer);
    } else {
      contentArray = content;
    }

    // Determine filters based on filename extension
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    let filters: FileFilter[] | undefined;
    if (ext === 'png') {
      filters = [{ name: 'PNG Image', extensions: ['png'] }];
    } else if (ext === 'svg') {
      filters = [{ name: 'SVG Image', extensions: ['svg'] }];
    } else if (ext === 'pdf') {
      filters = [{ name: 'PDF Document', extensions: ['pdf'] }];
    }

    await this.saveFile({
      defaultName: filename,
      filters,
      content: contentArray,
    });
  }

  async print(_content?: Uint8Array): Promise<void> {
    await this.api.print();
  }

  async loadTemplate(templateId: string): Promise<unknown> {
    // In Electron, templates are bundled with the app
    const response = await fetch(`./templates/${templateId}.json`);
    if (!response.ok) {
      throw new Error(`Template not found: ${templateId}`);
    }
    return response.json();
  }

  async listTemplates(): Promise<string[]> {
    try {
      const response = await fetch('./templates/index.json');
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Fallback
    }
    return ['default', 'zine', 'chapbook'];
  }
}

// Environment singleton
let environmentInstance: EnvironmentAPI | null = null;

export function getEnvironment(): EnvironmentAPI {
  if (!environmentInstance) {
    environmentInstance = window.electronAPI?.isElectron
      ? new ElectronEnvironment()
      : new WebEnvironment();
  }
  return environmentInstance;
}

export const env = {
  get isElectron(): boolean {
    return getEnvironment().isElectron;
  },

  openFiles: (options?: OpenFilesOptions) => getEnvironment().openFiles(options),
  saveFile: (options: SaveFileOptions) => getEnvironment().saveFile(options),
  downloadFile: (filename: string, content: Uint8Array | Blob) =>
    getEnvironment().downloadFile(filename, content),
  print: (content?: Uint8Array) => getEnvironment().print(content),
  loadTemplate: (templateId: string) => getEnvironment().loadTemplate(templateId),
  listTemplates: () => getEnvironment().listTemplates(),
};
