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
 * Flow sections across pages.
 *
 * `getReservedHeight(pageIndex)` lets the caller subtract space from the
 * content area for a specific page (used to reserve room for an on-page
 * footnote block). pageIndex is 0-based and matches the eventual position
 * of the page in the returned array.
 */
export function flowSections(
  ctx: CanvasRenderingContext2D,
  sections: DocumentSection[],
  pageDimensions: PageDimensions,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions,
  getReservedHeight?: (pageIndex: number) => number,
): PageContent[] {
  const pages: PageContent[] = [];
  let currentPage: PageContent = createEmptyPage(1);
  let currentHeight = 0;
  const availableHeight = () =>
    pageDimensions.contentHeight - (getReservedHeight ? getReservedHeight(pages.length) : 0);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Horizontal rule (---) acts as a page break
    if (section.type === 'hr') {
      if (currentPage.sections.length > 0) {
        pages.push(currentPage);
        currentPage = createEmptyPage(pages.length + 1);
        currentHeight = 0;
      }
      continue;
    }

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
    if (currentHeight + measured.measuredHeight <= availableHeight()) {
      currentPage.sections.push(measured);
      currentHeight += measured.measuredHeight;
    } else {
      // Need to break to new page
      // Try to fit partial content if possible (for paragraphs and blockquotes)
      if ((section.type === 'paragraph' || section.type === 'blockquote') && measured.lines.length > 1) {
        const fontStyle = getFontStyleForSection(section, fontOptions);
        const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

        // Use richLines for line count if available, otherwise use lines
        // This ensures we split based on what's actually rendered
        const sourceLines = measured.richLines && measured.richLines.length > 0
          ? measured.richLines
          : measured.lines;
        const totalLineCount = Array.isArray(sourceLines) ? sourceLines.length : 0;

        let remainingLineIndex = 0;

        // First, fit what we can on the current page
        const remainingHeight = availableHeight() - currentHeight;
        const linesForCurrentPage = Math.floor(remainingHeight / lineHeight);

        if (linesForCurrentPage >= 2 && remainingLineIndex < totalLineCount) {
          const endIndex = Math.min(remainingLineIndex + linesForCurrentPage, totalLineCount);

          const firstPart: MeasuredSection = {
            ...measured,
            lines: measured.lines.slice(remainingLineIndex, endIndex),
            richLines: measured.richLines?.slice(remainingLineIndex, endIndex),
            lineHeights: measured.lines.slice(remainingLineIndex, endIndex).map(() => lineHeight),
            measuredHeight: (endIndex - remainingLineIndex) * lineHeight,
          };

          currentPage.sections.push(firstPart);
          pages.push(currentPage);
          remainingLineIndex = endIndex;

          currentPage = createEmptyPage(pages.length + 1);
          currentHeight = 0;
        } else if (currentPage.sections.length > 0) {
          // Can't fit enough lines, move to next page
          pages.push(currentPage);
          currentPage = createEmptyPage(pages.length + 1);
          currentHeight = 0;
        }

        // Now handle remaining lines, splitting across as many pages as needed
        const maxLinesPerPage = Math.floor(availableHeight() / lineHeight);

        while (remainingLineIndex < totalLineCount) {
          const linesLeft = totalLineCount - remainingLineIndex;
          const linesToAdd = Math.min(linesLeft, maxLinesPerPage);
          const endIndex = remainingLineIndex + linesToAdd;
          const isLastPart = endIndex >= totalLineCount;

          const part: MeasuredSection = {
            ...measured,
            lines: measured.lines.slice(remainingLineIndex, endIndex),
            richLines: measured.richLines?.slice(remainingLineIndex, endIndex),
            lineHeights: measured.lines.slice(remainingLineIndex, endIndex).map(() => lineHeight),
            measuredHeight: linesToAdd * lineHeight + (isLastPart ? layoutOptions.paragraphSpacing : 0),
          };

          currentPage.sections.push(part);
          currentHeight = part.measuredHeight;
          remainingLineIndex = endIndex;

          // If there are more lines and current page is full, create new page
          if (remainingLineIndex < totalLineCount) {
            pages.push(currentPage);
            currentPage = createEmptyPage(pages.length + 1);
            currentHeight = 0;
          }
        }

        continue;
      }

      // Can't split or don't want to, move whole section to new page
      if (currentPage.sections.length > 0) {
        pages.push(currentPage);
      }
      currentPage = createEmptyPage(pages.length + 1);
      currentHeight = 0;

      // Add section to new page - handle oversized sections by splitting
      if (measured.measuredHeight <= availableHeight()) {
        currentPage.sections.push(measured);
        currentHeight = measured.measuredHeight;
      } else {
        // Section is too tall for a single page - force-break by lines
        const fontStyle = getFontStyleForSection(section, fontOptions);
        const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;
        const maxLinesPerPage = Math.floor(availableHeight() / lineHeight);
        const sourceLines = measured.richLines && measured.richLines.length > 0
          ? measured.richLines
          : measured.lines;
        const totalLineCount = Array.isArray(sourceLines) ? sourceLines.length : 0;

        let lineIndex = 0;
        while (lineIndex < totalLineCount) {
          const linesLeft = totalLineCount - lineIndex;
          const linesToAdd = Math.min(linesLeft, maxLinesPerPage);
          const endIndex = lineIndex + linesToAdd;
          const isLastPart = endIndex >= totalLineCount;

          const part: MeasuredSection = {
            ...measured,
            lines: measured.lines.slice(lineIndex, endIndex),
            richLines: measured.richLines?.slice(lineIndex, endIndex),
            lineHeights: measured.lines.slice(lineIndex, endIndex).map(() => lineHeight),
            measuredHeight: linesToAdd * lineHeight + (isLastPart ? layoutOptions.paragraphSpacing : 0),
          };

          currentPage.sections.push(part);
          currentHeight = part.measuredHeight;
          lineIndex = endIndex;

          if (lineIndex < totalLineCount) {
            pages.push(currentPage);
            currentPage = createEmptyPage(pages.length + 1);
            currentHeight = 0;
          }
        }
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
