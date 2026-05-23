/**
 * Footnote support for the text flow engine.
 *
 * Markdown footnotes use GFM-style syntax:
 *
 *     Some text with a reference[^1].
 *
 *     [^1]: The footnote body.
 *
 * This module:
 *   - Extracts footnote definitions from the source markdown (and strips
 *     them from the body so `marked` never sees them).
 *   - Assigns sequential numbers to references in document order.
 *   - Measures the height a page's footnote block would take, so pagination
 *     can shrink the available content height for pages that carry
 *     footnotes.
 *   - Builds synthetic DocumentSections that materialise endnotes when the
 *     "Show footnotes and endnotes" option is enabled.
 */

import type {
  DocumentSection,
  FootnoteDefinition,
  FontOptions,
  FontStyle,
  LayoutOptions,
  PageContent,
  RichTextLine,
  TextSpan,
} from '../../types';

const DEF_LINE = /^\[\^([^\]]+)\]:[ \t]*(.*)$/;
const REF_PATTERN = /\[\^([^\]]+)\]/g;

/**
 * Result of scanning the source markdown for footnote definitions.
 */
export interface FootnoteExtraction {
  /** Markdown with `[^id]: ...` definition blocks removed. */
  strippedMarkdown: string;
  /** All definitions found, keyed by user id, in document order. */
  definitions: Map<string, FootnoteDefinition>;
  /** Same definitions, in document-reference order (1-based). */
  ordered: FootnoteDefinition[];
}

/**
 * Walk the markdown line by line, peeling out `[^id]: ...` definitions
 * (including their continuation lines — additional indented or blank lines
 * following the opening line per the CommonMark footnote convention). Then
 * scan the remaining text for `[^id]` references and assign sequential
 * numbers in the order they first appear.
 */
export function extractFootnotes(markdown: string): FootnoteExtraction {
  const lines = markdown.split('\n');
  const rawDefs = new Map<string, string>();
  const keptLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = DEF_LINE.exec(line);
    if (m) {
      const id = m[1].trim();
      const parts: string[] = [m[2]];
      // Continuation: subsequent indented lines belong to the same footnote.
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (/^[ \t]+\S/.test(next)) {
          parts.push(next.replace(/^[ \t]+/, ''));
          j++;
        } else if (next.trim() === '' && j + 1 < lines.length && /^[ \t]+\S/.test(lines[j + 1])) {
          // Blank line between continuation paragraphs.
          parts.push('');
          j++;
        } else {
          break;
        }
      }
      const content = parts.join('\n').trim();
      if (id && !rawDefs.has(id)) {
        rawDefs.set(id, content);
      }
      i = j;
      continue;
    }
    keptLines.push(line);
    i++;
  }

  const strippedMarkdown = keptLines.join('\n');

  // Walk the stripped markdown for references in document order.
  const ordered: FootnoteDefinition[] = [];
  const definitions = new Map<string, FootnoteDefinition>();
  const refRegex = new RegExp(REF_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(strippedMarkdown)) !== null) {
    const id = match[1].trim();
    if (definitions.has(id)) continue;
    const content = rawDefs.get(id);
    if (content === undefined) continue; // Reference without a definition — leave as plain text.
    const def: FootnoteDefinition = {
      id,
      number: ordered.length + 1,
      content,
    };
    ordered.push(def);
    definitions.set(id, def);
  }

  return { strippedMarkdown, definitions, ordered };
}

/**
 * Replace every `[^id]` token inside a text run with the corresponding
 * sequential number, leaving non-defined refs untouched. Returns the new
 * text plus the list of footnote numbers introduced (in left-to-right
 * order) so callers can attach `footnoteNumber` spans.
 */
export function expandFootnoteRefs(
  text: string,
  definitions: Map<string, FootnoteDefinition>,
): { text: string; refs: number[] } {
  if (definitions.size === 0) return { text, refs: [] };
  const refs: number[] = [];
  const out = text.replace(REF_PATTERN, (whole, id: string) => {
    const def = definitions.get(id.trim());
    if (!def) return whole;
    refs.push(def.number);
    // Sentinel survives marked parsing because SOH bytes are passed through
    // as ordinary text.
    return `\x01FN${def.number}\x01`;
  });
  return { text: out, refs };
}

// SOH-bracketed footnote sentinel: \x01FN<n>\x01. SOH (U+0001) never
// appears in real markdown, so the marker round-trips through marked's
// tokenizer untouched and is unambiguous when we split spans later.
const SENTINEL_REGEX = /\x01FN(\d+)\x01/g;

/**
 * Split a plain-text run on footnote sentinels, returning a sequence of
 * TextSpan pieces. The numeric pieces carry `footnoteNumber` so renderers
 * can draw them as superscripts.
 */
export function spansFromSentinelText(text: string, inheritedStyle: Partial<TextSpan>): TextSpan[] {
  const result: TextSpan[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(SENTINEL_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ text: text.slice(lastIndex, match.index), ...inheritedStyle });
    }
    const num = parseInt(match[1], 10);
    result.push({
      text: String(num),
      ...inheritedStyle,
      footnoteNumber: num,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex), ...inheritedStyle });
  }
  return result;
}

/**
 * Effective font size used to lay out a footnote-reference superscript.
 * Markers visually shrink to ~0.6x of the body line so they don't disturb
 * line height noticeably.
 */
export function footnoteMarkerFontSize(baseSize: number): number {
  return baseSize * 0.65;
}

/**
 * Style used for inline footnote reference markers (superscript digits).
 */
export function getFootnoteMarkerStyle(baseStyle: FontStyle): FontStyle {
  return {
    ...baseStyle,
    fontSize: footnoteMarkerFontSize(baseStyle.fontSize),
    fontWeight: 'normal',
    fontStyle: 'normal',
    textTransform: 'none',
  };
}

/**
 * Compute the height needed to render a footnote block at the bottom of a
 * page, including the separator rule, padding, and one line per footnote
 * (multi-line footnotes are wrapped at render time but estimated here using
 * a simple character/width heuristic so pagination has a safe upper bound).
 */
export function measureFootnoteBlockHeight(
  ctx: CanvasRenderingContext2D,
  footnotes: FootnoteDefinition[],
  contentWidth: number,
  fontOptions: FontOptions,
  layoutOptions: LayoutOptions,
): number {
  if (footnotes.length === 0) return 0;
  const style = fontOptions.footnote;
  const lineHeight = (style.lineHeight ?? layoutOptions.lineHeight) * style.fontSize;
  // Reserve: rule + small top gap + per-footnote lines + bottom gap.
  const rule = FOOTNOTE_RULE_GAP + FOOTNOTE_RULE_THICKNESS + FOOTNOTE_RULE_GAP;
  let lines = 0;
  for (const f of footnotes) {
    const text = `${f.number}. ${f.content}`;
    lines += estimateWrappedLineCount(ctx, text, contentWidth, style);
  }
  return rule + lines * lineHeight;
}

/** Layout constants shared with the renderers (canvas and PDF). */
export const FOOTNOTE_RULE_GAP = 4;
export const FOOTNOTE_RULE_THICKNESS = 0.5;
export const FOOTNOTE_RULE_WIDTH_RATIO = 0.3; // Rule spans ~30% of content width.

/**
 * Rough wrapped-line estimate used during pagination reservation. We can't
 * call the full rich-text wrapper without circular imports; the canvas
 * `measureText` width-based estimate is plenty accurate for plain footnote
 * bodies (newlines explicitly force breaks).
 */
function estimateWrappedLineCount(
  ctx: CanvasRenderingContext2D,
  text: string,
  contentWidth: number,
  style: FontStyle,
): number {
  if (!text) return 1;
  const safeWidth = contentWidth * 0.98;
  const quotedFamily = style.fontFamily.includes(' ') ? `"${style.fontFamily}"` : style.fontFamily;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${quotedFamily}`;
  let total = 0;
  for (const hardLine of text.split('\n')) {
    const words = hardLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      total += 1;
      continue;
    }
    let current = '';
    let lineCount = 0;
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= safeWidth) {
        current = candidate;
      } else {
        if (current) lineCount += 1;
        current = word;
      }
    }
    if (current) lineCount += 1;
    total += Math.max(1, lineCount);
  }
  return total;
}

/**
 * Pull the footnote numbers referenced anywhere in a page's content.
 * Walks all measured sections' rich lines for `footnoteNumber` spans.
 */
export function collectFootnoteNumbersOnPage(page: PageContent): number[] {
  const result: number[] = [];
  const seen = new Set<number>();
  const add = (n: number) => {
    if (!seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  };
  for (const section of page.sections) {
    // Endnote sections are themselves footnote bodies — they shouldn't
    // recursively reserve a footnote block at the page bottom.
    if (section.type === 'endnote' || section.type === 'endnoteHeader') continue;
    const lines = (section as { richLines?: RichTextLine[] }).richLines;
    if (lines && lines.length > 0) {
      // Rich-text section: the slice of lines that landed on this page is
      // the source of truth. Pagination splits a paragraph by slicing its
      // richLines, but the section's `footnoteRefs` array is the union of
      // refs across the WHOLE original paragraph — using it here would
      // make every page slice claim every footnote.
      for (const line of lines) {
        for (const span of line.spans) {
          if (span.footnoteNumber !== undefined) add(span.footnoteNumber);
        }
      }
      continue;
    }
    // Non-rich sections (headings, lists, etc.) don't split across pages,
    // so their footnoteRefs are accurate as-is.
    if (section.footnoteRefs) {
      for (const n of section.footnoteRefs) add(n);
    }
  }
  return result.sort((a, b) => a - b);
}

/**
 * Build the synthetic endnote sections appended to the document when
 * `showFootnotesAsEndnotes` is enabled. The block starts with an `hr`
 * (which pagination treats as a hard page break) so endnotes always begin
 * on a fresh page rather than running on from the previous body content.
 */
export function buildEndnoteSections(
  footnotes: FootnoteDefinition[],
): DocumentSection[] {
  if (footnotes.length === 0) return [];
  const sections: DocumentSection[] = [];
  sections.push({
    id: crypto.randomUUID(),
    type: 'hr',
    content: '',
    rawMarkdown: '---',
  });
  for (const f of footnotes) {
    const prefixed = `${f.number}. ${f.content}`;
    sections.push({
      id: crypto.randomUUID(),
      type: 'endnote',
      endnoteNumber: f.number,
      content: prefixed,
      rawMarkdown: prefixed,
    });
  }
  return sections;
}

/**
 * Insert endnote groups into a section stream at chapter boundaries.
 * Footnotes "belong" to the chapter whose H1 most recently introduced them.
 * The endnotes for each chapter are appended just before the next H1 (or
 * after the last section for the final chapter).
 */
export function injectChapterEndnotes(
  sections: DocumentSection[],
  ordered: FootnoteDefinition[],
): DocumentSection[] {
  if (ordered.length === 0) return sections;
  const byNumber = new Map<number, FootnoteDefinition>();
  for (const f of ordered) byNumber.set(f.number, f);

  const result: DocumentSection[] = [];
  let pending: FootnoteDefinition[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    result.push(...buildEndnoteSections(pending));
    pending = [];
  };

  for (const section of sections) {
    if (section.type === 'heading' && section.level === 1 && pending.length > 0) {
      flushPending();
    }
    result.push(section);
    if (section.footnoteRefs) {
      for (const n of section.footnoteRefs) {
        const def = byNumber.get(n);
        if (def && !pending.includes(def)) pending.push(def);
      }
    }
  }
  flushPending();
  return result;
}
