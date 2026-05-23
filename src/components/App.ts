/**
 * Main Application Component
 * Orchestrates all UI components and handles global interactions
 */

import { appState } from '../services/state';
import { env } from '../services/environment';
import { textFlowEngine, clearMeasurementCache } from '../services/textFlow';
import { googleFonts } from '../services/googleFonts';
import { fontService } from '../services/fontService';
import { FileList } from './FileList';
import { FilePreview } from './FilePreview';
import { SpreadEditor } from './SpreadEditor';
import { PDFPreview } from './PDFPreview';
import { OptionsPanel } from './OptionsPanel';
import { updateStylesTab } from './OptionsPanel/stylesTab';
import { ZipHandler } from '../services/zipHandler';
import { PDFGenerator } from '../services/pdfGenerator';
import { projectFile } from '../services/projectFile';
import { recentProjects, type RecentEntry } from '../services/recentProjects';
import { WelcomeScreen, type WelcomeAction } from './WelcomeScreen';
import type { BookletProject } from '../types';

const AUTOSAVE_DEBOUNCE_MS = 600;

export class App {
  private fileList!: FileList;
  private filePreview!: FilePreview;
  private spreadEditor!: SpreadEditor;
  private pdfPreview!: PDFPreview;
  private optionsPanel!: OptionsPanel;
  private zipHandler!: ZipHandler;
  private pdfGenerator!: PDFGenerator;
  private welcomeScreen!: WelcomeScreen;

  /** Debounced auto-save handle. */
  private autoSaveTimer: number | null = null;
  /** Suppress auto-save while loading an existing project (avoids
   *  re-writing the file we just read). */
  private suppressAutoSave = false;

  init(): void {
    // Initialize components
    this.fileList = new FileList();
    this.filePreview = new FilePreview();
    this.spreadEditor = new SpreadEditor();
    this.pdfPreview = new PDFPreview();
    this.optionsPanel = new OptionsPanel();
    this.zipHandler = new ZipHandler();
    this.pdfGenerator = new PDFGenerator();
    this.welcomeScreen = new WelcomeScreen();

    // Mount components
    this.fileList.mount();
    this.filePreview.mount();
    this.spreadEditor.mount();
    this.pdfPreview.mount();
    this.optionsPanel.mount();
    this.welcomeScreen.mount();
    this.welcomeScreen.setOnAction((action) => this.handleWelcomeAction(action));

    // Connect file list to preview
    this.fileList.setOnFileSelect((file) => {
      this.filePreview.showFile(file);
    });

    // Set up event listeners
    this.setupHeaderButtons();
    this.setupHeaderMenus();
    this.setupTabs();
    this.setupOptionsTabs();
    this.setupCollapsiblePanels();
    this.setupStateListeners();
    this.setupResizers();
    this.setupAutoSave();

    // Show the welcome screen — the user must create or open a project
    // before the editor becomes interactive.
    void this.welcomeScreen.show();

    // Warn the user up-front on browsers without the File System Access
    // API: auto-save can't write to disk, so the manual Save button
    // (re-download flow) is shown instead.
    if (!env.isElectron && !env.supportsSilentWrites) {
      document.getElementById('no-fsa-banner')?.classList.remove('hidden');
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) saveBtn.style.display = '';
    }

    console.log('PrintFold initialized', env.isElectron ? '(Electron)' : '(Web)');
  }

  // -------------------------------------------------------------------
  // Welcome screen / project file lifecycle
  // -------------------------------------------------------------------

  private async handleWelcomeAction(action: WelcomeAction): Promise<void> {
    try {
      if (action.kind === 'new') {
        await this.createNewProject();
      } else if (action.kind === 'open') {
        await this.openExistingProject();
      } else if (action.kind === 'openRecent') {
        await this.openRecentProject(action.entry);
      }
    } catch (e) {
      console.error('Welcome action failed:', e);
      alert(`Could not open project: ${(e as Error).message}`);
    }
  }

  private async createNewProject(): Promise<void> {
    const dest = await env.pickProjectDestination('Untitled.printfold');
    if (!dest) return;

    // Reset to a fresh project, then bind the file destination and
    // perform the initial write so the .printfold file on disk reflects
    // the empty starting state.
    this.suppressAutoSave = true;
    appState.reset();
    const displayName = stripExtension(dest.name);
    appState.updateProject({ name: displayName });

    if (dest.path) {
      projectFile.setElectronPath(dest.path, dest.name);
      await recentProjects.addElectronPath(dest.path, dest.name);
    } else if (dest.handle) {
      projectFile.setWebHandle(dest.handle, dest.name);
      await recentProjects.addWebHandle(dest.handle, dest.name);
    }
    this.suppressAutoSave = false;

    this.welcomeScreen.hide();
    this.updateHeaderForProject();
    this.performReflow();
    await this.saveNow();
  }

  private async openExistingProject(): Promise<void> {
    const source = await env.openProjectFile();
    if (!source) return;
    await this.loadProjectFromSource(source.content, source.name, {
      path: source.path,
      handle: source.handle,
    });
  }

  private async openRecentProject(entry: RecentEntry): Promise<void> {
    if (env.isElectron && entry.path) {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron bridge unavailable');
      const direct = await api.readFile(entry.path);
      if (!direct.success || !direct.content) {
        throw new Error(`Could not read ${entry.path}`);
      }
      const binary = atob(direct.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await this.loadProjectFromSource(bytes, entry.name, { path: entry.path });
      await recentProjects.addElectronPath(entry.path, entry.name);
      return;
    }

    // Web: try to re-use the persisted FileSystemFileHandle.
    const handle = await recentProjects.getWebHandle(entry.id);
    if (!handle) {
      await recentProjects.remove(entry);
      throw new Error('This recent project is no longer available. Try Open Project instead.');
    }
    // Re-validate permissions — browsers drop them after a session.
    const permState = await (handle as unknown as {
      queryPermission: (opts: { mode: string }) => Promise<PermissionState>
    }).queryPermission({ mode: 'readwrite' });
    if (permState !== 'granted') {
      const requested = await (handle as unknown as {
        requestPermission: (opts: { mode: string }) => Promise<PermissionState>
      }).requestPermission({ mode: 'readwrite' });
      if (requested !== 'granted') {
        throw new Error('Permission to access this file was denied.');
      }
    }
    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    await this.loadProjectFromSource(new Uint8Array(buffer), entry.name, { handle });
    await recentProjects.touchWeb(entry.id);
  }

  private async loadProjectFromSource(
    bytes: Uint8Array,
    name: string,
    binding: { path?: string; handle?: FileSystemFileHandle },
  ): Promise<void> {
    this.suppressAutoSave = true;
    try {
      // Empty file (e.g. a fresh .printfold from a brand-new project on
      // another machine, or a file the OS created but never populated).
      // Treat as a blank project rather than a load error.
      if (bytes.length === 0) {
        appState.reset();
        appState.updateProject({ name: stripExtension(name) });
      } else {
        const base64 = uint8ArrayToBase64(bytes);
        await this.zipHandler.import(base64);
        appState.updateProject({ name: stripExtension(name) });
      }

      if (binding.path) {
        projectFile.setElectronPath(binding.path, name);
      } else if (binding.handle) {
        projectFile.setWebHandle(binding.handle, name);
      }
    } finally {
      this.suppressAutoSave = false;
    }

    this.welcomeScreen.hide();
    this.updateHeaderForProject();
    this.performReflow();
  }

  private updateHeaderForProject(): void {
    const display = document.getElementById('project-name-display');
    if (display) display.textContent = projectFile.getName();
  }

  // -------------------------------------------------------------------
  // Auto-save
  // -------------------------------------------------------------------

  private setupAutoSave(): void {
    appState.onProjectChange(() => {
      if (this.suppressAutoSave) return;
      if (!projectFile.hasFile()) return;
      this.scheduleAutoSave();
    });
  }

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
    }
    this.setSaveStatus('Saving…', 'saving');
    this.autoSaveTimer = window.setTimeout(() => {
      this.autoSaveTimer = null;
      void this.saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  private async saveNow(): Promise<void> {
    if (!projectFile.hasFile()) return;
    try {
      const bytes = await this.zipHandler.export();
      await projectFile.write(bytes);
      this.setSaveStatus('Saved', '');
    } catch (e) {
      console.error('Auto-save failed:', e);
      this.setSaveStatus('Save failed', 'error');
    }
  }

  private setSaveStatus(text: string, cls: 'saving' | 'error' | ''): void {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('saving', 'error');
    if (cls) el.classList.add(cls);
  }

  private setupHeaderButtons(): void {
    // Re-open the welcome screen (for switching projects)
    document.getElementById('btn-welcome')?.addEventListener('click', () => {
      void this.welcomeScreen.show();
    });

    // Manual save button — shown only when auto-save isn't available
    // (browsers without the File System Access API). Performs a fresh
    // download of the .printfold file.
    document.getElementById('btn-save')?.addEventListener('click', async () => {
      const zipContent = await this.zipHandler.export();
      await env.saveFile({
        defaultName: `${appState.getProject().name}.printfold`,
        filters: [{ name: 'PrintFold Project', extensions: ['printfold'] }],
        content: zipContent,
      });
    });

    // Export PDF button
    document.getElementById('btn-export')?.addEventListener('click', async () => {
      try {
        const pdfBytes = await this.pdfGenerator.generate();
        await env.saveFile({
          defaultName: `${appState.getProject().name}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          content: pdfBytes,
        });
      } catch (error) {
        console.error('PDF generation failed:', error);
        alert('Failed to generate PDF. See console for details.');
      }
    });
  }

  private setupHeaderMenus(): void {
    const viewMenu = document.getElementById('menu-view');
    const viewBtn = viewMenu?.querySelector('.header-menu-btn');
    const viewDropdown = viewMenu?.querySelector('.header-menu-dropdown');
    const toggleSidebarBtn = document.getElementById('menu-toggle-sidebar');
    const sidebar = document.querySelector('.column-input') as HTMLElement | null;
    const sidebarResizer = sidebar?.nextElementSibling as HTMLElement | null;

    if (!viewMenu || !viewBtn || !viewDropdown || !toggleSidebarBtn || !sidebar) return;

    const toggleSidebar = () => {
      const isHidden = sidebar.classList.toggle('sidebar-hidden');
      const label = toggleSidebarBtn.querySelector('.menu-item-label');
      if (label) label.textContent = isHidden ? 'Show Files Sidebar' : 'Hide Files Sidebar';
      // Close the menu
      viewDropdown.classList.add('hidden');
      viewMenu.classList.remove('open');
      // Resize the editor after layout settles
      setTimeout(() => this.spreadEditor.resize(), 250);
    };

    toggleSidebarBtn.addEventListener('click', toggleSidebar);

    // Open/close the View dropdown
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = viewDropdown.classList.toggle('hidden');
      viewMenu.classList.toggle('open', !isOpen);
    });

    // Close on outside click
    document.addEventListener('click', () => {
      viewDropdown.classList.add('hidden');
      viewMenu.classList.remove('open');
    });
    viewDropdown.addEventListener('click', (e) => e.stopPropagation());

    // Keyboard shortcut: Cmd+\ (Mac) or Ctrl+\ (Windows/Linux)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    });
  }

  private setupTabs(): void {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');

        // Update tab states
        tabs.forEach(t => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });

        // Update panel visibility
        panels.forEach(panel => {
          const isActive = panel.id === `tab-${tabName}`;
          panel.classList.toggle('active', isActive);
        });

        // Update editor state
        appState.updateEditor({
          activeTab: tabName as 'editor' | 'preview',
        });

        // Update options tabs state based on mode
        this.updateOptionsTabsForMode(tabName as 'editor' | 'preview');

        // Trigger resize for canvas components
        if (tabName === 'editor') {
          this.spreadEditor.resize();
        } else if (tabName === 'preview') {
          this.pdfPreview.refresh();
        }
      });
    });
  }

  /**
   * Update options tabs based on editor/preview mode
   * In preview mode, disable the "Selected" tab since there's nothing to select
   */
  private updateOptionsTabsForMode(mode: 'editor' | 'preview'): void {
    const selectedTabBtn = document.querySelector('.options-tabs .tab-btn[data-tab="selected"]') as HTMLButtonElement;
    const stylesTabBtn = document.querySelector('.options-tabs .tab-btn[data-tab="styles"]') as HTMLButtonElement;
    const optionsTabButtons = document.querySelectorAll('.options-tabs .tab-btn');
    const optionsTabPanels = document.querySelectorAll('.options-tab-content > .tab-panel');

    if (!selectedTabBtn) return;

    if (mode === 'preview') {
      // Disable the Selected tab
      selectedTabBtn.disabled = true;

      // If Selected tab is currently active, switch to Output tab
      if (selectedTabBtn.classList.contains('active')) {
        const outputTabBtn = document.querySelector('.options-tabs .tab-btn[data-tab="output"]');
        if (outputTabBtn) {
          optionsTabButtons.forEach(b => b.classList.toggle('active', b === outputTabBtn));
          optionsTabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === 'tab-output');
          });
        }
      }
    } else {
      // Re-enable the Selected tab in editor mode
      selectedTabBtn.disabled = false;

      // Refresh styles tab if it's active to ensure proper initialization
      if (stylesTabBtn?.classList.contains('active')) {
        updateStylesTab(true);
      }
    }
  }

  private setupOptionsTabs(): void {
    const tabButtons = document.querySelectorAll('.options-tabs .tab-btn');
    const tabPanels = document.querySelectorAll('.options-tab-content > .tab-panel');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Don't switch to disabled tabs
        if ((btn as HTMLButtonElement).disabled) return;

        const tabName = btn.getAttribute('data-tab');

        // Update button states
        tabButtons.forEach(b => {
          b.classList.toggle('active', b === btn);
        });

        // Update panel visibility
        tabPanels.forEach(panel => {
          const isActive = panel.id === `tab-${tabName}`;
          panel.classList.toggle('active', isActive);
        });

        // Refresh styles tab when it becomes active to ensure proper initialization
        if (tabName === 'styles') {
          updateStylesTab(true);
        }
      });
    });
  }

  private setupCollapsiblePanels(): void {
    // Handle options panels (including Info panel)
    const optionsPanels = document.querySelectorAll('.panel-options, .panel-info');

    optionsPanels.forEach(panel => {
      const header = panel.querySelector('.panel-header.collapsible');
      if (header) {
        header.addEventListener('click', () => {
          panel.classList.toggle('collapsed');
        });

        // Info and Output panels start expanded, others start collapsed
        const panelName = panel.getAttribute('data-panel');
        if (panelName !== 'output' && panelName !== 'info') {
          panel.classList.add('collapsed');
        }
      }
    });

    // Handle preview panel
    const previewPanel = document.querySelector('.panel-preview');
    const filesPanel = document.querySelector('.panel-files');
    if (previewPanel) {
      const header = previewPanel.querySelector('.panel-header.collapsible');
      if (header) {
        header.addEventListener('click', () => {
          previewPanel.classList.toggle('collapsed');
          // When preview is collapsed, files panel should expand
          filesPanel?.classList.toggle('expanded', previewPanel.classList.contains('collapsed'));
        });
      }
    }
  }

  private setupResizers(): void {
    // Column resizers (horizontal dragging)
    const columnResizers = document.querySelectorAll('.column-resizer');
    columnResizers.forEach(resizer => {
      this.setupColumnResizer(resizer as HTMLElement);
    });

    // Panel resizers (vertical dragging)
    const panelResizers = document.querySelectorAll('.panel-resizer');
    panelResizers.forEach(resizer => {
      this.setupPanelResizer(resizer as HTMLElement);
    });
  }

  private setupColumnResizer(resizer: HTMLElement): void {
    const resizerType = resizer.dataset.resizer;
    let prevSibling: HTMLElement | null = null;
    let nextSibling: HTMLElement | null = null;

    // Get the columns on either side
    if (resizerType === 'input-editor') {
      prevSibling = document.querySelector('.column-input');
      nextSibling = document.querySelector('.column-editor');
    } else if (resizerType === 'editor-options') {
      prevSibling = document.querySelector('.column-editor');
      nextSibling = document.querySelector('.column-options');
    }

    if (!prevSibling || !nextSibling) return;

    let startX = 0;
    let startPrevWidth = 0;
    let startNextWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;

      // Calculate new widths
      const newPrevWidth = Math.max(200, startPrevWidth + dx);
      const newNextWidth = Math.max(200, startNextWidth - dx);

      prevSibling!.style.flex = `0 0 ${newPrevWidth}px`;
      nextSibling!.style.flex = resizerType === 'input-editor' ? '1' : `0 0 ${newNextWidth}px`;

      if (resizerType === 'editor-options') {
        nextSibling!.style.flex = `0 0 ${newNextWidth}px`;
      }
    };

    const onMouseUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      startX = e.clientX;
      startPrevWidth = prevSibling!.offsetWidth;
      startNextWidth = nextSibling!.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private setupPanelResizer(resizer: HTMLElement): void {
    const resizerType = resizer.dataset.resizer;
    let prevSibling: HTMLElement | null = null;
    let nextSibling: HTMLElement | null = null;

    if (resizerType === 'files-preview') {
      prevSibling = document.querySelector('.panel-files');
      nextSibling = document.querySelector('.panel-preview');
    }

    if (!prevSibling || !nextSibling) return;

    let startY = 0;
    let startPrevHeight = 0;
    let startNextHeight = 0;

    const onMouseMove = (e: MouseEvent) => {
      const dy = e.clientY - startY;

      // Calculate new heights
      const newPrevHeight = Math.max(100, startPrevHeight + dy);
      const newNextHeight = Math.max(50, startNextHeight - dy);

      prevSibling!.style.flex = `0 0 ${newPrevHeight}px`;
      prevSibling!.style.minHeight = `${newPrevHeight}px`;
      prevSibling!.style.maxHeight = 'none';
      nextSibling!.style.flex = `0 0 ${newNextHeight}px`;
      nextSibling!.style.minHeight = `${newNextHeight}px`;
      nextSibling!.style.maxHeight = 'none';
    };

    const onMouseUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      startY = e.clientY;
      startPrevHeight = prevSibling!.offsetHeight;
      startNextHeight = nextSibling!.offsetHeight;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private setupStateListeners(): void {
    // Reflow when requested
    appState.onReflowRequest(() => {
      this.performReflow();
    });

    // Keep the font service's custom-font registry in sync with project
    // files. Whenever the file list changes, register any new font files
    // and unregister fonts whose files have been removed.
    const registeredFontFiles = new Map<string, string>(); // fileId -> family
    appState.onProjectChange((project) => {
      this.updateDocumentInfo(project);

      const currentFontFiles = project.files.filter((f) => f.type === 'font');
      const seenIds = new Set<string>();
      for (const file of currentFontFiles) {
        seenIds.add(file.id);
        if (!registeredFontFiles.has(file.id)) {
          const family = fontService.registerCustomFont(file.name, file.content);
          registeredFontFiles.set(file.id, family);
        }
      }
      // Drop any fonts whose files were removed.
      for (const [fileId, family] of Array.from(registeredFontFiles.entries())) {
        if (!seenIds.has(fileId)) {
          fontService.unregisterCustomFont(family);
          registeredFontFiles.delete(fileId);
        }
      }
    });

    // Reflow when fonts finish loading (measurements may change)
    // Use a debounce to avoid multiple reflows if many fonts load in succession
    let fontReflowTimeout: number | null = null;
    googleFonts.onFontLoaded(() => {
      if (fontReflowTimeout) {
        clearTimeout(fontReflowTimeout);
      }
      fontReflowTimeout = window.setTimeout(() => {
        clearMeasurementCache();
        this.performReflow();
        fontReflowTimeout = null;
      }, 100);
    });

    // Listen for navigation requests
    window.addEventListener('navigate-to-page', ((e: CustomEvent<{ pageNumber: number }>) => {
      this.spreadEditor.navigateToPage(e.detail.pageNumber);
    }) as EventListener);
  }

  private performReflow(): void {
    // Always clear measurement cache to ensure fresh measurements with loaded fonts
    clearMeasurementCache();

    // Get all markdown files and concatenate their content in order
    const project = appState.getProject();
    const markdownFiles = project.files.filter(f => f.type === 'markdown');

    // Concatenate all markdown content with double newlines between files
    // (empty string if no markdown files - static spreads will still be processed)
    const combinedContent = markdownFiles.map(f => f.content).join('\n\n');

    // Perform text flow on combined content (also merges static spreads)
    const result = textFlowEngine.reflow(combinedContent);

    // Update project with flow result
    appState.updateProject({ signatures: result.signatures });

    // Update spread editor
    this.spreadEditor.render();

    // Update document info
    this.updateDocumentInfo(appState.getProject());
  }

  private updateDocumentInfo(project: BookletProject): void {
    const pageCount = project.signatures.reduce(
      (sum, sig) => sum + sig.pageCount,
      0
    );
    const spreadCount = project.signatures.reduce(
      (sum, sig) => sum + sig.spreads.length,
      0
    );
    const signatureCount = project.signatures.length;
    const sheetsPerSig = project.outputOptions.pagesPerSignature / 4;
    const sheetCount = signatureCount * sheetsPerSig;

    document.getElementById('info-pages')!.textContent = pageCount.toString();
    document.getElementById('info-spreads')!.textContent = spreadCount.toString();
    document.getElementById('info-signatures')!.textContent = signatureCount.toString();
    document.getElementById('info-sheets')!.textContent = sheetCount.toString();
  }
}

function stripExtension(name: string): string {
  return name.replace(/\.printfold$/i, '');
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
