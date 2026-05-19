/**
 * Slot-based text flow.
 *
 * Builds an ordered sequence of "slots" that need to be filled with markdown
 * content — full text pages plus any text-flow item regions on static pages —
 * and pours sections into them in document order. Each text-flow item ends up
 * with a slice of the same markdown flow that runs through the surrounding
 * pages, so it acts like a mini-page embedded in a static page.
 */

import { measureSection, getFontStyleForSection } from './measurement';
import type { MeasuredSection, PageDimensions } from './types';
import type {
  DocumentSection,
  PageContent,
  PageItem,
  TextFlowPageItem,
  FontOptions,
  LayoutOptions,
} from '../../types';

export interface FlowSlot {
  kind: 'page' | 'item';
  contentWidth: number;
  contentHeight: number;
  pageNumber?: number;       // For kind === 'page'
  hostPageNumber?: number;   // For kind === 'item'
  itemId?: string;           // For kind === 'item'
  sections: MeasuredSection[];
}

/**
 * Build the initial sequence of slots from existing static pages.
 * Iterates from page 1 up to the highest static page number; static pages
 * contribute one slot per text-flow item (top-to-bottom), other positions
 * contribute a single full-page text slot.
 */
export function buildInitialSlots(
  staticPagesByNumber: Map<number, PageContent>,
  fullPageDim: PageDimensions
): FlowSlot[] {
  const slots: FlowSlot[] = [];
  const staticPageNumbers = [...staticPagesByNumber.keys()];
  const maxStaticPageNum = staticPageNumbers.length > 0
    ? Math.max(...staticPageNumbers)
    : 0;

  for (let pn = 1; pn <= maxStaticPageNum; pn++) {
    const staticPage = staticPagesByNumber.get(pn);
    if (staticPage) {
      const textFlowItems = (staticPage.items || [])
        .filter((it): it is TextFlowPageItem => it.type === 'textFlow')
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x);

      for (const item of textFlowItems) {
        const padding = item.padding ?? 0;
        slots.push({
          kind: 'item',
          contentWidth: Math.max(0, item.width - padding * 2),
          contentHeight: Math.max(0, item.height - padding * 2),
          hostPageNumber: pn,
          itemId: item.id,
          sections: [],
        });
      }
      // Static pages without text-flow items contribute no flow slot.
    } else {
      slots.push({
        kind: 'page',
        contentWidth: fullPageDim.contentWidth,
        contentHeight: fullPageDim.contentHeight,
        pageNumber: pn,
        sections: [],
      });
    }
  }

  return slots;
}

/**
 * Flow sections into the slot sequence. Auto-extends with full text-page slots
 * for any content that remains after the initial slot list is filled.
 */
export function flowSectionsIntoSlots(
  ctx: CanvasRenderingContext2D,
  sections: DocumentSection[],
  initialSlots: FlowSlot[],
  fullPageDim: PageDimensions,
  staticPagesByNumber: Map<number, PageContent>,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): FlowSlot[] {
  const slots: FlowSlot[] = initialSlots.map(s => ({ ...s, sections: [] }));

  // Next available page number for auto-extended text slots — must skip
  // pages already occupied by static pages.
  let nextTextPageNum = 1;
  const advanceNextTextPageNum = (): number => {
    while (staticPagesByNumber.has(nextTextPageNum)) nextTextPageNum++;
    const result = nextTextPageNum;
    nextTextPageNum++;
    return result;
  };

  // Seed advance counter: account for page numbers already used by initial
  // text-page slots so auto-extension starts after them.
  for (const slot of slots) {
    if (slot.kind === 'page' && slot.pageNumber !== undefined) {
      if (slot.pageNumber >= nextTextPageNum) {
        nextTextPageNum = slot.pageNumber + 1;
      }
    }
  }

  let slotIndex = 0;
  let currentHeight = 0;

  const ensureSlot = (): FlowSlot => {
    while (slotIndex >= slots.length) {
      slots.push({
        kind: 'page',
        contentWidth: fullPageDim.contentWidth,
        contentHeight: fullPageDim.contentHeight,
        pageNumber: advanceNextTextPageNum(),
        sections: [],
      });
    }
    return slots[slotIndex];
  };

  const advanceSlot = () => {
    slotIndex++;
    currentHeight = 0;
  };

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    if (section.type === 'hr') {
      if (ensureSlot().sections.length > 0) advanceSlot();
      continue;
    }

    let slot = ensureSlot();

    // H1 page break — only honored between full-page slots, otherwise it
    // would force a textFlow region to flush mid-flow.
    if (
      section.type === 'heading' &&
      section.level === 1 &&
      layoutOptions.emptyPageBeforeH1 &&
      slot.kind === 'page' &&
      slot.sections.length > 0
    ) {
      advanceSlot();
      slot = ensureSlot();
    }

    const measured = measureSection(ctx, section, slot.contentWidth, fontOptions, layoutOptions);

    if (currentHeight + measured.measuredHeight <= slot.contentHeight) {
      slot.sections.push(measured);
      currentHeight += measured.measuredHeight;
      continue;
    }

    // Doesn't fit. Try to split a paragraph/blockquote across slots.
    if (
      (section.type === 'paragraph' || section.type === 'blockquote') &&
      measured.lines.length > 1
    ) {
      const fontStyle = getFontStyleForSection(section, fontOptions);
      const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;

      const sourceLines = measured.richLines && measured.richLines.length > 0
        ? measured.richLines
        : measured.lines;
      const totalLineCount = Array.isArray(sourceLines) ? sourceLines.length : 0;

      let lineCursor = 0;

      // Fit what we can into the current slot if at least two lines fit.
      const remainingHeight = slot.contentHeight - currentHeight;
      const linesForCurrent = Math.floor(remainingHeight / lineHeight);

      if (linesForCurrent >= 2 && lineCursor < totalLineCount) {
        const endIndex = Math.min(lineCursor + linesForCurrent, totalLineCount);
        slot.sections.push(makePartialSection(measured, lineCursor, endIndex, lineHeight, false, layoutOptions));
        lineCursor = endIndex;
        advanceSlot();
      } else if (slot.sections.length > 0) {
        advanceSlot();
      }

      // Spread remaining lines across as many slots as needed.
      while (lineCursor < totalLineCount) {
        slot = ensureSlot();
        // Re-measure for this slot's width — measured was computed for prior
        // slot width which may be different (e.g., page vs item).
        // For now we keep the same measured.lines (computed at the original
        // contentWidth). Lines were already wrapped to the slot they started
        // in, so we'd ideally re-wrap. v1: tolerate slight overflow.
        const maxLinesPerSlot = Math.floor(slot.contentHeight / lineHeight);
        if (maxLinesPerSlot < 1) {
          // Slot too small; skip to next slot.
          advanceSlot();
          continue;
        }
        const linesLeft = totalLineCount - lineCursor;
        const linesToAdd = Math.min(linesLeft, maxLinesPerSlot);
        const endIndex = lineCursor + linesToAdd;
        const isLast = endIndex >= totalLineCount;

        slot.sections.push(makePartialSection(measured, lineCursor, endIndex, lineHeight, isLast, layoutOptions));
        currentHeight = (isLast ? linesToAdd * lineHeight + layoutOptions.paragraphSpacing : linesToAdd * lineHeight);
        lineCursor = endIndex;

        if (lineCursor < totalLineCount) {
          advanceSlot();
        }
      }
      continue;
    }

    // Non-splittable section: push to next slot.
    if (slot.sections.length > 0) advanceSlot();
    slot = ensureSlot();

    if (measured.measuredHeight <= slot.contentHeight) {
      slot.sections.push(measured);
      currentHeight = measured.measuredHeight;
      continue;
    }

    // Section taller than a whole slot — force-break by lines.
    const fontStyle = getFontStyleForSection(section, fontOptions);
    const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;
    const sourceLines = measured.richLines && measured.richLines.length > 0
      ? measured.richLines
      : measured.lines;
    const totalLineCount = Array.isArray(sourceLines) ? sourceLines.length : 0;

    let lineCursor = 0;
    while (lineCursor < totalLineCount) {
      slot = ensureSlot();
      const maxLinesPerSlot = Math.floor(slot.contentHeight / lineHeight);
      if (maxLinesPerSlot < 1) {
        advanceSlot();
        continue;
      }
      const linesLeft = totalLineCount - lineCursor;
      const linesToAdd = Math.min(linesLeft, maxLinesPerSlot);
      const endIndex = lineCursor + linesToAdd;
      const isLast = endIndex >= totalLineCount;

      slot.sections.push(makePartialSection(measured, lineCursor, endIndex, lineHeight, isLast, layoutOptions));
      currentHeight = (isLast ? linesToAdd * lineHeight + layoutOptions.paragraphSpacing : linesToAdd * lineHeight);
      lineCursor = endIndex;

      if (lineCursor < totalLineCount) advanceSlot();
    }
  }

  return slots;
}

function makePartialSection(
  source: MeasuredSection,
  startLine: number,
  endLine: number,
  lineHeight: number,
  isLast: boolean,
  layoutOptions: LayoutOptions
): MeasuredSection {
  const lines = source.lines.slice(startLine, endLine);
  return {
    ...source,
    lines,
    richLines: source.richLines?.slice(startLine, endLine),
    lineHeights: lines.map(() => lineHeight),
    measuredHeight: lines.length * lineHeight + (isLast ? layoutOptions.paragraphSpacing : 0),
  };
}

/**
 * Materialize filled slots back into text pages and updated static pages.
 * Text-page slots become PageContent entries; item slots write their flowed
 * sections back into the host static page's text-flow items.
 */
export function materializeSlots(
  filledSlots: FlowSlot[],
  staticPagesByNumber: Map<number, PageContent>
): { textPages: PageContent[]; updatedStaticPages: Map<number, PageContent> } {
  const textPages: PageContent[] = [];
  // Map: pageNumber -> Map<itemId, sections>
  const itemContentByPage = new Map<number, Map<string, MeasuredSection[]>>();

  for (const slot of filledSlots) {
    if (slot.kind === 'page' && slot.pageNumber !== undefined) {
      if (slot.sections.length === 0) continue;
      textPages.push({
        id: crypto.randomUUID(),
        pageNumber: slot.pageNumber,
        pageState: 'text',
        sections: slot.sections,
        isBlank: false,
        isRecto: slot.pageNumber % 2 === 1,
        isStatic: false,
      });
    } else if (slot.kind === 'item' && slot.hostPageNumber !== undefined && slot.itemId) {
      let pageMap = itemContentByPage.get(slot.hostPageNumber);
      if (!pageMap) {
        pageMap = new Map();
        itemContentByPage.set(slot.hostPageNumber, pageMap);
      }
      pageMap.set(slot.itemId, slot.sections);
    }
  }

  // Apply item content to copies of static pages.
  const updatedStaticPages = new Map<number, PageContent>();
  for (const [pageNum, page] of staticPagesByNumber) {
    const itemContent = itemContentByPage.get(pageNum);
    if (!itemContent) {
      updatedStaticPages.set(pageNum, page);
      continue;
    }
    const newItems: PageItem[] = (page.items || []).map(it => {
      if (it.type !== 'textFlow') return it;
      const sections = itemContent.get(it.id);
      if (!sections) return it;
      return { ...it, flowedSections: sections } as TextFlowPageItem;
    });
    updatedStaticPages.set(pageNum, { ...page, items: newItems });
  }

  return { textPages, updatedStaticPages };
}
