/**
 * Property input handlers for the Edit Selected section
 */

import { appState } from '../../../services/state';
import { createFontDropdown } from '../../FontDropdown';
import { setItemFontDropdown } from './shared';
import { addArrayDimension } from './arrayInstances';
import type { TextPageItem, ArrayDimension } from '../../../types';

/**
 * Set up property input handlers for the Edit Selected section
 */
export function setupEditPropertyInputs(updateEditSelectedSectionFn: () => void): void {
  // Position inputs
  const setupPropInput = (id: string, prop: string) => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (!input) return;
    input.addEventListener('input', () => {
      const editorState = appState.getEditor();
      if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
      const value = parseFloat(input.value);
      if (!isNaN(value)) {
        appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { [prop]: value });
      }
    });
  };

  setupPropInput('item-x', 'x');
  setupPropInput('item-y', 'y');
  setupPropInput('item-width', 'width');
  setupPropInput('item-height', 'height');
  setupPropInput('item-rotation', 'rotation');
  setupPropInput('item-opacity', 'opacity');

  // Shape properties
  const setupColorInput = (id: string, prop: string) => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (!input) return;
    input.addEventListener('input', () => {
      const editorState = appState.getEditor();
      if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { [prop]: input.value });
    });
  };

  // Shape stroke properties
  setupColorInput('item-stroke', 'strokeColor');
  setupPropInput('item-stroke-width', 'strokeWidth');

  // Shape fill/stroke toggle handlers
  const shapeHasFill = document.getElementById('shape-has-fill') as HTMLInputElement;
  const shapeFillSection = document.getElementById('shape-fill-section');
  shapeHasFill?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { hasFill: shapeHasFill.checked });
    if (shapeFillSection) shapeFillSection.style.display = shapeHasFill.checked ? 'block' : 'none';
  });

  const shapeHasStroke = document.getElementById('shape-has-stroke') as HTMLInputElement;
  const shapeStrokeSection = document.getElementById('shape-stroke-section');
  shapeHasStroke?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { hasStroke: shapeHasStroke.checked });
    if (shapeStrokeSection) shapeStrokeSection.style.display = shapeHasStroke.checked ? 'block' : 'none';
  });

  // Text properties - use custom font dropdown
  const fontDropdown = createFontDropdown('item-font-family', (value) => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { fontFamily: value });
  });
  setItemFontDropdown(fontDropdown);

  setupPropInput('item-font-size', 'fontSize');

  // Text fill/stroke toggle handlers
  const textHasFill = document.getElementById('text-has-fill') as HTMLInputElement;
  const textFillSection = document.getElementById('text-fill-section');
  textHasFill?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { hasFill: textHasFill.checked });
    if (textFillSection) textFillSection.style.display = textHasFill.checked ? 'block' : 'none';
  });

  const textHasStroke = document.getElementById('text-has-stroke') as HTMLInputElement;
  const textStrokeSection = document.getElementById('text-stroke-section');
  textHasStroke?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { hasStroke: textHasStroke.checked });
    if (textStrokeSection) textStrokeSection.style.display = textHasStroke.checked ? 'block' : 'none';
  });

  // Text stroke properties
  setupColorInput('text-stroke-color', 'strokeColor');
  setupPropInput('text-stroke-width', 'strokeWidth');

  // Text align buttons
  ['left', 'center', 'right'].forEach(align => {
    document.getElementById(`item-align-${align}`)?.addEventListener('click', () => {
      const editorState = appState.getEditor();
      if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { textAlign: align as 'left' | 'center' | 'right' });
      updateEditSelectedSectionFn();
    });
  });

  // Bold/Italic buttons
  document.getElementById('item-bold')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
    if (item && item.type === 'text') {
      const textItem = item as TextPageItem;
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
        fontWeight: textItem.fontWeight === 'bold' ? 'normal' : 'bold',
      });
      updateEditSelectedSectionFn();
    }
  });

  document.getElementById('item-italic')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
    if (item && item.type === 'text') {
      const textItem = item as TextPageItem;
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
        fontStyle: textItem.fontStyle === 'italic' ? 'normal' : 'italic',
      });
      updateEditSelectedSectionFn();
    }
  });

  // === Effects Section Handlers ===

  // Unified stroke toggle (for all item types)
  const itemHasStroke = document.getElementById('item-has-stroke') as HTMLInputElement;
  const itemStrokeSection = document.getElementById('item-stroke-section');
  itemHasStroke?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { hasStroke: itemHasStroke.checked });
    if (itemStrokeSection) itemStrokeSection.style.display = itemHasStroke.checked ? 'block' : 'none';
  });

  // Shadow toggle
  const itemHasShadow = document.getElementById('item-has-shadow') as HTMLInputElement;
  const itemShadowSection = document.getElementById('item-shadow-section');
  itemHasShadow?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { hasShadow: itemHasShadow.checked });
    if (itemShadowSection) itemShadowSection.style.display = itemHasShadow.checked ? 'block' : 'none';
  });

  // Shadow properties
  setupColorInput('item-shadow-color', 'shadowColor');
  setupPropInput('item-shadow-blur', 'shadowBlur');
  setupPropInput('item-shadow-offset-x', 'shadowOffsetX');
  setupPropInput('item-shadow-offset-y', 'shadowOffsetY');
  setupPropInput('item-shadow-opacity', 'shadowOpacity');

  // Array toggle - when checked, add first dimension; when unchecked, clear all dimensions
  const itemHasArray = document.getElementById('item-has-array') as HTMLInputElement;
  const itemArraySection = document.getElementById('item-array-section');
  itemHasArray?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

    if (itemHasArray.checked) {
      // Add first dimension with default values
      const firstDimension: ArrayDimension = {
        id: crypto.randomUUID(),
        count: 3,
        offsetX: 30,
        offsetY: 0,
      };
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
        arrayDimensions: [firstDimension],
      });
    } else {
      // Clear all dimensions
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
        arrayDimensions: undefined,
      });
    }

    if (itemArraySection) itemArraySection.style.display = itemHasArray.checked ? 'block' : 'none';
  });
}
