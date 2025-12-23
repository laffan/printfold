/**
 * PDFPreview Component
 * Displays a preview of the print-ready PDF output
 */

import { appState } from '../services/state';
import { PDFGenerator } from '../services/pdfGenerator';

export class PDFPreview {
  private container!: HTMLElement;
  private pdfGenerator: PDFGenerator;
  private currentPdfUrl: string | null = null;
  private isGenerating = false;

  constructor() {
    this.pdfGenerator = new PDFGenerator();
  }

  mount(): void {
    this.container = document.getElementById('pdf-preview-container')!;

    // Listen for reflow events to regenerate preview
    appState.onReflowRequest(() => {
      // Debounce PDF generation
      this.scheduleRefresh();
    });
  }

  private refreshTimeout: number | null = null;

  private scheduleRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = window.setTimeout(() => {
      // Only refresh if preview tab is active
      const activeTab = appState.getEditor().activeTab;
      if (activeTab === 'preview') {
        this.refresh();
      }
    }, 500);
  }

  async refresh(): Promise<void> {
    if (this.isGenerating) return;

    const project = appState.getProject();
    if (project.signatures.length === 0) {
      this.showPlaceholder('No content to preview');
      return;
    }

    this.isGenerating = true;
    this.showPlaceholder('Generating PDF preview...');

    try {
      const pdfBytes = await this.pdfGenerator.generate();

      // Revoke old URL
      if (this.currentPdfUrl) {
        URL.revokeObjectURL(this.currentPdfUrl);
      }

      // Create new blob URL
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      this.currentPdfUrl = URL.createObjectURL(blob);

      // Display PDF
      this.showPdf(this.currentPdfUrl);
    } catch (error) {
      console.error('PDF generation failed:', error);
      this.showPlaceholder('Failed to generate PDF preview');
    } finally {
      this.isGenerating = false;
    }
  }

  private showPlaceholder(message: string): void {
    this.container.innerHTML = `
      <div class="preview-placeholder">
        <p>${message}</p>
      </div>
    `;
  }

  private showPdf(url: string): void {
    this.container.innerHTML = `
      <iframe
        src="${url}"
        style="width: 100%; height: 100%; border: none; background: white;"
        title="PDF Preview"
      ></iframe>
    `;
  }

  destroy(): void {
    if (this.currentPdfUrl) {
      URL.revokeObjectURL(this.currentPdfUrl);
      this.currentPdfUrl = null;
    }
  }
}
