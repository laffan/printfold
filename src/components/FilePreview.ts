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
import { extractFootnotes } from '../services/textFlow/footnotes';
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
    if (!this.currentFile || this.currentFile.type !== 'markdown') return;
    if (this.cursorTimeout) clearTimeout(this.cursorTimeout);

    this.cursorTimeout = window.setTimeout(() => {
      const pos = view.state.selection.main.head;
      const project = appState.getProject();
      const markdownFiles = project.files.filter(f => f.type === 'markdown');
      if (markdownFiles.length === 0) return;

      // Cursor offset in the original concatenated markdown
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

      // Strip footnote definitions to match what the parser sees.
      const extraction = extractFootnotes(combinedMarkdown);
      const strippedMarkdown = extraction.strippedMarkdown;

      // Map charOffset from original → stripped by walking lines
      const origLines = combinedMarkdown.split('\n');
      const strippedLines = strippedMarkdown.split('\n');
      let origAcc = 0;
      let strippedAcc = 0;
      let si = 0;
      let strippedOffset = 0;
      let mapped = false;
      for (let oi = 0; oi < origLines.length; oi++) {
        const origLine = origLines[oi];
        const origLineEnd = origAcc + origLine.length;
        const kept = si < strippedLines.length && origLine === strippedLines[si];
        if (!mapped && charOffset <= origLineEnd) {
          strippedOffset = kept ? strippedAcc + (charOffset - origAcc) : strippedAcc;
          mapped = true;
        }
        if (kept) {
          strippedAcc += origLine.length + 1;
          si++;
        }
        origAcc = origLineEnd + 1;
      }
      if (!mapped) strippedOffset = strippedAcc;

      // Normalize: strip footnote ref markers so text matches between
      // the source ([^id]) and parsed sections (sentinel chars).
      const norm = (t: string) =>
        t.replace(/\x01FN\d+\x01/g, '').replace(/\[\^[^\]]+\]/g, '');

      const normBefore = norm(strippedMarkdown.substring(0, strippedOffset));
      const normOffset = normBefore.length;
      const normText = norm(strippedMarkdown);

      // Pre-compute total line count per unique rawMarkdown to handle splits
      const totalLinesByRaw = new Map<string, number>();
      for (const sg of project.signatures) {
        for (const sp of sg.spreads) {
          for (const pg of [sp.verso, sp.recto]) {
            if (!pg?.sections || pg.pageState !== 'text') continue;
            for (const sec of pg.sections) {
              const ms = sec as any;
              const lines: string[] = ms.lines || [sec.content];
              const key = sec.rawMarkdown || '';
              totalLinesByRaw.set(key, (totalLinesByRaw.get(key) || 0) + lines.length);
            }
          }
        }
      }

      const linesSeenByRaw = new Map<string, number>();
      let bestPage = 1;

      for (const sg of project.signatures) {
        for (const sp of sg.spreads) {
          for (const pg of [sp.verso, sp.recto]) {
            if (!pg?.sections || pg.pageState !== 'text') continue;
            for (let secIdx = 0; secIdx < pg.sections.length; secIdx++) {
              const sec = pg.sections[secIdx];
              if (!sec.rawMarkdown) continue;
              const ms = sec as any;
              const secLines: string[] = ms.lines || [sec.content];
              const key = sec.rawMarkdown;
              const normRaw = norm(key);
              const secStart = normText.indexOf(normRaw);
              if (secStart === -1) continue;
              const secEnd = secStart + normRaw.length;

              if (normOffset >= secStart && normOffset <= secEnd) {
                const totalLines = totalLinesByRaw.get(key) || secLines.length;
                const linesSoFar = linesSeenByRaw.get(key) || 0;
                const frac = normRaw.length > 0 ? (normOffset - secStart) / normRaw.length : 0;
                const cursorLine = Math.min(Math.floor(frac * totalLines), totalLines - 1);

                if (cursorLine >= linesSoFar && cursorLine < linesSoFar + secLines.length) {
                  const localLine = cursorLine - linesSoFar;
                  const lineFrac = (frac * totalLines) - cursorLine;
                  const lineText = secLines[localLine] || '';
                  const charInLine = Math.min(Math.floor(lineFrac * lineText.length), lineText.length);

                  const mark = this.cursorSyncEnabled
                    ? { pageNumber: pg.pageNumber, sectionIndex: secIdx, lineIndex: localLine, charInLine }
                    : null;
                  appState.updateEditor({ selectedPageNumber: pg.pageNumber, cursorMark: mark });
                  return;
                }
              }
              if (secStart <= normOffset) bestPage = pg.pageNumber;
              linesSeenByRaw.set(key, (linesSeenByRaw.get(key) || 0) + secLines.length);
            }
          }
        }
      }
      appState.updateEditor({ selectedPageNumber: bestPage, cursorMark: null });
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
