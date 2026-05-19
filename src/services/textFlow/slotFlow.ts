/**
 * Slot-based text flow.
 *
 * Builds an ordered sequence of "slots" that need to be filled with markdown
 * content — full text pages plus any text-flow item regions on static pages —
 * and pours sections into them in document order. Each text-flow item ends up
 * with a slice of the same markdown flow that runs through the surrounding
 * pages, so it acts like a mini-page embedded in a static page.
 */

import { measureSection, getFontStyleForSection, measureTextWidth } from './measurement';
import { applyTextTransform } from './parsing';
import type { MeasuredSection, PageDimensions } from './types';
import type {
  DocumentSection,
  PageContent,
  PageItem,
  PolygonFlowLine,
  TextFlowPageItem,
  FontStyle,
  FontOptions,
  LayoutOptions,
} from '../../types';

export interface FlowSlot {
  kind: 'page' | 'item' | 'polygonItem';
  contentWidth: number;
  contentHeight: number;
  pageNumber?: number;       // For kind === 'page'
  hostPageNumber?: number;   // For kind === 'item' | 'polygonItem'
  itemId?: string;           // For kind === 'item' | 'polygonItem'
  // For 'polygonItem' slots only: absolute (item-local) polygon vertices
  // and the polygon's bounding box origin (offsets inside the item).
  polygonAbsPoints?: { x: number; y: number }[];
  sections: MeasuredSection[];
  // For 'polygonItem' slots: per-line laid-out content.
  polygonLines?: PolygonFlowLine[];
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
        if (item.flowShape === 'polygon' && item.polygonPoints && item.polygonPoints.length >= 3) {
          // Convert normalized polygon to absolute item-local coords.
          const absPoints = item.polygonPoints.map(p => ({
            x: p.x * item.width,
            y: p.y * item.height,
          }));
          slots.push({
            kind: 'polygonItem',
            contentWidth: item.width,
            contentHeight: item.height,
            hostPageNumber: pn,
            itemId: item.id,
            polygonAbsPoints: absPoints,
            sections: [],
            polygonLines: [],
          });
        } else {
          slots.push({
            kind: 'item',
            contentWidth: Math.max(0, item.width - padding * 2),
            contentHeight: Math.max(0, item.height - padding * 2),
            hostPageNumber: pn,
            itemId: item.id,
            sections: [],
          });
        }
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
  // Per-slot vertical cursor for polygon slots (lines lay out individually).
  let polygonY = 0;

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
    polygonY = 0;
  };

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    if (section.type === 'hr') {
      const s = ensureSlot();
      if ((s.sections.length > 0) || (s.polygonLines && s.polygonLines.length > 0)) {
        advanceSlot();
        polygonY = 0;
      }
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
      polygonY = 0;
      slot = ensureSlot();
    }

    // Polygon slot: lay out lines individually with width determined by the
    // polygon's horizontal extent at the line's y position.
    if (slot.kind === 'polygonItem' && slot.polygonAbsPoints) {
      const leftover = flowSectionIntoPolygonSlot(
        ctx, section, slot, polygonY, fontOptions, layoutOptions
      );
      polygonY = leftover.nextY;
      if (leftover.fullyConsumed) continue;
      // Section did not fully fit — advance to next slot and re-enqueue.
      advanceSlot();
      polygonY = 0;
      // Reduce the section to its remaining content and retry on next slot.
      sections[i] = leftover.remainingSection;
      i--;
      continue;
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

/**
 * Lay out a section's content into a polygon slot, one line at a time,
 * using the polygon's horizontal extent at each y to decide line width.
 * Returns the next y to flow at and either consumes the section fully or
 * yields a remainder section containing the unflowed text.
 */
function flowSectionIntoPolygonSlot(
  ctx: CanvasRenderingContext2D,
  section: DocumentSection,
  slot: FlowSlot,
  startY: number,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions
): { fullyConsumed: boolean; nextY: number; remainingSection: DocumentSection } {
  if (!slot.polygonAbsPoints) {
    return { fullyConsumed: true, nextY: startY, remainingSection: section };
  }

  // Images/hr aren't supported inside polygons; skip them (consume).
  if (section.type === 'image' || section.type === 'hr') {
    return { fullyConsumed: true, nextY: startY, remainingSection: section };
  }

  const fontStyle = getFontStyleForSection(section, fontOptions);
  const lineHeight = layoutOptions.lineHeight * fontStyle.fontSize;
  const polygonMaxY = slot.contentHeight;

  let y = startY;

  // Heading spacing before drawing any lines.
  if (section.type === 'heading') {
    switch (section.level) {
      case 1: y += layoutOptions.spacingAboveH1; break;
      case 2: y += layoutOptions.spacingAboveH2; break;
      case 3: y += layoutOptions.spacingAboveH3; break;
    }
  }

  const transformedContent = applyTextTransform(section.content, fontStyle.textTransform);
  const hardLines = transformedContent.split('\n');

  for (let hardLineIndex = 0; hardLineIndex < hardLines.length; hardLineIndex++) {
    const hardLine = hardLines[hardLineIndex];
    let remainingWords = hardLine.split(/\s+/).filter(Boolean);

    while (remainingWords.length > 0 || hardLine.trim() === '') {
      // Find an available line position by walking y downward until the
      // polygon offers enough horizontal room.
      let placed = false;
      while (y + lineHeight <= polygonMaxY) {
        const midY = y + lineHeight / 2;
        const extent = polygonHorizontalExtent(slot.polygonAbsPoints, midY);
        if (!extent || extent.right - extent.left < fontStyle.fontSize) {
          y += lineHeight;
          continue;
        }
        const availWidth = extent.right - extent.left;
        const { line, rest } = wrapOneLine(ctx, remainingWords, availWidth, fontStyle);
        if (!line) {
          // Couldn't fit even one word at this y — skip down.
          y += lineHeight;
          continue;
        }
        const measuredWidth = measureTextWidth(ctx, line, fontStyle);
        const textAlign = fontStyle.textAlign || layoutOptions.textAlign;
        let x = extent.left;
        if (textAlign === 'center') {
          x = extent.left + (availWidth - measuredWidth) / 2;
        } else if (textAlign === 'right') {
          x = extent.right - measuredWidth;
        }
        slot.polygonLines!.push({
          text: line,
          x,
          y,
          sectionType: section.type,
          sectionLevel: section.level,
        });
        y += lineHeight;
        remainingWords = rest;
        placed = true;
        if (hardLine.trim() === '') break; // Empty hardline = one blank line
        break;
      }

      if (!placed) {
        // No vertical room left in this polygon — return remainder.
        const consumedHardLines = hardLines.slice(0, hardLineIndex);
        const consumedThisLine = hardLine
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, hardLine.split(/\s+/).filter(Boolean).length - remainingWords.length)
          .join(' ');
        const consumedText = [...consumedHardLines, consumedThisLine].join('\n');
        const remainingThisLine = remainingWords.join(' ');
        const remainingText = [remainingThisLine, ...hardLines.slice(hardLineIndex + 1)].join('\n');
        // Build a remainder section preserving type/level so it re-flows next slot.
        const remainder: DocumentSection = {
          ...section,
          content: remainingText,
          rawMarkdown: remainingText,
        };
        // If we placed nothing at all and this is the start of the section,
        // skip the section entirely on this slot to avoid an infinite loop.
        if (consumedText.length === 0 && y === startY) {
          return { fullyConsumed: false, nextY: y, remainingSection: section };
        }
        return { fullyConsumed: false, nextY: y, remainingSection: remainder };
      }
    }
  }

  // Paragraph spacing after the section.
  return {
    fullyConsumed: true,
    nextY: y + layoutOptions.paragraphSpacing,
    remainingSection: section,
  };
}

/**
 * Wrap as many words as fit into the available width, returning the line
 * text and any leftover words.
 */
function wrapOneLine(
  ctx: CanvasRenderingContext2D,
  words: string[],
  availWidth: number,
  fontStyle: FontStyle
): { line: string; rest: string[] } {
  if (words.length === 0) return { line: '', rest: [] };
  const safeWidth = availWidth * 0.98;
  let currentLine = '';
  let i = 0;
  for (; i < words.length; i++) {
    const word = words[i];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = measureTextWidth(ctx, candidate, fontStyle);
    if (width <= safeWidth) {
      currentLine = candidate;
    } else {
      if (!currentLine) {
        // Single word doesn't fit at all — skip the line (caller will move on).
        return { line: '', rest: words };
      }
      break;
    }
  }
  return { line: currentLine, rest: words.slice(i) };
}

/**
 * Horizontal extent of a polygon at a given y, treating the polygon as the
 * union of its scanline intersections. For convex polygons this is a single
 * [left, right] span; for concave shapes the leftmost-to-rightmost span is
 * returned (we ignore notches in v1).
 */
export function polygonHorizontalExtent(
  points: { x: number; y: number }[],
  y: number
): { left: number; right: number } | null {
  const intersections: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    // Edge crosses the horizontal line at y when its endpoints straddle y.
    const crossesDown = p1.y <= y && p2.y > y;
    const crossesUp = p2.y <= y && p1.y > y;
    if (crossesDown || crossesUp) {
      const t = (y - p1.y) / (p2.y - p1.y);
      intersections.push(p1.x + t * (p2.x - p1.x));
    }
  }
  if (intersections.length < 2) return null;
  intersections.sort((a, b) => a - b);
  return { left: intersections[0], right: intersections[intersections.length - 1] };
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
  const polygonContentByPage = new Map<number, Map<string, PolygonFlowLine[]>>();

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
    } else if (slot.kind === 'polygonItem' && slot.hostPageNumber !== undefined && slot.itemId) {
      let pageMap = polygonContentByPage.get(slot.hostPageNumber);
      if (!pageMap) {
        pageMap = new Map();
        polygonContentByPage.set(slot.hostPageNumber, pageMap);
      }
      pageMap.set(slot.itemId, slot.polygonLines || []);
    }
  }

  // Apply item content to copies of static pages.
  const updatedStaticPages = new Map<number, PageContent>();
  for (const [pageNum, page] of staticPagesByNumber) {
    const itemContent = itemContentByPage.get(pageNum);
    const polygonContent = polygonContentByPage.get(pageNum);
    if (!itemContent && !polygonContent) {
      updatedStaticPages.set(pageNum, page);
      continue;
    }
    const newItems: PageItem[] = (page.items || []).map(it => {
      if (it.type !== 'textFlow') return it;
      if (it.flowShape === 'polygon' && polygonContent) {
        const lines = polygonContent.get(it.id);
        if (!lines) return it;
        return { ...it, flowedPolygonLines: lines } as TextFlowPageItem;
      }
      if (itemContent) {
        const sections = itemContent.get(it.id);
        if (!sections) return it;
        return { ...it, flowedSections: sections } as TextFlowPageItem;
      }
      return it;
    });
    updatedStaticPages.set(pageNum, { ...page, items: newItems });
  }

  return { textPages, updatedStaticPages };
}
