/**
 * Text editing functionality for Konva text items
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import type { TextPageItem } from '../../../types';

/**
 * Start editing a text item with a textarea overlay
 */
export function startTextEditing(
  textNode: Konva.Text,
  item: TextPageItem,
  pageNumber: number,
  xOffset: number,
  zoomLevel: number,
  stage: Konva.Stage,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): void {
  // Hide the text node while editing
  textNode.hide();
  transformer.nodes([]);
  itemsLayer.draw();

  // Get the position of the text node
  const textPosition = textNode.getAbsolutePosition();
  const stageBox = stage.container().getBoundingClientRect();

  // Create a textarea
  const textarea = document.createElement('textarea');
  stage.container().parentElement!.appendChild(textarea);

  // Position and style the textarea
  textarea.value = item.content;
  textarea.style.position = 'absolute';
  textarea.style.left = `${stageBox.left + textPosition.x}px`;
  textarea.style.top = `${stageBox.top + textPosition.y}px`;
  textarea.style.width = `${textNode.width() * zoomLevel}px`;
  textarea.style.minHeight = `${textNode.height() * zoomLevel}px`;
  textarea.style.fontSize = `${item.fontSize * zoomLevel}px`;
  textarea.style.fontFamily = item.fontFamily;
  textarea.style.fontWeight = item.fontWeight;
  textarea.style.fontStyle = item.fontStyle;
  textarea.style.color = item.color;
  textarea.style.textAlign = item.textAlign;
  textarea.style.border = '2px solid #22c55e';
  textarea.style.borderRadius = '2px';
  textarea.style.padding = '2px 4px';
  textarea.style.margin = '0';
  textarea.style.overflow = 'hidden';
  textarea.style.background = 'white';
  textarea.style.outline = 'none';
  textarea.style.resize = 'none';
  textarea.style.lineHeight = '1.2';
  textarea.style.zIndex = '1000';
  textarea.style.transformOrigin = 'left top';

  // Apply rotation if any
  if (item.rotation) {
    textarea.style.transform = `rotate(${item.rotation}deg)`;
  }

  textarea.focus();
  textarea.select();

  // Auto-resize textarea
  const resizeTextarea = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', resizeTextarea);
  resizeTextarea();

  // Handle blur/finish editing
  const finishEditing = () => {
    const newContent = textarea.value;
    textarea.remove();
    textNode.show();

    // Update the item content
    if (newContent !== item.content) {
      appState.updateItemOnPage(pageNumber, item.id, { content: newContent });
    }

    updateTransformerFn();
    itemsLayer.draw();
  };

  textarea.addEventListener('blur', finishEditing);

  // Handle escape to cancel, enter+shift for newline, enter to finish
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textarea.value = item.content; // Restore original
      textarea.blur();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });
}
