/**
 * Image handling for PDF generation
 */

import type { PDFDocument, PDFImage } from 'pdf-lib';
import type { ImagePageItem } from '../../types';
import type { ImageCacheType, RenderedPageCacheType } from './types';
import { renderPageToImage } from '../pageRenderer';
import { getOrientedSheetSize } from '../../types';

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
 * When renderTextAsImages is true, ALL pages are rendered as images (no font embedding)
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

  // Get page dimensions (with orientation applied)
  const sheetSize = getOrientedSheetSize(
    project.outputOptions.sheetSize,
    project.outputOptions.orientation
  );
  let pageWidth: number = sheetSize.width / 2;
  let pageHeight: number;

  switch (project.outputOptions.bookletSize) {
    case 'custom':
      pageWidth = project.outputOptions.customWidth || sheetSize.width / 2;
      pageHeight = project.outputOptions.customHeight || sheetSize.height;
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

  // Build a global page map for reading-order adjacency lookup
  const globalPageMap: Map<number, import('../../types').PageContent> = new Map();
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) globalPageMap.set(spread.verso.pageNumber, spread.verso);
      if (spread.recto) globalPageMap.set(spread.recto.pageNumber, spread.recto);
    }
  }

  // Helper to get reading-order adjacent page
  const getReadingOrderAdjacent = (page: import('../../types').PageContent): import('../../types').PageContent | null => {
    const adjacentPageNum = page.isRecto ? page.pageNumber - 1 : page.pageNumber + 1;
    return globalPageMap.get(adjacentPageNum) || null;
  };

  // Check if we should render ALL pages as images (for font fallback mode)
  const renderAllAsImages = project.outputOptions.renderTextAsImages === true;

  // Collect pages that need rendering
  const pagesToRender: Array<{
    page: import('../../types').PageContent;
    adjacentPage: import('../../types').PageContent | null;
  }> = [];

  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      const pages = [spread.verso, spread.recto].filter(Boolean) as import('../../types').PageContent[];
      for (const page of pages) {
        // Get reading-order adjacent page for crossing items
        const adjacentPage = getReadingOrderAdjacent(page);

        // If renderTextAsImages is enabled, render ALL pages as images
        if (renderAllAsImages) {
          pagesToRender.push({ page, adjacentPage });
          continue;
        }

        // Otherwise, use the normal logic to determine which pages need rendering
        const isTextPage = page.pageState === 'text';
        const hasOwnItems = page.items && page.items.length > 0;
        const hasBackgroundFill = !!page.backgroundFill;
        const isStaticOrAvailable = page.pageState === 'static' ||
                                     page.pageState === 'available' ||
                                     page.isBlank || page.isStatic;

        // Check for crossing items from adjacent page
        const hasCrossingItems = adjacentPage?.items?.some(item => {
          if (page.isRecto) {
            return item.x + item.width > pageWidth;
          } else {
            return item.x < 0;
          }
        });

        // For text pages: only pre-render if they have items or crossing items
        // (the pre-rendered image will be overlaid on top of text content)
        if (isTextPage) {
          if (hasOwnItems || hasCrossingItems) {
            pagesToRender.push({ page, adjacentPage });
          }
          continue;
        }

        // For static/available pages: pre-render if they have content
        if (!(hasOwnItems || hasBackgroundFill || isStaticOrAvailable)) continue;

        const hasOwnContent = page.items?.length || page.backgroundFill;

        if (hasOwnContent || hasCrossingItems) {
          pagesToRender.push({ page, adjacentPage });
        }
      }
    }
  }

  // Render each page
  for (const { page, adjacentPage } of pagesToRender) {
    try {
      // When rendering text as images, include text content in the render
      const includeTextContent = renderAllAsImages;
      const dataUrl = await renderPageToImage(page, pageWidth, pageHeight, adjacentPage, includeTextContent);
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
