/**
 * Imposition calculation for booklet printing
 */

import type { Signature } from '../../types';

export interface ImpositionSheet {
  sheetNumber: number;
  front: { left: number; right: number };
  back: { left: number; right: number };
}

/**
 * Calculate imposition order for printing
 */
export function calculateImposition(signature: Signature): ImpositionSheet[] {
  const pageCount = signature.pageCount;
  const sheets: ImpositionSheet[] = [];

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
