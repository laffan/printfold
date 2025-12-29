/**
 * ZipHandler Service
 * Handles import and export of project files as ZIP archives
 *
 * Export format:
 * /project.json         - Project manifest with settings
 * /text/*.md           - Markdown text files
 * /images/*            - Image files (png, jpg, etc.)
 * /static/*.json       - Static page content (items on blank/static pages)
 */

import JSZip from 'jszip';
import { appState } from './state';
import type { ProjectFile, BookletProject, PageItem } from '../types';

/**
 * File entry in the manifest
 */
interface ManifestFile {
  id: string;
  name: string;
  type: string;
  path: string; // Path within the zip (e.g., "text/chapter1.md")
  lastModified: number;
}

/**
 * Static page content stored in the zip
 */
interface StaticPageContent {
  pageNumber: number;
  items: PageItem[];
}

/**
 * Static page data stored in the zip
 */
interface StaticPageData {
  pageNumber: number;
  pageState: 'static' | 'available' | 'text';
  items: PageItem[];
  backgroundFill?: import('../types').FillConfig;
  customBackgroundImageId?: string;
}

/**
 * Project manifest stored as project.json
 */
interface ProjectManifest {
  version: string;
  name: string;
  projectId: string;
  mainDocument: string | null;
  measurementUnit?: import('../types').MarginUnit; // Added in v2.1
  outputOptions: BookletProject['outputOptions'];
  layoutOptions: BookletProject['layoutOptions'];
  fontOptions: BookletProject['fontOptions'];
  headerFooter: BookletProject['headerFooter'];
  blankPages: number[];
  files: ManifestFile[];
  fileOrder: string[]; // IDs in order for concatenation
}

export class ZipHandler {
  private static readonly MANIFEST_FILENAME = 'project.json';
  private static readonly VERSION = '2.1.0';
  private static readonly TEXT_FOLDER = 'text';
  private static readonly IMAGES_FOLDER = 'images';
  private static readonly STATIC_FOLDER = 'static';

  // Store pending static page data to apply after reflow
  private pendingStaticPages: Map<number, StaticPageData> = new Map();

  /**
   * Export current project to ZIP
   */
  async export(): Promise<Uint8Array> {
    const project = appState.getProject();
    const zip = new JSZip();

    // Create folders
    const textFolder = zip.folder(ZipHandler.TEXT_FOLDER)!;
    const imagesFolder = zip.folder(ZipHandler.IMAGES_FOLDER)!;
    const staticFolder = zip.folder(ZipHandler.STATIC_FOLDER)!;

    // Build file manifest and add files to appropriate folders
    const manifestFiles: ManifestFile[] = [];
    const fileOrder: string[] = [];

    for (const file of project.files) {
      const baseName = this.getBaseName(file.name);

      if (file.type === 'markdown') {
        const path = `${ZipHandler.TEXT_FOLDER}/${baseName}`;
        textFolder.file(baseName, file.content);
        manifestFiles.push({
          id: file.id,
          name: file.name,
          type: file.type,
          path,
          lastModified: file.lastModified,
        });
        fileOrder.push(file.id);
      } else if (file.type === 'image') {
        const path = `${ZipHandler.IMAGES_FOLDER}/${baseName}`;
        const binaryData = this.base64ToArrayBuffer(file.content);
        imagesFolder.file(baseName, binaryData);
        manifestFiles.push({
          id: file.id,
          name: file.name,
          type: file.type,
          path,
          lastModified: file.lastModified,
        });
      }
    }

    // Export static page data (state, items, backgrounds for static/available pages)
    const staticPages = this.collectStaticPageData(project);
    for (const [pageNumber, pageData] of staticPages) {
      // Save any page that has state info, items, background fill, or custom background
      if (pageData.pageState !== 'text' || pageData.items.length > 0 || pageData.backgroundFill || pageData.customBackgroundImageId) {
        const hash = this.generateHash(pageNumber);
        staticFolder.file(`${hash}.json`, JSON.stringify(pageData, null, 2));
      }
    }

    // Create manifest
    const manifest: ProjectManifest = {
      version: ZipHandler.VERSION,
      name: project.name,
      projectId: project.id,
      mainDocument: project.mainDocument,
      measurementUnit: project.measurementUnit,
      outputOptions: project.outputOptions,
      layoutOptions: project.layoutOptions,
      fontOptions: project.fontOptions,
      headerFooter: project.headerFooter,
      blankPages: project.blankPages,
      files: manifestFiles,
      fileOrder,
    };

    // Add manifest to root
    zip.file(ZipHandler.MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

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

    // Try to load manifest (project.json or legacy printfold.json)
    let manifest: ProjectManifest | null = null;
    const manifestFile = zip.file(ZipHandler.MANIFEST_FILENAME) || zip.file('printfold.json');

    if (manifestFile) {
      const manifestContent = await manifestFile.async('string');
      manifest = JSON.parse(manifestContent);
    }

    // Reset state before importing
    appState.reset();

    // Load files from folders or root (legacy support)
    const files: ProjectFile[] = [];
    const filePromises: Promise<void>[] = [];
    const staticPages: Map<number, StaticPageData> = new Map();

    zip.forEach((relativePath, zipEntry) => {
      // Skip manifest files and directories
      if (relativePath === ZipHandler.MANIFEST_FILENAME ||
          relativePath === 'printfold.json' ||
          zipEntry.dir) {
        return;
      }

      const pathParts = relativePath.split('/');
      const folder = pathParts.length > 1 ? pathParts[0] : null;
      const fileName = pathParts[pathParts.length - 1];
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      // Handle static page content (supports both new StaticPageData and legacy StaticPageContent format)
      if (folder === ZipHandler.STATIC_FOLDER && ext === 'json') {
        const promise = (async () => {
          const jsonContent = await zipEntry.async('string');
          const parsed = JSON.parse(jsonContent);
          // Convert legacy format (only items) to new format (with pageState, backgroundFill, customBackgroundImageId)
          const pageData: StaticPageData = {
            pageNumber: parsed.pageNumber,
            pageState: parsed.pageState || 'static', // Default to 'static' for legacy files
            items: parsed.items || [],
            backgroundFill: parsed.backgroundFill,
            customBackgroundImageId: parsed.customBackgroundImageId,
          };
          staticPages.set(pageData.pageNumber, pageData);
        })();
        filePromises.push(promise);
        return;
      }

      // Handle text and image files
      const isTextFile = ext === 'md';
      const isImageFile = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);

      if (!isTextFile && !isImageFile) return;

      const promise = (async () => {
        // Find file info in manifest
        const manifestEntry = manifest?.files.find(f =>
          f.path === relativePath || f.name === relativePath || f.name === fileName
        );

        let content: string;
        if (isTextFile) {
          content = await zipEntry.async('string');
        } else {
          const arrayBuffer = await zipEntry.async('arraybuffer');
          content = this.arrayBufferToBase64(arrayBuffer);
        }

        files.push({
          id: manifestEntry?.id || crypto.randomUUID(),
          name: manifestEntry?.name || fileName,
          type: this.getFileType(ext),
          content,
          isBase64: !isTextFile,
          lastModified: manifestEntry?.lastModified || Date.now(),
        });
      })();

      filePromises.push(promise);
    });

    await Promise.all(filePromises);

    // Sort files according to manifest order
    if (manifest?.fileOrder) {
      files.sort((a, b) => {
        const indexA = manifest.fileOrder.indexOf(a.id);
        const indexB = manifest.fileOrder.indexOf(b.id);
        // Files not in order list go to the end
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    }

    // Store static page data to apply after reflow
    this.pendingStaticPages = staticPages;

    // Update project settings from manifest
    if (manifest) {
      appState.updateProject({
        id: manifest.projectId || crypto.randomUUID(),
        name: manifest.name,
        measurementUnit: manifest.measurementUnit || 'in', // Default to inches for legacy files
        outputOptions: manifest.outputOptions,
        layoutOptions: manifest.layoutOptions,
        fontOptions: manifest.fontOptions,
        headerFooter: manifest.headerFooter,
        blankPages: manifest.blankPages || [],
      });
    }

    // Add files (this triggers reflow)
    appState.addFiles(files);

    // Set main document if specified in manifest
    if (manifest?.mainDocument) {
      const mainFile = files.find(f => f.id === manifest.mainDocument);
      if (mainFile) {
        appState.setMainDocument(mainFile.id);
      }
    }

    // Apply static page data after a short delay to allow reflow to complete
    if (this.pendingStaticPages.size > 0) {
      setTimeout(() => {
        this.applyStaticPageData();
      }, 100);
    }
  }

  /**
   * Import files from a dropped or selected ZIP file
   */
  async importFromFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    await this.importFromArrayBuffer(arrayBuffer);
  }

  /**
   * Apply pending static page data after reflow
   */
  private applyStaticPageData(): void {
    for (const [pageNumber, pageData] of this.pendingStaticPages) {
      // Apply page state if not 'text' (static or available)
      if (pageData.pageState !== 'text') {
        appState.setPageState(pageNumber, pageData.pageState);
      }

      // Apply background fill if present
      if (pageData.backgroundFill) {
        appState.setPageBackgroundFill(pageNumber, pageData.backgroundFill);
      }

      // Apply custom background image if present
      if (pageData.customBackgroundImageId) {
        appState.setCustomBackground(pageNumber, pageData.customBackgroundImageId);
      }

      // Apply items
      for (const item of pageData.items) {
        appState.addItemToPage(pageNumber, item);
      }
    }
    this.pendingStaticPages.clear();
  }

  /**
   * Collect page data from all pages that have state, items, or backgrounds
   */
  private collectStaticPageData(project: BookletProject): Map<number, StaticPageData> {
    const result = new Map<number, StaticPageData>();

    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        // Check verso page
        if (spread.verso) {
          const page = spread.verso;
          // Save page data if it has non-text state, items, background fill, or custom background
          if (page.pageState !== 'text' || (page.items && page.items.length > 0) || page.backgroundFill || page.customBackgroundImageId) {
            result.set(page.pageNumber, {
              pageNumber: page.pageNumber,
              pageState: page.pageState,
              items: page.items || [],
              backgroundFill: page.backgroundFill,
              customBackgroundImageId: page.customBackgroundImageId,
            });
          }
        }
        // Check recto page
        if (spread.recto) {
          const page = spread.recto;
          // Save page data if it has non-text state, items, background fill, or custom background
          if (page.pageState !== 'text' || (page.items && page.items.length > 0) || page.backgroundFill || page.customBackgroundImageId) {
            result.set(page.pageNumber, {
              pageNumber: page.pageNumber,
              pageState: page.pageState,
              items: page.items || [],
              backgroundFill: page.backgroundFill,
              customBackgroundImageId: page.customBackgroundImageId,
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Generate a unique hash for a page number
   */
  private generateHash(pageNumber: number): string {
    const data = `page-${pageNumber}-${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `page${pageNumber}-${Math.abs(hash).toString(16)}`;
  }

  /**
   * Get just the filename from a path
   */
  private getBaseName(path: string): string {
    return path.split('/').pop() || path;
  }

  private getFileType(ext: string): ProjectFile['type'] {
    switch (ext) {
      case 'md':
        return 'markdown';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'gif':
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
