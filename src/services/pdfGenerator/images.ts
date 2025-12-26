/**
 * Image handling for PDF generation
 */

import type { PDFDocument, PDFImage } from 'pdf-lib';
import type { ImagePageItem } from '../../types';
import type { ImageCacheType, RenderedPageCacheType } from './types';
import { renderPageToImage } from '../pageRenderer';
import { SHEET_SIZES } from '../../types';

/**
 * Embed all images used in static pages
 */
export async function embedImages(
  pdfDoc: PDFDocument,
  project: {
    signatures: Array<{
      spreads: Array<{
        verso: { isBlank?: boolean; isStatic?: boolean; items?: Array<{ type: string; imageFileId?: string }> } | null;
        recto: { isBlank?: boolean; isStatic?: boolean; items?: Array<{ type: string; imageFileId?: string }> } | null;
      }>;
    }>;
    files: Array<{ id: string; type: string; isBase64?: boolean; content: string; name: string }>;
  },
  imageCache: ImageCacheType
): Promise<void> {
  imageCache.clear();

  // Collect all image file IDs from static pages
  const imageFileIds = new Set<string>();
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const pages = [spread.verso, spread.recto].filter(Boolean);
      for (const page of pages) {
        if ((page?.isBlank || page?.isStatic) && page?.items) {
          for (const item of page.items) {
            if (item.type === 'image') {
              const imageItem = item as ImagePageItem;
              imageFileIds.add(imageItem.imageFileId);
            }
          }
        }
      }
    }
  }

  // Embed each image
  for (const fileId of imageFileIds) {
    const file = project.files.find(f => f.id === fileId);
    if (!file || file.type !== 'image' || !file.isBase64) continue;

    try {
      const imageData = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));

      // Try to embed as PNG first, then JPEG
      let pdfImage: PDFImage | null = null;
      try {
        pdfImage = await pdfDoc.embedPng(imageData);
      } catch {
        try {
          pdfImage = await pdfDoc.embedJpg(imageData);
        } catch {
          console.warn(`Failed to embed image: ${file.name}`);
        }
      }

      if (pdfImage) {
        imageCache.set(fileId, pdfImage);
      }
    } catch (error) {
      console.warn(`Error processing image ${file.name}:`, error);
    }
  }
}

/**
 * Pre-render static/blank pages as high-resolution images
 */
export async function preRenderStaticPages(
  pdfDoc: PDFDocument,
  project: {
    signatures: Array<{
      spreads: Array<{
        verso: import('../../types').PageContent | null;
        recto: import('../../types').PageContent | null;
      }>;
    }>;
    outputOptions: import('../../types').OutputOptions;
  },
  renderedPageCache: RenderedPageCacheType
): Promise<void> {
  renderedPageCache.clear();

  // Get page dimensions
  const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];
  let pageWidth: number;
  let pageHeight: number;

  if (project.outputOptions.bookletSize === 'custom') {
    pageWidth = project.outputOptions.customWidth || sheetSize.width / 2;
    pageHeight = project.outputOptions.customHeight || sheetSize.height;
  } else if (project.outputOptions.bookletSize.startsWith('quarter-')) {
    pageWidth = sheetSize.width / 2;
    pageHeight = sheetSize.height / 2;
  } else {
    pageWidth = sheetSize.width / 2;
    pageHeight = sheetSize.height;
  }

  // Collect static/blank pages that need rendering
  const pagesToRender: Array<{
    page: import('../../types').PageContent;
    adjacentPage: import('../../types').PageContent | null;
  }> = [];

  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const pages = [spread.verso, spread.recto].filter(Boolean) as import('../../types').PageContent[];
      for (const page of pages) {
        const hasOwnItems = page.items && page.items.length > 0;
        const hasBackgroundFill = !!page.backgroundFill;
        if (!(hasOwnItems || hasBackgroundFill || page.isBlank || page.isStatic)) continue;

        const adjacentPage = page.isRecto ? spread.verso : spread.recto;
        const hasOwnContent = page.items?.length || page.backgroundFill;
        const hasCrossingItems = adjacentPage?.items?.some(item => {
          if (page.isRecto) {
            return item.x + item.width > pageWidth;
          } else {
            return item.x < 0;
          }
        });

        if (hasOwnContent || hasCrossingItems) {
          pagesToRender.push({ page, adjacentPage: adjacentPage || null });
        }
      }
    }
  }

  // Render each page
  for (const { page, adjacentPage } of pagesToRender) {
    try {
      const dataUrl = await renderPageToImage(page, pageWidth, pageHeight, adjacentPage);
      if (dataUrl) {
        const base64Data = dataUrl.split(',')[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const pdfImage = await pdfDoc.embedPng(imageBytes);
        renderedPageCache.set(page.pageNumber, pdfImage);
      }
    } catch (error) {
      console.warn(`Failed to pre-render page ${page.pageNumber}:`, error);
    }
  }
}
