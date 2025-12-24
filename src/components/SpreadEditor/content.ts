/**
 * SpreadEditor Content Module
 * Handles rendering of page content (text, images, headings)
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageContent, FontStyle } from '../../types';

/**
 * Draw page content (text sections, images, headings)
 */
export function drawPageContent(
  page: PageContent,
  x: number,
  y: number,
  width: number,
  height: number,
  layer: Konva.Layer
): void {
  const project = appState.getProject();
  let currentY = y;

  for (const section of page.sections) {
    const fontStyle = getFontStyleForSection(section.type, section.level);
    const lineHeight = project.layoutOptions.lineHeight * fontStyle.fontSize;

    // Add spacing before headings
    if (section.type === 'heading') {
      switch (section.level) {
        case 1:
          currentY += project.layoutOptions.spacingAboveH1;
          break;
        case 2:
          currentY += project.layoutOptions.spacingAboveH2;
          break;
        case 3:
          currentY += project.layoutOptions.spacingAboveH3;
          break;
      }
    }

    // Handle image placeholders
    if (section.type === 'image') {
      const imageFile = section.imageRef ? appState.getImageByName(section.imageRef) : null;

      if (imageFile) {
        const imgX = x;
        const imgY = currentY;
        const maxImgWidth = width; // Full content width

        // Create placeholder while image loads
        const placeholder = new Konva.Rect({
          x: imgX,
          y: imgY,
          width: maxImgWidth,
          height: 100,
          fill: '#f8f8f8',
          stroke: '#ddd',
          strokeWidth: 1,
        });
        layer.add(placeholder);

        // Load and display image asynchronously with correct aspect ratio
        const img = new window.Image();
        img.onload = () => {
          placeholder.destroy();

          // Calculate size: full width, auto height maintaining aspect ratio
          const aspectRatio = img.width / img.height;
          const displayWidth = maxImgWidth;
          const displayHeight = displayWidth / aspectRatio;

          const konvaImage = new Konva.Image({
            x: imgX,
            y: imgY,
            width: displayWidth,
            height: displayHeight,
            image: img,
          });
          layer.add(konvaImage);

          // Add caption if present
          if (section.content && section.content.trim()) {
            const captionText = new Konva.Text({
              x: imgX,
              y: imgY + displayHeight + 4,
              text: section.content,
              fontSize: 9,
              fontStyle: 'italic',
              fill: '#666666',
              width: displayWidth,
              align: 'center',
            });
            layer.add(captionText);
          }

          layer.draw();
        };
        img.src = `data:image/png;base64,${imageFile.content}`;

        currentY += 120; // Will be adjusted when image loads
      } else {
        // Draw placeholder
        const placeholder = new Konva.Rect({
          x,
          y: currentY,
          width: Math.min(width, 200),
          height: 100,
          fill: '#f0f0f0',
          stroke: '#cccccc',
          strokeWidth: 1,
          dash: [4, 4],
        });
        layer.add(placeholder);

        const placeholderText = new Konva.Text({
          x: x + 10,
          y: currentY + 40,
          text: `Image not uploaded: ${section.imageRef || 'unknown'}`,
          fontSize: 10,
          fill: '#999999',
          width: Math.min(width, 200) - 20,
          wrap: 'word',
          align: 'center',
        });
        layer.add(placeholderText);
        currentY += 110;
      }
      continue;
    }

    // Draw text content
    const lines = (section as { lines?: string[] }).lines || [section.content];
    const textAlign = project.layoutOptions.textAlign;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (currentY > y + height) break;

      const text = new Konva.Text({
        x,
        y: currentY,
        text: line,
        fontSize: fontStyle.fontSize,
        fontFamily: fontStyle.fontFamily,
        fontStyle: fontStyle.fontStyle === 'italic' ? 'italic' : 'normal',
        fill: fontStyle.color,
        width,
        // For justify, we need wrap enabled; for left align, disable wrap to use pre-wrapped lines
        wrap: textAlign === 'justify' ? 'word' : 'none',
        align: textAlign,
        ellipsis: textAlign !== 'justify',
      });

      if (fontStyle.fontWeight === 'bold') {
        text.fontStyle('bold');
      }

      layer.add(text);
      currentY += lineHeight;
    }

    // Add paragraph spacing
    currentY += project.layoutOptions.paragraphSpacing;
  }
}

/**
 * Get font style for a specific section type
 */
export function getFontStyleForSection(type: string, level?: number): FontStyle {
  const project = appState.getProject();
  const fonts = project.fontOptions;

  switch (type) {
    case 'heading':
      return fonts[`h${level || 1}` as keyof typeof fonts] as FontStyle;
    case 'code':
      return fonts.code;
    case 'blockquote':
      return fonts.blockquote;
    default:
      return fonts.body;
  }
}
