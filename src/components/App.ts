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
    this.setupCollapsiblePanels();
    this.setupStateListeners();

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

        // Trigger resize for canvas components
        if (tabName === 'editor') {
          this.spreadEditor.resize();
        } else if (tabName === 'preview') {
          this.pdfPreview.refresh();
        }
      });
    });
  }

  private setupCollapsiblePanels(): void {
    const panels = document.querySelectorAll('.panel-options');

    panels.forEach(panel => {
      const header = panel.querySelector('.panel-header.collapsible');
      if (header) {
        header.addEventListener('click', () => {
          panel.classList.toggle('collapsed');
        });

        // Start expanded for first panel
        const panelName = panel.getAttribute('data-panel');
        if (panelName !== 'output') {
          panel.classList.add('collapsed');
        }
      }
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
      console.log('[App] Font loaded, scheduling cache clear and reflow');
      if (fontReflowTimeout) {
        clearTimeout(fontReflowTimeout);
      }
      fontReflowTimeout = window.setTimeout(() => {
        console.log('[App] Executing font load reflow');
        clearMeasurementCache();
        this.performReflow();
        fontReflowTimeout = null;
      }, 100);
    });
  }

  private performReflow(): void {
    console.log('[App] performReflow called');

    // Always clear measurement cache to ensure fresh measurements with loaded fonts
    clearMeasurementCache();

    const mainDoc = appState.getMainDocument();
    if (!mainDoc) {
      console.log('[App] No main document, clearing');
      // Clear everything
      appState.updateProject({ signatures: [] });
      this.spreadEditor.render();
      this.updateDocumentInfo(appState.getProject());
      return;
    }

    console.log('[App] Performing text flow with margins:', appState.getProject().layoutOptions.margins);
    // Perform text flow
    const result = textFlowEngine.reflow(mainDoc.content);

    console.log('[App] Reflow complete, pages:', result.totalPages);
    console.log('[App] First page sections:', result.signatures[0]?.spreads[0]?.verso?.sections?.length || 0);

    // Update project with flow result
    appState.updateProject({ signatures: result.signatures });

    // Verify signatures were stored
    const storedSigs = appState.getProject().signatures;
    console.log('[App] Stored signatures count:', storedSigs.length);

    // Update spread editor
    console.log('[App] Calling spreadEditor.render()');
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
