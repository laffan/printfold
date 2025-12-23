/**
 * FileList Component
 * Handles file management with drag/drop support
 */

import { appState } from '../services/state';
import { env } from '../services/environment';
import type { ProjectFile } from '../types';

export class FileList {
  private container!: HTMLElement;
  private dropZone!: HTMLElement;
  private selectedFileId: string | null = null;
  private onFileSelect: ((file: ProjectFile | null) => void) | null = null;

  mount(): void {
    this.container = document.getElementById('file-list')!;
    this.dropZone = document.getElementById('file-drop-zone')!;

    this.setupDropZone();
    this.setupAddButton();
    this.setupStateListener();
    this.render();
  }

  setOnFileSelect(callback: (file: ProjectFile | null) => void): void {
    this.onFileSelect = callback;
  }

  private setupDropZone(): void {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.container.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Highlight drop zone on drag over
    ['dragenter', 'dragover'].forEach(eventName => {
      this.container.addEventListener(eventName, () => {
        this.dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.container.addEventListener(eventName, () => {
        this.dropZone.classList.remove('dragover');
      });
    });

    // Handle dropped files
    this.container.addEventListener('drop', async (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!dt) return;

      const files = await this.processDroppedFiles(dt.files);
      if (files.length > 0) {
        appState.addFiles(files);
      }
    });

    // Click to open file dialog
    this.dropZone.addEventListener('click', () => {
      this.openFileDialog();
    });
  }

  private setupAddButton(): void {
    const btn = document.getElementById('btn-add-files');
    btn?.addEventListener('click', () => {
      this.openFileDialog();
    });
  }

  private async openFileDialog(): Promise<void> {
    const files = await env.openFiles({
      filters: [
        { name: 'Supported Files', extensions: ['md', 'png', 'jpg', 'jpeg', 'webp', 'zip'] },
      ],
      multiple: true,
    });

    if (files) {
      appState.addFiles(files);
    }
  }

  private async processDroppedFiles(droppedFiles: globalThis.FileList): Promise<ProjectFile[]> {
    const files: ProjectFile[] = [];
    const allowedExtensions = ['md', 'png', 'jpg', 'jpeg', 'webp', 'zip'];

    for (const file of Array.from(droppedFiles) as File[]) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!allowedExtensions.includes(ext)) {
        console.warn(`Skipping unsupported file: ${file.name}`);
        continue;
      }

      const isText = ext === 'md';
      const content = await this.readFile(file, isText);

      files.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: this.getFileType(ext),
        content,
        isBase64: !isText,
        lastModified: file.lastModified,
      });
    }

    return files;
  }

  private readFile(file: File, asText: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (asText) {
          resolve(reader.result as string);
        } else {
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

  private setupStateListener(): void {
    appState.onProjectChange(() => {
      this.render();
    });
  }

  private render(): void {
    const project = appState.getProject();
    const files = project.files;

    this.container.innerHTML = '';

    // Always show drop zone at the top
    const dropZone = document.createElement('div');
    dropZone.className = 'file-drop-zone' + (files.length > 0 ? ' mini' : '');
    dropZone.id = 'file-drop-zone';
    if (files.length === 0) {
      dropZone.innerHTML = `
        <p>Drop files here or click to add</p>
        <p class="hint">Supports .md, .png, .jpg, .jpeg, .webp, .zip</p>
      `;
    } else {
      dropZone.innerHTML = '<p>+ Drop files here</p>';
    }
    dropZone.addEventListener('click', () => this.openFileDialog());

    // Handle drag events
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('dragover');
      });
    });

    this.dropZone = dropZone;
    this.container.appendChild(dropZone);

    // Add file items below drop zone
    files.forEach(file => {
      const item = this.createFileItem(file, project.mainDocument === file.id);
      this.container.appendChild(item);
    });
  }

  private createDropZone(): HTMLElement {
    const dropZone = document.createElement('div');
    dropZone.className = 'file-drop-zone';
    dropZone.id = 'file-drop-zone';
    dropZone.innerHTML = `
      <p>Drop files here or click to add</p>
      <p class="hint">Supports .md, .png, .jpg, .jpeg, .webp, .zip</p>
    `;
    dropZone.addEventListener('click', () => this.openFileDialog());

    this.dropZone = dropZone;
    return dropZone;
  }

  private createFileItem(file: ProjectFile, isMainDocument: boolean): HTMLElement {
    const item = document.createElement('div');
    item.className = 'file-item';
    if (file.id === this.selectedFileId) {
      item.classList.add('selected');
    }
    if (isMainDocument) {
      item.classList.add('main-document');
    }

    const icon = this.getFileIcon(file.type);

    item.innerHTML = `
      <span class="file-icon">${icon}</span>
      <span class="file-name" title="${file.name}">${file.name}</span>
      <div class="file-actions">
        ${file.type === 'markdown' && !isMainDocument ?
          '<button class="btn btn-icon btn-set-main" title="Set as main document">★</button>' :
          ''}
        <button class="btn btn-icon btn-remove" title="Remove file">×</button>
      </div>
    `;

    // Click to select
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.file-actions')) return;

      this.selectedFileId = file.id;
      this.render();
      this.onFileSelect?.(file);
    });

    // Set as main document
    const setMainBtn = item.querySelector('.btn-set-main');
    setMainBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.setMainDocument(file.id);
    });

    // Remove file
    const removeBtn = item.querySelector('.btn-remove');
    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.removeFile(file.id);
      if (this.selectedFileId === file.id) {
        this.selectedFileId = null;
        this.onFileSelect?.(null);
      }
    });

    return item;
  }

  private getFileIcon(type: ProjectFile['type']): string {
    switch (type) {
      case 'markdown':
        return '📄';
      case 'image':
        return '🖼️';
      case 'archive':
        return '📦';
      default:
        return '📎';
    }
  }

  getSelectedFile(): ProjectFile | null {
    if (!this.selectedFileId) return null;
    return appState.getFile(this.selectedFileId);
  }

  selectFile(fileId: string): void {
    this.selectedFileId = fileId;
    this.render();
    const file = appState.getFile(fileId);
    this.onFileSelect?.(file);
  }
}
