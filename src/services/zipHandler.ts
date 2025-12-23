/**
 * ZipHandler Service
 * Handles import and export of project files as ZIP archives
 */

import JSZip from 'jszip';
import { appState } from './state';
import type { ProjectFile, BookletProject } from '../types';

interface ProjectManifest {
  version: string;
  name: string;
  mainDocument: string | null;
  outputOptions: BookletProject['outputOptions'];
  layoutOptions: BookletProject['layoutOptions'];
  fontOptions: BookletProject['fontOptions'];
  headerFooter: BookletProject['headerFooter'];
  blankPages: number[];
  files: Array<{
    id: string;
    name: string;
    type: string;
    lastModified: number;
  }>;
}

export class ZipHandler {
  private static readonly MANIFEST_FILENAME = 'printfold.json';
  private static readonly VERSION = '1.0.0';

  /**
   * Export current project to ZIP
   */
  async export(): Promise<Uint8Array> {
    const project = appState.getProject();
    const zip = new JSZip();

    // Create manifest
    const manifest: ProjectManifest = {
      version: ZipHandler.VERSION,
      name: project.name,
      mainDocument: project.mainDocument,
      outputOptions: project.outputOptions,
      layoutOptions: project.layoutOptions,
      fontOptions: project.fontOptions,
      headerFooter: project.headerFooter,
      blankPages: project.blankPages,
      files: project.files.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        lastModified: f.lastModified,
      })),
    };

    // Add manifest
    zip.file(ZipHandler.MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

    // Add files
    for (const file of project.files) {
      if (file.isBase64) {
        // Binary file (image)
        const binaryData = this.base64ToArrayBuffer(file.content);
        zip.file(file.name, binaryData);
      } else {
        // Text file (markdown)
        zip.file(file.name, file.content);
      }
    }

    return zip.generateAsync({ type: 'uint8array' });
  }

  /**
   * Import project from ZIP (base64 encoded)
   */
  async import(base64Content: string): Promise<void> {
    const binaryContent = this.base64ToArrayBuffer(base64Content);
    await this.importFromArrayBuffer(binaryContent);
  }

  /**
   * Import project from ZIP (ArrayBuffer)
   */
  async importFromArrayBuffer(content: ArrayBuffer): Promise<void> {
    const zip = await JSZip.loadAsync(content);

    // Check for manifest
    const manifestFile = zip.file(ZipHandler.MANIFEST_FILENAME);
    let manifest: ProjectManifest | null = null;

    if (manifestFile) {
      const manifestContent = await manifestFile.async('string');
      manifest = JSON.parse(manifestContent);
    }

    // Load files
    const files: ProjectFile[] = [];
    const filePromises: Promise<void>[] = [];

    zip.forEach((relativePath, zipEntry) => {
      if (relativePath === ZipHandler.MANIFEST_FILENAME) return;
      if (zipEntry.dir) return;

      const ext = relativePath.split('.').pop()?.toLowerCase() || '';
      const allowedExtensions = ['md', 'png', 'jpg', 'jpeg', 'webp'];

      if (!allowedExtensions.includes(ext)) return;

      const promise = (async () => {
        const manifestEntry = manifest?.files.find(f => f.name === relativePath);
        const isText = ext === 'md';

        let content: string;
        if (isText) {
          content = await zipEntry.async('string');
        } else {
          const arrayBuffer = await zipEntry.async('arraybuffer');
          content = this.arrayBufferToBase64(arrayBuffer);
        }

        files.push({
          id: manifestEntry?.id || crypto.randomUUID(),
          name: relativePath,
          type: this.getFileType(ext),
          content,
          isBase64: !isText,
          lastModified: manifestEntry?.lastModified || Date.now(),
        });
      })();

      filePromises.push(promise);
    });

    await Promise.all(filePromises);

    // Update state
    if (manifest) {
      // Full project import
      appState.updateProject({
        name: manifest.name,
        outputOptions: manifest.outputOptions,
        layoutOptions: manifest.layoutOptions,
        fontOptions: manifest.fontOptions,
        headerFooter: manifest.headerFooter,
        blankPages: manifest.blankPages,
      });
    }

    // Add files
    appState.addFiles(files);

    // Set main document if specified in manifest
    if (manifest?.mainDocument) {
      const mainFile = files.find(f => f.id === manifest.mainDocument);
      if (mainFile) {
        appState.setMainDocument(mainFile.id);
      }
    }
  }

  /**
   * Import files from a dropped or selected ZIP file
   */
  async importFromFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    await this.importFromArrayBuffer(arrayBuffer);
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

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
