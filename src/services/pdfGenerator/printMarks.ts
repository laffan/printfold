/**
 * Print marks (cut marks and fold indicators) for PDF generation
 */

import { rgb } from 'pdf-lib';
import type { PDFDocument } from 'pdf-lib';

/**
 * Add cut marks and optional fold indicators to all pages
 */
export function addPrintMarks(
  pdfDoc: PDFDocument,
  sheetSize: { width: number; height: number },
  pageHeight: number,
  rowsPerSheet: number,
  showFoldMarks: boolean = false
): void {
  const markLength = 18; // 0.25 inch
  const markOffset = 9; // Distance from edge

  for (const page of pdfDoc.getPages()) {
    // Cut marks are black
    const cutMarkColor = rgb(0, 0, 0);
    // Fold marks are light gray
    const foldMarkColor = rgb(0.7, 0.7, 0.7);
    const lineWidth = 0.5;

    // Top-left corner
    page.drawLine({
      start: { x: markOffset, y: sheetSize.height - markOffset },
      end: { x: markOffset, y: sheetSize.height - markOffset - markLength },
      thickness: lineWidth,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: markOffset, y: sheetSize.height - markOffset },
      end: { x: markOffset + markLength, y: sheetSize.height - markOffset },
      thickness: lineWidth,
      color: cutMarkColor,
    });

    // Top-right corner
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
      end: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset - markLength },
      thickness: lineWidth,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: sheetSize.height - markOffset },
      end: { x: sheetSize.width - markOffset - markLength, y: sheetSize.height - markOffset },
      thickness: lineWidth,
      color: cutMarkColor,
    });

    // Bottom-left corner
    page.drawLine({
      start: { x: markOffset, y: markOffset },
      end: { x: markOffset, y: markOffset + markLength },
      thickness: lineWidth,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: markOffset, y: markOffset },
      end: { x: markOffset + markLength, y: markOffset },
      thickness: lineWidth,
      color: cutMarkColor,
    });

    // Bottom-right corner
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: markOffset },
      end: { x: sheetSize.width - markOffset, y: markOffset + markLength },
      thickness: lineWidth,
      color: cutMarkColor,
    });
    page.drawLine({
      start: { x: sheetSize.width - markOffset, y: markOffset },
      end: { x: sheetSize.width - markOffset - markLength, y: markOffset },
      thickness: lineWidth,
      color: cutMarkColor,
    });

    // Center fold marks (light gray, only if enabled)
    if (showFoldMarks) {
      const centerX = sheetSize.width / 2;
      page.drawLine({
        start: { x: centerX, y: sheetSize.height - markOffset },
        end: { x: centerX, y: sheetSize.height - markOffset - markLength },
        thickness: lineWidth,
        color: foldMarkColor,
      });
      page.drawLine({
        start: { x: centerX, y: markOffset },
        end: { x: centerX, y: markOffset + markLength },
        thickness: lineWidth,
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
          thickness: lineWidth,
          color: cutMarkColor,
        });

        // Right side cut mark
        page.drawLine({
          start: { x: sheetSize.width - markOffset, y: cutY },
          end: { x: sheetSize.width - markOffset - markLength, y: cutY },
          thickness: lineWidth,
          color: cutMarkColor,
        });

        // Center fold mark at horizontal cut line (light gray, only if enabled)
        if (showFoldMarks) {
          page.drawLine({
            start: { x: centerX - markLength / 2, y: cutY },
            end: { x: centerX + markLength / 2, y: cutY },
            thickness: lineWidth,
            color: foldMarkColor,
          });
        }
      }
    }
  }
}
