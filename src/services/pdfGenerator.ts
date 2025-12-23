/**
 * PDF Generator Service
 * Generates print-ready PDFs using pdf-lib with booklet imposition
 */

import { PDFDocument, PDFPage, rgb, StandardFonts, PDFFont, degrees } from 'pdf-lib';
import { appState } from './state';
import { textFlowEngine } from './textFlow';
import type { Signature, PageContent, FontStyle } from '../types';
import { SHEET_SIZES } from '../types';

interface FontCache {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

export class PDFGenerator {
  private fontCache: FontCache | null = null;

  /**
   * Sanitize text for WinAnsi encoding (removes emojis and non-Latin characters)
   */
  private sanitizeText(text: string): string {
    // Replace common special characters with ASCII equivalents
    let sanitized = text
      .replace(/[\u2018\u2019]/g, "'") // Smart quotes
      .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
      .replace(/\u2014/g, '--') // Em dash
      .replace(/\u2013/g, '-') // En dash
      .replace(/\u2026/g, '...') // Ellipsis
      .replace(/\u00A0/g, ' '); // Non-breaking space

    // Remove any characters outside the WinAnsi range (keep only printable ASCII and Latin-1)
    // WinAnsi supports: 0x20-0x7E (basic ASCII) and 0xA0-0xFF (Latin-1 supplement)
    sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

    return sanitized;
  }

  /**
   * Generate a print-ready PDF
   */
  async generate(): Promise<Uint8Array> {
    const project = appState.getProject();
    const pdfDoc = await PDFDocument.create();

    // Embed fonts
    this.fontCache = {
      regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
      mono: await pdfDoc.embedFont(StandardFonts.Courier),
    };

    // Get sheet dimensions
    const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];

    // Calculate page dimensions based on booklet size
    let pageWidth: number;
    let pageHeight: number;

    if (project.outputOptions.bookletSize === 'custom') {
      pageWidth = project.outputOptions.customWidth || sheetSize.width / 2;
      pageHeight = project.outputOptions.customHeight || sheetSize.height;
    } else if (project.outputOptions.bookletSize.startsWith('quarter-')) {
      pageWidth = sheetSize.width / 2;
      pageHeight = sheetSize.height / 2;
    } else {
      pageWidth = sheetSize.width / 2;
      pageHeight = sheetSize.height;
    }

    // Generate imposed pages for each signature
    for (const signature of project.signatures) {
      await this.generateSignatureSheets(pdfDoc, signature, sheetSize, pageWidth, pageHeight);
    }

    // Add cut marks and fold indicators if there are pages
    if (project.signatures.length > 0) {
      this.addPrintMarks(pdfDoc, sheetSize);
    }

    return pdfDoc.save();
  }

  /**
   * Generate imposition sheets for a signature
   */
  private async generateSignatureSheets(
    pdfDoc: PDFDocument,
    signature: Signature,
    sheetSize: { width: number; height: number },
    pageWidth: number,
    pageHeight: number
  ): Promise<void> {
    const project = appState.getProject();
    const imposition = textFlowEngine.calculateImposition(signature);

    // Get all pages from spreads
    const pages: (PageContent | null)[] = [];
    for (const spread of signature.spreads) {
      pages.push(spread.verso);
      pages.push(spread.recto);
    }

    // Generate each sheet (front and back)
    for (const sheet of imposition) {
      // Front of sheet
      const frontPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      // Draw left page (rotated 180° for booklet fold)
      const leftPageIndex = sheet.front.left - 1 - (signature.signatureNumber - 1) * signature.pageCount;
      const rightPageIndex = sheet.front.right - 1 - (signature.signatureNumber - 1) * signature.pageCount;

      if (leftPageIndex >= 0 && leftPageIndex < pages.length && pages[leftPageIndex]) {
        this.drawPage(frontPage, pages[leftPageIndex]!, 0, 0, pageWidth, pageHeight, project, false);
      }

      if (rightPageIndex >= 0 && rightPageIndex < pages.length && pages[rightPageIndex]) {
        this.drawPage(frontPage, pages[rightPageIndex]!, pageWidth, 0, pageWidth, pageHeight, project, true);
      }

      // Back of sheet
      const backPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      const backLeftIndex = sheet.back.left - 1 - (signature.signatureNumber - 1) * signature.pageCount;
      const backRightIndex = sheet.back.right - 1 - (signature.signatureNumber - 1) * signature.pageCount;

      if (backLeftIndex >= 0 && backLeftIndex < pages.length && pages[backLeftIndex]) {
        this.drawPage(backPage, pages[backLeftIndex]!, 0, 0, pageWidth, pageHeight, project, true);
      }

      if (backRightIndex >= 0 && backRightIndex < pages.length && pages[backRightIndex]) {
        this.drawPage(backPage, pages[backRightIndex]!, pageWidth, 0, pageWidth, pageHeight, project, false);
      }
    }
  }

  /**
   * Draw a single page content onto the PDF page
   */
  private drawPage(
    pdfPage: PDFPage,
    pageContent: PageContent,
    x: number,
    y: number,
    width: number,
    height: number,
    project: ReturnType<typeof appState.getProject>,
    isRecto: boolean
  ): void {
    const { headerFooter, layoutOptions, fontOptions } = project;
    const margins = layoutOptions.margins;

    // Calculate content area
    const innerMargin = isRecto ? margins.inner : margins.outer;
    const outerMargin = isRecto ? margins.outer : margins.inner;
    const headerHeight = headerFooter.header.enabled ? headerFooter.header.height : 0;
    const footerHeight = headerFooter.footer.enabled ? headerFooter.footer.height : 0;

    const contentX = x + innerMargin;
    const contentY = y + margins.bottom + footerHeight;
    const contentWidth = width - innerMargin - outerMargin;
    const contentHeight = height - margins.top - margins.bottom - headerHeight - footerHeight;

    if (pageContent.isBlank) {
      // Don't draw anything for blank pages
      return;
    }

    // Draw content
    let currentY = y + height - margins.top - headerHeight;

    for (const section of pageContent.sections) {
      const fontStyle = this.getFontStyleForSection(section.type, section.level, fontOptions);
      const font = this.getFont(fontStyle);
      const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

      // Add spacing before headings
      if (section.type === 'heading') {
        switch (section.level) {
          case 1:
            currentY -= layoutOptions.spacingAboveH1;
            break;
          case 2:
            currentY -= layoutOptions.spacingAboveH2;
            break;
          case 3:
            currentY -= layoutOptions.spacingAboveH3;
            break;
        }
      }

      // Handle images
      if (section.type === 'image') {
        // Draw placeholder rectangle
        const placeholderHeight = 100;
        pdfPage.drawRectangle({
          x: contentX,
          y: currentY - placeholderHeight,
          width: Math.min(contentWidth, 200),
          height: placeholderHeight,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
        });

        pdfPage.drawText(this.sanitizeText(`[Image: ${section.imageRef || 'unknown'}]`), {
          x: contentX + 10,
          y: currentY - placeholderHeight / 2,
          size: 10,
          font: this.fontCache!.regular,
          color: rgb(0.6, 0.6, 0.6),
        });

        currentY -= placeholderHeight + 10;
        continue;
      }

      // Draw text lines
      const lines = (section as { lines?: string[] }).lines || [section.content];

      for (const line of lines) {
        if (currentY < contentY) break;

        pdfPage.drawText(this.sanitizeText(line), {
          x: contentX,
          y: currentY - fontStyle.fontSize,
          size: fontStyle.fontSize,
          font,
          color: this.parseColor(fontStyle.color),
        });

        currentY -= lineHeight;
      }

      // Add paragraph spacing
      currentY -= layoutOptions.paragraphSpacing;
    }

    // Draw footer
    if (headerFooter.footer.enabled) {
      const footerY = y + margins.bottom;
      const footerContent = isRecto ? headerFooter.footer.recto : headerFooter.footer.verso;
      const footerFont = this.fontCache!.regular;
      const footerSize = headerFooter.footer.font.fontSize;

      // Replace placeholders
      const pageNumStr = pageContent.pageNumber.toString();

      if (footerContent.left) {
        const text = this.sanitizeText(footerContent.left.replace('{{pageNumber}}', pageNumStr));
        pdfPage.drawText(text, {
          x: contentX,
          y: footerY,
          size: footerSize,
          font: footerFont,
          color: rgb(0, 0, 0),
        });
      }

      if (footerContent.center) {
        const text = this.sanitizeText(footerContent.center.replace('{{pageNumber}}', pageNumStr));
        const textWidth = footerFont.widthOfTextAtSize(text, footerSize);
        pdfPage.drawText(text, {
          x: x + width / 2 - textWidth / 2,
          y: footerY,
          size: footerSize,
          font: footerFont,
          color: rgb(0, 0, 0),
        });
      }

      if (footerContent.right) {
        const text = this.sanitizeText(footerContent.right.replace('{{pageNumber}}', pageNumStr));
        const textWidth = footerFont.widthOfTextAtSize(text, footerSize);
        pdfPage.drawText(text, {
          x: x + width - outerMargin - textWidth,
          y: footerY,
          size: footerSize,
          font: footerFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Draw header
    if (headerFooter.header.enabled) {
      const headerY = y + height - margins.top;
      const headerContent = isRecto ? headerFooter.header.recto : headerFooter.header.verso;
      const headerFont = this.fontCache!.regular;
      const headerSize = headerFooter.header.font.fontSize;

      const pageNumStr = pageContent.pageNumber.toString();

      if (headerContent.left) {
        const text = this.sanitizeText(headerContent.left.replace('{{pageNumber}}', pageNumStr));
        pdfPage.drawText(text, {
          x: contentX,
          y: headerY,
          size: headerSize,
          font: headerFont,
          color: rgb(0, 0, 0),
        });
      }

      if (headerContent.center) {
        const text = this.sanitizeText(headerContent.center.replace('{{pageNumber}}', pageNumStr));
        const textWidth = headerFont.widthOfTextAtSize(text, headerSize);
        pdfPage.drawText(text, {
          x: x + width / 2 - textWidth / 2,
          y: headerY,
          size: headerSize,
          font: headerFont,
          color: rgb(0, 0, 0),
        });
      }

      if (headerContent.right) {
        const text = this.sanitizeText(headerContent.right.replace('{{pageNumber}}', pageNumStr));
        const textWidth = headerFont.widthOfTextAtSize(text, headerSize);
        pdfPage.drawText(text, {
          x: x + width - outerMargin - textWidth,
          y: headerY,
          size: headerSize,
          font: headerFont,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  /**
   * Add cut marks and fold indicators
   */
  private addPrintMarks(
    pdfDoc: PDFDocument,
    sheetSize: { width: number; height: number }
  ): void {
    const markLength = 18; // 0.25 inch
    const markOffset = 9; // Distance from edge

    for (const page of pdfDoc.getPages()) {
      // Draw cut marks at corners
      const markColor = rgb(0, 0, 0);
      const lineWidth = 0.5;

      // Top-left corner
      page.drawLine({
        start: { x: markOffset, y: sheetSize.height - markOffset },
        end: { x: markOffset, y: sheetSize.height - markOffset - markLength },
        thickness: lineWidth,
        color: markColor,
      });
      page.drawLine({
        start: { x: markOffset, y: sheetSize.height - markOffset },
        end: { x: markOffset + markLength, y: sheetSize.height - markOffset },
        thickness: lineWidth,
        color: markColor,
      });

      // Top-right corner
      page.drawLine({
        start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
        end: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset - markLength },
        thickness: lineWidth,
        color: markColor,
      });
      page.drawLine({
        start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
        end: { x: sheetSize.width - markOffset - markLength, y: sheetSize.height - markOffset },
        thickness: lineWidth,
        color: markColor,
      });

      // Bottom-left corner
      page.drawLine({
        start: { x: markOffset, y: markOffset },
        end: { x: markOffset, y: markOffset + markLength },
        thickness: lineWidth,
        color: markColor,
      });
      page.drawLine({
        start: { x: markOffset, y: markOffset },
        end: { x: markOffset + markLength, y: markOffset },
        thickness: lineWidth,
        color: markColor,
      });

      // Bottom-right corner
      page.drawLine({
        start: { x: sheetSize.width - markOffset, y: markOffset },
        end: { x: sheetSize.width - markOffset, y: markOffset + markLength },
        thickness: lineWidth,
        color: markColor,
      });
      page.drawLine({
        start: { x: sheetSize.width - markOffset, y: markOffset },
        end: { x: sheetSize.width - markOffset - markLength, y: markOffset },
        thickness: lineWidth,
        color: markColor,
      });

      // Center fold mark (top and bottom)
      const centerX = sheetSize.width / 2;
      page.drawLine({
        start: { x: centerX, y: sheetSize.height - markOffset },
        end: { x: centerX, y: sheetSize.height - markOffset - markLength },
        thickness: lineWidth,
        color: markColor,
      });
      page.drawLine({
        start: { x: centerX, y: markOffset },
        end: { x: centerX, y: markOffset + markLength },
        thickness: lineWidth,
        color: markColor,
      });
    }
  }

  private getFontStyleForSection(type: string, level: number | undefined, fontOptions: ReturnType<typeof appState.getProject>['fontOptions']): FontStyle {
    switch (type) {
      case 'heading':
        return fontOptions[`h${level || 1}` as keyof typeof fontOptions] as FontStyle;
      case 'code':
        return fontOptions.code;
      case 'blockquote':
        return fontOptions.blockquote;
      default:
        return fontOptions.body;
    }
  }

  private getFont(style: FontStyle): PDFFont {
    if (!this.fontCache) {
      throw new Error('Font cache not initialized');
    }

    if (style.fontFamily.includes('mono') || style.fontFamily.includes('Menlo') || style.fontFamily.includes('Courier')) {
      return this.fontCache.mono;
    }

    if (style.fontWeight === 'bold' && style.fontStyle === 'italic') {
      return this.fontCache.boldItalic;
    }
    if (style.fontWeight === 'bold') {
      return this.fontCache.bold;
    }
    if (style.fontStyle === 'italic') {
      return this.fontCache.italic;
    }
    return this.fontCache.regular;
  }

  private parseColor(colorStr: string): ReturnType<typeof rgb> {
    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return rgb(r, g, b);
    }
    return rgb(0, 0, 0);
  }
}
