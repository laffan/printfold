/**
 * PDF Generator Service
 * Generates print-ready PDFs using pdf-lib with booklet imposition
 */

import { PDFDocument, PDFPage, PDFImage, rgb, StandardFonts, PDFFont, degrees } from 'pdf-lib';
import { appState } from './state';
import { textFlowEngine } from './textFlow';
import type { Signature, PageContent, FontStyle, PageItem, TextPageItem, ShapePageItem, ImagePageItem } from '../types';
import { SHEET_SIZES, calculateSpreadRowsPerSheet } from '../types';

interface FontCache {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

export class PDFGenerator {
  private fontCache: FontCache | null = null;
  private imageCache: Map<string, PDFImage> = new Map();

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

    // Embed images used in static pages
    await this.embedImages(pdfDoc, project);

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

    // Calculate rows per sheet for cut marks
    const rowsPerSheet = calculateSpreadRowsPerSheet(
      sheetSize,
      pageHeight,
      project.outputOptions.fillAvailableSpace
    );

    // Add cut marks and fold indicators if there are pages
    if (project.signatures.length > 0) {
      this.addPrintMarks(pdfDoc, sheetSize, pageHeight, rowsPerSheet);
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

    // Calculate rows per sheet (for fill available space mode)
    const rowsPerSheet = calculateSpreadRowsPerSheet(
      sheetSize,
      pageHeight,
      project.outputOptions.fillAvailableSpace
    );

    // Group imposition sheets for multi-row layout
    for (let i = 0; i < imposition.length; i += rowsPerSheet) {
      const sheetsInGroup = imposition.slice(i, i + rowsPerSheet);

      // Front of combined sheet
      const frontPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      // Draw each row on the front
      sheetsInGroup.forEach((sheet, rowIndex) => {
        // Y position: start from top, work down
        const rowY = sheetSize.height - (rowIndex + 1) * pageHeight;

        const leftPageIndex = sheet.front.left - 1 - (signature.signatureNumber - 1) * signature.pageCount;
        const rightPageIndex = sheet.front.right - 1 - (signature.signatureNumber - 1) * signature.pageCount;

        if (leftPageIndex >= 0 && leftPageIndex < pages.length && pages[leftPageIndex]) {
          this.drawPage(frontPage, pages[leftPageIndex]!, 0, rowY, pageWidth, pageHeight, project, false);
        }

        if (rightPageIndex >= 0 && rightPageIndex < pages.length && pages[rightPageIndex]) {
          this.drawPage(frontPage, pages[rightPageIndex]!, pageWidth, rowY, pageWidth, pageHeight, project, true);
        }
      });

      // Back of combined sheet
      const backPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      // Draw each row on the back (same vertical positions, content is flipped for duplex)
      sheetsInGroup.forEach((sheet, rowIndex) => {
        const rowY = sheetSize.height - (rowIndex + 1) * pageHeight;

        const backLeftIndex = sheet.back.left - 1 - (signature.signatureNumber - 1) * signature.pageCount;
        const backRightIndex = sheet.back.right - 1 - (signature.signatureNumber - 1) * signature.pageCount;

        if (backLeftIndex >= 0 && backLeftIndex < pages.length && pages[backLeftIndex]) {
          this.drawPage(backPage, pages[backLeftIndex]!, 0, rowY, pageWidth, pageHeight, project, true);
        }

        if (backRightIndex >= 0 && backRightIndex < pages.length && pages[backRightIndex]) {
          this.drawPage(backPage, pages[backRightIndex]!, pageWidth, rowY, pageWidth, pageHeight, project, false);
        }
      });
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

    // For blank/static pages, draw items but skip regular content
    if (pageContent.isBlank || pageContent.isStatic) {
      if (pageContent.items && pageContent.items.length > 0) {
        this.drawPageItems(pdfPage, pageContent.items, x, y, width, height);
      }
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
    sheetSize: { width: number; height: number },
    pageHeight: number,
    rowsPerSheet: number
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

      // Horizontal cut marks for multi-row layouts
      if (rowsPerSheet > 1) {
        for (let row = 1; row < rowsPerSheet; row++) {
          const cutY = sheetSize.height - row * pageHeight;

          // Left side cut mark
          page.drawLine({
            start: { x: markOffset, y: cutY },
            end: { x: markOffset + markLength, y: cutY },
            thickness: lineWidth,
            color: markColor,
          });

          // Right side cut mark
          page.drawLine({
            start: { x: sheetSize.width - markOffset, y: cutY },
            end: { x: sheetSize.width - markOffset - markLength, y: cutY },
            thickness: lineWidth,
            color: markColor,
          });

          // Center cut mark (at fold line)
          page.drawLine({
            start: { x: centerX - markLength / 2, y: cutY },
            end: { x: centerX + markLength / 2, y: cutY },
            thickness: lineWidth,
            color: markColor,
          });
        }
      }
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

  /**
   * Draw page items (shapes, text) on a static/blank page
   */
  private drawPageItems(
    pdfPage: PDFPage,
    items: PageItem[],
    pageX: number,
    pageY: number,
    pageWidth: number,
    pageHeight: number
  ): void {
    for (const item of items) {
      const opacity = item.opacity ?? 1;

      // Convert from top-left origin to PDF bottom-left origin
      // Item y is from top of page, PDF y is from bottom
      const itemPdfY = pageY + pageHeight - item.y - item.height;

      if (item.type === 'text') {
        const textItem = item as TextPageItem;
        const font = this.getTextItemFont(textItem);
        const color = this.parseColor(textItem.color);

        // Draw text (PDF text draws from baseline, adjust for that)
        const textY = itemPdfY + item.height - textItem.fontSize;

        pdfPage.drawText(this.sanitizeText(textItem.content), {
          x: pageX + item.x,
          y: textY,
          size: textItem.fontSize,
          font,
          color,
          opacity,
        });
      } else if (item.type === 'shape') {
        const shapeItem = item as ShapePageItem;
        const fillColor = shapeItem.fillColor ? this.parseColor(shapeItem.fillColor) : undefined;
        const strokeColor = shapeItem.strokeColor ? this.parseColor(shapeItem.strokeColor) : rgb(0, 0, 0);
        const strokeWidth = shapeItem.strokeWidth ?? 1;

        if (shapeItem.shapeType === 'rectangle') {
          pdfPage.drawRectangle({
            x: pageX + item.x,
            y: itemPdfY,
            width: item.width,
            height: item.height,
            color: fillColor,
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            opacity,
            rotate: item.rotation ? degrees(item.rotation) : undefined,
          });
        } else if (shapeItem.shapeType === 'ellipse') {
          // pdf-lib doesn't have native ellipse, approximate with a scaled circle path
          // For now, draw as a rectangle with note - proper ellipse would need custom path
          const centerX = pageX + item.x + item.width / 2;
          const centerY = itemPdfY + item.height / 2;

          // Draw ellipse using the ellipse method
          pdfPage.drawEllipse({
            x: centerX,
            y: centerY,
            xScale: item.width / 2,
            yScale: item.height / 2,
            color: fillColor,
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            opacity,
          });
        } else if (shapeItem.shapeType === 'circle') {
          const radius = Math.min(item.width, item.height) / 2;
          const centerX = pageX + item.x + radius;
          const centerY = itemPdfY + radius;

          pdfPage.drawCircle({
            x: centerX,
            y: centerY,
            size: radius,
            color: fillColor,
            borderColor: strokeColor,
            borderWidth: strokeWidth,
            opacity,
          });
        } else if (shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow') {
          // Lines go from (x, y) to (x + width, y) with rotation
          const startX = pageX + item.x;
          const startY = itemPdfY + item.height / 2;
          const endX = startX + item.width;
          const endY = startY;

          pdfPage.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: strokeWidth,
            color: strokeColor,
            opacity,
          });

          // Draw arrowhead for arrow type
          if (shapeItem.shapeType === 'arrow') {
            const arrowSize = 8;
            // Simple arrowhead pointing right
            pdfPage.drawLine({
              start: { x: endX, y: endY },
              end: { x: endX - arrowSize, y: endY + arrowSize / 2 },
              thickness: strokeWidth,
              color: strokeColor,
              opacity,
            });
            pdfPage.drawLine({
              start: { x: endX, y: endY },
              end: { x: endX - arrowSize, y: endY - arrowSize / 2 },
              thickness: strokeWidth,
              color: strokeColor,
              opacity,
            });
          }
        }
      } else if (item.type === 'image') {
        const imageItem = item as ImagePageItem;
        const pdfImage = this.imageCache.get(imageItem.imageFileId);

        if (pdfImage) {
          pdfPage.drawImage(pdfImage, {
            x: pageX + item.x,
            y: itemPdfY,
            width: item.width,
            height: item.height,
            opacity,
            rotate: item.rotation ? degrees(item.rotation) : undefined,
          });
        }
      }
    }
  }

  /**
   * Embed all images used in static pages
   */
  private async embedImages(pdfDoc: PDFDocument, project: ReturnType<typeof appState.getProject>): Promise<void> {
    this.imageCache.clear();

    // Collect all image file IDs from static pages
    const imageFileIds = new Set<string>();
    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        const pages = [spread.verso, spread.recto].filter(Boolean);
        for (const page of pages) {
          if ((page?.isBlank || page?.isStatic) && page?.items) {
            for (const item of page.items) {
              if (item.type === 'image') {
                const imageItem = item as ImagePageItem;
                imageFileIds.add(imageItem.imageFileId);
              }
            }
          }
        }
      }
    }

    // Embed each image
    for (const fileId of imageFileIds) {
      const file = project.files.find(f => f.id === fileId);
      if (!file || file.type !== 'image' || !file.isBase64) continue;

      try {
        const imageData = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));

        // Try to embed as PNG first, then JPEG
        let pdfImage: PDFImage | null = null;
        try {
          pdfImage = await pdfDoc.embedPng(imageData);
        } catch {
          try {
            pdfImage = await pdfDoc.embedJpg(imageData);
          } catch {
            console.warn(`Failed to embed image: ${file.name}`);
          }
        }

        if (pdfImage) {
          this.imageCache.set(fileId, pdfImage);
        }
      } catch (error) {
        console.warn(`Error processing image ${file.name}:`, error);
      }
    }
  }

  /**
   * Get font for text item (simplified - uses standard fonts)
   */
  private getTextItemFont(textItem: TextPageItem): PDFFont {
    if (!this.fontCache) {
      throw new Error('Font cache not initialized');
    }

    if (textItem.fontWeight === 'bold' && textItem.fontStyle === 'italic') {
      return this.fontCache.boldItalic;
    }
    if (textItem.fontWeight === 'bold') {
      return this.fontCache.bold;
    }
    if (textItem.fontStyle === 'italic') {
      return this.fontCache.italic;
    }
    return this.fontCache.regular;
  }
}
