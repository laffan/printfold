/**
 * PDF Generator Service
 * Generates print-ready PDFs using pdf-lib with booklet imposition
 */

import { PDFDocument, PDFPage, PDFImage, rgb, StandardFonts } from 'pdf-lib';
import { appState } from '../state';
import { textFlowEngine } from '../textFlow';
import type { Signature, Spread, PageContent, PageItem, SpanningItem } from '../../types';
import { SHEET_SIZES, calculateSpreadRowsPerSheet } from '../../types';
import type { FontCache, ImageCacheType, RenderedPageCacheType } from './types';
import { sanitizeText } from './textUtils';
import { parseColor } from './colors';
import { getFontStyleForSection, getFont } from './fonts';
import { embedImages, preRenderStaticPages } from './images';
import { addPrintMarks } from './printMarks';
import { drawPageItemsClipped, spanningItemToPageItem } from './itemDrawing';

export class PDFGenerator {
  private fontCache: FontCache | null = null;
  private imageCache: ImageCacheType = new Map();
  private renderedPageCache: RenderedPageCacheType = new Map();

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
    await embedImages(pdfDoc, project, this.imageCache);

    // Pre-render static/blank pages as high-res images for gradient/pattern/font support
    await preRenderStaticPages(pdfDoc, project, this.renderedPageCache);

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
      addPrintMarks(pdfDoc, sheetSize, pageHeight, rowsPerSheet);
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
    const staticSpreads = project.staticSpreads || [];

    // Get all pages from spreads with their spread info
    const pages: (PageContent | null)[] = [];
    const spreadForPage: Map<number, { spread: Spread; staticSpread?: import('../../types').StaticSpread }> = new Map();

    for (const spread of signature.spreads) {
      const staticSpread = staticSpreads.find(s => s.id === spread.id);

      if (spread.verso) {
        spreadForPage.set(spread.verso.pageNumber, { spread, staticSpread });
      }
      if (spread.recto) {
        spreadForPage.set(spread.recto.pageNumber, { spread, staticSpread });
      }
      pages.push(spread.verso);
      pages.push(spread.recto);
    }

    const rowsPerSheet = calculateSpreadRowsPerSheet(
      sheetSize,
      pageHeight,
      project.outputOptions.fillAvailableSpace
    );

    const basePageOffset = (signature.signatureNumber - 1) * signature.pageCount;
    const pageNumberToIndex = (impositionPageNum: number): number => {
      const localPageNum = impositionPageNum - basePageOffset;
      if (localPageNum === signature.pageCount) {
        return 0;
      }
      return localPageNum;
    };

    // Group imposition sheets for multi-row layout
    for (let i = 0; i < imposition.length; i += rowsPerSheet) {
      const sheetsInGroup = imposition.slice(i, i + rowsPerSheet);

      // Front of combined sheet
      const frontPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      sheetsInGroup.forEach((sheet, rowIndex) => {
        const rowY = sheetSize.height - (rowIndex + 1) * pageHeight;

        const leftPageIndex = pageNumberToIndex(sheet.front.left);
        const rightPageIndex = pageNumberToIndex(sheet.front.right);

        const leftPage = leftPageIndex >= 0 && leftPageIndex < pages.length ? pages[leftPageIndex] : null;
        const rightPage = rightPageIndex >= 0 && rightPageIndex < pages.length ? pages[rightPageIndex] : null;

        if (leftPage) {
          const info = spreadForPage.get(leftPage.pageNumber);
          const adjacentPage = leftPage.isRecto ? info?.spread.verso : info?.spread.recto;
          const spanningItems = info?.staticSpread?.spanningItems;
          this.drawPage(frontPage, leftPage, 0, rowY, pageWidth, pageHeight, project, leftPage.isRecto, adjacentPage, spanningItems);
        }

        if (rightPage) {
          const info = spreadForPage.get(rightPage.pageNumber);
          const adjacentPage = rightPage.isRecto ? info?.spread.verso : info?.spread.recto;
          const spanningItems = info?.staticSpread?.spanningItems;
          this.drawPage(frontPage, rightPage, pageWidth, rowY, pageWidth, pageHeight, project, rightPage.isRecto, adjacentPage, spanningItems);
        }
      });

      // Back of combined sheet
      const backPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      sheetsInGroup.forEach((sheet, rowIndex) => {
        const rowY = sheetSize.height - (rowIndex + 1) * pageHeight;

        const backLeftIndex = pageNumberToIndex(sheet.back.left);
        const backRightIndex = pageNumberToIndex(sheet.back.right);

        const leftPage = backLeftIndex >= 0 && backLeftIndex < pages.length ? pages[backLeftIndex] : null;
        const rightPage = backRightIndex >= 0 && backRightIndex < pages.length ? pages[backRightIndex] : null;

        if (leftPage) {
          const info = spreadForPage.get(leftPage.pageNumber);
          const adjacentPage = leftPage.isRecto ? info?.spread.verso : info?.spread.recto;
          const spanningItems = info?.staticSpread?.spanningItems;
          this.drawPage(backPage, leftPage, 0, rowY, pageWidth, pageHeight, project, leftPage.isRecto, adjacentPage, spanningItems);
        }

        if (rightPage) {
          const info = spreadForPage.get(rightPage.pageNumber);
          const adjacentPage = rightPage.isRecto ? info?.spread.verso : info?.spread.recto;
          const spanningItems = info?.staticSpread?.spanningItems;
          this.drawPage(backPage, rightPage, pageWidth, rowY, pageWidth, pageHeight, project, rightPage.isRecto, adjacentPage, spanningItems);
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
    isRecto: boolean,
    adjacentPage?: PageContent | null,
    spreadSpanningItems?: SpanningItem[]
  ): void {
    if (!this.fontCache) return;

    const { headerFooter, layoutOptions, fontOptions } = project;
    const margins = layoutOptions.margins;

    const innerMargin = isRecto ? margins.inner : margins.outer;
    const outerMargin = isRecto ? margins.outer : margins.inner;
    const headerHeight = headerFooter.header.enabled ? headerFooter.header.height : 0;
    const footerHeight = headerFooter.footer.enabled ? headerFooter.footer.height : 0;

    const contentX = x + innerMargin;
    const contentY = y + margins.bottom + footerHeight;
    const contentWidth = width - innerMargin - outerMargin;
    const contentHeight = height - margins.top - margins.bottom - headerHeight - footerHeight;

    const hasItems = pageContent.items && pageContent.items.length > 0;
    const hasBackground = !!pageContent.backgroundFill;
    // A page is a text page if its pageState is 'text' - these pages need text content rendered
    const isTextPage = pageContent.pageState === 'text';
    // Check for static/available pages using pageState (prefer) or deprecated flags (fallback)
    const isStaticOrAvailable = pageContent.pageState === 'static' ||
                                 pageContent.pageState === 'available' ||
                                 pageContent.isBlank || pageContent.isStatic;

    // For static/blank pages with items or background, use pre-rendered image if available
    if (!isTextPage && (hasItems || hasBackground || isStaticOrAvailable)) {
      const preRenderedImage = this.renderedPageCache.get(pageContent.pageNumber);
      if (preRenderedImage) {
        pdfPage.drawImage(preRenderedImage, { x, y, width, height });
        // Still render crossing items from adjacent pages after the pre-rendered image
        this.drawCrossingItems(pdfPage, adjacentPage, x, y, width, height, isRecto);
        this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
        return;
      }

      // Fallback: draw items directly for static/blank pages
      if (pageContent.items && pageContent.items.length > 0) {
        drawPageItemsClipped(pdfPage, pageContent.items, x, y, width, height, 0, width, this.fontCache, this.imageCache);
      }
      this.drawCrossingItems(pdfPage, adjacentPage, x, y, width, height, isRecto);
      this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
      return;
    }

    // Draw content
    let currentY = y + height - margins.top - headerHeight;

    for (const section of pageContent.sections) {
      const fontStyle = getFontStyleForSection(section.type, section.level, fontOptions);
      const font = getFont(fontStyle, this.fontCache);
      const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

      if (section.type === 'heading') {
        switch (section.level) {
          case 1: currentY -= layoutOptions.spacingAboveH1; break;
          case 2: currentY -= layoutOptions.spacingAboveH2; break;
          case 3: currentY -= layoutOptions.spacingAboveH3; break;
        }
      }

      if (section.type === 'image') {
        const placeholderHeight = 100;
        pdfPage.drawRectangle({
          x: contentX,
          y: currentY - placeholderHeight,
          width: Math.min(contentWidth, 200),
          height: placeholderHeight,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
        });

        pdfPage.drawText(sanitizeText(`[Image: ${section.imageRef || 'unknown'}]`), {
          x: contentX + 10,
          y: currentY - placeholderHeight / 2,
          size: 10,
          font: this.fontCache.regular,
          color: rgb(0.6, 0.6, 0.6),
        });

        currentY -= placeholderHeight + 10;
        continue;
      }

      const lines = (section as { lines?: string[] }).lines || [section.content];

      for (const line of lines) {
        if (currentY < contentY) break;

        pdfPage.drawText(sanitizeText(line), {
          x: contentX,
          y: currentY - fontStyle.fontSize,
          size: fontStyle.fontSize,
          font,
          color: parseColor(fontStyle.color),
        });

        currentY -= lineHeight;
      }

      currentY -= layoutOptions.paragraphSpacing;
    }

    // Draw footer
    if (headerFooter.footer.enabled) {
      const footerY = y + margins.bottom;
      const footerContent = isRecto ? headerFooter.footer.recto : headerFooter.footer.verso;
      const footerFont = this.fontCache.regular;
      const footerSize = headerFooter.footer.font.fontSize;
      const pageNumStr = pageContent.pageNumber.toString();

      if (footerContent.left) {
        const text = sanitizeText(footerContent.left.replace('{{pageNumber}}', pageNumStr));
        pdfPage.drawText(text, { x: contentX, y: footerY, size: footerSize, font: footerFont, color: rgb(0, 0, 0) });
      }

      if (footerContent.center) {
        const text = sanitizeText(footerContent.center.replace('{{pageNumber}}', pageNumStr));
        const textWidth = footerFont.widthOfTextAtSize(text, footerSize);
        pdfPage.drawText(text, { x: x + width / 2 - textWidth / 2, y: footerY, size: footerSize, font: footerFont, color: rgb(0, 0, 0) });
      }

      if (footerContent.right) {
        const text = sanitizeText(footerContent.right.replace('{{pageNumber}}', pageNumStr));
        const textWidth = footerFont.widthOfTextAtSize(text, footerSize);
        pdfPage.drawText(text, { x: x + width - outerMargin - textWidth, y: footerY, size: footerSize, font: footerFont, color: rgb(0, 0, 0) });
      }
    }

    // Draw header
    if (headerFooter.header.enabled) {
      const headerY = y + height - margins.top;
      const headerContent = isRecto ? headerFooter.header.recto : headerFooter.header.verso;
      const headerFont = this.fontCache.regular;
      const headerSize = headerFooter.header.font.fontSize;
      const pageNumStr = pageContent.pageNumber.toString();

      if (headerContent.left) {
        const text = sanitizeText(headerContent.left.replace('{{pageNumber}}', pageNumStr));
        pdfPage.drawText(text, { x: contentX, y: headerY, size: headerSize, font: headerFont, color: rgb(0, 0, 0) });
      }

      if (headerContent.center) {
        const text = sanitizeText(headerContent.center.replace('{{pageNumber}}', pageNumStr));
        const textWidth = headerFont.widthOfTextAtSize(text, headerSize);
        pdfPage.drawText(text, { x: x + width / 2 - textWidth / 2, y: headerY, size: headerSize, font: headerFont, color: rgb(0, 0, 0) });
      }

      if (headerContent.right) {
        const text = sanitizeText(headerContent.right.replace('{{pageNumber}}', pageNumStr));
        const textWidth = headerFont.widthOfTextAtSize(text, headerSize);
        pdfPage.drawText(text, { x: x + width - outerMargin - textWidth, y: headerY, size: headerSize, font: headerFont, color: rgb(0, 0, 0) });
      }
    }

    // Draw items on top of text content (for text pages with items)
    if (hasItems) {
      drawPageItemsClipped(pdfPage, pageContent.items!, x, y, width, height, 0, width, this.fontCache, this.imageCache);
    }

    // Draw crossing items from adjacent pages
    this.drawCrossingItems(pdfPage, adjacentPage, x, y, width, height, isRecto);

    // Draw spanning items
    this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
  }

  /**
   * Draw items from adjacent page that cross into this page
   */
  private drawCrossingItems(
    pdfPage: PDFPage,
    adjacentPage: PageContent | null | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
    isRecto: boolean
  ): void {
    if (!adjacentPage?.items || adjacentPage.items.length === 0 || !this.fontCache) return;

    const crossingItems = adjacentPage.items.filter(item => {
      if (isRecto) {
        // This is recto, adjacent is verso - items extending right past verso boundary
        return item.x + item.width > width;
      } else {
        // This is verso, adjacent is recto - items with negative x extending left
        return item.x < 0;
      }
    });

    if (crossingItems.length > 0) {
      const offsetX = isRecto ? -width : width;
      drawPageItemsClipped(pdfPage, crossingItems, x, y, width, height, offsetX, width, this.fontCache, this.imageCache);
    }
  }

  /**
   * Draw spanning items that bridge across the spread
   */
  private drawSpanningItems(
    pdfPage: PDFPage,
    spreadSpanningItems: SpanningItem[] | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
    isRecto: boolean
  ): void {
    if (!spreadSpanningItems || spreadSpanningItems.length === 0 || !this.fontCache) return;

    const spanningPageItems = spreadSpanningItems.map(item => spanningItemToPageItem(item)).filter(Boolean) as PageItem[];
    const offsetX = isRecto ? -width : 0;
    const visibleItems = spanningPageItems.filter(item => {
      const itemLeft = item.x + offsetX;
      const itemRight = itemLeft + item.width;
      return itemRight > 0 && itemLeft < width;
    });

    if (visibleItems.length > 0) {
      drawPageItemsClipped(pdfPage, visibleItems, x, y, width, height, offsetX, width, this.fontCache, this.imageCache);
    }
  }
}
