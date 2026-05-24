/**
 * FilePreview Component
 * Displays preview of selected file with markdown editing support
 */

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { appState } from '../services/state';
import type { ProjectFile } from '../types';

export class FilePreview {
  private container!: HTMLElement;
  private filenameSpan!: HTMLElement;
  private downloadBtn!: HTMLButtonElement;
  private cursorSyncBtn!: HTMLButtonElement;
  private cursorSyncEnabled = false;
  private editor: EditorView | null = null;
  private currentFile: ProjectFile | null = null;
  private updateTimeout: number | null = null;

  mount(): void {
    this.container = document.getElementById('file-preview')!;
    this.filenameSpan = document.getElementById('preview-filename')!;
    this.downloadBtn = document.getElementById('btn-download-file') as HTMLButtonElement;
    this.cursorSyncBtn = document.getElementById('btn-cursor-sync') as HTMLButtonElement;

    this.downloadBtn.addEventListener('click', () => this.downloadCurrentFile());

    this.cursorSyncBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursorSyncEnabled = !this.cursorSyncEnabled;
      this.cursorSyncBtn.classList.toggle('active', this.cursorSyncEnabled);
    });

    this.showPlaceholder();
  }

  showFile(file: ProjectFile | null): void {
    this.currentFile = file;

    if (!file) {
      this.showPlaceholder();
      this.downloadBtn.style.display = 'none';
      this.cursorSyncBtn.style.display = 'none';
      return;
    }

    this.filenameSpan.textContent = file.name;
    this.downloadBtn.style.display = 'inline-flex';
    this.cursorSyncBtn.style.display = file.type === 'markdown' ? 'inline-flex' : 'none';

    switch (file.type) {
      case 'markdown':
        this.showMarkdownEditor(file);
        break;
      case 'image':
        this.showImage(file);
        break;
      case 'font':
        this.showFontPreview(file);
        break;
      default:
        this.showPlaceholder();
    }
  }

  private showFontPreview(file: ProjectFile): void {
    this.destroyEditor();
    const family = file.name.replace(/\.[^.]+$/, '');
    const safeFamily = family.replace(/'/g, "\\'");
    this.container.innerHTML = `
      <div class="font-preview" style="font-family: '${safeFamily}', sans-serif;">
        <div class="font-preview-large">Aa</div>
        <div class="font-preview-pangram">The quick brown fox jumps over the lazy dog.</div>
        <div class="font-preview-numbers">0 1 2 3 4 5 6 7 8 9</div>
      </div>
    `;
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
        syntaxHighlighting(HighlightStyle.define([
          { tag: tags.contentSeparator, color: '#4a9eff' },
        ])),
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
    if (!this.currentFile || this.currentFile.type !== 'markdown') {
      return;
    }

    if (this.cursorTimeout) {
      clearTimeout(this.cursorTimeout);
    }

    this.cursorTimeout = window.setTimeout(() => {
      const pos = view.state.selection.main.head;
      const project = appState.getProject();
      const markdownFiles = project.files.filter(f => f.type === 'markdown');
      if (markdownFiles.length === 0) return;

      let charOffset = 0;
      let foundFile = false;
      for (const file of markdownFiles) {
        if (file.id === this.currentFile!.id) {
          foundFile = true;
          charOffset += Math.min(pos, file.content.length);
          break;
        }
        charOffset += file.content.length + 2;
      }
      if (!foundFile) return;

      const combinedMarkdown = markdownFiles.map(f => f.content).join('\n\n');
      let bestPage = 1;
      let bestSection = '';
      let bestFraction = 0;

      for (const sig of project.signatures) {
        for (const spread of sig.spreads) {
          for (const page of [spread.verso, spread.recto]) {
            if (!page || !page.sections || page.sections.length === 0) continue;
            if (page.pageState === 'static' || page.pageState === 'available') continue;
            for (const section of page.sections) {
              if (!section.rawMarkdown) continue;
              const idx = combinedMarkdown.indexOf(section.rawMarkdown);
              if (idx === -1) continue;
              if (idx <= charOffset && charOffset <= idx + section.rawMarkdown.length) {
                const fraction = section.rawMarkdown.length > 0
                  ? (charOffset - idx) / section.rawMarkdown.length
                  : 0;
                const mark = this.cursorSyncEnabled
                  ? { pageNumber: page.pageNumber, sectionRaw: section.rawMarkdown, charFraction: fraction }
                  : null;
                appState.updateEditor({ selectedPageNumber: page.pageNumber, cursorMark: mark });
                return;
              }
              if (idx <= charOffset) {
                bestPage = page.pageNumber;
                bestSection = section.rawMarkdown;
                bestFraction = 1;
              }
            }
          }
        }
      }
      const mark = this.cursorSyncEnabled
        ? { pageNumber: bestPage, sectionRaw: bestSection, charFraction: bestFraction }
        : null;
      appState.updateEditor({ selectedPageNumber: bestPage, cursorMark: mark });
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

  private downloadCurrentFile(): void {
    if (!this.currentFile) return;

    let content: string;
    let mimeType: string;
    const filename = this.currentFile.name;

    if (this.currentFile.type === 'markdown') {
      // For markdown, get the current content from the editor (includes any edits)
      content = this.editor?.state.doc.toString() || this.currentFile.content;
      mimeType = 'text/markdown';

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } else if (this.currentFile.isBase64) {
      // Images and fonts are stored as base64.
      const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
      if (this.currentFile.type === 'image') {
        mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      } else if (this.currentFile.type === 'font') {
        mimeType = ext === 'otf' ? 'font/otf' : ext === 'woff' ? 'font/woff' : 'font/ttf';
      } else {
        mimeType = 'application/octet-stream';
      }

      const binary = atob(this.currentFile.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}
