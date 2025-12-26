/**
 * AppState Core - Base class with state management
 */

import type {
  BookletProject,
  ProjectFile,
  OutputOptions,
  LayoutOptions,
  FontOptions,
  HeaderFooterOptions,
  EditorState,
  PageItem,
  PageContent,
  Spread,
  Signature,
  StaticSpread,
  SpanningItem,
  FillConfig,
  MarginUnit,
} from '../../types';
import { defaultEditorState, createEmptyProject } from './defaults';

export type StateChangeHandler<T> = (state: T, prevState: T) => void;

/**
 * Application state manager with event emitter pattern
 */
export class AppState {
  private project: BookletProject = createEmptyProject();
  private editor: EditorState = { ...defaultEditorState };
  private projectListeners: Set<StateChangeHandler<BookletProject>> = new Set();
  private editorListeners: Set<StateChangeHandler<EditorState>> = new Set();
  private reflowListeners: Set<() => void> = new Set();
  private reflowTimeout: number | null = null;

  // ==========================================
  // Core State Access
  // ==========================================

  getProject(): BookletProject {
    return this.project;
  }

  setProject(project: BookletProject): void {
    this.project = project;
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

  notifyProjectListeners(prevState: BookletProject): void {
    for (const handler of this.projectListeners) {
      handler(this.project, prevState);
    }
  }

  // ==========================================
  // Editor State
  // ==========================================

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

  // ==========================================
  // Reflow Management
  // ==========================================

  onReflowRequest(handler: () => void): () => void {
    this.reflowListeners.add(handler);
    return () => this.reflowListeners.delete(handler);
  }

  requestReflow(): void {
    if (this.reflowTimeout) {
      clearTimeout(this.reflowTimeout);
    }
    this.reflowTimeout = window.setTimeout(() => {
      requestAnimationFrame(() => {
        for (const handler of this.reflowListeners) {
          handler();
        }
      });
    }, 0);
  }

  // ==========================================
  // Reset and Serialization
  // ==========================================

  reset(): void {
    const prevProject = this.project;
    const prevEditor = this.editor;

    this.project = createEmptyProject();
    this.editor = { ...defaultEditorState };

    this.notifyProjectListeners(prevProject);
    this.notifyEditorListeners(prevEditor);
  }

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

// Declare interface for prototype extensions
declare module './AppStateCore' {
  interface AppState {
    // File management
    addFiles(files: ProjectFile[]): void;
    removeFile(fileId: string): void;
    updateFile(fileId: string, updates: Partial<ProjectFile>): void;
    reorderFiles(fileIds: string[]): void;
    setMainDocument(fileId: string | null): void;
    getMainDocument(): ProjectFile | null;
    getFile(fileId: string): ProjectFile | null;
    getImageByName(name: string): ProjectFile | null;

    // Options
    updateOutputOptions(updates: Partial<OutputOptions>): void;
    updateLayoutOptions(updates: Partial<LayoutOptions>): void;
    updateFontOptions(updates: Partial<FontOptions>): void;
    updateHeaderFooter(updates: Partial<HeaderFooterOptions>): void;
    getMeasurementUnit(): MarginUnit;
    setMeasurementUnit(unit: MarginUnit): void;

    // Blank pages and static pages
    addBlankPage(afterPageNumber: number): void;
    removeBlankPage(pageNumber: number): void;
    makePageStatic(pageNumber: number): void;
    pageNeedsStaticPrompt(pageNumber: number): boolean;
    insertStaticPageAtSelection(): void;
    moveStaticPage(fromPageNumber: number, toPageNumber: number): void;
    deleteStaticPage(pageNumber: number): void;

    // Signatures and spreads
    addAvailableSignature(): void;
    addStaticSignature(): void;
    addStaticSpread(): void;
    addStaticPage(position?: 'verso' | 'recto'): void;
    removeStaticSpread(spreadId: string): void;
    getStaticSpreads(): StaticSpread[];
    reorderStaticPages(sourceSpreadId: string, targetSpreadId: string): void;
    reorderSignatures(sourceIndex: number, targetIndex: number): void;

    // Spanning items
    addSpanningItemToSpread(spreadId: string, item: SpanningItem): void;
    updateSpanningItem(spreadId: string, itemId: string, updates: Partial<SpanningItem>): void;
    deleteSpanningItem(spreadId: string, itemId: string): void;

    // Page items
    addItemToPage(pageNumber: number, item: PageItem): void;
    updateItemOnPage(pageNumber: number, itemId: string, updates: Partial<PageItem>): void;
    deleteItemFromPage(pageNumber: number, itemId: string): void;
    updatePageBackground(pageNumber: number, backgroundFill: FillConfig | undefined): void;
    getPageBackground(pageNumber: number): FillConfig | undefined;
    getItemFromPage(pageNumber: number, itemId: string): PageItem | null;
    bringItemToFront(pageNumber: number, itemId: string): void;
    sendItemToBack(pageNumber: number, itemId: string): void;
    moveItemForward(pageNumber: number, itemId: string): void;
    moveItemBackward(pageNumber: number, itemId: string): void;

    // Multi-select
    selectItem(itemId: string, additive?: boolean): void;
    selectItems(itemIds: string[]): void;
    addToSelection(itemIds: string[]): void;
    clearSelection(): void;
    getSelectedItems(): PageItem[];
    copyToClipboard(): void;
    pasteFromClipboard(): PageItem[];
    deleteSelectedItems(): void;
    duplicateSelectedItems(): PageItem[];
    duplicateItemsAtPosition(): PageItem[];
    duplicateItemsInPlace(): PageItem[];
    alignItems(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void;
    distributeItems(axis: 'horizontal' | 'vertical'): void;
  }
}
