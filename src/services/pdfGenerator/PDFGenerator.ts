/**
 * PDF Generator Service
 * Generates print-ready PDFs using pdf-lib with booklet imposition
 */

import { PDFDocument, PDFPage, PDFImage, rgb, StandardFonts, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } from 'pdf-lib';
import { appState } from '../state';
import { textFlowEngine } from '../textFlow';
import type { Signature, Spread, PageContent, PageItem, SpanningItem, StaticSpread } from '../../types';
import { SHEET_SIZES, getOrientedSheetSize, calculateSpreadRowsPerSheet } from '../../types';
import type { FontCache, ImageCacheType, RenderedPageCacheType, ImpositionSheet } from './types';
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

    // Embed fonts for all three categories: serif, sans-serif, monospace
    this.fontCache = {
      // Serif fonts (for Georgia, Times New Roman, Palatino, etc.)
      serifRegular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      serifItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      serifBoldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
      // Sans-serif fonts (for Arial, Helvetica, Verdana, etc.)
      sansRegular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      sansItalic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      sansBoldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      // Monospace fonts (for Courier, Monaco, Consolas, etc.)
      monoRegular: await pdfDoc.embedFont(StandardFonts.Courier),
      monoBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
      monoItalic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
      monoBoldItalic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
    };

    // Embed images used in static pages
    await embedImages(pdfDoc, project, this.imageCache);

    // Pre-render static/blank pages as high-res images for gradient/pattern/font support
    await preRenderStaticPages(pdfDoc, project, this.renderedPageCache);

    // Get sheet dimensions (with orientation applied)
    const sheetSize = getOrientedSheetSize(
      project.outputOptions.sheetSize,
      project.outputOptions.orientation
    );

    // Calculate page dimensions based on booklet size
    let pageWidth: number = sheetSize.width / 2;
    let pageHeight: number;

    switch (project.outputOptions.bookletSize) {
      case 'custom':
        pageWidth = project.outputOptions.customWidth || sheetSize.width / 2;
        pageHeight = project.outputOptions.customHeight || sheetSize.height;
        break;
      case 'half':
        pageHeight = sheetSize.height;
        break;
      case 'quarter':
        pageHeight = sheetSize.height / 2;
        break;
      case 'eighth':
        pageHeight = sheetSize.height / 4;
        break;
      case 'sixteenth':
        pageHeight = sheetSize.height / 8;
        break;
      default:
        pageHeight = sheetSize.height;
    }

    // Build a GLOBAL page map across all signatures for reading-order adjacency
    // This allows crossing items to work between pages in different signatures
    const globalPageMap: Map<number, PageContent> = new Map();
    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso) {
          globalPageMap.set(spread.verso.pageNumber, spread.verso);
        }
        if (spread.recto) {
          globalPageMap.set(spread.recto.pageNumber, spread.recto);
        }
      }
    }

    // Calculate rows per sheet for fill mode
    const rowsPerSheet = calculateSpreadRowsPerSheet(
      sheetSize,
      pageHeight,
      project.outputOptions.fillAvailableSpace
    );

    // Collect all imposition sheets from all signatures for cross-signature fill mode
    const allSheets: Array<{
      sheet: ImpositionSheet;
      signature: Signature;
      spreadForPage: Map<number, { spread: Spread; staticSpread?: StaticSpread }>;
    }> = [];

    const staticSpreads = project.staticSpreads || [];

    for (const signature of project.signatures) {
      const imposition = textFlowEngine.calculateImposition(signature);

      // Build maps for looking up spread info by page number
      const spreadForPage: Map<number, { spread: Spread; staticSpread?: StaticSpread }> = new Map();
      for (const spread of signature.spreads) {
        const staticSpread = staticSpreads.find(s => s.id === spread.id);
        if (spread.verso) {
          spreadForPage.set(spread.verso.pageNumber, { spread, staticSpread });
        }
        if (spread.recto) {
          spreadForPage.set(spread.recto.pageNumber, { spread, staticSpread });
        }
      }

      // Add all imposition sheets from this signature
      for (const sheet of imposition) {
        allSheets.push({ sheet, signature, spreadForPage });
      }
    }

    // Generate PDF pages by grouping sheets across signatures
    await this.generateCombinedSheets(pdfDoc, allSheets, sheetSize, pageWidth, pageHeight, rowsPerSheet, globalPageMap);

    // Add cut marks and optional fold indicators if there are pages
    if (project.signatures.length > 0) {
      addPrintMarks(pdfDoc, sheetSize, pageHeight, rowsPerSheet, project.outputOptions.showFoldMarks);
    }

    return pdfDoc.save();
  }

  /**
   * Generate combined PDF sheets from all signatures, grouping across signatures for fill mode
   */
  private async generateCombinedSheets(
    pdfDoc: PDFDocument,
    allSheets: Array<{
      sheet: ImpositionSheet;
      signature: Signature;
      spreadForPage: Map<number, { spread: Spread; staticSpread?: StaticSpread }>;
    }>,
    sheetSize: { width: number; height: number },
    pageWidth: number,
    pageHeight: number,
    rowsPerSheet: number,
    globalPageMap: Map<number, PageContent>
  ): Promise<void> {
    const project = appState.getProject();

    // Helper to get reading-order adjacent page
    const getReadingOrderAdjacent = (page: PageContent): PageContent | null => {
      const adjacentPageNum = page.isRecto ? page.pageNumber - 1 : page.pageNumber + 1;
      return globalPageMap.get(adjacentPageNum) || null;
    };

    // Group sheets across all signatures by rowsPerSheet
    for (let i = 0; i < allSheets.length; i += rowsPerSheet) {
      const sheetsInGroup = allSheets.slice(i, i + rowsPerSheet);

      // Front of combined sheet
      const frontPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      sheetsInGroup.forEach(({ sheet, spreadForPage }, rowIndex) => {
        const rowY = sheetSize.height - (rowIndex + 1) * pageHeight;

        // Look up pages by their page number from global map
        const leftPage = globalPageMap.get(sheet.front.left) || null;
        const rightPage = globalPageMap.get(sheet.front.right) || null;

        if (leftPage) {
          const info = spreadForPage.get(leftPage.pageNumber);
          const spanningItems = info?.staticSpread?.spanningItems;
          const adjacentPage = getReadingOrderAdjacent(leftPage);
          this.drawPage(frontPage, leftPage, 0, rowY, pageWidth, pageHeight, project, leftPage.isRecto, adjacentPage, spanningItems);
        }

        if (rightPage) {
          const info = spreadForPage.get(rightPage.pageNumber);
          const spanningItems = info?.staticSpread?.spanningItems;
          const adjacentPage = getReadingOrderAdjacent(rightPage);
          this.drawPage(frontPage, rightPage, pageWidth, rowY, pageWidth, pageHeight, project, rightPage.isRecto, adjacentPage, spanningItems);
        }
      });

      // Back of combined sheet
      const backPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

      sheetsInGroup.forEach(({ sheet, spreadForPage }, rowIndex) => {
        const rowY = sheetSize.height - (rowIndex + 1) * pageHeight;

        // Look up pages by their page number from global map
        const leftPage = globalPageMap.get(sheet.back.left) || null;
        const rightPage = globalPageMap.get(sheet.back.right) || null;

        if (leftPage) {
          const info = spreadForPage.get(leftPage.pageNumber);
          const spanningItems = info?.staticSpread?.spanningItems;
          const adjacentPage = getReadingOrderAdjacent(leftPage);
          this.drawPage(backPage, leftPage, 0, rowY, pageWidth, pageHeight, project, leftPage.isRecto, adjacentPage, spanningItems);
        }

        if (rightPage) {
          const info = spreadForPage.get(rightPage.pageNumber);
          const spanningItems = info?.staticSpread?.spanningItems;
          const adjacentPage = getReadingOrderAdjacent(rightPage);
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
    // Header/footer live inside the margin area, so they don't affect content dimensions
    const contentX = x + innerMargin;
    const contentY = y + margins.bottom;
    const contentWidth = width - innerMargin - outerMargin;
    const contentHeight = height - margins.top - margins.bottom;

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
        // Pre-rendered image already includes crossing items from adjacent pages (rendered via Konva)
        // Only need to render spanning items which are separate
        this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
        return;
      }

      // Fallback: draw items directly for static/blank pages (when pre-render failed or wasn't done)
      // Use clipping to prevent items from extending past page boundaries
      const hasItemsToClip = (pageContent.items && pageContent.items.length > 0) ||
                              (adjacentPage?.items && adjacentPage.items.length > 0);
      if (hasItemsToClip) {
        // Set up clipping rectangle for the page bounds
        pdfPage.pushOperators(
          pushGraphicsState(),
          moveTo(x, y),
          lineTo(x + width, y),
          lineTo(x + width, y + height),
          lineTo(x, y + height),
          closePath(),
          clip(),
          endPath()
        );

        if (pageContent.items && pageContent.items.length > 0) {
          drawPageItemsClipped(pdfPage, pageContent.items, x, y, width, height, 0, width, this.fontCache, this.imageCache);
        }
        // Use reading-order position (pageContent.isRecto) not physical sheet position for crossing items
        this.drawCrossingItems(pdfPage, adjacentPage, x, y, width, height, pageContent.isRecto);

        // Restore graphics state to remove clipping
        pdfPage.pushOperators(popGraphicsState());
      }
      this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
      return;
    }

    // Draw content - header/footer are inside margin, so content starts at margin boundary
    let currentY = y + height - margins.top;

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
          font: this.fontCache.sansRegular,
          color: rgb(0.6, 0.6, 0.6),
        });

        currentY -= placeholderHeight + 10;
        continue;
      }

      const lines = (section as { lines?: string[] }).lines || [section.content];
      // Use per-element textAlign if set, otherwise fall back to layoutOptions
      const textAlign = fontStyle.textAlign || layoutOptions.textAlign || 'left';

      for (const line of lines) {
        if (currentY < contentY) break;

        const sanitizedLine = sanitizeText(line);
        const textWidth = font.widthOfTextAtSize(sanitizedLine, fontStyle.fontSize);

        // Calculate x position based on alignment
        let lineX = contentX;
        if (textAlign === 'center') {
          lineX = contentX + (contentWidth - textWidth) / 2;
        } else if (textAlign === 'right') {
          lineX = contentX + contentWidth - textWidth;
        }

        // Draw inline background color (highlight) if set
        if (fontStyle.backgroundColor && fontStyle.backgroundColor !== '#ffffff') {
          pdfPage.drawRectangle({
            x: lineX,
            y: currentY - fontStyle.fontSize,
            width: textWidth,
            height: lineHeight,
            color: parseColor(fontStyle.backgroundColor),
          });
        }

        pdfPage.drawText(sanitizedLine, {
          x: lineX,
          y: currentY - fontStyle.fontSize,
          size: fontStyle.fontSize,
          font,
          color: parseColor(fontStyle.color),
        });

        // Draw underline if set
        const textDeco = fontStyle.textDecoration || 'none';
        if (textDeco.includes('underline')) {
          const underlineY = currentY - fontStyle.fontSize - 1;
          pdfPage.drawLine({
            start: { x: lineX, y: underlineY },
            end: { x: lineX + textWidth, y: underlineY },
            thickness: fontStyle.fontSize / 15,
            color: parseColor(fontStyle.color),
          });
        }

        // Draw strikethrough if set
        if (textDeco.includes('line-through')) {
          const strikeY = currentY - fontStyle.fontSize * 0.6;
          pdfPage.drawLine({
            start: { x: lineX, y: strikeY },
            end: { x: lineX + textWidth, y: strikeY },
            thickness: fontStyle.fontSize / 15,
            color: parseColor(fontStyle.color),
          });
        }

        currentY -= lineHeight;
      }

      currentY -= layoutOptions.paragraphSpacing;
    }

    // Draw footer
    // The footer is positioned inside the bottom margin area, offset from the margin boundary by footerHeight
    // In the editor: marginBoundaryY = y + height - margins.bottom, footerLineY = marginBoundaryY + footerHeight
    // In PDF coords (y=0 at bottom): marginBoundary = y + margins.bottom
    // footerY = marginBoundary - footerHeight (moving toward page edge)
    if (headerFooter.footer.enabled) {
      const footerHeight = headerFooter.footer.height;
      const footerY = y + margins.bottom - footerHeight;
      const footerContent = isRecto ? headerFooter.footer.recto : headerFooter.footer.verso;
      const footerFont = getFont(headerFooter.footer.font, this.fontCache);
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
    // The header is positioned inside the top margin area, offset from the margin boundary by headerHeight
    // In the editor: marginBoundaryY = y + margins.top, headerLineY = marginBoundaryY - headerHeight
    // In PDF coords (y=0 at bottom): marginBoundary = y + height - margins.top
    // headerY = marginBoundary + headerHeight (moving toward page edge/top)
    if (headerFooter.header.enabled) {
      const headerHeight = headerFooter.header.height;
      const headerY = y + height - margins.top + headerHeight;
      const headerContent = isRecto ? headerFooter.header.recto : headerFooter.header.verso;
      const headerFont = getFont(headerFooter.header.font, this.fontCache);
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
    // Check for pre-rendered image first (preserves gradients, custom fonts, etc.)
    const preRenderedItemsImage = this.renderedPageCache.get(pageContent.pageNumber);
    if (preRenderedItemsImage) {
      pdfPage.drawImage(preRenderedItemsImage, { x, y, width, height });
    } else if (hasItems || (adjacentPage?.items && adjacentPage.items.length > 0)) {
      // Fallback: use clipping to prevent items from extending past page boundaries
      pdfPage.pushOperators(
        pushGraphicsState(),
        moveTo(x, y),
        lineTo(x + width, y),
        lineTo(x + width, y + height),
        lineTo(x, y + height),
        closePath(),
        clip(),
        endPath()
      );

      if (hasItems) {
        drawPageItemsClipped(pdfPage, pageContent.items!, x, y, width, height, 0, width, this.fontCache, this.imageCache);
      }

      // Draw crossing items from adjacent pages (within the clipping region)
      // Use reading-order position (pageContent.isRecto) not physical sheet position
      this.drawCrossingItems(pdfPage, adjacentPage, x, y, width, height, pageContent.isRecto);

      // Restore graphics state to remove clipping
      pdfPage.pushOperators(popGraphicsState());
    }

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
