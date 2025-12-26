/**
 * Text utilities for PDF generation
 */

/**
 * Sanitize text for WinAnsi encoding (removes emojis and non-Latin characters)
 */
export function sanitizeText(text: string): string {
  // Replace common special characters with ASCII equivalents
  let sanitized = text
    .replace(/[\u2018\u2019]/g, "'") // Smart quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/\u2014/g, '--') // Em dash
    .replace(/\u2013/g, '-') // En dash
    .replace(/\u2026/g, '...') // Ellipsis
    .replace(/\u00A0/g, ' '); // Non-breaking space

  // Remove any characters outside the WinAnsi range (keep only printable ASCII and Latin-1)
  // WinAnsi supports: 0x20-0x7E (basic ASCII) and 0xA0-0xFF (Latin-1 supplement)
  sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

  return sanitized;
}
