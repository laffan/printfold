/**
 * PDF Generator Service
 * Generates print-ready PDFs using pdf-lib with booklet imposition
 */

import { PDFDocument, PDFPage, PDFImage, PDFFont, rgb, StandardFonts, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { appState } from '../state';
import { textFlowEngine, applyTextTransform } from '../textFlow';
import { fontService, FontFileData } from '../fontService';
import type { Signature, Spread, PageContent, PageItem, SpanningItem, StaticSpread, RichTextLine } from '../../types';
import { SHEET_SIZES, getOrientedSheetSize, calculateSpreadRowsPerSheet } from '../../types';
import type { FontCache, FontVariants, ImageCacheType, RenderedPageCacheType, ImpositionSheet } from './types';
import { sanitizeText, drawRichLine } from './textUtils';
import { parseColor } from './colors';
import { getFontStyleForSection, getFont } from './fonts';
import type { MeasuredSection } from '../textFlow/types';
import { embedImages, preRenderStaticPages } from './images';
import { addPrintMarks } from './printMarks';
import { drawPageItemsClipped, spanningItemToPageItem } from './itemDrawing';

export class PDFGenerator {
  private fontCache: FontCache | null = null;
  private imageCache: ImageCacheType = new Map();
  private renderedPageCache: RenderedPageCacheType = new Map();

  /**
   * Generate a print-ready PDF.
   *
   * Fonts are embedded with glyph subsetting by default to keep file size
   * down. Subsetting runs inside fontkit at `save()` time, and for some
   * CFF/OpenType fonts it throws ("value" argument is out of bounds). When
   * that happens we retry once with full (non-subset) font embedding, which
   * bypasses the subsetter entirely so export still succeeds.
   */
  async generate(): Promise<Uint8Array> {
    try {
      return await this.generateInternal('subset');
    } catch (subsetErr) {
      console.warn(
        'PDF generation failed during font subsetting; retrying with full font embedding.',
        subsetErr,
      );
      try {
        return await this.generateInternal('full');
      } catch (embedErr) {
        console.warn(
          'PDF generation failed during full font embedding; falling back to standard PDF fonts.',
          embedErr,
        );
        return await this.generateInternal('standard');
      }
    }
  }

  private async generateInternal(fontMode: 'subset' | 'full' | 'standard'): Promise<Uint8Array> {
    const project = appState.getProject();
    const pdfDoc = await PDFDocument.create();

    // Check if we're rendering text as images (no font embedding needed)
    const renderTextAsImages = project.outputOptions.renderTextAsImages === true;

    if (!renderTextAsImages && fontMode !== 'standard') {
      // Register fontkit for custom font embedding
      pdfDoc.registerFontkit(fontkit);

      // Build font cache with embedded fonts (subset unless we're retrying
      // after a subsetter failure).
      this.fontCache = await this.buildFontCache(pdfDoc, project, fontMode === 'subset');
    } else {
      // Use only standard PDF fonts (no custom embedding). This is the case
      // both when rendering text as images (fonts are baked into the page
      // image) and when font embedding failed and we're falling back so the
      // export still produces a usable PDF.
      this.fontCache = await this.buildFallbackFontCache(pdfDoc);
    }

    // Embed images used in static pages
    await embedImages(pdfDoc, project, this.imageCache);

    // Pre-render pages as high-res images
    // When renderTextAsImages is true, ALL pages (including text) are pre-rendered
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

    const bookletType = project.outputOptions.bookletType ?? 'booklet';

    if (bookletType !== 'booklet') {
      // Sequential page mode (double-sided or single-sided)
      await this.generateSequentialPages(pdfDoc, sheetSize, pageWidth, pageHeight, globalPageMap, project);
      return pdfDoc.save();
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
      addPrintMarks(pdfDoc, sheetSize, pageHeight, rowsPerSheet, project.outputOptions.showFoldMarks, {
        showCropMarks: project.outputOptions.showCropMarks,
        cropMarkColor: project.outputOptions.cropMarkColor,
        cropMarkThickness: project.outputOptions.cropMarkThickness,
      });
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

    // Get duplex offset values (in points)
    const duplexOffsetX = project.outputOptions.duplexOffsetX || 0;
    const duplexOffsetY = project.outputOptions.duplexOffsetY || 0;

    // Group sheets across all signatures by rowsPerSheet
    for (let i = 0; i < allSheets.length; i += rowsPerSheet) {
      const sheetsInGroup = allSheets.slice(i, i + rowsPerSheet);

      // Front of combined sheet (odd PDF pages - apply duplex offset)
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
          this.drawPage(frontPage, leftPage, 0 + duplexOffsetX, rowY + duplexOffsetY, pageWidth, pageHeight, project, leftPage.isRecto, adjacentPage, spanningItems);
        }

        if (rightPage) {
          const info = spreadForPage.get(rightPage.pageNumber);
          const spanningItems = info?.staticSpread?.spanningItems;
          const adjacentPage = getReadingOrderAdjacent(rightPage);
          this.drawPage(frontPage, rightPage, pageWidth + duplexOffsetX, rowY + duplexOffsetY, pageWidth, pageHeight, project, rightPage.isRecto, adjacentPage, spanningItems);
        }
      });

      // Back of combined sheet (even PDF pages - no offset)
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
   * Generate sequential PDF pages (double-sided or single-sided, no imposition)
   */
  private async generateSequentialPages(
    pdfDoc: PDFDocument,
    sheetSize: { width: number; height: number },
    pageWidth: number,
    pageHeight: number,
    globalPageMap: Map<number, PageContent>,
    project: ReturnType<typeof appState.getProject>
  ): Promise<void> {
    const bookletType = project.outputOptions.bookletType ?? 'booklet';
    const placement = project.outputOptions.placement ?? 'autofill';
    const staticSpreads = project.staticSpreads || [];

    // Collect all pages in reading order
    const allPages: PageContent[] = [];
    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso) allPages.push(spread.verso);
        if (spread.recto) allPages.push(spread.recto);
      }
    }

    // Build spread lookup for spanning items
    const spreadForPage: Map<number, { spread: Spread; staticSpread?: StaticSpread }> = new Map();
    for (const sig of project.signatures) {
      for (const spread of sig.spreads) {
        const staticSpread = staticSpreads.find(s => s.id === spread.id);
        if (spread.verso) spreadForPage.set(spread.verso.pageNumber, { spread, staticSpread });
        if (spread.recto) spreadForPage.set(spread.recto.pageNumber, { spread, staticSpread });
      }
    }

    const getReadingOrderAdjacent = (page: PageContent): PageContent | null => {
      const adjacentPageNum = page.isRecto ? page.pageNumber - 1 : page.pageNumber + 1;
      return globalPageMap.get(adjacentPageNum) || null;
    };

    const cols = Math.max(1, Math.floor(sheetSize.width / pageWidth));
    const rows = Math.max(1, Math.floor(sheetSize.height / pageHeight));
    const slotsPerSide = placement === 'autofill' ? cols * rows : 1;

    const slotOffset = (slot: number): { x: number; y: number } => {
      if (placement === 'center') {
        return {
          x: (sheetSize.width - pageWidth) / 2,
          y: (sheetSize.height - pageHeight) / 2,
        };
      } else if (placement === 'upperLeft') {
        return { x: 0, y: sheetSize.height - pageHeight };
      }
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      return {
        x: col * pageWidth,
        y: sheetSize.height - (row + 1) * pageHeight,
      };
    };

    const drawOnePage = (pdfPage: PDFPage, page: PageContent, slot: number) => {
      const { x, y } = slotOffset(slot);
      const info = spreadForPage.get(page.pageNumber);
      const spanningItems = info?.staticSpread?.spanningItems;
      const adjacentPage = getReadingOrderAdjacent(page);
      this.drawPage(pdfPage, page, x, y, pageWidth, pageHeight, project, page.isRecto, adjacentPage, spanningItems);
    };

    if (bookletType === 'doubleSided') {
      // Each physical slot on the sheet holds a front/back pair.
      // For N slots per side we consume 2*N pages per physical sheet:
      //   Front slot 0 → page 0, Back slot 0 → page 1
      //   Front slot 1 → page 2, Back slot 1 → page 3  …
      const pagesPerPhysicalSheet = slotsPerSide * 2;

      for (let i = 0; i < allPages.length; i += pagesPerPhysicalSheet) {
        const chunk = allPages.slice(i, i + pagesPerPhysicalSheet);
        const frontPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);
        let hasBack = false;

        for (let slot = 0; slot < slotsPerSide; slot++) {
          const frontIdx = slot * 2;
          const backIdx = slot * 2 + 1;
          if (frontIdx < chunk.length) drawOnePage(frontPage, chunk[frontIdx], slot);
          if (backIdx < chunk.length) hasBack = true;
        }

        if (hasBack) {
          const backPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);
          for (let slot = 0; slot < slotsPerSide; slot++) {
            const backIdx = slot * 2 + 1;
            if (backIdx < chunk.length) drawOnePage(backPage, chunk[backIdx], slot);
          }
        }
      }
    } else {
      // Single-sided: fill each sheet front only
      for (let i = 0; i < allPages.length; i += slotsPerSide) {
        const chunk = allPages.slice(i, i + slotsPerSide);
        const pdfPage = pdfDoc.addPage([sheetSize.width, sheetSize.height]);
        chunk.forEach((page, slot) => drawOnePage(pdfPage, page, slot));
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
    const hasBackground = !!pageContent.backgroundFill || !!pageContent.customBackgroundImageId;
    // A page is a text page if its pageState is 'text' - these pages need text content rendered
    const isTextPage = pageContent.pageState === 'text';
    // Check for static/available pages using pageState (prefer) or deprecated flags (fallback)
    const isStaticOrAvailable = pageContent.pageState === 'static' ||
                                 pageContent.pageState === 'available' ||
                                 pageContent.isBlank || pageContent.isStatic;
    // Check if "render text as images" mode is enabled
    const renderTextAsImages = project.outputOptions.renderTextAsImages === true;

    // When renderTextAsImages is enabled, ALL pages (including text) use pre-rendered images
    if (renderTextAsImages) {
      const preRenderedImage = this.renderedPageCache.get(pageContent.pageNumber);
      if (preRenderedImage) {
        pdfPage.drawImage(preRenderedImage, { x, y, width, height });
        this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
        return;
      }
      // If pre-rendered image is missing, fall through to normal rendering
      // (this shouldn't happen, but provides a safety net)
    }

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
          drawPageItemsClipped(pdfPage, pageContent.items, x, y, width, height, 0, width, this.fontCache, this.imageCache, fontOptions, layoutOptions);
        }
        // Use reading-order position (pageContent.isRecto) not physical sheet position for crossing items
        this.drawCrossingItems(pdfPage, adjacentPage, x, y, width, height, pageContent.isRecto);

        // Restore graphics state to remove clipping
        pdfPage.pushOperators(popGraphicsState());
      }
      this.drawSpanningItems(pdfPage, spreadSpanningItems, x, y, width, height, isRecto);
      return;
    }

    // Draw background fill for text pages (if set)
    if (pageContent.backgroundFill) {
      const bgColor = pageContent.backgroundFill.type === 'color' && pageContent.backgroundFill.color
        ? parseColor(pageContent.backgroundFill.color)
        : null;
      if (bgColor) {
        pdfPage.drawRectangle({
          x,
          y,
          width,
          height,
          color: bgColor,
        });
      }
    }

    // Draw custom background image for text pages (if set)
    if (pageContent.customBackgroundImageId) {
      const bgImage = this.imageCache.get(pageContent.customBackgroundImageId);
      if (bgImage) {
        pdfPage.drawImage(bgImage, { x, y, width, height });
      }
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
          font: this.fontCache.fallback.sans.regular,
          color: rgb(0.6, 0.6, 0.6),
        });

        currentY -= placeholderHeight + 10;
        continue;
      }

      const measuredSection = section as MeasuredSection;
      const lines = measuredSection.lines || [section.content];
      const richLines = measuredSection.richLines;
      // Use per-element textAlign if set, otherwise fall back to layoutOptions
      const textAlign = fontStyle.textAlign || layoutOptions.textAlign || 'left';

      // Use rich lines if available (for paragraphs and blockquotes with inline styling)
      if (richLines && richLines.length > 0) {
        for (const richLine of richLines) {
          if (currentY < contentY) break;

          // Draw the rich line with all its styled spans
          drawRichLine(
            pdfPage,
            richLine,
            contentX,
            currentY - fontStyle.fontSize,
            fontStyle,
            fontOptions,
            this.fontCache,
            contentWidth,
            textAlign
          );

          currentY -= lineHeight;
        }
      } else {
        // Fallback to plain text rendering
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
      }

      currentY -= layoutOptions.paragraphSpacing;
    }

    // Draw footnote block at the bottom of the content area (above the
    // bottom margin) — pagination already reserved space for it.
    if (pageContent.footnotes && pageContent.footnotes.length > 0) {
      this.drawFootnotes(pdfPage, pageContent, contentX, contentY, contentWidth, fontOptions, layoutOptions);
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
      const footerTransform = headerFooter.footer.font.textTransform;
      const pageNumStr = pageContent.pageNumber.toString();
      const finalize = (raw: string) => sanitizeText(applyTextTransform(raw.replace('{{pageNumber}}', pageNumStr), footerTransform));

      if (footerContent.left) {
        const text = finalize(footerContent.left);
        pdfPage.drawText(text, { x: contentX, y: footerY, size: footerSize, font: footerFont, color: rgb(0, 0, 0) });
      }

      if (footerContent.center) {
        const text = finalize(footerContent.center);
        const textWidth = footerFont.widthOfTextAtSize(text, footerSize);
        pdfPage.drawText(text, { x: x + width / 2 - textWidth / 2, y: footerY, size: footerSize, font: footerFont, color: rgb(0, 0, 0) });
      }

      if (footerContent.right) {
        const text = finalize(footerContent.right);
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
      const headerTransform = headerFooter.header.font.textTransform;
      const pageNumStr = pageContent.pageNumber.toString();
      const finalize = (raw: string) => sanitizeText(applyTextTransform(raw.replace('{{pageNumber}}', pageNumStr), headerTransform));

      if (headerContent.left) {
        const text = finalize(headerContent.left);
        pdfPage.drawText(text, { x: contentX, y: headerY, size: headerSize, font: headerFont, color: rgb(0, 0, 0) });
      }

      if (headerContent.center) {
        const text = finalize(headerContent.center);
        const textWidth = headerFont.widthOfTextAtSize(text, headerSize);
        pdfPage.drawText(text, { x: x + width / 2 - textWidth / 2, y: headerY, size: headerSize, font: headerFont, color: rgb(0, 0, 0) });
      }

      if (headerContent.right) {
        const text = finalize(headerContent.right);
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
        drawPageItemsClipped(pdfPage, pageContent.items!, x, y, width, height, 0, width, this.fontCache, this.imageCache, fontOptions, layoutOptions);
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
   * Draw the footnote block (separator rule + per-footnote text) anchored
   * to the bottom of the content area.
   */
  private drawFootnotes(
    pdfPage: PDFPage,
    pageContent: PageContent,
    contentX: number,
    contentY: number,
    contentWidth: number,
    fontOptions: ReturnType<typeof appState.getProject>['fontOptions'],
    layoutOptions: ReturnType<typeof appState.getProject>['layoutOptions'],
  ): void {
    if (!this.fontCache || !pageContent.footnotes || pageContent.footnotes.length === 0) return;
    const style = fontOptions.footnote;
    const font = getFont(style, this.fontCache);
    const lineHeight = (style.lineHeight ?? layoutOptions.lineHeight) * style.fontSize;

    const footnoteGap = fontOptions.footnoteGap ?? 0;
    const numberColorHex = fontOptions.footnoteNumberColor || style.color;
    const numberColor = parseColor(numberColorHex);
    const hasDistinctNumberColor = numberColorHex !== style.color;

    // Measure each footnote (line count) to compute total block height.
    const wrappedPerFootnote: string[][] = pageContent.footnotes.map(f => {
      return wrapPlainText(`${f.number}. ${f.content}`, contentWidth, font, style.fontSize);
    });
    const totalLines = wrappedPerFootnote.reduce((a, b) => a + b.length, 0);
    const totalGap = Math.max(0, wrappedPerFootnote.length - 1) * footnoteGap;

    const ruleGap = 4;
    const ruleThickness = 0.5;
    const ruleSpace = ruleGap + ruleThickness + ruleGap;
    const blockHeight = ruleSpace + totalLines * lineHeight + totalGap;

    // PDF coords: y=0 at bottom. The block sits with its top at
    // (contentY + blockHeight) above contentY.
    const topY = contentY + blockHeight;
    const ruleY = topY - ruleGap;

    pdfPage.drawLine({
      start: { x: contentX, y: ruleY },
      end: { x: contentX + contentWidth * 0.3, y: ruleY },
      thickness: ruleThickness,
      color: parseColor(style.color),
    });

    // Walk top to bottom; each line lives at (y - fontSize) baseline in
    // pdf-lib's coordinate system. textY is the top-of-line cursor.
    let textY = ruleY - ruleGap;
    for (let fi = 0; fi < wrappedPerFootnote.length; fi++) {
      const lines = wrappedPerFootnote[fi];
      const prefix = `${pageContent.footnotes[fi].number}. `;
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        // Color the number prefix on the first line of each footnote
        if (li === 0 && hasDistinctNumberColor) {
          const prefixWidth = font.widthOfTextAtSize(sanitizeText(prefix), style.fontSize);
          pdfPage.drawText(sanitizeText(prefix), {
            x: contentX,
            y: textY - style.fontSize,
            size: style.fontSize,
            font,
            color: numberColor,
          });
          pdfPage.drawText(sanitizeText(line.slice(prefix.length)), {
            x: contentX + prefixWidth,
            y: textY - style.fontSize,
            size: style.fontSize,
            font,
            color: parseColor(style.color),
          });
        } else {
          pdfPage.drawText(sanitizeText(line), {
            x: contentX,
            y: textY - style.fontSize,
            size: style.fontSize,
            font,
            color: parseColor(style.color),
          });
        }
        textY -= lineHeight;
      }
      // Add gap between footnotes (not after the last one)
      if (fi < wrappedPerFootnote.length - 1) {
        textY -= footnoteGap;
      }
    }
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

  /**
   * Build font cache - embed actual fonts in Electron, use standard fonts as fallback
   */
  private async buildFontCache(
    pdfDoc: PDFDocument,
    project: { fontOptions: import('../../types').FontOptions; headerFooter: import('../../types').HeaderFooterOptions },
    subsetFonts: boolean = true
  ): Promise<FontCache> {
    // Create fallback fonts (standard PDF fonts)
    const fallback = {
      serif: {
        regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
        bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
        italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
        boldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
      },
      sans: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
        italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      },
      mono: {
        regular: await pdfDoc.embedFont(StandardFonts.Courier),
        bold: await pdfDoc.embedFont(StandardFonts.CourierBold),
        italic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
      },
    };

    const embedded = new Map<string, FontVariants>();

    // Try to embed actual fonts (Electron only)
    if (fontService.canEmbedFonts()) {
      // Collect all unique font families used in the document
      const fontFamilies = this.collectFontFamilies(project);

      // Load and embed each font
      for (const family of fontFamilies) {
        try {
          console.log(`Loading font file for: "${family}"`);
          const fontData = await fontService.loadFontFileData(family);
          if (fontData) {
            const variants = await this.embedFontData(pdfDoc, fontData, fallback, subsetFonts);
            if (variants) {
              embedded.set(family, variants);
              console.log(`Embedded font: "${family}" (has: ${Object.keys(fontData).filter(k => fontData[k as keyof typeof fontData]).join(', ')})`);
            }
          } else {
            console.log(`No font file found for: "${family}"`);
          }
        } catch (error) {
          console.warn(`Failed to embed font "${family}":`, error);
          // Will fall back to standard fonts
        }
      }
    }

    return { embedded, fallback };
  }

  /**
   * Build a minimal font cache with only fallback fonts (for "render text as images" mode)
   * Since all text is rendered as images, we only need standard fonts for any edge cases
   */
  private async buildFallbackFontCache(pdfDoc: PDFDocument): Promise<FontCache> {
    const fallback = {
      serif: {
        regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
        bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
        italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
        boldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
      },
      sans: {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
        italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      },
      mono: {
        regular: await pdfDoc.embedFont(StandardFonts.Courier),
        bold: await pdfDoc.embedFont(StandardFonts.CourierBold),
        italic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
      },
    };

    return { embedded: new Map(), fallback };
  }

  /**
   * Collect all unique font families used in the document
   */
  private collectFontFamilies(
    project: { fontOptions: import('../../types').FontOptions; headerFooter: import('../../types').HeaderFooterOptions }
  ): Set<string> {
    const families = new Set<string>();

    // Font options (body, headings, code, blockquote)
    const { fontOptions, headerFooter } = project;

    families.add(fontOptions.body.fontFamily);
    families.add(fontOptions.h1.fontFamily);
    families.add(fontOptions.h2.fontFamily);
    families.add(fontOptions.h3.fontFamily);
    families.add(fontOptions.h4.fontFamily);
    families.add(fontOptions.h5.fontFamily);
    families.add(fontOptions.h6.fontFamily);
    families.add(fontOptions.code.fontFamily);
    families.add(fontOptions.blockquote.fontFamily);

    // Header/footer fonts
    if (headerFooter.header.enabled) {
      families.add(headerFooter.header.font.fontFamily);
    }
    if (headerFooter.footer.enabled) {
      families.add(headerFooter.footer.font.fontFamily);
    }

    return families;
  }

  /**
   * Embed font data into PDF with subsetting to reduce file size
   */
  private async embedFontData(
    pdfDoc: PDFDocument,
    fontData: FontFileData,
    fallback: { serif: FontVariants; sans: FontVariants; mono: FontVariants },
    subsetFonts: boolean = true
  ): Promise<FontVariants | null> {
    // We need at least the regular variant
    if (!fontData.regular) {
      return null;
    }

    try {
      // subset: true only embeds glyphs actually used (smaller files). Some
      // CFF/OpenType fonts crash the subsetter at save() time, in which case
      // generate() retries with subsetFonts = false (full embedding).
      const regular = await pdfDoc.embedFont(fontData.regular, { subset: subsetFonts });

      // Try to embed other variants, fall back to regular if not available
      let bold: PDFFont | undefined;
      let italic: PDFFont | undefined;
      let boldItalic: PDFFont | undefined;

      if (fontData.bold) {
        try {
          bold = await pdfDoc.embedFont(fontData.bold, { subset: subsetFonts });
        } catch {
          // Use regular for bold
        }
      }

      if (fontData.italic) {
        try {
          italic = await pdfDoc.embedFont(fontData.italic, { subset: subsetFonts });
        } catch {
          // Use regular for italic
        }
      }

      if (fontData.boldItalic) {
        try {
          boldItalic = await pdfDoc.embedFont(fontData.boldItalic, { subset: subsetFonts });
        } catch {
          // Use bold or italic or regular
        }
      }

      return {
        regular,
        bold,
        italic,
        boldItalic,
      };
    } catch (error) {
      console.warn('Failed to embed font:', error);
      return null;
    }
  }

  /**
   * Generate a test page PDF for duplex offset calibration
   * Creates a 2-page PDF with alignment crosses and hash marks
   */
  async generateTestPage(): Promise<Uint8Array> {
    const project = appState.getProject();
    const pdfDoc = await PDFDocument.create();

    // Get sheet dimensions
    const sheetSize = getOrientedSheetSize(
      project.outputOptions.sheetSize,
      project.outputOptions.orientation
    );

    // Get offset values (in points)
    const offsetX = project.outputOptions.duplexOffsetX || 0;
    const offsetY = project.outputOptions.duplexOffsetY || 0;

    // Convert offsets to mm for display
    const displayOffsetX = offsetX * 25.4 / 72;
    const displayOffsetY = offsetY * 25.4 / 72;

    // Embed font for text
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page 1 (Front - odd page, with offset applied)
    const page1 = pdfDoc.addPage([sheetSize.width, sheetSize.height]);

    // Draw corner crosses
    this.drawCornerCrosses(page1, sheetSize.width, sheetSize.height, offsetX, offsetY);

    // Draw center calibration grid with hash marks
    this.drawCalibrationGrid(page1, sheetSize.width, sheetSize.height, offsetX, offsetY, font, true);

    // Draw offset info text above center
    const text = `Duplex Offset: X=${displayOffsetX.toFixed(1)}mm, Y=${displayOffsetY.toFixed(1)}mm`;
    const fontSize = 20;
    const textWidth = fontBold.widthOfTextAtSize(text, fontSize);
    page1.drawText(text, {
      x: sheetSize.width / 2 - textWidth / 2 + offsetX,
      y: sheetSize.height / 2 + 100 + offsetY,
      size: fontSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Page 2 (Back - even page, no offset, only center cross)
    const page2 = pdfDoc.addPage([sheetSize.width, sheetSize.height]);
    this.drawCornerCrosses(page2, sheetSize.width, sheetSize.height, 0, 0);
    this.drawCalibrationGrid(page2, sheetSize.width, sheetSize.height, 0, 0, font, false);

    return pdfDoc.save();
  }

  /**
   * Draw alignment crosses in corners
   */
  private drawCornerCrosses(
    page: PDFPage,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number
  ): void {
    const crossSize = 20; // Length of each arm of the cross
    const lineWidth = 0.5;
    const color = rgb(0, 0, 0);

    // Define corner positions
    const positions = [
      { x: 36, y: height - 36 },           // Top-left
      { x: width - 36, y: height - 36 },   // Top-right
      { x: 36, y: 36 },                    // Bottom-left
      { x: width - 36, y: 36 },            // Bottom-right
    ];

    // Draw crosses at each corner
    for (const pos of positions) {
      const x = pos.x + offsetX;
      const y = pos.y + offsetY;

      // Horizontal line
      page.drawLine({
        start: { x: x - crossSize, y },
        end: { x: x + crossSize, y },
        thickness: lineWidth,
        color,
      });

      // Vertical line
      page.drawLine({
        start: { x, y: y - crossSize },
        end: { x, y: y + crossSize },
        thickness: lineWidth,
        color,
      });
    }
  }

  /**
   * Draw calibration grid with hash marks every 1mm and 5mm
   */
  private drawCalibrationGrid(
    page: PDFPage,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    font: PDFFont,
    drawHashMarks: boolean = true
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const darkColor = rgb(0, 0, 0);
    const lightColor = rgb(0.7, 0.7, 0.7);

    // 1mm in points (1mm = 72/25.4 points)
    const mmToPoints = 72 / 25.4;
    const maxMm = 15; // Go up to ±15mm
    const darkHashLength = 10; // Length of 5mm hash marks
    const lightHashLength = 5; // Length of 1mm hash marks
    const fontSize = 10;
    const lineWidth = 0.5;

    // Draw center cross
    const centerCrossSize = 7.5;
    page.drawLine({
      start: { x: centerX - centerCrossSize + offsetX, y: centerY + offsetY },
      end: { x: centerX + centerCrossSize + offsetX, y: centerY + offsetY },
      thickness: lineWidth,
      color: darkColor,
    });
    page.drawLine({
      start: { x: centerX + offsetX, y: centerY - centerCrossSize + offsetY },
      end: { x: centerX + offsetX, y: centerY + centerCrossSize + offsetY },
      thickness: lineWidth,
      color: darkColor,
    });

    // Only draw hash marks if requested (front page only)
    if (!drawHashMarks) {
      return;
    }

    // Draw horizontal hash marks (left and right from center)
    for (let mm = 1; mm <= maxMm; mm++) {
      const offset = mm * mmToPoints;
      const isDarkMark = mm % 5 === 0;
      const hashLength = isDarkMark ? darkHashLength : lightHashLength;
      const color = isDarkMark ? darkColor : lightColor;

      // Right side (+X)
      const xRight = centerX + offset + offsetX;
      page.drawLine({
        start: { x: xRight, y: centerY - hashLength + offsetY },
        end: { x: xRight, y: centerY + hashLength + offsetY },
        thickness: lineWidth,
        color,
      });

      // Left side (-X)
      const xLeft = centerX - offset + offsetX;
      page.drawLine({
        start: { x: xLeft, y: centerY - hashLength + offsetY },
        end: { x: xLeft, y: centerY + hashLength + offsetY },
        thickness: lineWidth,
        color,
      });
    }

    // Draw vertical hash marks (up and down from center)
    for (let mm = 1; mm <= maxMm; mm++) {
      const offset = mm * mmToPoints;
      const isDarkMark = mm % 5 === 0;
      const hashLength = isDarkMark ? darkHashLength : lightHashLength;
      const color = isDarkMark ? darkColor : lightColor;

      // Top side (+Y)
      const yTop = centerY + offset + offsetY;
      page.drawLine({
        start: { x: centerX - hashLength + offsetX, y: yTop },
        end: { x: centerX + hashLength + offsetX, y: yTop },
        thickness: lineWidth,
        color,
      });

      // Bottom side (-Y)
      const yBottom = centerY - offset + offsetY;
      page.drawLine({
        start: { x: centerX - hashLength + offsetX, y: yBottom },
        end: { x: centerX + hashLength + offsetX, y: yBottom },
        thickness: lineWidth,
        color,
      });
    }

    // Add axis labels
    const labelFontSize = 10;

    // +X label (to the right of right hash marks)
    const plusXLabel = '+X';
    const plusXWidth = font.widthOfTextAtSize(plusXLabel, labelFontSize);
    page.drawText(plusXLabel, {
      x: centerX + maxMm * mmToPoints + darkHashLength + 5 + offsetX,
      y: centerY - labelFontSize / 2 + offsetY,
      size: labelFontSize,
      font,
      color: darkColor,
    });

    // -X label (to the left of left hash marks)
    const minusXLabel = '-X';
    const minusXWidth = font.widthOfTextAtSize(minusXLabel, labelFontSize);
    page.drawText(minusXLabel, {
      x: centerX - maxMm * mmToPoints - darkHashLength - 5 - minusXWidth + offsetX,
      y: centerY - labelFontSize / 2 + offsetY,
      size: labelFontSize,
      font,
      color: darkColor,
    });

    // +Y label (above top hash marks)
    const plusYLabel = '+Y';
    const plusYWidth = font.widthOfTextAtSize(plusYLabel, labelFontSize);
    page.drawText(plusYLabel, {
      x: centerX - plusYWidth / 2 + offsetX,
      y: centerY + maxMm * mmToPoints + darkHashLength + 5 + offsetY,
      size: labelFontSize,
      font,
      color: darkColor,
    });

    // -Y label (below bottom hash marks)
    const minusYLabel = '-Y';
    const minusYWidth = font.widthOfTextAtSize(minusYLabel, labelFontSize);
    page.drawText(minusYLabel, {
      x: centerX - minusYWidth / 2 + offsetX,
      y: centerY - maxMm * mmToPoints - darkHashLength - 5 - labelFontSize + offsetY,
      size: labelFontSize,
      font,
      color: darkColor,
    });

    // Add descriptive label below the grid
    const descLabel = 'Each dark line represents 5mm';
    const descFontSize = 9;
    const descWidth = font.widthOfTextAtSize(descLabel, descFontSize);
    page.drawText(descLabel, {
      x: centerX - descWidth / 2 + offsetX,
      y: centerY - maxMm * mmToPoints - darkHashLength - 30 + offsetY,
      size: descFontSize,
      font,
      color: darkColor,
    });
  }
}

/**
 * Wrap plain text to a max width using pdf-lib's font width measurement.
 * Used for footnote bodies, where line layout is straightforward — no
 * inline styling, no per-span widths.
 */
function wrapPlainText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const safe = maxWidth * 0.98;
  const out: string[] = [];
  for (const hardLine of text.split('\n')) {
    const words = hardLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(sanitizeText(candidate), fontSize) <= safe) {
        line = candidate;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}
