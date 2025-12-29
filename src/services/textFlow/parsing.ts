/**
 * Markdown parsing utilities for text flow engine
 */

import { marked } from 'marked';
import type { DocumentSection, TextSpan, RichTextLine } from '../../types';

/**
 * Decode HTML entities back to normal characters
 */
export function decodeHtmlEntities(text: string): string {
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
export function extractText(token: any): string {
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
  return decodeHtmlEntities(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractListText(token: any): string {
  return token.items.map((item: any, i: number) => {
    const prefix = token.ordered ? `${i + 1}. ` : '• ';
    const text = item.tokens?.map((t: any) => {
      if (t.type === 'text') return t.text;
      if ('text' in t) return t.text;
      return '';
    }).join('') || item.text;
    return prefix + decodeHtmlEntities(text);
  }).join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractBlockquoteText(token: any): string {
  const text = token.tokens?.map((t: any) => {
    if (t.type === 'paragraph') return extractText(t);
    if ('text' in t) return t.text;
    return '';
  }).join('\n') || '';
  return decodeHtmlEntities(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tokenToSection(token: any): DocumentSection | null {
  const id = crypto.randomUUID();

  switch (token.type) {
    case 'heading':
      return {
        id,
        type: 'heading',
        level: token.depth,
        content: decodeHtmlEntities(token.text),
        rawMarkdown: token.raw,
      };

    case 'paragraph':
      // Check for image - format: ![caption](image-path.jpg)
      if (token.tokens?.length === 1 && token.tokens[0].type === 'image') {
        const imgToken = token.tokens[0];
        // text = alt text (caption), title = optional title attribute
        const caption = decodeHtmlEntities(imgToken.text || imgToken.title || '');
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
        content: extractText(token),
        rawMarkdown: token.raw,
      };

    case 'list':
      return {
        id,
        type: 'list',
        content: extractListText(token),
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
        content: extractBlockquoteText(token),
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
 * Parse markdown into structured sections
 */
export function parseMarkdown(markdown: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const tokens = marked.lexer(markdown);

  for (const token of tokens) {
    const section = tokenToSection(token);
    if (section) {
      sections.push(section);
    }
  }

  return sections;
}

/**
 * Convert inline tokens to TextSpan array
 * Handles nested formatting like **_bold italic_**
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tokensToSpans(tokens: any[], inheritedStyle: Partial<TextSpan> = {}): TextSpan[] {
  const spans: TextSpan[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        spans.push({
          text: decodeHtmlEntities(token.text || token.raw || ''),
          ...inheritedStyle,
        });
        break;

      case 'strong':
        if (token.tokens) {
          spans.push(...tokensToSpans(token.tokens, { ...inheritedStyle, bold: true }));
        } else {
          spans.push({
            text: decodeHtmlEntities(token.text || ''),
            ...inheritedStyle,
            bold: true,
          });
        }
        break;

      case 'em':
        if (token.tokens) {
          spans.push(...tokensToSpans(token.tokens, { ...inheritedStyle, italic: true }));
        } else {
          spans.push({
            text: decodeHtmlEntities(token.text || ''),
            ...inheritedStyle,
            italic: true,
          });
        }
        break;

      case 'codespan':
        spans.push({
          text: decodeHtmlEntities(token.text || ''),
          ...inheritedStyle,
          code: true,
        });
        break;

      case 'del':
        // Strikethrough ~~text~~
        if (token.tokens) {
          spans.push(...tokensToSpans(token.tokens, { ...inheritedStyle, strikethrough: true }));
        } else {
          spans.push({
            text: decodeHtmlEntities(token.text || ''),
            ...inheritedStyle,
            strikethrough: true,
          });
        }
        break;

      case 'link':
        // Handle links - preserve text with link info
        if (token.tokens) {
          spans.push(...tokensToSpans(token.tokens, { ...inheritedStyle, link: token.href }));
        } else {
          spans.push({
            text: decodeHtmlEntities(token.text || ''),
            ...inheritedStyle,
            link: token.href,
          });
        }
        break;

      case 'escape':
        spans.push({
          text: token.text || '',
          ...inheritedStyle,
        });
        break;

      case 'br':
        // Line break - represented as newline in text
        spans.push({
          text: '\n',
          ...inheritedStyle,
        });
        break;

      default:
        // For unknown tokens, try to extract text
        if (token.text) {
          spans.push({
            text: decodeHtmlEntities(token.text),
            ...inheritedStyle,
          });
        } else if (token.raw) {
          spans.push({
            text: decodeHtmlEntities(token.raw),
            ...inheritedStyle,
          });
        }
    }
  }

  return spans;
}

/**
 * Parse inline markdown to rich text spans
 * Handles ==highlight== syntax (Obsidian-style)
 */
export function parseInlineMarkdown(text: string): TextSpan[] {
  // First, handle Obsidian-style highlights (==text==) since marked doesn't support them
  const highlightRegex = /==([^=]+)==/g;
  let processedText = text;
  const highlights: { start: number; end: number; content: string }[] = [];

  // Find and track highlight positions
  let match;
  let offset = 0;
  while ((match = highlightRegex.exec(text)) !== null) {
    const originalStart = match.index - offset;
    const content = match[1];
    highlights.push({
      start: originalStart,
      end: originalStart + content.length,
      content: content,
    });
    // Replace ==content== with just content in processedText for marked parsing
    processedText = processedText.substring(0, match.index - offset) +
                    content +
                    processedText.substring(match.index - offset + match[0].length);
    offset += 4; // Account for removed == markers
  }

  // Use marked's inline lexer
  const tokens = marked.lexer(processedText, { gfm: true });

  // Find the paragraph token (marked wraps inline content in paragraph)
  const paragraphToken = tokens.find(t => t.type === 'paragraph');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inlineTokens = (paragraphToken as any)?.tokens || tokens;

  // Convert tokens to spans
  let spans = tokensToSpans(inlineTokens);

  // Apply highlight markers based on position
  if (highlights.length > 0) {
    spans = applyHighlights(spans, highlights);
  }

  // Merge adjacent spans with same styling
  return mergeAdjacentSpans(spans);
}

/**
 * Apply highlight markers to spans based on character positions
 */
function applyHighlights(
  spans: TextSpan[],
  highlights: { start: number; end: number; content: string }[]
): TextSpan[] {
  if (highlights.length === 0) return spans;

  const result: TextSpan[] = [];
  let charPos = 0;

  for (const span of spans) {
    const spanStart = charPos;
    const spanEnd = charPos + span.text.length;
    let remainingText = span.text;
    let currentPos = spanStart;

    for (const highlight of highlights) {
      if (highlight.end <= currentPos || highlight.start >= spanEnd) {
        continue; // No overlap
      }

      // Handle overlap
      const overlapStart = Math.max(highlight.start, currentPos);
      const overlapEnd = Math.min(highlight.end, spanEnd);

      // Text before highlight
      if (overlapStart > currentPos) {
        const beforeText = remainingText.substring(0, overlapStart - currentPos);
        if (beforeText) {
          result.push({ ...span, text: beforeText });
        }
      }

      // Highlighted text
      const highlightText = remainingText.substring(
        overlapStart - currentPos,
        overlapEnd - currentPos
      );
      if (highlightText) {
        result.push({ ...span, text: highlightText, highlight: true });
      }

      remainingText = remainingText.substring(overlapEnd - currentPos);
      currentPos = overlapEnd;
    }

    // Remaining text after all highlights
    if (remainingText) {
      result.push({ ...span, text: remainingText });
    }

    charPos = spanEnd;
  }

  return result;
}

/**
 * Merge adjacent spans with identical styling
 */
export function mergeAdjacentSpans(spans: TextSpan[]): TextSpan[] {
  if (spans.length === 0) return [];

  const result: TextSpan[] = [];
  let current = { ...spans[0] };

  for (let i = 1; i < spans.length; i++) {
    const span = spans[i];
    if (
      current.bold === span.bold &&
      current.italic === span.italic &&
      current.code === span.code &&
      current.strikethrough === span.strikethrough &&
      current.highlight === span.highlight &&
      current.link === span.link
    ) {
      // Same styling, merge text
      current.text += span.text;
    } else {
      // Different styling, push current and start new
      if (current.text) result.push(current);
      current = { ...span };
    }
  }

  if (current.text) result.push(current);
  return result;
}

/**
 * Convert a RichTextLine to plain text (for backwards compatibility)
 */
export function richLineToPlainText(line: RichTextLine): string {
  return line.spans.map(span => span.text).join('');
}

/**
 * Create a RichTextLine from plain text (no styling)
 */
export function plainTextToRichLine(text: string): RichTextLine {
  return { spans: [{ text }] };
}
