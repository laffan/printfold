/**
 * FileList Component
 * Handles file management with drag/drop support
 */

import { appState } from '../services/state';
import { env } from '../services/environment';
import type { ProjectFile } from '../types';

export class FileList {
  private container!: HTMLElement;
  private selectedFileId: string | null = null;
  private onFileSelect: ((file: ProjectFile | null) => void) | null = null;
  private activeTab: 'text' | 'images' = 'text';
  private draggedFileId: string | null = null;

  mount(): void {
    this.container = document.getElementById('file-list')!;

    this.setupDropZone();
    this.setupAddButton();
    this.setupStateListener();
    this.render();
  }

  setOnFileSelect(callback: (file: ProjectFile | null) => void): void {
    this.onFileSelect = callback;
  }

  private setupDropZone(): void {
    // Prevent default drag behaviors on container
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.container.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Highlight container on drag over
    ['dragenter', 'dragover'].forEach(eventName => {
      this.container.addEventListener(eventName, () => {
        this.container.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.container.addEventListener(eventName, () => {
        this.container.classList.remove('dragover');
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

    // Add tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'file-tabs';

    const textTab = document.createElement('button');
    textTab.className = 'file-tab' + (this.activeTab === 'text' ? ' active' : '');
    const textCount = files.filter(f => f.type === 'markdown').length;
    textTab.textContent = `Text (${textCount})`;
    textTab.addEventListener('click', () => {
      this.activeTab = 'text';
      this.render();
    });

    const imagesTab = document.createElement('button');
    imagesTab.className = 'file-tab' + (this.activeTab === 'images' ? ' active' : '');
    const imageCount = files.filter(f => f.type === 'image').length;
    imagesTab.textContent = `Images (${imageCount})`;
    imagesTab.addEventListener('click', () => {
      this.activeTab = 'images';
      this.render();
    });

    tabsContainer.appendChild(textTab);
    tabsContainer.appendChild(imagesTab);
    this.container.appendChild(tabsContainer);

    // File list container
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'file-items-container';

    // Filter files based on active tab
    const filteredFiles = files.filter(file => {
      if (this.activeTab === 'text') {
        return file.type === 'markdown';
      } else {
        return file.type === 'image';
      }
    });

    // Add file items
    filteredFiles.forEach(file => {
      const item = this.createFileItem(file);
      fileListContainer.appendChild(item);
    });

    // Show empty state if no files in this tab
    if (filteredFiles.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'file-list-empty';
      emptyState.textContent = this.activeTab === 'text'
        ? 'No text files. Drop .md files here.'
        : 'No images. Drop image files here.';
      fileListContainer.appendChild(emptyState);
    }

    this.container.appendChild(fileListContainer);
  }

  private createFileItem(file: ProjectFile): HTMLElement {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.fileId = file.id;

    if (file.id === this.selectedFileId) {
      item.classList.add('selected');
    }

    const isTextFile = file.type === 'markdown';
    const isImageFile = file.type === 'image';

    // Add drag handle for text files
    const dragHandle = isTextFile ? '<span class="drag-handle" title="Drag to reorder">⋮⋮</span>' : '';

    if (isImageFile && file.isBase64) {
      // Image file: show thumbnail
      item.className = 'file-item file-item-image';
      item.innerHTML = `
        <div class="file-thumbnail">
          <img src="data:image/png;base64,${file.content}" alt="${file.name}" draggable="false">
        </div>
        <span class="file-name" title="${file.name}">${file.name}</span>
        <div class="file-actions">
          <button class="btn btn-icon btn-remove" title="Remove file">×</button>
        </div>
      `;
    } else {
      // Text file: show icon and name
      const icon = this.getFileIcon(file.type);
      item.innerHTML = `
        ${dragHandle}
        <span class="file-icon">${icon}</span>
        <span class="file-name" title="${file.name}">${file.name}</span>
        <div class="file-actions">
          <button class="btn btn-icon btn-remove" title="Remove file">×</button>
        </div>
      `;
    }

    // Make text files draggable
    if (isTextFile) {
      item.draggable = true;

      item.addEventListener('dragstart', (e) => {
        this.draggedFileId = file.id;
        item.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', file.id);
        }
      });

      item.addEventListener('dragend', () => {
        this.draggedFileId = null;
        item.classList.remove('dragging');
        // Remove all drag-over classes
        this.container.querySelectorAll('.drag-over').forEach(el => {
          el.classList.remove('drag-over');
        });
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedFileId && this.draggedFileId !== file.id) {
          e.dataTransfer!.dropEffect = 'move';
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');

        if (this.draggedFileId && this.draggedFileId !== file.id) {
          // Reorder files
          const project = appState.getProject();
          const textFiles = project.files.filter(f => f.type === 'markdown');
          const draggedIndex = textFiles.findIndex(f => f.id === this.draggedFileId);
          const dropIndex = textFiles.findIndex(f => f.id === file.id);

          if (draggedIndex !== -1 && dropIndex !== -1) {
            // Remove dragged file and insert at new position
            const [draggedFile] = textFiles.splice(draggedIndex, 1);
            textFiles.splice(dropIndex, 0, draggedFile);

            // Update state with new order
            appState.reorderFiles(textFiles.map(f => f.id));
          }
        }
      });
    }

    // Make image files draggable for adding to static pages
    if (isImageFile) {
      item.draggable = true;

      item.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('application/x-printfold-image', file.id);
          e.dataTransfer.setData('text/plain', file.id);
        }
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
    }

    // Click to select
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.file-actions')) return;
      if ((e.target as HTMLElement).closest('.drag-handle')) return;

      this.selectedFileId = file.id;
      this.render();
      this.onFileSelect?.(file);
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
