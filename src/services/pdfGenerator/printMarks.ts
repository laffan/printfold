/**
 * Print marks (cut marks and fold indicators) for PDF generation
 */

import { rgb } from 'pdf-lib';
import type { PDFDocument } from 'pdf-lib';

/**
 * Parse hex color to RGB values (0-1 range)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    };
  }
  return { r: 0, g: 0, b: 0 }; // Default to black
}

/**
 * Options for crop marks
 */
export interface CropMarkOptions {
  showCropMarks?: boolean;
  cropMarkColor?: string;
  cropMarkThickness?: number;
}

/**
 * Add cut marks and optional fold indicators to all pages
 */
export function addPrintMarks(
  pdfDoc: PDFDocument,
  sheetSize: { width: number; height: number },
  pageHeight: number,
  rowsPerSheet: number,
  showFoldMarks: boolean = false,
  cropMarkOptions?: CropMarkOptions
): void {
  const markLength = 18; // 0.25 inch
  const markOffset = 9; // Distance from edge

  // Get crop mark settings with defaults
  const showCropMarks = cropMarkOptions?.showCropMarks ?? true;
  const cropMarkColorHex = cropMarkOptions?.cropMarkColor ?? '#000000';
  const cropMarkThickness = cropMarkOptions?.cropMarkThickness ?? 0.5;

  // Parse colors
  const cropRgb = hexToRgb(cropMarkColorHex);
  const cutMarkColor = rgb(cropRgb.r, cropRgb.g, cropRgb.b);
  // Fold marks are light gray
  const foldMarkColor = rgb(0.7, 0.7, 0.7);

  // Draw fold marks even if crop marks are disabled
  if (!showCropMarks) {
    if (showFoldMarks) {
      for (const page of pdfDoc.getPages()) {
        const centerX = sheetSize.width / 2;
        page.drawLine({
          start: { x: centerX, y: sheetSize.height - markOffset },
          end: { x: centerX, y: sheetSize.height - markOffset - markLength },
          thickness: 0.5,
          color: foldMarkColor,
        });
        page.drawLine({
          start: { x: centerX, y: markOffset },
          end: { x: centerX, y: markOffset + markLength },
          thickness: 0.5,
          color: foldMarkColor,
        });

        // Horizontal fold marks for multi-row layouts
        if (rowsPerSheet > 1) {
          for (let row = 1; row < rowsPerSheet; row++) {
            const cutY = sheetSize.height - row * pageHeight;
            page.drawLine({
              start: { x: centerX - markLength / 2, y: cutY },
              end: { x: centerX + markLength / 2, y: cutY },
              thickness: 0.5,
              color: foldMarkColor,
            });
          }
        }
      }
    }
    return;
  }

  for (const page of pdfDoc.getPages()) {
    // Top-left corner
    page.drawLine({
      start: { x: markOffset, y: sheetSize.height - markOffset },
      end: { x: markOffset, y: sheetSize.height - markOffset - markLength },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: markOffset, y: sheetSize.height - markOffset },
      end: { x: markOffset + markLength, y: sheetSize.height - markOffset },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });

    // Top-right corner
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
      end: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset - markLength },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
      end: { x: sheetSize.width - markOffset - markLength, y: sheetSize.height - markOffset },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });

    // Bottom-left corner
    page.drawLine({
      start: { x: markOffset, y: markOffset },
      end: { x: markOffset, y: markOffset + markLength },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: markOffset, y: markOffset },
      end: { x: markOffset + markLength, y: markOffset },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });

    // Bottom-right corner
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: markOffset },
      end: { x: sheetSize.width - markOffset, y: markOffset + markLength },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: markOffset },
      end: { x: sheetSize.width - markOffset - markLength, y: markOffset },
      thickness: cropMarkThickness,
      color: cutMarkColor,
    });

    // Center fold marks (light gray, only if enabled)
    if (showFoldMarks) {
      const centerX = sheetSize.width / 2;
      page.drawLine({
        start: { x: centerX, y: sheetSize.height - markOffset },
        end: { x: centerX, y: sheetSize.height - markOffset - markLength },
        thickness: cropMarkThickness,
        color: foldMarkColor,
      });
      page.drawLine({
        start: { x: centerX, y: markOffset },
        end: { x: centerX, y: markOffset + markLength },
        thickness: cropMarkThickness,
        color: foldMarkColor,
      });
    }

    // Horizontal cut marks for multi-row layouts
    if (rowsPerSheet > 1) {
      const centerX = sheetSize.width / 2;
      for (let row = 1; row < rowsPerSheet; row++) {
        const cutY = sheetSize.height - row * pageHeight;

        // Left side cut mark
        page.drawLine({
          start: { x: markOffset, y: cutY },
          end: { x: markOffset + markLength, y: cutY },
          thickness: cropMarkThickness,
          color: cutMarkColor,
        });

        // Right side cut mark
        page.drawLine({
          start: { x: sheetSize.width - markOffset, y: cutY },
          end: { x: sheetSize.width - markOffset - markLength, y: cutY },
          thickness: cropMarkThickness,
          color: cutMarkColor,
        });

        // Center fold mark at horizontal cut line (light gray, only if enabled)
        if (showFoldMarks) {
          page.drawLine({
            start: { x: centerX - markLength / 2, y: cutY },
            end: { x: centerX + markLength / 2, y: cutY },
            thickness: cropMarkThickness,
            color: foldMarkColor,
          });
        }
      }
    }
  }
}
