/**
 * Page dimension calculations for the text flow engine
 */

import type { PageDimensions } from './types';
import type { OutputOptions, LayoutOptions, HeaderFooterOptions, Margins } from '../../types';
import { SHEET_SIZES } from '../../types';

/**
 * Calculate page content dimensions
 */
export function calculatePageDimensions(
  outputOptions: OutputOptions,
  layoutOptions: LayoutOptions,
  headerFooter: HeaderFooterOptions
): PageDimensions {
  const sheetSize = SHEET_SIZES[outputOptions.sheetSize];

  let pageWidth: number;
  let pageHeight: number;

  if (outputOptions.bookletSize === 'custom') {
    pageWidth = outputOptions.customWidth || sheetSize.width / 2;
    pageHeight = outputOptions.customHeight || sheetSize.height;
  } else if (outputOptions.bookletSize.startsWith('half-')) {
    pageWidth = sheetSize.width / 2;
    pageHeight = sheetSize.height;
  } else {
    pageWidth = sheetSize.width / 2;
    pageHeight = sheetSize.height / 2;
  }

  const margins = layoutOptions.margins;
  const headerHeight = headerFooter.header.enabled ? headerFooter.header.height : 0;
  const footerHeight = headerFooter.footer.enabled ? headerFooter.footer.height : 0;

  const contentWidth = pageWidth - margins.inner - margins.outer;
  const contentHeight = pageHeight - margins.top - margins.bottom - headerHeight - footerHeight;

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
