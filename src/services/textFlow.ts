/**
 * Text flow engine for laying out markdown content across pages
 * Uses canvas-based text measurement for accurate flow calculations
 */

import { marked } from 'marked';
import type {
  DocumentSection,
  PageContent,
  Spread,
  Signature,
  LayoutOptions,
  FontOptions,
  OutputOptions,
  HeaderFooterOptions,
  FontStyle,
  Margins,
  StaticSpread,
} from '../types';
import { SHEET_SIZES } from '../types';
import { appState } from './state';

interface MeasuredSection extends DocumentSection {
  measuredHeight: number;
  lines: string[];
  lineHeights: number[];
}

interface FlowResult {
  pages: PageContent[];
  spreads: Spread[];
  signatures: Signature[];
  totalPages: number;
}

// Cache for font measurements
const measurementCache = new Map<string, number>();

/**
 * Clear the measurement cache - call this when fonts change
 */
export function clearMeasurementCache(): void {
  measurementCache.clear();
}

export class TextFlowEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontOptions: FontOptions;
  private layoutOptions: LayoutOptions;
  private outputOptions: OutputOptions;
  private headerFooter: HeaderFooterOptions;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.fontOptions = appState.getProject().fontOptions;
    this.layoutOptions = appState.getProject().layoutOptions;
    this.outputOptions = appState.getProject().outputOptions;
    this.headerFooter = appState.getProject().headerFooter;
  }

  /**
   * Main entry point - reflow content based on current state
   * Static pages are preserved in place and text flows around them
   */
  reflow(markdown: string): FlowResult {
    // Refresh options from state
    const project = appState.getProject();
    this.fontOptions = project.fontOptions;
    this.layoutOptions = project.layoutOptions;
    this.outputOptions = project.outputOptions;
    this.headerFooter = project.headerFooter;

    // Capture existing static pages from current signatures
    // These will be preserved in their positions
    const staticPagesByNumber = this.captureStaticPages(project.signatures);

    // Parse markdown into sections
    const sections = this.parseMarkdown(markdown);

    // Calculate page dimensions
    const pageDimensions = this.calculatePageDimensions();

    // Flow sections across pages
    const textPages = this.flowSections(sections, pageDimensions);

    // Insert blank pages (user-specified)
    const textPagesWithBlanks = this.insertBlankPages(textPages, project.blankPages);

    // Merge text pages with static pages, keeping static pages in their positions
    const allPages = this.mergeStaticPagesInPlace(textPagesWithBlanks, staticPagesByNumber);

    // Create spreads from all pages
    const spreads = this.createSpreadsFromPages(allPages);

    const signatures = this.createSignatures(spreads);

    return {
      pages: allPages,
      spreads,
      signatures,
      totalPages: allPages.length,
    };
  }

  /**
   * Capture static pages from existing signatures
   * Returns a map of pageNumber -> PageContent for static pages
   */
  private captureStaticPages(signatures: import('../types').Signature[]): Map<number, PageContent> {
    const staticPages = new Map<number, PageContent>();

    for (const sig of signatures) {
      for (const spread of sig.spreads) {
        if (spread.verso?.pageState === 'static') {
          staticPages.set(spread.verso.pageNumber, spread.verso);
        }
        if (spread.recto?.pageState === 'static') {
          staticPages.set(spread.recto.pageNumber, spread.recto);
        }
      }
    }

    return staticPages;
  }

  /**
   * Merge text pages with static pages
   * Static pages stay in their positions, text pages fill the remaining slots
   *
   * Page 0 (back cover) is handled specially - it's always created if not static
   * Text pages from flowSections have pageNumbers 1,2,3,... which are their ORDER,
   * not their final positions. They get renumbered as they're placed.
   */
  private mergeStaticPagesInPlace(textPages: PageContent[], staticPages: Map<number, PageContent>): PageContent[] {
    // Get previous back cover state
    const project = appState.getProject();
    const prevFirstSpread = project.signatures[0]?.spreads[0];

    // If no static pages, use the original flow but ensure page 0 (back cover) exists
    if (staticPages.size === 0) {
      const result: PageContent[] = [];

      // Create page 0 (back cover)
      const backCoverPage = this.createEmptyPage(0, true);
      backCoverPage.isRecto = false;
      backCoverPage.isStatic = true;
      backCoverPage.pageState = 'available';
      if (prevFirstSpread?.verso?.pageNumber === 0) {
        if (prevFirstSpread.verso.items) backCoverPage.items = prevFirstSpread.verso.items;
        if (prevFirstSpread.verso.backgroundFill) backCoverPage.backgroundFill = prevFirstSpread.verso.backgroundFill;
        if (prevFirstSpread.verso.pageState) backCoverPage.pageState = prevFirstSpread.verso.pageState;
      }
      result.push(backCoverPage);

      // Add text pages with corrected page numbers (starting from 1)
      for (let i = 0; i < textPages.length; i++) {
        const pageNum = i + 1;
        result.push({
          ...textPages[i],
          pageNumber: pageNum,
          isRecto: pageNum % 2 === 1,
          pageState: 'text',
        });
      }

      return result;
    }

    // With static pages, we need to place them at their positions
    // and flow text into the remaining slots

    // Find the range of pages we need
    const maxStaticPageNum = Math.max(...staticPages.keys());
    // We need at least enough slots for all text + all static pages
    // But also at least up to the max static page number
    const minPagesNeeded = Math.max(textPages.length + staticPages.size, maxStaticPageNum + 1);

    const result: PageContent[] = [];
    let textPageIndex = 0;

    // First, handle page 0 (back cover) specially
    if (staticPages.has(0)) {
      const staticPage = staticPages.get(0)!;
      result.push({
        ...staticPage,
        pageNumber: 0,
        isRecto: false,
      });
    } else {
      // Create back cover as available
      const backCoverPage = this.createEmptyPage(0, true);
      backCoverPage.isRecto = false;
      backCoverPage.isStatic = true;
      backCoverPage.pageState = 'available';
      if (prevFirstSpread?.verso?.pageNumber === 0) {
        if (prevFirstSpread.verso.items) backCoverPage.items = prevFirstSpread.verso.items;
        if (prevFirstSpread.verso.backgroundFill) backCoverPage.backgroundFill = prevFirstSpread.verso.backgroundFill;
        if (prevFirstSpread.verso.pageState) backCoverPage.pageState = prevFirstSpread.verso.pageState;
      }
      result.push(backCoverPage);
    }

    // Now handle pages 1 through minPagesNeeded
    for (let pageNum = 1; pageNum < minPagesNeeded; pageNum++) {
      if (staticPages.has(pageNum)) {
        // This position has a static page - use it
        const staticPage = staticPages.get(pageNum)!;
        result.push({
          ...staticPage,
          pageNumber: pageNum,
          isRecto: pageNum % 2 === 1,
        });
      } else if (textPageIndex < textPages.length) {
        // Fill with text content
        result.push({
          ...textPages[textPageIndex],
          pageNumber: pageNum,
          isRecto: pageNum % 2 === 1,
          pageState: 'text',
        });
        textPageIndex++;
      } else {
        // No more text, create available page
        result.push(this.createEmptyPage(pageNum, true));
      }
    }

    // If there are remaining text pages, append them at the end
    while (textPageIndex < textPages.length) {
      const pageNum = result.length;
      result.push({
        ...textPages[textPageIndex],
        pageNumber: pageNum,
        isRecto: pageNum % 2 === 1,
        pageState: 'text',
      });
      textPageIndex++;
    }

    return result;
  }

  /**
   * Create spreads from a linear array of pages
   * NEW LAYOUT: First page on right, last page on left
   * - First spread: [null | page 1] - ghost placeholder for back cover
   * - Middle spreads: [2|3], [4|5], etc.
   * - Last spread: [lastPage | null] - back cover on left
   */
  private createSpreadsFromPages(pages: PageContent[]): Spread[] {
    const spreads: Spread[] = [];

    if (pages.length === 0) return spreads;

    // Sort pages by page number
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

    // First spread: null verso (ghost placeholder), page 1 on recto
    const page1 = sortedPages.find(p => p.pageNumber === 1) || sortedPages[0];
    spreads.push({
      id: crypto.randomUUID(),
      spreadNumber: 1,
      verso: null, // Ghost placeholder - UI renders back cover ghost here
      recto: page1,
    });

    // Middle spreads: pair remaining pages
    // Skip page 1, pair pages 2-3, 4-5, etc., but save last page for final spread
    const remainingPages = sortedPages.filter(p => p.pageNumber !== 1);
    const lastPage = remainingPages.length > 0 ? remainingPages[remainingPages.length - 1] : null;
    const middlePages = lastPage ? remainingPages.slice(0, -1) : [];

    for (let i = 0; i < middlePages.length; i += 2) {
      const verso = middlePages[i] || null;
      const recto = middlePages[i + 1] || null;

      if (verso || recto) {
        spreads.push({
          id: crypto.randomUUID(),
          spreadNumber: spreads.length + 1,
          verso,
          recto,
        });
      }
    }

    // Last spread: back cover on left, null on right
    if (lastPage && lastPage.pageNumber !== 1) {
      spreads.push({
        id: crypto.randomUUID(),
        spreadNumber: spreads.length + 1,
        verso: lastPage,
        recto: null, // Empty - back cover is on left
      });
    }

    return spreads;
  }

  /**
   * DEPRECATED: Merge static spreads with content spreads
   * This method is kept for backward compatibility but is no longer used
   */
  private mergeStaticSpreads(contentSpreads: Spread[], staticSpreads: StaticSpread[]): Spread[] {
    const merged = [...contentSpreads];

    const baseSpreadNumber = merged.length > 0
      ? Math.max(...merged.map(s => s.spreadNumber)) + 1
      : 1;

    staticSpreads.forEach((staticSpread, index) => {
      const spreadNumber = baseSpreadNumber + index;
      const basePageNumber = contentSpreads.length * 2 + index * 2;

      const verso = staticSpread.verso ? {
        ...staticSpread.verso,
        pageNumber: basePageNumber,
      } : null;

      const recto = staticSpread.recto ? {
        ...staticSpread.recto,
        pageNumber: basePageNumber + 1,
      } : null;

      merged.push({
        id: staticSpread.id,
        spreadNumber,
        verso,
        recto,
      });
    });

    return merged;
  }

  /**
   * Parse markdown into structured sections
   */
  private parseMarkdown(markdown: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const tokens = marked.lexer(markdown);

    for (const token of tokens) {
      const section = this.tokenToSection(token);
      if (section) {
        sections.push(section);
      }
    }

    return sections;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenToSection(token: any): DocumentSection | null {
    const id = crypto.randomUUID();

    switch (token.type) {
      case 'heading':
        return {
          id,
          type: 'heading',
          level: token.depth,
          content: this.decodeHtmlEntities(token.text),
          rawMarkdown: token.raw,
        };

      case 'paragraph':
        // Check for image - format: ![caption](image-path.jpg)
        if (token.tokens?.length === 1 && token.tokens[0].type === 'image') {
          const imgToken = token.tokens[0];
          // text = alt text (caption), title = optional title attribute
          const caption = this.decodeHtmlEntities(imgToken.text || imgToken.title || '');
          return {
            id,
            type: 'image',
            content: caption,
            rawMarkdown: token.raw,
            imageRef: imgToken.href,
          };
        }
        return {
          id,
          type: 'paragraph',
          content: this.extractText(token),
          rawMarkdown: token.raw,
        };

      case 'list':
        return {
          id,
          type: 'list',
          content: this.extractListText(token),
          rawMarkdown: token.raw,
        };

      case 'code':
        return {
          id,
          type: 'code',
          content: token.text,
          rawMarkdown: token.raw,
        };

      case 'blockquote':
        return {
          id,
          type: 'blockquote',
          content: this.extractBlockquoteText(token),
          rawMarkdown: token.raw,
        };

      case 'hr':
        return {
          id,
          type: 'hr',
          content: '',
          rawMarkdown: token.raw,
        };

      case 'space':
        return null;

      default:
        return null;
    }
  }

  /**
   * Decode HTML entities back to normal characters
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&mdash;': '\u2014', // em dash
      '&ndash;': '\u2013', // en dash
      '&hellip;': '\u2026', // ellipsis
      '&lsquo;': '\u2018', // left single quote
      '&rsquo;': '\u2019', // right single quote
      '&ldquo;': '\u201C', // left double quote
      '&rdquo;': '\u201D', // right double quote
    };

    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
      result = result.replace(new RegExp(entity, 'g'), char);
    }
    // Handle numeric entities like &#60;
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractText(token: any): string {
    let text: string;
    if ('tokens' in token && token.tokens) {
      text = token.tokens.map((t: any) => {
        if ('text' in t) return t.text;
        if ('raw' in t) return t.raw;
        return '';
      }).join('');
    } else {
      text = 'text' in token ? token.text : '';
    }
    return this.decodeHtmlEntities(text);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractListText(token: any): string {
    return token.items.map((item: any, i: number) => {
      const prefix = token.ordered ? `${i + 1}. ` : '• ';
      const text = item.tokens?.map((t: any) => {
        if (t.type === 'text') return t.text;
        if ('text' in t) return t.text;
        return '';
      }).join('') || item.text;
      return prefix + this.decodeHtmlEntities(text);
    }).join('\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractBlockquoteText(token: any): string {
    const text = token.tokens?.map((t: any) => {
      if (t.type === 'paragraph') return this.extractText(t);
      if ('text' in t) return t.text;
      return '';
    }).join('\n') || '';
    return this.decodeHtmlEntities(text);
  }

  /**
   * Calculate page content dimensions
   */
  private calculatePageDimensions(): {
    width: number;
    height: number;
    contentWidth: number;
    contentHeight: number;
  } {
    const sheetSize = SHEET_SIZES[this.outputOptions.sheetSize];

    // For booklets, the page is half the sheet size
    let pageWidth: number;
    let pageHeight: number;

    if (this.outputOptions.bookletSize === 'custom') {
      pageWidth = this.outputOptions.customWidth || sheetSize.width / 2;
      pageHeight = this.outputOptions.customHeight || sheetSize.height;
    } else if (this.outputOptions.bookletSize.startsWith('half-')) {
      // Half-size booklet (fold once)
      pageWidth = sheetSize.width / 2;
      pageHeight = sheetSize.height;
    } else {
      // Quarter-size booklet (fold twice)
      pageWidth = sheetSize.width / 2;
      pageHeight = sheetSize.height / 2;
    }

    const margins = this.layoutOptions.margins;
    const headerHeight = this.headerFooter.header.enabled ? this.headerFooter.header.height : 0;
    const footerHeight = this.headerFooter.footer.enabled ? this.headerFooter.footer.height : 0;

    const contentWidth = pageWidth - margins.inner - margins.outer;
    const contentHeight = pageHeight - margins.top - margins.bottom - headerHeight - footerHeight;

    return { width: pageWidth, height: pageHeight, contentWidth, contentHeight };
  }

  /**
   * Get margins for a specific page (with overrides)
   */
  private getMarginsForPage(pageNumber: number): Margins {
    const baseMargins = this.layoutOptions.margins;
    const override = this.layoutOptions.marginOverrides.find(o => o.pageNumber === pageNumber);

    if (override) {
      return { ...baseMargins, ...override.margins };
    }
    return baseMargins;
  }

  /**
   * Get font style for a section type
   */
  private getFontStyleForSection(section: DocumentSection): FontStyle {
    switch (section.type) {
      case 'heading':
        return this.fontOptions[`h${section.level || 1}` as keyof FontOptions] as FontStyle;
      case 'code':
        return this.fontOptions.code;
      case 'blockquote':
        return this.fontOptions.blockquote;
      default:
        return this.fontOptions.body;
    }
  }

  /**
   * Measure text width
   */
  private measureTextWidth(text: string, fontStyle: FontStyle): number {
    const cacheKey = `${text}|${fontStyle.fontFamily}|${fontStyle.fontSize}|${fontStyle.fontWeight}`;
    const cached = measurementCache.get(cacheKey);
    if (cached !== undefined) return cached;

    // Font family names with spaces must be quoted in CSS font string
    const quotedFamily = fontStyle.fontFamily.includes(' ')
      ? `"${fontStyle.fontFamily}"`
      : fontStyle.fontFamily;
    this.ctx.font = `${fontStyle.fontStyle} ${fontStyle.fontWeight} ${fontStyle.fontSize}px ${quotedFamily}`;
    const width = this.ctx.measureText(text).width;
    measurementCache.set(cacheKey, width);
    return width;
  }

  /**
   * Wrap text to fit within a width
   */
  private wrapText(text: string, maxWidth: number, fontStyle: FontStyle): string[] {
    // Apply a small safety margin (2%) to account for measurement differences
    // between Canvas 2D and Konva rendering engines
    const safeMaxWidth = maxWidth * 0.98;

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.measureTextWidth(testLine, fontStyle);

      if (testWidth <= safeMaxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        // Check if single word is too long
        if (this.measureTextWidth(word, fontStyle) > safeMaxWidth) {
          // Break word
          const chars = word.split('');
          let charLine = '';
          for (const char of chars) {
            const testCharLine = charLine + char;
            if (this.measureTextWidth(testCharLine, fontStyle) <= safeMaxWidth) {
              charLine = testCharLine;
            } else {
              if (charLine) lines.push(charLine);
              charLine = char;
            }
          }
          currentLine = charLine;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Measure a section's height
   */
  private measureSection(section: DocumentSection, contentWidth: number): MeasuredSection {
    const fontStyle = this.getFontStyleForSection(section);
    const lineHeight = this.layoutOptions.lineHeight * fontStyle.fontSize;

    // Handle different section types
    if (section.type === 'image') {
      // Fixed height for images (or could be configurable)
      return {
        ...section,
        measuredHeight: 200, // Placeholder height
        lines: [],
        lineHeights: [],
      };
    }

    if (section.type === 'hr') {
      return {
        ...section,
        measuredHeight: 24,
        lines: ['—————'],
        lineHeights: [24],
      };
    }

    // Wrap text content
    const textLines = section.content.split('\n');
    const wrappedLines: string[] = [];

    for (const textLine of textLines) {
      const wrapped = this.wrapText(textLine, contentWidth, fontStyle);
      wrappedLines.push(...wrapped);
    }

    const lineHeights = wrappedLines.map(() => lineHeight);

    // Add spacing before headings
    let spacingBefore = 0;
    if (section.type === 'heading') {
      switch (section.level) {
        case 1:
          spacingBefore = this.layoutOptions.spacingAboveH1;
          break;
        case 2:
          spacingBefore = this.layoutOptions.spacingAboveH2;
          break;
        case 3:
          spacingBefore = this.layoutOptions.spacingAboveH3;
          break;
      }
    }

    const measuredHeight = spacingBefore + wrappedLines.length * lineHeight + this.layoutOptions.paragraphSpacing;

    return {
      ...section,
      measuredHeight,
      lines: wrappedLines,
      lineHeights,
    };
  }

  /**
   * Flow sections across pages
   */
  private flowSections(sections: DocumentSection[], pageDimensions: ReturnType<typeof this.calculatePageDimensions>): PageContent[] {
    const pages: PageContent[] = [];
    let currentPage: PageContent = this.createEmptyPage(1);
    let currentHeight = 0;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Check for H1 page break
      if (section.type === 'heading' && section.level === 1 && this.layoutOptions.emptyPageBeforeH1 && currentPage.sections.length > 0) {
        // Finish current page
        pages.push(currentPage);

        // Add blank page if needed to make H1 start on recto
        if (pages.length % 2 === 1) {
          pages.push(this.createEmptyPage(pages.length + 1, true));
        }

        // Start new page
        currentPage = this.createEmptyPage(pages.length + 1);
        currentHeight = 0;
      }

      const measured = this.measureSection(section, pageDimensions.contentWidth);

      // Check if section fits on current page
      if (currentHeight + measured.measuredHeight <= pageDimensions.contentHeight) {
        currentPage.sections.push(measured);
        currentHeight += measured.measuredHeight;
      } else {
        // Need to break to new page
        // Try to fit partial content if possible (for paragraphs)
        if (section.type === 'paragraph' && measured.lines.length > 1) {
          const remainingHeight = pageDimensions.contentHeight - currentHeight;
          const fontStyle = this.getFontStyleForSection(section);
          const lineHeight = this.layoutOptions.lineHeight * fontStyle.fontSize;
          const linesPerPage = Math.floor(remainingHeight / lineHeight);

          if (linesPerPage >= 2) {
            // Split the paragraph
            const firstPartLines = measured.lines.slice(0, linesPerPage);
            const remainingLines = measured.lines.slice(linesPerPage);

            const firstPart: MeasuredSection = {
              ...measured,
              lines: firstPartLines,
              lineHeights: firstPartLines.map(() => lineHeight),
              measuredHeight: linesPerPage * lineHeight,
            };

            currentPage.sections.push(firstPart);
            pages.push(currentPage);

            // Start new page with remaining lines
            currentPage = this.createEmptyPage(pages.length + 1);
            currentHeight = 0;

            if (remainingLines.length > 0) {
              const remainingPart: MeasuredSection = {
                ...measured,
                lines: remainingLines,
                lineHeights: remainingLines.map(() => lineHeight),
                measuredHeight: remainingLines.length * lineHeight + this.layoutOptions.paragraphSpacing,
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
        currentPage = this.createEmptyPage(pages.length + 1);
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
          currentPage = this.createEmptyPage(pages.length + 1);
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

  private createEmptyPage(pageNumber: number, isBlank = false, isStatic = false): PageContent {
    // Determine pageState based on flags
    let pageState: import('../types').PageState = 'available';
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
   * Insert user-specified blank pages
   */
  private insertBlankPages(pages: PageContent[], blankPageNumbers: number[]): PageContent[] {
    const result: PageContent[] = [];
    let offset = 0;

    for (let i = 0; i < pages.length; i++) {
      const originalPageNumber = i + 1;

      // Insert blank pages before this page if specified
      for (const blankNum of blankPageNumbers) {
        if (blankNum === originalPageNumber) {
          const blankPage = this.createEmptyPage(result.length + 1, true);
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

  /**
   * Create spreads from pages
   *
   * For booklet printing, this creates spreads in reading order:
   * - Spread 1: [Back Cover indicator | Page 1 (front cover)]
   * - Spread 2: [Page 2 | Page 3]
   * - Spread 3: [Page 4 | Page 5]
   * - etc.
   *
   * The back cover is a special placeholder that represents where the
   * last page of the signature will appear when the booklet is folded.
   *
   * NEW LAYOUT:
   * - First spread: [ghost/null | page 1] - ghost of back cover shown at 50% in UI
   * - Middle spreads: [page 2 | page 3], [page 4 | page 5], etc.
   * - Last spread: [back cover | null] - back cover on left, empty on right
   */
  private createSpreads(pages: PageContent[]): Spread[] {
    const spreads: Spread[] = [];

    // Get previous signatures to preserve items on existing pages
    const project = appState.getProject();
    const prevFirstSpread = project.signatures[0]?.spreads[0];

    // Page 1 (front cover) - always exists
    const page1 = pages[0] || this.createEmptyPage(1, true);
    if (!pages[0]) {
      // No content - page 1 starts as available
      page1.isStatic = true; // Deprecated: kept for backward compat
      page1.pageState = 'available';
      // Preserve items and state from previous page 1
      if (prevFirstSpread?.recto?.pageNumber === 1) {
        if (prevFirstSpread.recto.items) {
          page1.items = prevFirstSpread.recto.items;
        }
        if (prevFirstSpread.recto.backgroundFill) {
          page1.backgroundFill = prevFirstSpread.recto.backgroundFill;
        }
        if (prevFirstSpread.recto.pageState) {
          page1.pageState = prevFirstSpread.recto.pageState;
        }
      }
    } else {
      // Has content - page 1 is a text page
      page1.pageState = 'text';
    }

    // Preserve the spread ID if it exists (helps with item references)
    const spreadId = prevFirstSpread?.id || crypto.randomUUID();

    // First spread: null verso (ghost placeholder), page 1 on recto
    // The ghost will be rendered by the UI as a 50% opacity clone of the back cover
    spreads.push({
      id: spreadId,
      spreadNumber: 1,
      verso: null, // Ghost placeholder - UI will render back cover ghost here
      recto: page1,
    });

    // Middle pages: create spreads [2|3], [4|5], etc.
    if (pages.length > 1) {
      for (let i = 1; i < pages.length; i += 2) {
        const verso = pages[i];
        const recto = pages[i + 1] || null;

        // Don't add if both are null
        if (verso || recto) {
          spreads.push({
            id: crypto.randomUUID(),
            spreadNumber: spreads.length + 1,
            verso,
            recto,
          });
        }
      }
    }

    return spreads;
  }

  /**
   * Create signatures from spreads
   */
  private createSignatures(spreads: Spread[]): Signature[] {
    const pagesPerSig = this.outputOptions.pagesPerSignature;
    const spreadsPerSig = pagesPerSig / 2;
    const signatures: Signature[] = [];

    // Pad spreads to fill complete signatures
    // Page numbering: spread 0 has [backCover(0) | page1], spread 1 has [page2 | page3], etc.
    // So spread at index N has pages (N*2) and (N*2 + 1) for N > 0
    // For padding spreads, continue this pattern
    const paddedSpreads = [...spreads];
    while (paddedSpreads.length % spreadsPerSig !== 0) {
      const emptySpread: Spread = {
        id: crypto.randomUUID(),
        spreadNumber: paddedSpreads.length + 1,
        verso: this.createEmptyPage(paddedSpreads.length * 2, true),
        recto: this.createEmptyPage(paddedSpreads.length * 2 + 1, true),
      };
      paddedSpreads.push(emptySpread);
    }

    for (let i = 0; i < paddedSpreads.length; i += spreadsPerSig) {
      const sigSpreads = paddedSpreads.slice(i, i + spreadsPerSig);
      signatures.push({
        id: crypto.randomUUID(),
        signatureNumber: Math.floor(i / spreadsPerSig) + 1,
        spreads: sigSpreads,
        pageCount: sigSpreads.length * 2,
      });
    }

    return signatures;
  }

  /**
   * Calculate imposition order for printing
   */
  calculateImposition(signature: Signature): Array<{
    sheetNumber: number;
    front: { left: number; right: number };
    back: { left: number; right: number };
  }> {
    const pageCount = signature.pageCount;
    const sheets: Array<{
      sheetNumber: number;
      front: { left: number; right: number };
      back: { left: number; right: number };
    }> = [];

    // For booklet imposition, pages are arranged so that when folded and nested,
    // they read in order. Formula: pair up (n, total-n+1) for n=1,2,3...
    const sheetCount = pageCount / 4;

    for (let sheet = 0; sheet < sheetCount; sheet++) {
      const basePageOffset = (signature.signatureNumber - 1) * pageCount;

      // Front of sheet (print first)
      const frontRight = sheet * 2 + 1 + basePageOffset;
      const frontLeft = pageCount - sheet * 2 + basePageOffset;

      // Back of sheet (print second, flipped)
      const backLeft = sheet * 2 + 2 + basePageOffset;
      const backRight = pageCount - sheet * 2 - 1 + basePageOffset;

      sheets.push({
        sheetNumber: sheet + 1,
        front: { left: frontLeft, right: frontRight },
        back: { left: backLeft, right: backRight },
      });
    }

    return sheets;
  }
}

// Singleton instance
export const textFlowEngine = new TextFlowEngine();
