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
  PageItem,
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
  bookletSize: 'quarter-letter',
  pagesPerSignature: 4, // Default to 4-page signature (2 spreads: back cover/page 1, pages 2-3)
  orientation: 'portrait',
  fillAvailableSpace: true,
  creepEnabled: false,
  creepPerSheet: 0.0625 * 72, // 0.0625 inches in points (typical for bond paper)
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
  selectedPagePosition: null,
  selectedItemId: null,
  isDraggingMargin: false,
  dragMarginType: null,
  isLocalMarginChange: false,
  zoomLevel: 1,
  activeTab: 'editor',
  marginUnit: 'in',
};

function createEmptyProject(): BookletProject {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Booklet',
    files: [],
    mainDocument: null,
    measurementUnit: 'in',
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
    const file = this.project.files.find(f => f.id === fileId);
    const files = this.project.files.map(f =>
      f.id === fileId ? { ...f, ...updates } : f
    );
    this.project = { ...this.project, files };
    this.notifyProjectListeners(prevState);

    // Trigger reflow for any markdown file update (all text files are concatenated)
    if (file?.type === 'markdown') {
      this.requestReflow();
    }
  }

  reorderFiles(fileIds: string[]): void {
    const prevState = this.project;
    const fileMap = new Map(this.project.files.map(f => [f.id, f]));

    // Reorder only the files that are in the provided list
    const reorderedFiles: ProjectFile[] = [];
    const otherFiles: ProjectFile[] = [];

    // First, collect files not in the reorder list
    for (const file of this.project.files) {
      if (!fileIds.includes(file.id)) {
        otherFiles.push(file);
      }
    }

    // Then add reordered files in the new order
    for (const id of fileIds) {
      const file = fileMap.get(id);
      if (file) {
        reorderedFiles.push(file);
      }
    }

    // Merge: text files (reordered) + other files
    this.project = { ...this.project, files: [...reorderedFiles, ...otherFiles] };
    this.notifyProjectListeners(prevState);
    this.requestReflow();
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

  // Measurement unit - project-wide setting
  getMeasurementUnit(): import('../types').MarginUnit {
    return this.project.measurementUnit || 'in';
  }

  setMeasurementUnit(unit: import('../types').MarginUnit): void {
    this.updateProject({ measurementUnit: unit });
    // Also update editor marginUnit for backward compatibility
    this.updateEditor({ marginUnit: unit });
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

  // Static spreads (exist independently of markdown)
  addStaticSpread(): void {
    const prevState = this.project;
    const staticSpreads = [...(this.project.staticSpreads || [])];

    const newIndex = staticSpreads.length;
    const basePageNumber = 1000 + newIndex * 2; // Use high numbers to avoid conflicts

    const newSpread: import('../types').StaticSpread = {
      id: crypto.randomUUID(),
      index: newIndex,
      verso: {
        id: crypto.randomUUID(),
        pageNumber: basePageNumber,
        sections: [],
        isBlank: true,
        isRecto: false,
        isStatic: true,
        items: [],
      },
      recto: {
        id: crypto.randomUUID(),
        pageNumber: basePageNumber + 1,
        sections: [],
        isBlank: true,
        isRecto: true,
        isStatic: true,
        items: [],
      },
    };

    staticSpreads.push(newSpread);
    this.project = { ...this.project, staticSpreads };
    this.notifyProjectListeners(prevState);

    // Trigger reflow to merge static spreads
    this.requestReflow();
  }

  addStaticPage(position: 'verso' | 'recto' = 'recto'): void {
    const prevState = this.project;
    const staticSpreads = [...(this.project.staticSpreads || [])];

    // Find the last static spread or create a new one
    let targetSpread = staticSpreads[staticSpreads.length - 1];
    const basePageNumber = 1000 + staticSpreads.length * 2;

    // If no spreads exist, or the last spread already has a page in the requested position
    if (!targetSpread || (position === 'verso' && targetSpread.verso) || (position === 'recto' && targetSpread.recto)) {
      // Create a new spread with just this page
      const newSpread: import('../types').StaticSpread = {
        id: crypto.randomUUID(),
        index: staticSpreads.length,
        verso: position === 'verso' ? {
          id: crypto.randomUUID(),
          pageNumber: basePageNumber,
          sections: [],
          isBlank: true,
          isRecto: false,
          isStatic: true,
          items: [],
        } : null,
        recto: position === 'recto' ? {
          id: crypto.randomUUID(),
          pageNumber: basePageNumber + 1,
          sections: [],
          isBlank: true,
          isRecto: true,
          isStatic: true,
          items: [],
        } : null,
      };
      staticSpreads.push(newSpread);
    } else {
      // Add page to existing spread
      const pageNumber = position === 'verso' ? basePageNumber - 2 : basePageNumber - 1;
      targetSpread[position] = {
        id: crypto.randomUUID(),
        pageNumber,
        sections: [],
        isBlank: true,
        isRecto: position === 'recto',
        isStatic: true,
        items: [],
      };
    }

    this.project = { ...this.project, staticSpreads };
    this.notifyProjectListeners(prevState);
    this.requestReflow();
  }

  removeStaticSpread(spreadId: string): void {
    const prevState = this.project;
    const staticSpreads = (this.project.staticSpreads || []).filter(s => s.id !== spreadId);

    // Reindex remaining spreads
    staticSpreads.forEach((spread, index) => {
      spread.index = index;
    });

    this.project = { ...this.project, staticSpreads };
    this.notifyProjectListeners(prevState);
    this.requestReflow();
  }

  getStaticSpreads(): import('../types').StaticSpread[] {
    return this.project.staticSpreads || [];
  }

  // Spanning items (items that bridge across verso and recto)
  addSpanningItemToSpread(spreadId: string, item: import('../types').SpanningItem): void {
    const prevState = this.project;
    const staticSpreads = (this.project.staticSpreads || []).map(spread => {
      if (spread.id !== spreadId) return spread;
      return {
        ...spread,
        spanningItems: [...(spread.spanningItems || []), item],
      };
    });
    this.project = { ...this.project, staticSpreads };
    this.notifyProjectListeners(prevState);
  }

  updateSpanningItem(spreadId: string, itemId: string, updates: Partial<import('../types').SpanningItem>): void {
    const prevState = this.project;
    const staticSpreads = (this.project.staticSpreads || []).map(spread => {
      if (spread.id !== spreadId) return spread;
      return {
        ...spread,
        spanningItems: (spread.spanningItems || []).map(item =>
          item.id === itemId ? { ...item, ...updates } as import('../types').SpanningItem : item
        ),
      };
    });
    this.project = { ...this.project, staticSpreads };
    this.notifyProjectListeners(prevState);
  }

  deleteSpanningItem(spreadId: string, itemId: string): void {
    const prevState = this.project;
    const staticSpreads = (this.project.staticSpreads || []).map(spread => {
      if (spread.id !== spreadId) return spread;
      return {
        ...spread,
        spanningItems: (spread.spanningItems || []).filter(item => item.id !== itemId),
      };
    });
    this.project = { ...this.project, staticSpreads };
    this.notifyProjectListeners(prevState);

    if (this.editor.selectedItemId === itemId) {
      this.updateEditor({ selectedItemId: null });
    }
  }

  // Page items (for static pages)
  addItemToPage(pageNumber: number, item: PageItem): void {
    const prevState = this.project;

    // Find which spread and position (verso/recto) contains this page
    let targetSpreadId: string | null = null;
    let targetPosition: 'verso' | 'recto' | null = null;

    for (const sig of this.project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'verso';
          break;
        }
        if (spread.recto?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'recto';
          break;
        }
      }
      if (targetSpreadId) break;
    }

    // Helper to update a page by page number (for signatures)
    const updatePageByNumber = (page: import('../types').PageContent | null) => {
      if (!page || page.pageNumber !== pageNumber) return page;
      return {
        ...page,
        items: [...(page.items || []), item],
      };
    };

    // Helper to update static spread by spread ID and position
    const updateStaticSpread = (spread: import('../types').StaticSpread) => {
      if (spread.id !== targetSpreadId) return spread;
      if (targetPosition === 'verso' && spread.verso) {
        return {
          ...spread,
          verso: { ...spread.verso, items: [...(spread.verso.items || []), item] },
        };
      }
      if (targetPosition === 'recto' && spread.recto) {
        return {
          ...spread,
          recto: { ...spread.recto, items: [...(spread.recto.items || []), item] },
        };
      }
      return spread;
    };

    // Update signatures
    const signatures = this.project.signatures.map(sig => ({
      ...sig,
      spreads: sig.spreads.map(spread => ({
        ...spread,
        verso: updatePageByNumber(spread.verso),
        recto: updatePageByNumber(spread.recto),
      })),
    }));

    // Update static spreads by ID match
    const staticSpreads = (this.project.staticSpreads || []).map(updateStaticSpread);

    this.project = { ...this.project, signatures, staticSpreads };
    this.notifyProjectListeners(prevState);
  }

  updateItemOnPage(pageNumber: number, itemId: string, updates: Partial<PageItem>): void {
    const prevState = this.project;

    // Find which spread and position (verso/recto) contains this page
    let targetSpreadId: string | null = null;
    let targetPosition: 'verso' | 'recto' | null = null;

    for (const sig of this.project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'verso';
          break;
        }
        if (spread.recto?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'recto';
          break;
        }
      }
      if (targetSpreadId) break;
    }

    // Helper to update a page by page number
    const updatePageByNumber = (page: import('../types').PageContent | null) => {
      if (!page || page.pageNumber !== pageNumber) return page;
      return {
        ...page,
        items: (page.items || []).map(item =>
          item.id === itemId ? { ...item, ...updates } as PageItem : item
        ),
      };
    };

    // Helper to update items in a page
    const updateItems = (items: PageItem[] | undefined) => {
      return (items || []).map(item =>
        item.id === itemId ? { ...item, ...updates } as PageItem : item
      );
    };

    // Helper to update static spread by spread ID and position
    const updateStaticSpread = (spread: import('../types').StaticSpread) => {
      if (spread.id !== targetSpreadId) return spread;
      if (targetPosition === 'verso' && spread.verso) {
        return {
          ...spread,
          verso: { ...spread.verso, items: updateItems(spread.verso.items) },
        };
      }
      if (targetPosition === 'recto' && spread.recto) {
        return {
          ...spread,
          recto: { ...spread.recto, items: updateItems(spread.recto.items) },
        };
      }
      return spread;
    };

    const signatures = this.project.signatures.map(sig => ({
      ...sig,
      spreads: sig.spreads.map(spread => ({
        ...spread,
        verso: updatePageByNumber(spread.verso),
        recto: updatePageByNumber(spread.recto),
      })),
    }));

    // Update static spreads by ID match
    const staticSpreads = (this.project.staticSpreads || []).map(updateStaticSpread);

    this.project = { ...this.project, signatures, staticSpreads };
    this.notifyProjectListeners(prevState);
  }

  deleteItemFromPage(pageNumber: number, itemId: string): void {
    const prevState = this.project;

    // Find which spread and position (verso/recto) contains this page
    let targetSpreadId: string | null = null;
    let targetPosition: 'verso' | 'recto' | null = null;

    for (const sig of this.project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'verso';
          break;
        }
        if (spread.recto?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'recto';
          break;
        }
      }
      if (targetSpreadId) break;
    }

    // Helper to update a page by page number
    const updatePageByNumber = (page: import('../types').PageContent | null) => {
      if (!page || page.pageNumber !== pageNumber) return page;
      return {
        ...page,
        items: (page.items || []).filter(item => item.id !== itemId),
      };
    };

    // Helper to filter items in a page
    const filterItems = (items: PageItem[] | undefined) => {
      return (items || []).filter(item => item.id !== itemId);
    };

    // Helper to update static spread by spread ID and position
    const updateStaticSpread = (spread: import('../types').StaticSpread) => {
      if (spread.id !== targetSpreadId) return spread;
      if (targetPosition === 'verso' && spread.verso) {
        return {
          ...spread,
          verso: { ...spread.verso, items: filterItems(spread.verso.items) },
        };
      }
      if (targetPosition === 'recto' && spread.recto) {
        return {
          ...spread,
          recto: { ...spread.recto, items: filterItems(spread.recto.items) },
        };
      }
      return spread;
    };

    const signatures = this.project.signatures.map(sig => ({
      ...sig,
      spreads: sig.spreads.map(spread => ({
        ...spread,
        verso: updatePageByNumber(spread.verso),
        recto: updatePageByNumber(spread.recto),
      })),
    }));

    // Update static spreads by ID match
    const staticSpreads = (this.project.staticSpreads || []).map(updateStaticSpread);

    this.project = { ...this.project, signatures, staticSpreads };
    this.notifyProjectListeners(prevState);

    // Clear selection if the deleted item was selected
    if (this.editor.selectedItemId === itemId) {
      this.updateEditor({ selectedItemId: null });
    }
  }

  updatePageBackground(pageNumber: number, backgroundFill: import('../types').FillConfig | undefined): void {
    const prevState = this.project;

    // Find which spread and position (verso/recto) contains this page
    let targetSpreadId: string | null = null;
    let targetPosition: 'verso' | 'recto' | null = null;

    for (const sig of this.project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'verso';
          break;
        }
        if (spread.recto?.pageNumber === pageNumber) {
          targetSpreadId = spread.id;
          targetPosition = 'recto';
          break;
        }
      }
      if (targetSpreadId) break;
    }

    // Helper to update a page by page number
    const updatePageByNumber = (page: import('../types').PageContent | null) => {
      if (!page || page.pageNumber !== pageNumber) return page;
      return { ...page, backgroundFill };
    };

    // Helper to update static spread by spread ID and position
    const updateStaticSpread = (spread: import('../types').StaticSpread) => {
      if (spread.id !== targetSpreadId) return spread;
      if (targetPosition === 'verso' && spread.verso) {
        return {
          ...spread,
          verso: { ...spread.verso, backgroundFill },
        };
      }
      if (targetPosition === 'recto' && spread.recto) {
        return {
          ...spread,
          recto: { ...spread.recto, backgroundFill },
        };
      }
      return spread;
    };

    const signatures = this.project.signatures.map(sig => ({
      ...sig,
      spreads: sig.spreads.map(spread => ({
        ...spread,
        verso: updatePageByNumber(spread.verso),
        recto: updatePageByNumber(spread.recto),
      })),
    }));

    // Update static spreads by ID match
    const staticSpreads = (this.project.staticSpreads || []).map(updateStaticSpread);

    this.project = { ...this.project, signatures, staticSpreads };
    this.notifyProjectListeners(prevState);
  }

  getPageBackground(pageNumber: number): import('../types').FillConfig | undefined {
    // Check signatures
    for (const sig of this.project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso?.pageNumber === pageNumber) return spread.verso.backgroundFill;
        if (spread.recto?.pageNumber === pageNumber) return spread.recto.backgroundFill;
      }
    }
    // Check static spreads
    for (const spread of this.project.staticSpreads || []) {
      if (spread.verso?.pageNumber === pageNumber) return spread.verso.backgroundFill;
      if (spread.recto?.pageNumber === pageNumber) return spread.recto.backgroundFill;
    }
    return undefined;
  }

  getItemFromPage(pageNumber: number, itemId: string): PageItem | null {
    const checkPage = (page: import('../types').PageContent | null) => {
      if (!page || page.pageNumber !== pageNumber) return null;
      return page.items?.find(item => item.id === itemId) || null;
    };

    // Check signatures
    for (const sig of this.project.signatures) {
      for (const spread of sig.spreads) {
        const item = checkPage(spread.verso) || checkPage(spread.recto);
        if (item) return item;
      }
    }
    // Check static spreads
    for (const spread of this.project.staticSpreads || []) {
      const item = checkPage(spread.verso) || checkPage(spread.recto);
      if (item) return item;
    }
    return null;
  }

  /**
   * Move item to the front (highest z-index) on its page
   */
  bringItemToFront(pageNumber: number, itemId: string): void {
    this.reorderItemInPage(pageNumber, itemId, 'front');
  }

  /**
   * Move item to the back (lowest z-index) on its page
   */
  sendItemToBack(pageNumber: number, itemId: string): void {
    this.reorderItemInPage(pageNumber, itemId, 'back');
  }

  /**
   * Move item one step forward in z-order
   */
  moveItemForward(pageNumber: number, itemId: string): void {
    this.reorderItemInPage(pageNumber, itemId, 'forward');
  }

  /**
   * Move item one step backward in z-order
   */
  moveItemBackward(pageNumber: number, itemId: string): void {
    this.reorderItemInPage(pageNumber, itemId, 'backward');
  }

  /**
   * Internal helper to reorder items on a page
   */
  private reorderItemInPage(pageNumber: number, itemId: string, direction: 'front' | 'back' | 'forward' | 'backward'): void {
    const prevState = this.project;

    const signatures = this.project.signatures.map(sig => ({
      ...sig,
      spreads: sig.spreads.map(spread => {
        const updatePage = (page: typeof spread.verso) => {
          if (!page || page.pageNumber !== pageNumber || !page.items) return page;

          const items = [...page.items];
          const index = items.findIndex(item => item.id === itemId);
          if (index === -1) return page;

          const [item] = items.splice(index, 1);

          switch (direction) {
            case 'front':
              items.push(item);
              break;
            case 'back':
              items.unshift(item);
              break;
            case 'forward':
              if (index < items.length) {
                items.splice(index + 1, 0, item);
              } else {
                items.push(item);
              }
              break;
            case 'backward':
              if (index > 0) {
                items.splice(index - 1, 0, item);
              } else {
                items.unshift(item);
              }
              break;
          }

          return { ...page, items };
        };
        return {
          ...spread,
          verso: updatePage(spread.verso),
          recto: updatePage(spread.recto),
        };
      }),
    }));

    this.project = { ...this.project, signatures };
    this.notifyProjectListeners(prevState);
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
