/**
 * Draw the flowed markdown content inside a text-flow page item.
 *
 * The content has already been measured and laid out by the text flow engine
 * (stored on `flowedSections`); this module just renders those sections to
 * Konva nodes inside the item's group.
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import { getFontStyleForSection } from '../content';
import type {
  TextFlowPageItem,
  FontStyle,
  RichTextLine,
} from '../../../types';
import type { MeasuredSection } from '../../../services/textFlow/types';

/**
 * Render flowed content into the supplied group. Square text-flow items use
 * MeasuredSection layout; polygon items render pre-positioned lines.
 */
export function drawTextFlowItemContent(
  group: Konva.Group,
  item: TextFlowPageItem
): void {
  if (item.flowShape === 'polygon') {
    drawPolygonFlowLines(group, item);
    return;
  }
  const sections = (item.flowedSections as MeasuredSection[] | undefined) || [];
  if (sections.length === 0) {
    // Placeholder hint when nothing has flowed in yet.
    const hint = new Konva.Text({
      x: 0,
      y: item.height / 2 - 7,
      width: item.width,
      text: 'Text flow',
      fontSize: 11,
      fill: '#999999',
      align: 'center',
      listening: false,
    });
    group.add(hint);
    return;
  }

  const project = appState.getProject();
  const padding = item.padding ?? 0;
  const contentX = padding;
  const contentY = padding;
  const contentWidth = Math.max(0, item.width - padding * 2);
  const contentHeight = Math.max(0, item.height - padding * 2);

  let cursorY = contentY;

  for (const section of sections) {
    const fontStyle = getFontStyleForSection(section.type, section.level);
    const lineHeight = project.layoutOptions.lineHeight * fontStyle.fontSize;
    const textAlign = fontStyle.textAlign || project.layoutOptions.textAlign;

    if (section.type === 'heading') {
      switch (section.level) {
        case 1:
          cursorY += project.layoutOptions.spacingAboveH1;
          break;
        case 2:
          cursorY += project.layoutOptions.spacingAboveH2;
          break;
        case 3:
          cursorY += project.layoutOptions.spacingAboveH3;
          break;
      }
    }

    // If the item overrides the text color, clone the section's font style
    // with the override so rich-text spans use it too.
    const renderStyle = item.textColor ? { ...fontStyle, color: item.textColor } : fontStyle;

    const richLines = section.richLines;
    if (richLines && richLines.length > 0) {
      for (const richLine of richLines) {
        if (cursorY > contentY + contentHeight) break;
        drawRichLine(group, richLine, contentX, cursorY, renderStyle, contentWidth, lineHeight, textAlign);
        cursorY += lineHeight;
      }
    } else {
      for (const line of section.lines) {
        if (cursorY > contentY + contentHeight) break;
        let combinedFontStyle = '';
        if (fontStyle.fontWeight === 'bold') combinedFontStyle += 'bold';
        if (fontStyle.fontStyle === 'italic') {
          combinedFontStyle += (combinedFontStyle ? ' ' : '') + 'italic';
        }
        if (!combinedFontStyle) combinedFontStyle = 'normal';

        const text = new Konva.Text({
          x: contentX,
          y: cursorY,
          text: line,
          fontSize: fontStyle.fontSize,
          fontFamily: fontStyle.fontFamily,
          fontStyle: combinedFontStyle,
          fill: renderStyle.color,
          width: contentWidth,
          wrap: 'none',
          align: textAlign as string,
          listening: false,
        });
        group.add(text);
        cursorY += lineHeight;
      }
    }

    cursorY += project.layoutOptions.paragraphSpacing;
  }
}

function drawPolygonFlowLines(group: Konva.Group, item: TextFlowPageItem): void {
  const lines = item.flowedPolygonLines;
  if (!lines || lines.length === 0) {
    const hint = new Konva.Text({
      x: 0,
      y: item.height / 2 - 7,
      width: item.width,
      text: 'Text flow',
      fontSize: 11,
      fill: '#999999',
      align: 'center',
      listening: false,
    });
    group.add(hint);
    return;
  }

  for (const line of lines) {
    const fontStyle = getFontStyleForSection(line.sectionType, line.sectionLevel);
    let combined = '';
    if (fontStyle.fontWeight === 'bold') combined += 'bold';
    if (fontStyle.fontStyle === 'italic') {
      combined += (combined ? ' ' : '') + 'italic';
    }
    if (!combined) combined = 'normal';

    const text = new Konva.Text({
      x: line.x,
      y: line.y,
      text: line.text,
      fontSize: fontStyle.fontSize,
      fontFamily: fontStyle.fontFamily,
      fontStyle: combined,
      fill: item.textColor || fontStyle.color,
      listening: false,
    });
    group.add(text);
  }
}

function drawRichLine(
  group: Konva.Group,
  line: RichTextLine,
  x: number,
  y: number,
  baseStyle: FontStyle,
  contentWidth: number,
  lineHeight: number,
  textAlign: string | undefined
): void {
  // Measure each span to compute alignment.
  const measurements: { text: Konva.Text; width: number }[] = [];
  let totalWidth = 0;
  for (const span of line.spans) {
    let isBold = baseStyle.fontWeight === 'bold';
    let isItalic = baseStyle.fontStyle === 'italic';
    if (span.bold) isBold = true;
    if (span.italic) isItalic = true;
    let combinedStyle = '';
    if (isBold) combinedStyle += 'bold';
    if (isItalic) combinedStyle += (combinedStyle ? ' ' : '') + 'italic';
    if (!combinedStyle) combinedStyle = 'normal';

    const text = new Konva.Text({
      text: span.text,
      fontSize: baseStyle.fontSize,
      fontFamily: baseStyle.fontFamily,
      fontStyle: combinedStyle,
      fill: baseStyle.color,
      listening: false,
    });
    const width = text.width();
    measurements.push({ text, width });
    totalWidth += width;
  }

  let currentX = x;
  if (textAlign === 'center') {
    currentX = x + (contentWidth - totalWidth) / 2;
  } else if (textAlign === 'right') {
    currentX = x + contentWidth - totalWidth;
  }

  for (const m of measurements) {
    m.text.x(currentX);
    m.text.y(y);
    group.add(m.text);
    currentX += m.width;
  }
}
