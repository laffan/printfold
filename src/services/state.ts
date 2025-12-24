/**
 * Simple state management with event emitter pattern
 */

import type {
  BookletProject,
  ProjectFile,
  OutputOptions,
  LayoutOptions,
  FontOptions,
  HeaderFooterOptions,
  EditorState,
  FontStyle,
} from '../types';

type StateChangeHandler<T> = (state: T, prevState: T) => void;

// Default font styles - using Google Fonts
const defaultFontStyle: FontStyle = {
  fontFamily: 'Source Serif 4',
  fontSize: 12,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
};

const defaultHeadingStyle = (size: number, weight: 'bold' | 'normal' = 'bold'): FontStyle => ({
  fontFamily: 'Source Sans 3',
  fontSize: size,
  fontWeight: weight,
  fontStyle: 'normal',
  color: '#000000',
});

// Default options
export const defaultOutputOptions: OutputOptions = {
  sheetSize: 'letter',
  bookletSize: 'half-letter',
  pagesPerSignature: 8,
  orientation: 'portrait',
};

export const defaultLayoutOptions: LayoutOptions = {
  margins: {
    top: 54, // 0.75 inch
    bottom: 54,
    inner: 54,
    outer: 36, // 0.5 inch
  },
  marginOverrides: [],
  emptyPageBeforeH1: true,
  spacingAboveH1: 72, // 1 inch
  spacingAboveH2: 36,
  spacingAboveH3: 24,
  paragraphSpacing: 12,
  lineHeight: 1.5,
  textAlign: 'left',
};

export const defaultFontOptions: FontOptions = {
  body: defaultFontStyle,
  h1: defaultHeadingStyle(24),
  h2: defaultHeadingStyle(20),
  h3: defaultHeadingStyle(16),
  h4: defaultHeadingStyle(14),
  h5: defaultHeadingStyle(12),
  h6: defaultHeadingStyle(12, 'normal'),
  code: {
    ...defaultFontStyle,
    fontFamily: 'Inconsolata',
    fontSize: 10,
  },
  blockquote: {
    ...defaultFontStyle,
    fontStyle: 'italic',
    color: '#555555',
  },
};

export const defaultHeaderFooter: HeaderFooterOptions = {
  header: {
    enabled: false,
    height: 24,
    verso: { left: '', center: '', right: '' },
    recto: { left: '', center: '', right: '' },
    showOnFirstPage: false,
    font: { ...defaultFontStyle, fontSize: 10 },
  },
  footer: {
    enabled: true,
    height: 24,
    verso: { left: '{{pageNumber}}', center: '', right: '' },
    recto: { left: '', center: '', right: '{{pageNumber}}' },
    showOnFirstPage: false,
    font: { ...defaultFontStyle, fontSize: 10 },
  },
};

export const defaultEditorState: EditorState = {
  selectedPageNumber: null,
  selectedSpreadNumber: null,
  isDraggingMargin: false,
  dragMarginType: null,
  isLocalMarginChange: false,
  zoomLevel: 1,
  activeTab: 'editor',
};

function createEmptyProject(): BookletProject {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Booklet',
    files: [],
    mainDocument: null,
    outputOptions: { ...defaultOutputOptions },
    layoutOptions: JSON.parse(JSON.stringify(defaultLayoutOptions)),
    fontOptions: JSON.parse(JSON.stringify(defaultFontOptions)),
    headerFooter: JSON.parse(JSON.stringify(defaultHeaderFooter)),
    signatures: [],
    blankPages: [],
  };
}

class AppState {
  private project: BookletProject = createEmptyProject();
  private editor: EditorState = { ...defaultEditorState };
  private projectListeners: Set<StateChangeHandler<BookletProject>> = new Set();
  private editorListeners: Set<StateChangeHandler<EditorState>> = new Set();
  private reflowListeners: Set<() => void> = new Set();

  // Project state
  getProject(): BookletProject {
    return this.project;
  }

  updateProject(updates: Partial<BookletProject>): void {
    const prevState = this.project;
    this.project = { ...this.project, ...updates };
    this.notifyProjectListeners(prevState);
  }

  onProjectChange(handler: StateChangeHandler<BookletProject>): () => void {
    this.projectListeners.add(handler);
    return () => this.projectListeners.delete(handler);
  }

  private notifyProjectListeners(prevState: BookletProject): void {
    for (const handler of this.projectListeners) {
      handler(this.project, prevState);
    }
  }

  // Editor state
  getEditor(): EditorState {
    return this.editor;
  }

  updateEditor(updates: Partial<EditorState>): void {
    const prevState = this.editor;
    this.editor = { ...this.editor, ...updates };
    this.notifyEditorListeners(prevState);
  }

  onEditorChange(handler: StateChangeHandler<EditorState>): () => void {
    this.editorListeners.add(handler);
    return () => this.editorListeners.delete(handler);
  }

  private notifyEditorListeners(prevState: EditorState): void {
    for (const handler of this.editorListeners) {
      handler(this.editor, prevState);
    }
  }

  // File management
  addFiles(files: ProjectFile[]): void {
    const prevState = this.project;
    const newFiles = [...this.project.files];

    for (const file of files) {
      // Replace if same name exists
      const existingIndex = newFiles.findIndex(f => f.name === file.name);
      if (existingIndex >= 0) {
        newFiles[existingIndex] = file;
      } else {
        newFiles.push(file);
      }
    }

    // Auto-select main document if not set
    let mainDocument = this.project.mainDocument;
    if (!mainDocument) {
      const mdFile = newFiles.find(f => f.type === 'markdown');
      if (mdFile) {
        mainDocument = mdFile.id;
      }
    }

    this.project = { ...this.project, files: newFiles, mainDocument };
    this.notifyProjectListeners(prevState);
    this.requestReflow();
  }

  removeFile(fileId: string): void {
    const prevState = this.project;
    const files = this.project.files.filter(f => f.id !== fileId);
    let mainDocument = this.project.mainDocument;

    if (mainDocument === fileId) {
      const mdFile = files.find(f => f.type === 'markdown');
      mainDocument = mdFile?.id ?? null;
    }

    this.project = { ...this.project, files, mainDocument };
    this.notifyProjectListeners(prevState);
    this.requestReflow();
  }

  updateFile(fileId: string, updates: Partial<ProjectFile>): void {
    const prevState = this.project;
    const files = this.project.files.map(f =>
      f.id === fileId ? { ...f, ...updates } : f
    );
    this.project = { ...this.project, files };
    this.notifyProjectListeners(prevState);

    if (fileId === this.project.mainDocument) {
      this.requestReflow();
    }
  }

  setMainDocument(fileId: string | null): void {
    if (this.project.mainDocument !== fileId) {
      this.updateProject({ mainDocument: fileId });
      this.requestReflow();
    }
  }

  getMainDocument(): ProjectFile | null {
    if (!this.project.mainDocument) return null;
    return this.project.files.find(f => f.id === this.project.mainDocument) ?? null;
  }

  getFile(fileId: string): ProjectFile | null {
    return this.project.files.find(f => f.id === fileId) ?? null;
  }

  getImageByName(name: string): ProjectFile | null {
    return this.project.files.find(
      f => f.type === 'image' && f.name.toLowerCase() === name.toLowerCase()
    ) ?? null;
  }

  // Options
  updateOutputOptions(updates: Partial<OutputOptions>): void {
    this.updateProject({
      outputOptions: { ...this.project.outputOptions, ...updates },
    });
    this.requestReflow();
  }

  updateLayoutOptions(updates: Partial<LayoutOptions>): void {
    this.updateProject({
      layoutOptions: { ...this.project.layoutOptions, ...updates },
    });
    this.requestReflow();
  }

  updateFontOptions(updates: Partial<FontOptions>): void {
    this.updateProject({
      fontOptions: { ...this.project.fontOptions, ...updates },
    });
    this.requestReflow();
  }

  updateHeaderFooter(updates: Partial<HeaderFooterOptions>): void {
    this.updateProject({
      headerFooter: { ...this.project.headerFooter, ...updates },
    });
    this.requestReflow();
  }

  // Blank pages
  addBlankPage(afterPageNumber: number): void {
    const blankPages = [...this.project.blankPages, afterPageNumber].sort((a, b) => a - b);
    this.updateProject({ blankPages });
    this.requestReflow();
  }

  removeBlankPage(pageNumber: number): void {
    const blankPages = this.project.blankPages.filter(p => p !== pageNumber);
    this.updateProject({ blankPages });
    this.requestReflow();
  }

  // Reflow
  onReflowRequest(handler: () => void): () => void {
    this.reflowListeners.add(handler);
    return () => this.reflowListeners.delete(handler);
  }

  requestReflow(): void {
    // Debounce reflow requests to avoid excessive reflows during rapid changes
    if (this.reflowTimeout) {
      clearTimeout(this.reflowTimeout);
    }
    // Use requestAnimationFrame to ensure DOM updates have completed
    // and to batch rapid changes into a single reflow
    this.reflowTimeout = window.setTimeout(() => {
      requestAnimationFrame(() => {
        for (const handler of this.reflowListeners) {
          handler();
        }
      });
    }, 0);
  }

  private reflowTimeout: number | null = null;

  // Reset
  reset(): void {
    const prevProject = this.project;
    const prevEditor = this.editor;

    this.project = createEmptyProject();
    this.editor = { ...defaultEditorState };

    this.notifyProjectListeners(prevProject);
    this.notifyEditorListeners(prevEditor);
  }

  // Load/Save
  toJSON(): string {
    return JSON.stringify(this.project);
  }

  fromJSON(json: string): void {
    try {
      const loaded = JSON.parse(json) as BookletProject;
      this.updateProject(loaded);
      this.requestReflow();
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  }
}

// Singleton instance
export const appState = new AppState();
