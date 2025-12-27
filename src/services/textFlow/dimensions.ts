/**
 * Page dimension calculations for the text flow engine
 */

import type { PageDimensions } from './types';
import type { OutputOptions, LayoutOptions, HeaderFooterOptions, Margins } from '../../types';
import { getOrientedSheetSize } from '../../types';

/**
 * Calculate page content dimensions
 * Note: Header/footer live INSIDE the margin area, so they don't affect content dimensions
 */
export function calculatePageDimensions(
  outputOptions: OutputOptions,
  layoutOptions: LayoutOptions,
  _headerFooter: HeaderFooterOptions
): PageDimensions {
  const sheetSize = getOrientedSheetSize(outputOptions.sheetSize, outputOptions.orientation);

  let pageWidth: number;
  let pageHeight: number;

  // Page width is always half the sheet width (for booklet spreads)
  pageWidth = sheetSize.width / 2;

  switch (outputOptions.bookletSize) {
    case 'custom':
      pageWidth = outputOptions.customWidth || sheetSize.width / 2;
      pageHeight = outputOptions.customHeight || sheetSize.height;
      break;
    case 'half':
      pageHeight = sheetSize.height;
      break;
    case 'quarter':
      pageHeight = sheetSize.height / 2;
      break;
    case 'eighth':
      pageHeight = sheetSize.height / 4;
      break;
    case 'sixteenth':
      pageHeight = sheetSize.height / 8;
      break;
    default:
      pageHeight = sheetSize.height;
  }

  const margins = layoutOptions.margins;
  // Header/footer are inside the margin area, so they don't reduce content height
  const contentWidth = pageWidth - margins.inner - margins.outer;
  const contentHeight = pageHeight - margins.top - margins.bottom;

  return { width: pageWidth, height: pageHeight, contentWidth, contentHeight };
}

/**
 * Get margins for a specific page (with overrides)
 */
export function getMarginsForPage(
  pageNumber: number,
  layoutOptions: LayoutOptions
): Margins {
  const baseMargins = layoutOptions.margins;
  const override = layoutOptions.marginOverrides.find(o => o.pageNumber === pageNumber);

  if (override) {
    return { ...baseMargins, ...override.margins };
  }
  return baseMargins;
}
