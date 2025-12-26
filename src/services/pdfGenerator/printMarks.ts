/**
 * Print marks (cut marks and fold indicators) for PDF generation
 */

import { rgb } from 'pdf-lib';
import type { PDFDocument } from 'pdf-lib';

/**
 * Add cut marks and fold indicators to all pages
 */
export function addPrintMarks(
  pdfDoc: PDFDocument,
  sheetSize: { width: number; height: number },
  pageHeight: number,
  rowsPerSheet: number
): void {
  const markLength = 18; // 0.25 inch
  const markOffset = 9; // Distance from edge

  for (const page of pdfDoc.getPages()) {
    // Draw cut marks at corners
    const markColor = rgb(0, 0, 0);
    const lineWidth = 0.5;

    // Top-left corner
    page.drawLine({
      start: { x: markOffset, y: sheetSize.height - markOffset },
      end: { x: markOffset, y: sheetSize.height - markOffset - markLength },
      thickness: lineWidth,
      color: markColor,
    });
    page.drawLine({
      start: { x: markOffset, y: sheetSize.height - markOffset },
      end: { x: markOffset + markLength, y: sheetSize.height - markOffset },
      thickness: lineWidth,
      color: markColor,
    });

    // Top-right corner
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
      end: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset - markLength },
      thickness: lineWidth,
      color: markColor,
    });
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
      end: { x: sheetSize.width - markOffset - markLength, y: sheetSize.height - markOffset },
      thickness: lineWidth,
      color: markColor,
    });

    // Bottom-left corner
    page.drawLine({
      start: { x: markOffset, y: markOffset },
      end: { x: markOffset, y: markOffset + markLength },
      thickness: lineWidth,
      color: markColor,
    });
    page.drawLine({
      start: { x: markOffset, y: markOffset },
      end: { x: markOffset + markLength, y: markOffset },
      thickness: lineWidth,
      color: markColor,
    });

    // Bottom-right corner
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: markOffset },
      end: { x: sheetSize.width - markOffset, y: markOffset + markLength },
      thickness: lineWidth,
      color: markColor,
    });
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: markOffset },
      end: { x: sheetSize.width - markOffset - markLength, y: markOffset },
      thickness: lineWidth,
      color: markColor,
    });

    // Center fold mark (top and bottom)
    const centerX = sheetSize.width / 2;
    page.drawLine({
      start: { x: centerX, y: sheetSize.height - markOffset },
      end: { x: centerX, y: sheetSize.height - markOffset - markLength },
      thickness: lineWidth,
      color: markColor,
    });
    page.drawLine({
      start: { x: centerX, y: markOffset },
      end: { x: centerX, y: markOffset + markLength },
      thickness: lineWidth,
      color: markColor,
    });

    // Horizontal cut marks for multi-row layouts
    if (rowsPerSheet > 1) {
      for (let row = 1; row < rowsPerSheet; row++) {
        const cutY = sheetSize.height - row * pageHeight;

        // Left side cut mark
        page.drawLine({
          start: { x: markOffset, y: cutY },
          end: { x: markOffset + markLength, y: cutY },
          thickness: lineWidth,
          color: markColor,
        });

        // Right side cut mark
        page.drawLine({
          start: { x: sheetSize.width - markOffset, y: cutY },
          end: { x: sheetSize.width - markOffset - markLength, y: cutY },
          thickness: lineWidth,
          color: markColor,
        });

        // Center cut mark (at fold line)
        page.drawLine({
          start: { x: centerX - markLength / 2, y: cutY },
          end: { x: centerX + markLength / 2, y: cutY },
          thickness: lineWidth,
          color: markColor,
        });
      }
    }
  }
}
