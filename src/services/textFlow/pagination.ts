/**
 * Pagination utilities for the text flow engine
 */

import { measureSection, getFontStyleForSection } from './measurement';
import type { MeasuredSection, PageDimensions } from './types';
import type { DocumentSection, PageContent, FontOptions, LayoutOptions, PageState } from '../../types';

/**
 * Create an empty page
 */
export function createEmptyPage(pageNumber: number, isBlank = false, isStatic = false): PageContent {
  // Determine pageState based on flags
  let pageState: PageState = 'available';
  if (isStatic) {
    pageState = 'static';
  } else if (!isBlank) {
    pageState = 'text'; // Will have content flowed into it
  }

  return {
    id: crypto.randomUUID(),
    pageNumber,
    pageState,
    sections: [],
    isBlank,
    isRecto: pageNumber % 2 === 1,
    isStatic,
  };
}

/**
 * Flow sections across pages
 */
export function flowSections(
  ctx: CanvasRenderingContext2D,
  sections: DocumentSection[],
  pageDimensions: PageDimensions,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): PageContent[] {
  const pages: PageContent[] = [];
  let currentPage: PageContent = createEmptyPage(1);
  let currentHeight = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Check for H1 page break
    if (section.type === 'heading' && section.level === 1 && layoutOptions.emptyPageBeforeH1 && currentPage.sections.length > 0) {
      // Finish current page
      pages.push(currentPage);

      // Add blank page if needed to make H1 start on recto
      if (pages.length % 2 === 1) {
        pages.push(createEmptyPage(pages.length + 1, true));
      }

      // Start new page
      currentPage = createEmptyPage(pages.length + 1);
      currentHeight = 0;
    }

    const measured = measureSection(ctx, section, pageDimensions.contentWidth, fontOptions, layoutOptions);

    // Check if section fits on current page
    if (currentHeight + measured.measuredHeight <= pageDimensions.contentHeight) {
      currentPage.sections.push(measured);
      currentHeight += measured.measuredHeight;
    } else {
      // Need to break to new page
      // Try to fit partial content if possible (for paragraphs)
      if (section.type === 'paragraph' && measured.lines.length > 1) {
        const remainingHeight = pageDimensions.contentHeight - currentHeight;
        const fontStyle = getFontStyleForSection(section, fontOptions);
        const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;
        // Account for paragraph spacing when calculating how many lines fit
        const linesPerPage = Math.floor((remainingHeight - layoutOptions.paragraphSpacing) / lineHeight);

        if (linesPerPage >= 2) {
          // Split the paragraph
          const firstPartLines = measured.lines.slice(0, linesPerPage);
          const remainingLines = measured.lines.slice(linesPerPage);

          // Also split richLines if present (for inline formatting)
          const firstPartRichLines = measured.richLines?.slice(0, linesPerPage);
          const remainingRichLines = measured.richLines?.slice(linesPerPage);

          const firstPart: MeasuredSection = {
            ...measured,
            lines: firstPartLines,
            richLines: firstPartRichLines,
            lineHeights: firstPartLines.map(() => lineHeight),
            measuredHeight: linesPerPage * lineHeight + layoutOptions.paragraphSpacing,
          };

          currentPage.sections.push(firstPart);
          pages.push(currentPage);

          // Start new page with remaining lines
          currentPage = createEmptyPage(pages.length + 1);
          currentHeight = 0;

          if (remainingLines.length > 0) {
            const remainingPart: MeasuredSection = {
              ...measured,
              lines: remainingLines,
              richLines: remainingRichLines,
              lineHeights: remainingLines.map(() => lineHeight),
              measuredHeight: remainingLines.length * lineHeight + layoutOptions.paragraphSpacing,
            };
            currentPage.sections.push(remainingPart);
            currentHeight = remainingPart.measuredHeight;
          }
          continue;
        }
      }

      // Can't split or don't want to, move whole section to new page
      if (currentPage.sections.length > 0) {
        pages.push(currentPage);
      }
      currentPage = createEmptyPage(pages.length + 1);
      currentHeight = 0;

      // Add section to new page
      if (measured.measuredHeight <= pageDimensions.contentHeight) {
        currentPage.sections.push(measured);
        currentHeight = measured.measuredHeight;
      } else {
        // Section is too tall for a single page - will need to force-break
        currentPage.sections.push(measured);
        currentPage.overflow = [measured];
        pages.push(currentPage);
        currentPage = createEmptyPage(pages.length + 1);
        currentHeight = 0;
      }
    }
  }

  // Add final page if it has content
  if (currentPage.sections.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

/**
 * Insert user-specified blank pages
 */
export function insertBlankPages(pages: PageContent[], blankPageNumbers: number[]): PageContent[] {
  const result: PageContent[] = [];
  let offset = 0;

  for (let i = 0; i < pages.length; i++) {
    const originalPageNumber = i + 1;

    // Insert blank pages before this page if specified
    for (const blankNum of blankPageNumbers) {
      if (blankNum === originalPageNumber) {
        const blankPage = createEmptyPage(result.length + 1, true);
        result.push(blankPage);
        offset++;
      }
    }

    // Add the actual page with updated number
    const page = {
      ...pages[i],
      pageNumber: result.length + 1,
      isRecto: (result.length + 1) % 2 === 1,
    };
    result.push(page);
  }

  return result;
}
