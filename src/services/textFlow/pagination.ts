/**
 * Pagination utilities for the text flow engine
 */

import { measureSection, getFontStyleForSection, wrapRichTextAtWidth } from './measurement';
import { getTextRegionAtY, findNextClearY } from './displacement';
import { parseInlineMarkdown } from './parsing';
import type { MeasuredSection, PageDimensions, LinePosition } from './types';
import type { DisplacementZone } from './displacement';
import type { DocumentSection, PageContent, FontOptions, LayoutOptions, PageState, RichTextLine, TextSpan } from '../../types';

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
 * Flow sections across pages, with optional displacement zones for text wrapping around items
 */
export function flowSections(
  ctx: CanvasRenderingContext2D,
  sections: DocumentSection[],
  pageDimensions: PageDimensions,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions,
  displacementsByPage?: Map<number, DisplacementZone[]>
): PageContent[] {
  const pages: PageContent[] = [];
  let currentPage: PageContent = createEmptyPage(1);
  let currentHeight = 0;

  // Helper to get displacement zones for current page
  const getZones = (): DisplacementZone[] | undefined => {
    if (!displacementsByPage) return undefined;
    return displacementsByPage.get(currentPage.pageNumber);
  };

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

    const zones = getZones();

    if (zones && zones.length > 0) {
      // Displacement-aware flow: place content line-by-line with variable widths
      flowSectionWithDisplacement(
        ctx, section, zones, pageDimensions, fontOptions, layoutOptions,
        currentPage, currentHeight, pages
      );
      // After flowing, update currentPage and currentHeight from the last page
      currentPage = pages.length > 0 ? pages[pages.length - 1] : currentPage;
      // Recalculate currentHeight from the sections on currentPage
      if (pages[pages.length - 1] === currentPage && currentPage.sections.length > 0) {
        // Pop the page back off since we may still add more sections
        currentPage = pages.pop()!;
        currentHeight = currentPage.sections.reduce((h, s) => h + (s as MeasuredSection).measuredHeight, 0);
      } else {
        currentHeight = currentPage.sections.reduce((h, s) => h + (s as MeasuredSection).measuredHeight, 0);
      }
    } else {
      // Standard flow (fast path — no displacement zones)
      const measured = measureSection(ctx, section, pageDimensions.contentWidth, fontOptions, layoutOptions);

      if (currentHeight + measured.measuredHeight <= pageDimensions.contentHeight) {
        currentPage.sections.push(measured);
        currentHeight += measured.measuredHeight;
      } else {
        // Need to break to new page
        handlePageBreak(
          ctx, section, measured, pageDimensions, fontOptions, layoutOptions,
          pages, currentPage, currentHeight
        );
        // Update references
        currentPage = pages[pages.length - 1] || currentPage;
        if (pages[pages.length - 1] === currentPage) {
          currentPage = pages.pop()!;
        }
        currentHeight = currentPage.sections.reduce((h, s) => h + (s as MeasuredSection).measuredHeight, 0);
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
 * Flow a section with displacement zones (line-by-line variable-width placement)
 */
function flowSectionWithDisplacement(
  ctx: CanvasRenderingContext2D,
  section: DocumentSection,
  zones: DisplacementZone[],
  pageDimensions: PageDimensions,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions,
  currentPage: PageContent,
  startHeight: number,
  pages: PageContent[]
): void {
  const fontStyle = getFontStyleForSection(section, fontOptions);
  const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

  // Handle non-text sections (images, hr)
  if (section.type === 'image' || section.type === 'hr') {
    const measured = measureSection(ctx, section, pageDimensions.contentWidth, fontOptions, layoutOptions);
    if (startHeight + measured.measuredHeight <= pageDimensions.contentHeight) {
      currentPage.sections.push(measured);
    } else {
      pages.push(currentPage);
      const newPage = createEmptyPage(pages.length + 1);
      newPage.sections.push(measured);
      pages.push(newPage);
    }
    return;
  }

  // Add spacing before headings
  let spacingBefore = 0;
  if (section.type === 'heading') {
    switch (section.level) {
      case 1: spacingBefore = layoutOptions.spacingAboveH1; break;
      case 2: spacingBefore = layoutOptions.spacingAboveH2; break;
      case 3: spacingBefore = layoutOptions.spacingAboveH3; break;
    }
  }

  // Parse inline markdown to get spans for re-wrapping
  const rawSpans = parseInlineMarkdown(section.rawMarkdown.replace(/\n/g, ' '));

  // Flow line by line
  let currentY = startHeight + spacingBefore;
  let remainingSpans: TextSpan[] = [...rawSpans];
  const resultLines: string[] = [];
  const resultRichLines: RichTextLine[] = [];
  const resultLineHeights: number[] = [];
  const resultLinePositions: LinePosition[] = [];

  while (remainingSpans.length > 0) {
    // Check if we've exceeded the page
    if (currentY + lineHeight > pageDimensions.contentHeight) {
      // Push what we have as a partial section and start a new page
      if (resultLines.length > 0) {
        const partialSection: MeasuredSection = {
          ...section,
          measuredHeight: currentY - startHeight,
          lines: [...resultLines],
          richLines: [...resultRichLines],
          lineHeights: [...resultLineHeights],
          linePositions: [...resultLinePositions],
        };
        currentPage.sections.push(partialSection);
      }
      pages.push(currentPage);

      // Start new page
      const newPage = createEmptyPage(pages.length + 1);
      currentPage = newPage;
      currentY = 0;
      startHeight = 0;
      resultLines.length = 0;
      resultRichLines.length = 0;
      resultLineHeights.length = 0;
      resultLinePositions.length = 0;

      // New page may have different (or no) zones — get zones for new page
      // Note: we use the original zones for simplicity; displacement zones are
      // collected from existing items which are on specific page numbers
      // New overflow pages won't have items, so they get full width
      zones = [];
    }

    // Get available text region at current Y
    const region = getTextRegionAtY(currentY, lineHeight, zones, pageDimensions.contentWidth);

    if (region.width <= 0) {
      // No space at this Y — skip to below the blocking items
      const clearY = findNextClearY(currentY, zones);
      currentY = clearY;
      continue;
    }

    // Wrap remaining spans at the available width
    const wrappedLines = wrapRichTextAtWidth(ctx, remainingSpans, region.width, fontStyle, fontOptions);

    if (wrappedLines.length === 0) break;

    // Take the first wrapped line
    const firstLine = wrappedLines[0];
    const lineText = firstLine.spans.map(s => s.text).join('');

    resultLines.push(lineText);
    resultRichLines.push(firstLine);
    resultLineHeights.push(lineHeight);
    resultLinePositions.push({ xOffset: region.xOffset, width: region.width });

    // Remove the consumed spans from remaining
    // Count how many characters we consumed from the first line
    const consumedText = lineText.replace(/\s+/g, ' ').trim();
    remainingSpans = consumeSpans(remainingSpans, consumedText);

    currentY += lineHeight;
  }

  // Add paragraph spacing
  const totalHeight = (currentY - startHeight) + layoutOptions.paragraphSpacing;

  if (resultLines.length > 0) {
    const measuredSection: MeasuredSection = {
      ...section,
      measuredHeight: totalHeight,
      lines: resultLines,
      richLines: resultRichLines,
      lineHeights: resultLineHeights,
      linePositions: resultLinePositions,
    };
    currentPage.sections.push(measuredSection);
  }

  // Make sure the current page is tracked
  if (!pages.includes(currentPage) && currentPage.sections.length > 0) {
    pages.push(currentPage);
  }
}

/**
 * Consume spans that have been placed on a line, returning remaining spans
 */
function consumeSpans(spans: TextSpan[], consumedText: string): TextSpan[] {
  if (!consumedText || spans.length === 0) return spans;

  // Flatten all span text into a single string to track position
  let totalText = '';
  const spanBoundaries: Array<{ spanIndex: number; start: number; end: number }> = [];

  for (let i = 0; i < spans.length; i++) {
    const start = totalText.length;
    totalText += spans[i].text;
    spanBoundaries.push({ spanIndex: i, start, end: totalText.length });
  }

  // Find how far into the total text the consumed text reaches
  // Normalize whitespace for comparison
  const normalizedTotal = totalText.replace(/\s+/g, ' ').trim();
  const normalizedConsumed = consumedText.replace(/\s+/g, ' ').trim();

  if (normalizedConsumed.length >= normalizedTotal.length) {
    return []; // All consumed
  }

  // Find the character position in the original text that corresponds to where consumed text ends
  let consumedChars = 0;
  let originalPos = 0;
  const targetLen = normalizedConsumed.length;

  while (consumedChars < targetLen && originalPos < totalText.length) {
    // Skip leading whitespace in both
    while (originalPos < totalText.length && /\s/.test(totalText[originalPos])) {
      originalPos++;
    }
    while (consumedChars < targetLen && /\s/.test(normalizedConsumed[consumedChars])) {
      consumedChars++;
    }

    if (consumedChars < targetLen) {
      originalPos++;
      consumedChars++;
    }
  }

  // Skip any trailing whitespace in the original
  while (originalPos < totalText.length && /\s/.test(totalText[originalPos])) {
    originalPos++;
  }

  if (originalPos >= totalText.length) {
    return [];
  }

  // Build remaining spans starting from originalPos
  const result: TextSpan[] = [];
  for (const boundary of spanBoundaries) {
    if (boundary.end <= originalPos) continue; // Fully consumed

    if (boundary.start >= originalPos) {
      // Entirely remaining
      result.push({ ...spans[boundary.spanIndex] });
    } else {
      // Partially consumed
      const offset = originalPos - boundary.start;
      result.push({
        ...spans[boundary.spanIndex],
        text: spans[boundary.spanIndex].text.substring(offset),
      });
    }
  }

  return result;
}

/**
 * Handle page break for standard (non-displaced) flow
 * Extracted from the original flowSections logic
 */
function handlePageBreak(
  ctx: CanvasRenderingContext2D,
  section: DocumentSection,
  measured: MeasuredSection,
  pageDimensions: PageDimensions,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions,
  pages: PageContent[],
  currentPage: PageContent,
  currentHeight: number
): void {
  // Try to fit partial content if possible (for paragraphs and blockquotes)
  if ((section.type === 'paragraph' || section.type === 'blockquote') && measured.lines.length > 1) {
    const fontStyle = getFontStyleForSection(section, fontOptions);
    const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

    const sourceLines = measured.richLines && measured.richLines.length > 0
      ? measured.richLines
      : measured.lines;
    const totalLineCount = Array.isArray(sourceLines) ? sourceLines.length : 0;

    let remainingLineIndex = 0;

    // First, fit what we can on the current page
    const remainingHeight = pageDimensions.contentHeight - currentHeight;
    const linesForCurrentPage = Math.floor(remainingHeight / lineHeight);

    if (linesForCurrentPage >= 2 && remainingLineIndex < totalLineCount) {
      const endIndex = Math.min(remainingLineIndex + linesForCurrentPage, totalLineCount);

      const firstPart: MeasuredSection = {
        ...measured,
        lines: measured.lines.slice(remainingLineIndex, endIndex),
        richLines: measured.richLines?.slice(remainingLineIndex, endIndex),
        lineHeights: measured.lines.slice(remainingLineIndex, endIndex).map(() => lineHeight),
        linePositions: measured.linePositions?.slice(remainingLineIndex, endIndex),
        measuredHeight: (endIndex - remainingLineIndex) * lineHeight,
      };

      currentPage.sections.push(firstPart);
      pages.push(currentPage);
      remainingLineIndex = endIndex;

      currentPage = createEmptyPage(pages.length + 1);
    } else if (currentPage.sections.length > 0) {
      pages.push(currentPage);
      currentPage = createEmptyPage(pages.length + 1);
    }

    // Handle remaining lines
    const maxLinesPerPage = Math.floor(pageDimensions.contentHeight / lineHeight);

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
        linePositions: measured.linePositions?.slice(remainingLineIndex, endIndex),
        measuredHeight: linesToAdd * lineHeight + (isLastPart ? layoutOptions.paragraphSpacing : 0),
      };

      currentPage.sections.push(part);
      remainingLineIndex = endIndex;

      if (remainingLineIndex < totalLineCount) {
        pages.push(currentPage);
        currentPage = createEmptyPage(pages.length + 1);
      }
    }

    // Push the last page
    pages.push(currentPage);
    return;
  }

  // Can't split or don't want to, move whole section to new page
  if (currentPage.sections.length > 0) {
    pages.push(currentPage);
  }
  currentPage = createEmptyPage(pages.length + 1);

  // Add section to new page - handle oversized sections
  if (measured.measuredHeight <= pageDimensions.contentHeight) {
    currentPage.sections.push(measured);
    pages.push(currentPage);
  } else {
    // Section is too tall for a single page - force-break by lines
    const fontStyle = getFontStyleForSection(section, fontOptions);
    const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;
    const maxLinesPerPage = Math.floor(pageDimensions.contentHeight / lineHeight);
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
        linePositions: measured.linePositions?.slice(lineIndex, endIndex),
        measuredHeight: linesToAdd * lineHeight + (isLastPart ? layoutOptions.paragraphSpacing : 0),
      };

      currentPage.sections.push(part);
      lineIndex = endIndex;

      if (lineIndex < totalLineCount) {
        pages.push(currentPage);
        currentPage = createEmptyPage(pages.length + 1);
      }
    }

    pages.push(currentPage);
  }
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
