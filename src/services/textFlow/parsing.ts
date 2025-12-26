/**
 * Markdown parsing utilities for text flow engine
 */

import { marked } from 'marked';
import type { DocumentSection } from '../../types';

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
