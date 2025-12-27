/**
 * Panel update functions for the Edit Page module
 */

import { appState } from '../../../services/state';
import { createFillPicker } from '../../FillPicker';
import {
  switchToSelectedTab,
  itemFontDropdown,
  itemFillPicker,
  textFillPicker,
  setItemFillPicker,
  setTextFillPicker
} from './shared';
import { updateMultiSelectControls } from './multiSelect';
import { updateArrayDimensionsList, setupAddDimensionButton } from './arrayInstances';
import { setupPageBackgroundPicker } from './pageBackground';
import { getTotalArrayInstances } from '../../SpreadEditor/items/arrayItems';
import type { TextPageItem, ShapePageItem, FillConfig } from '../../../types';

/**
 * Update the Edit Page panel visibility and toolbar add buttons
 */
export function updateEditPagePanel(): void {
  const editorState = appState.getEditor();
  const project = appState.getProject();
  const panel = document.getElementById('edit-page-panel');
  const toolbarAddItems = document.getElementById('toolbar-add-items');

  // Hide if no page selected
  if (editorState.selectedPageNumber === null) {
    if (panel) panel.style.display = 'none';
    if (toolbarAddItems) toolbarAddItems.style.display = 'none';
    return;
  }

  // Find the selected page
  let selectedPage = null;
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (editorState.selectedPagePosition === 'verso' &&
          spread.verso?.pageNumber === editorState.selectedPageNumber) {
        selectedPage = spread.verso;
        break;
      }
      if (editorState.selectedPagePosition === 'recto' &&
          spread.recto?.pageNumber === editorState.selectedPageNumber) {
        selectedPage = spread.recto;
        break;
      }
    }
    if (selectedPage) break;
  }

  // Show add items in toolbar for all pages (items can exist on any page type)
  if (toolbarAddItems) {
    toolbarAddItems.style.display = 'flex';
  }

  // Panel visibility is now controlled by item selection (updateEditSelectedSection)
  // For text pages without selected items, we can still show the panel for page background
  const isBlankOrStatic = selectedPage?.isBlank || selectedPage?.isStatic;
  if (panel && !isBlankOrStatic && editorState.selectedItemIds.length === 0) {
    // Text pages without items selected - panel will be shown by updateEditSelectedSection if needed
  }
}

/**
 * Update the Edit Selected section based on current item selection
 */
export function updateEditSelectedSection(): void {
  const editorState = appState.getEditor();
  const panel = document.getElementById('edit-page-panel');
  const section = document.getElementById('edit-selected-section');
  const pageBackgroundSection = document.getElementById('page-background-section');
  const shapeProps = document.getElementById('shape-properties');
  const textProps = document.getElementById('text-properties');

  if (!section) return;

  // Always update multi-select controls
  updateMultiSelectControls();

  const selectedCount = editorState.selectedItemIds.length;

  // If multiple items selected, only show multi-select controls
  if (selectedCount > 1) {
    section.style.display = 'none';
    if (pageBackgroundSection) pageBackgroundSection.style.display = 'none';
    const effectsSection = document.getElementById('effects-section');
    if (effectsSection) effectsSection.style.display = 'none';
    if (panel) panel.style.display = 'block';
    return;
  }

  // If page selected but no item, show page background options
  if (editorState.selectedPageNumber && selectedCount === 0) {
    section.style.display = 'none';
    if (pageBackgroundSection) {
      pageBackgroundSection.style.display = 'block';
      setupPageBackgroundPicker(editorState.selectedPageNumber);
    }
    if (panel) panel.style.display = 'block';
    return;
  }

  // Hide page background section if item is selected
  if (pageBackgroundSection) {
    pageBackgroundSection.style.display = 'none';
  }

  // Hide if no item selected
  if (selectedCount === 0 || !editorState.selectedPageNumber) {
    section.style.display = 'none';
    const effectsSection = document.getElementById('effects-section');
    if (effectsSection) effectsSection.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  // Get the selected item (single selection case)
  const selectedItemId = editorState.selectedItemIds[0];
  const item = appState.getItemFromPage(editorState.selectedPageNumber, selectedItemId);
  if (!item) {
    section.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  // Show panel and section, and ensure we're on the Selected tab
  if (panel) panel.style.display = 'block';
  section.style.display = 'block';
  switchToSelectedTab();

  // Helper to safely set input values
  const setInputValue = (id: string, value: string) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.value = value;
  };

  // Update common properties
  setInputValue('item-x', Math.round(item.x).toString());
  setInputValue('item-y', Math.round(item.y).toString());
  setInputValue('item-width', Math.round(item.width).toString());
  setInputValue('item-height', Math.round(item.height).toString());
  setInputValue('item-rotation', (item.rotation || 0).toString());
  setInputValue('item-opacity', (item.opacity ?? 1).toString());

  // Show the effects section
  const effectsSection = document.getElementById('effects-section');
  if (effectsSection) effectsSection.style.display = 'block';

  // Get stroke properties based on item type
  let hasStroke = false;
  let strokeColor = '#000000';
  let strokeWidth = 1;

  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    hasStroke = shapeItem.hasStroke ?? true;
    strokeColor = shapeItem.strokeColor || '#000000';
    strokeWidth = shapeItem.strokeWidth || 1;
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    hasStroke = textItem.hasStroke ?? false;
    strokeColor = textItem.strokeColor || '#000000';
    strokeWidth = textItem.strokeWidth || 1;
  }

  // Update unified stroke toggle
  const itemHasStroke = document.getElementById('item-has-stroke') as HTMLInputElement;
  const itemStrokeSection = document.getElementById('item-stroke-section');
  if (itemHasStroke) itemHasStroke.checked = hasStroke;
  if (itemStrokeSection) itemStrokeSection.style.display = hasStroke ? 'block' : 'none';
  setInputValue('item-stroke', strokeColor);
  setInputValue('item-stroke-width', strokeWidth.toString());

  // Update shadow toggle and properties
  const hasShadow = item.hasShadow ?? false;
  const itemHasShadow = document.getElementById('item-has-shadow') as HTMLInputElement;
  const itemShadowSection = document.getElementById('item-shadow-section');
  if (itemHasShadow) itemHasShadow.checked = hasShadow;
  if (itemShadowSection) itemShadowSection.style.display = hasShadow ? 'block' : 'none';
  setInputValue('item-shadow-color', item.shadowColor || '#000000');
  setInputValue('item-shadow-blur', (item.shadowBlur ?? 5).toString());
  setInputValue('item-shadow-offset-x', (item.shadowOffsetX ?? 3).toString());
  setInputValue('item-shadow-offset-y', (item.shadowOffsetY ?? 3).toString());
  setInputValue('item-shadow-opacity', (item.shadowOpacity ?? 0.5).toString());

  // Update array toggle and properties (multi-dimensional)
  const dimensions = item.arrayDimensions || [];
  const hasArray = dimensions.length > 0;
  const totalInstances = getTotalArrayInstances(dimensions);
  const itemHasArray = document.getElementById('item-has-array') as HTMLInputElement;
  const itemArraySection = document.getElementById('item-array-section');
  if (itemHasArray) itemHasArray.checked = hasArray;
  if (itemArraySection) itemArraySection.style.display = hasArray ? 'block' : 'none';

  // Update total instances count display
  const totalCountDisplay = document.getElementById('array-total-count');
  if (totalCountDisplay) {
    totalCountDisplay.textContent = totalInstances > 1 ? `(${totalInstances} total copies)` : '';
  }

  // Update array dimensions list and set up add button
  updateArrayDimensionsList(item);
  setupAddDimensionButton();

  // Show/hide type-specific properties
  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    shapeProps!.style.display = 'block';
    textProps!.style.display = 'none';

    // Determine default fill/stroke based on shape type
    const isLinear = shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow';
    const hasFill = shapeItem.hasFill ?? !isLinear;
    const shapeHasStroke = shapeItem.hasStroke ?? true;

    // Update fill toggle
    const shapeHasFillCheckbox = document.getElementById('shape-has-fill') as HTMLInputElement;
    const shapeFillSection = document.getElementById('shape-fill-section');
    if (shapeHasFillCheckbox) shapeHasFillCheckbox.checked = hasFill;
    if (shapeFillSection) shapeFillSection.style.display = hasFill ? 'block' : 'none';

    // Update stroke toggle
    const shapeHasStrokeCheckbox = document.getElementById('shape-has-stroke') as HTMLInputElement;
    const shapeStrokeSection = document.getElementById('shape-stroke-section');
    if (shapeHasStrokeCheckbox) shapeHasStrokeCheckbox.checked = shapeHasStroke;
    if (shapeStrokeSection) shapeStrokeSection.style.display = shapeHasStroke ? 'block' : 'none';

    // Set up fill picker
    const fillPickerContainer = document.getElementById('item-fill-picker');
    if (fillPickerContainer) {
      // Get current fill, falling back to fillColor for backwards compatibility
      const currentFill: FillConfig = shapeItem.fill || {
        type: 'color',
        color: shapeItem.fillColor || '#cccccc'
      };

      if (itemFillPicker) {
        itemFillPicker.setFill(currentFill);
      } else {
        const picker = createFillPicker(fillPickerContainer, currentFill, (fill) => {
          const editorState = appState.getEditor();
          if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

          // Update fill property
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
            fill,
            // Also update fillColor for backwards compatibility
            fillColor: fill.type === 'color' ? fill.color : undefined
          });
        });
        setItemFillPicker(picker);
      }
    }

    setInputValue('item-stroke', shapeItem.strokeColor || '#000000');
    setInputValue('item-stroke-width', (shapeItem.strokeWidth || 1).toString());
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    shapeProps!.style.display = 'none';
    textProps!.style.display = 'block';

    // Use font dropdown if available, otherwise fall back to select
    if (itemFontDropdown) {
      itemFontDropdown.setValue(textItem.fontFamily);
    }
    setInputValue('item-font-size', textItem.fontSize.toString());

    // Update fill toggle (default: true for text)
    const hasFill = textItem.hasFill ?? true;
    const textHasFillCheckbox = document.getElementById('text-has-fill') as HTMLInputElement;
    const textFillSection = document.getElementById('text-fill-section');
    if (textHasFillCheckbox) textHasFillCheckbox.checked = hasFill;
    if (textFillSection) textFillSection.style.display = hasFill ? 'block' : 'none';

    // Update stroke toggle (default: false for text)
    const textHasStroke = textItem.hasStroke ?? false;
    const textHasStrokeCheckbox = document.getElementById('text-has-stroke') as HTMLInputElement;
    const textStrokeSection = document.getElementById('text-stroke-section');
    if (textHasStrokeCheckbox) textHasStrokeCheckbox.checked = textHasStroke;
    if (textStrokeSection) textStrokeSection.style.display = textHasStroke ? 'block' : 'none';

    // Set up text fill picker
    const textFillPickerContainer = document.getElementById('text-fill-picker');
    if (textFillPickerContainer) {
      // Get current fill, falling back to color for backwards compatibility
      const currentFill: FillConfig = textItem.fill || {
        type: 'color',
        color: textItem.color || '#000000'
      };

      if (textFillPicker) {
        textFillPicker.setFill(currentFill);
      } else {
        const picker = createFillPicker(textFillPickerContainer, currentFill, (fill) => {
          const editorState = appState.getEditor();
          if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

          // Update fill property
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
            fill,
            // Also update color for backwards compatibility
            color: fill.type === 'color' ? (fill.color || '#000000') : '#000000'
          });
        });
        setTextFillPicker(picker);
      }
    }

    // Update stroke properties
    setInputValue('text-stroke-color', textItem.strokeColor || '#000000');
    setInputValue('text-stroke-width', (textItem.strokeWidth || 1).toString());

    // Update align button states
    ['left', 'center', 'right'].forEach(align => {
      const btn = document.getElementById(`item-align-${align}`);
      if (btn) {
        btn.classList.toggle('active', textItem.textAlign === align);
      }
    });

    // Update bold/italic button states
    document.getElementById('item-bold')?.classList.toggle('active', textItem.fontWeight === 'bold');
    document.getElementById('item-italic')?.classList.toggle('active', textItem.fontStyle === 'italic');
  } else {
    shapeProps!.style.display = 'none';
    textProps!.style.display = 'none';
  }
}
