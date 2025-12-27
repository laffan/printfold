/**
 * Main Application Component
 * Orchestrates all UI components and handles global interactions
 */

import { appState } from '../services/state';
import { env } from '../services/environment';
import { textFlowEngine, clearMeasurementCache } from '../services/textFlow';
import { googleFonts } from '../services/googleFonts';
import { FileList } from './FileList';
import { FilePreview } from './FilePreview';
import { SpreadEditor } from './SpreadEditor';
import { PDFPreview } from './PDFPreview';
import { OptionsPanel } from './OptionsPanel';
import { ZipHandler } from '../services/zipHandler';
import { PDFGenerator } from '../services/pdfGenerator';
import type { BookletProject } from '../types';

export class App {
  private fileList!: FileList;
  private filePreview!: FilePreview;
  private spreadEditor!: SpreadEditor;
  private pdfPreview!: PDFPreview;
  private optionsPanel!: OptionsPanel;
  private zipHandler!: ZipHandler;
  private pdfGenerator!: PDFGenerator;

  init(): void {
    // Initialize components
    this.fileList = new FileList();
    this.filePreview = new FilePreview();
    this.spreadEditor = new SpreadEditor();
    this.pdfPreview = new PDFPreview();
    this.optionsPanel = new OptionsPanel();
    this.zipHandler = new ZipHandler();
    this.pdfGenerator = new PDFGenerator();

    // Mount components
    this.fileList.mount();
    this.filePreview.mount();
    this.spreadEditor.mount();
    this.pdfPreview.mount();
    this.optionsPanel.mount();

    // Connect file list to preview
    this.fileList.setOnFileSelect((file) => {
      this.filePreview.showFile(file);
    });

    // Set up event listeners
    this.setupHeaderButtons();
    this.setupTabs();
    this.setupOptionsTabs();
    this.setupCollapsiblePanels();
    this.setupStateListeners();
    this.setupResizers();

    // Initial reflow if there's content
    this.performReflow();

    console.log('PrintFold initialized', env.isElectron ? '(Electron)' : '(Web)');
  }

  private setupHeaderButtons(): void {
    // New button
    document.getElementById('btn-new')?.addEventListener('click', () => {
      if (confirm('Create a new booklet? Unsaved changes will be lost.')) {
        appState.reset();
        this.performReflow();
      }
    });

    // Open button
    document.getElementById('btn-open')?.addEventListener('click', async () => {
      const files = await env.openFiles({
        filters: [
          { name: 'PrintFold Project', extensions: ['zip', 'json'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Supported', extensions: ['zip', 'json', 'md', 'png', 'jpg', 'jpeg', 'webp'] },
        ],
        multiple: true,
      });

      if (files) {
        for (const file of files) {
          if (file.type === 'archive') {
            await this.zipHandler.import(file.content);
          } else {
            appState.addFiles([file]);
          }
        }
      }
    });

    // Save button
    document.getElementById('btn-save')?.addEventListener('click', async () => {
      const zipContent = await this.zipHandler.export();
      await env.saveFile({
        defaultName: `${appState.getProject().name}.zip`,
        filters: [{ name: 'PrintFold Project', extensions: ['zip'] }],
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

    // Update document info when project changes
    appState.onProjectChange((project) => {
      this.updateDocumentInfo(project);
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
