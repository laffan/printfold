/**
 * FilePreview Component
 * Displays preview of selected file with markdown editing support
 */

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { appState } from '../services/state';
import type { ProjectFile } from '../types';

export class FilePreview {
  private container!: HTMLElement;
  private filenameSpan!: HTMLElement;
  private editor: EditorView | null = null;
  private currentFile: ProjectFile | null = null;
  private updateTimeout: number | null = null;

  mount(): void {
    this.container = document.getElementById('file-preview')!;
    this.filenameSpan = document.getElementById('preview-filename')!;

    // Listen for file selection from FileList
    // This is connected through App component
    this.showPlaceholder();
  }

  showFile(file: ProjectFile | null): void {
    this.currentFile = file;

    if (!file) {
      this.showPlaceholder();
      return;
    }

    this.filenameSpan.textContent = file.name;

    switch (file.type) {
      case 'markdown':
        this.showMarkdownEditor(file);
        break;
      case 'image':
        this.showImage(file);
        break;
      default:
        this.showPlaceholder();
    }
  }

  private showPlaceholder(): void {
    this.destroyEditor();
    this.filenameSpan.textContent = '';
    this.container.innerHTML = `
      <div class="preview-placeholder">
        <p>Select a file to preview</p>
      </div>
    `;
  }

  private showMarkdownEditor(file: ProjectFile): void {
    this.destroyEditor();
    this.container.innerHTML = '';

    // Create CodeMirror editor
    const startState = EditorState.create({
      doc: file.content,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.handleContentChange(update.state.doc.toString());
          }
          // Track cursor position changes for page sync
          if (update.selectionSet || update.docChanged) {
            this.handleCursorChange(update.view);
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: '#2d2d2d',
          },
          '.cm-content': {
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            color: '#e0e0e0',
            caretColor: '#4a9eff',
          },
          '.cm-cursor': {
            borderLeftColor: '#4a9eff',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
          },
          '.cm-selectionBackground': {
            backgroundColor: 'rgba(74, 158, 255, 0.3) !important',
          },
          '.cm-gutters': {
            backgroundColor: '#242424',
            color: '#707070',
            borderRight: '1px solid #404040',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
          },
        }),
      ],
    });

    this.editor = new EditorView({
      state: startState,
      parent: this.container,
    });
  }

  private handleContentChange(newContent: string): void {
    if (!this.currentFile) return;

    // Debounce updates
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = window.setTimeout(() => {
      appState.updateFile(this.currentFile!.id, {
        content: newContent,
        lastModified: Date.now(),
      });
    }, 100);
  }

  private cursorTimeout: number | null = null;

  private handleCursorChange(view: EditorView): void {
    // Only sync for markdown files
    if (!this.currentFile || this.currentFile.type !== 'markdown') {
      return;
    }

    // Debounce cursor changes
    if (this.cursorTimeout) {
      clearTimeout(this.cursorTimeout);
    }

    this.cursorTimeout = window.setTimeout(() => {
      const pos = view.state.selection.main.head;
      const lineNumber = view.state.doc.lineAt(pos).number;
      const currentFileLines = view.state.doc.lines;

      // Get all markdown files to calculate position in concatenated content
      const project = appState.getProject();
      const markdownFiles = project.files.filter(f => f.type === 'markdown');

      // Calculate total lines and offset for current file
      let totalLines = 0;
      let lineOffset = 0;
      let foundCurrentFile = false;

      for (const file of markdownFiles) {
        const fileLines = (file.content.match(/\n/g) || []).length + 1;
        if (file.id === this.currentFile!.id) {
          foundCurrentFile = true;
          lineOffset = totalLines;
        }
        totalLines += fileLines + 1; // +1 for the blank line between files
      }

      if (!foundCurrentFile) return;

      // Calculate absolute line position in concatenated content
      const absoluteLine = lineOffset + lineNumber;

      // Get total pages from project
      const totalPages = project.signatures.reduce(
        (sum, sig) => sum + sig.spreads.length * 2,
        0
      );

      if (totalPages === 0 || totalLines === 0) return;

      // Estimate page number based on line position ratio
      const ratio = absoluteLine / totalLines;
      const estimatedPage = Math.max(1, Math.ceil(ratio * totalPages));

      // Update editor state (this will trigger SpreadEditor to navigate)
      appState.updateEditor({ selectedPageNumber: estimatedPage });
    }, 150);
  }

  private showImage(file: ProjectFile): void {
    this.destroyEditor();

    const dataUrl = `data:image/${this.getImageMimeType(file.name)};base64,${file.content}`;

    this.container.innerHTML = `
      <div class="image-preview-container" style="display: flex; align-items: center; justify-content: center; height: 100%; padding: 16px;">
        <img src="${dataUrl}" alt="${file.name}" class="image-preview" style="max-width: 100%; max-height: 100%; object-fit: contain;">
      </div>
    `;
  }

  private getImageMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
        return 'png';
      case 'jpg':
      case 'jpeg':
        return 'jpeg';
      case 'webp':
        return 'webp';
      default:
        return 'png';
    }
  }

  private destroyEditor(): void {
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    if (this.cursorTimeout) {
      clearTimeout(this.cursorTimeout);
      this.cursorTimeout = null;
    }
  }

  refresh(): void {
    if (this.currentFile) {
      // Get latest file content from state
      const updatedFile = appState.getFile(this.currentFile.id);
      if (updatedFile && updatedFile.content !== this.editor?.state.doc.toString()) {
        this.showFile(updatedFile);
      }
    }
  }
}
