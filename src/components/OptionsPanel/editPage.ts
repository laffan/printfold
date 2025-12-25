/**
 * OptionsPanel Edit Page Module
 * Handles the edit page panel for static pages (adding/editing items)
 */

import { appState } from '../../services/state';
import { createFontDropdown, FontDropdown } from '../FontDropdown';
import { createFillPicker, FillPicker } from '../FillPicker';
import type { PageItem, TextPageItem, ShapePageItem, ImagePageItem, ProjectFile, FillConfig, ArrayInstance } from '../../types';

/**
 * Set up the multi-select controls (align & distribute)
 */
export function setupMultiSelectControls(): void {
  // Align buttons
  document.getElementById('btn-align-left')?.addEventListener('click', () => {
    appState.alignItems('left');
  });
  document.getElementById('btn-align-h-center')?.addEventListener('click', () => {
    appState.alignItems('center');
  });
  document.getElementById('btn-align-right')?.addEventListener('click', () => {
    appState.alignItems('right');
  });
  document.getElementById('btn-align-top')?.addEventListener('click', () => {
    appState.alignItems('top');
  });
  document.getElementById('btn-align-v-center')?.addEventListener('click', () => {
    appState.alignItems('middle');
  });
  document.getElementById('btn-align-bottom')?.addEventListener('click', () => {
    appState.alignItems('bottom');
  });

  // Distribute buttons
  document.getElementById('btn-distribute-h')?.addEventListener('click', () => {
    appState.distributeItems('horizontal');
  });
  document.getElementById('btn-distribute-v')?.addEventListener('click', () => {
    appState.distributeItems('vertical');
  });
}

/**
 * Update the multi-select controls visibility and count
 */
export function updateMultiSelectControls(): void {
  const editorState = appState.getEditor();
  const multiSelectControls = document.getElementById('multi-select-controls');
  const multiSelectCount = document.getElementById('multi-select-count');

  if (!multiSelectControls) return;

  const selectedCount = editorState.selectedItemIds.length;

  if (selectedCount > 1) {
    multiSelectControls.style.display = 'block';
    if (multiSelectCount) {
      multiSelectCount.textContent = `${selectedCount} items selected`;
    }

    // Enable/disable distribute buttons based on count
    const distributeH = document.getElementById('btn-distribute-h') as HTMLButtonElement;
    const distributeV = document.getElementById('btn-distribute-v') as HTMLButtonElement;
    if (distributeH) distributeH.disabled = selectedCount < 3;
    if (distributeV) distributeV.disabled = selectedCount < 3;
  } else {
    multiSelectControls.style.display = 'none';
  }
}

// Module-level instances
let itemFontDropdown: FontDropdown | null = null;
let itemFillPicker: FillPicker | null = null;
let textFillPicker: FillPicker | null = null;
let pageBackgroundPicker: FillPicker | null = null;
const instanceFillPickers: Map<number, FillPicker> = new Map();

/**
 * Switch to the Selected tab in the options panel
 */
export function switchToSelectedTab(): void {
  const tabButtons = document.querySelectorAll('.options-tabs .tab-btn');
  const tabPanels = document.querySelectorAll('.options-tab-content > .tab-panel');

  tabButtons.forEach(btn => {
    const isSelected = btn.getAttribute('data-tab') === 'selected';
    btn.classList.toggle('active', isSelected);
  });

  tabPanels.forEach(panel => {
    const isSelected = panel.id === 'tab-selected';
    panel.classList.toggle('active', isSelected);
  });
}

/**
 * Set up the Edit Page panel event handlers
 */
export function setupEditPagePanel(updateEditSelectedSectionFn: () => void): void {
  // Add Text button
  document.getElementById('btn-add-text')?.addEventListener('click', () => {
    addItemToCurrentPage('text');
  });

  // Add Rectangle button
  document.getElementById('btn-add-rect')?.addEventListener('click', () => {
    addItemToCurrentPage('rectangle');
  });

  // Add Ellipse button
  document.getElementById('btn-add-ellipse')?.addEventListener('click', () => {
    addItemToCurrentPage('ellipse');
  });

  // Add Line button
  document.getElementById('btn-add-line')?.addEventListener('click', () => {
    addItemToCurrentPage('line');
  });

  // Add Circle button
  document.getElementById('btn-add-circle')?.addEventListener('click', () => {
    addItemToCurrentPage('circle');
  });

  // Add Arrow button
  document.getElementById('btn-add-arrow')?.addEventListener('click', () => {
    addItemToCurrentPage('arrow');
  });

  // Add Image button
  document.getElementById('btn-add-image')?.addEventListener('click', () => {
    // Create file input to select image
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await addImageToCurrentPage(file);
      }
    };
    input.click();
  });

  // Duplicate item button
  document.getElementById('btn-duplicate-item')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
      if (item) {
        const newItem: PageItem = {
          ...item,
          id: crypto.randomUUID(),
          x: item.x + 20,
          y: item.y + 20,
        };
        appState.addItemToPage(editorState.selectedPageNumber, newItem);
        appState.updateEditor({ selectedItemId: newItem.id });
        switchToSelectedTab();
      }
    }
  });

  // Delete item button
  document.getElementById('btn-delete-item')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.deleteItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  // Z-order buttons
  document.getElementById('btn-bring-front')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.bringItemToFront(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  document.getElementById('btn-send-back')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.sendItemToBack(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  document.getElementById('btn-move-forward')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.moveItemForward(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  document.getElementById('btn-move-backward')?.addEventListener('click', () => {
    const editorState = appState.getEditor();
    if (editorState.selectedPageNumber && editorState.selectedItemId) {
      appState.moveItemBackward(editorState.selectedPageNumber, editorState.selectedItemId);
    }
  });

  // Property input handlers
  setupEditPropertyInputs(updateEditSelectedSectionFn);
}

/**
 * Set up property input handlers for the Edit Selected section
 */
function setupEditPropertyInputs(updateEditSelectedSectionFn: () => void): void {
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
  itemFontDropdown = createFontDropdown('item-font-family', (value) => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { fontFamily: value });
  });

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

  // Array toggle
  const itemHasArray = document.getElementById('item-has-array') as HTMLInputElement;
  const itemArraySection = document.getElementById('item-array-section');
  itemHasArray?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    // Set arrayCount to 2 when enabled, 1 when disabled
    const newArrayCount = itemHasArray.checked ? 2 : 1;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { arrayCount: newArrayCount });
    if (itemArraySection) itemArraySection.style.display = itemHasArray.checked ? 'block' : 'none';
  });

  // Array duplication inputs
  const arrayCountInput = document.getElementById('item-array-count') as HTMLInputElement;
  arrayCountInput?.addEventListener('input', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    const value = parseInt(arrayCountInput.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 50) {
      appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { arrayCount: value });
      // Refresh the instances list
      const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
      if (item) updateArrayInstancesList(item);
    }
  });
  setupPropInput('item-array-offset-x', 'arrayOffsetX');
  setupPropInput('item-array-offset-y', 'arrayOffsetY');
}

/**
 * Add an item to the currently selected static page
 */
function addItemToCurrentPage(itemType: 'text' | 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow'): void {
  const editorState = appState.getEditor();
  if (editorState.selectedPageNumber === null) return;

  // Determine dimensions based on shape type
  const isLinear = itemType === 'line' || itemType === 'arrow';
  const isCircular = itemType === 'circle';

  const baseItem = {
    id: crypto.randomUUID(),
    x: 50,
    y: 50,
    width: isLinear ? 100 : (isCircular ? 60 : 100),
    height: isLinear ? 2 : (itemType === 'text' ? 30 : (isCircular ? 60 : 80)),
    rotation: 0,
    opacity: 1,
  };

  let item: PageItem;

  if (itemType === 'text') {
    item = {
      ...baseItem,
      type: 'text',
      content: 'Text',
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#000000',
      textAlign: 'left',
    } as TextPageItem;
  } else {
    item = {
      ...baseItem,
      type: 'shape',
      shapeType: itemType,
      fillColor: isLinear ? undefined : '#cccccc',
      strokeColor: '#000000',
      strokeWidth: isLinear ? 2 : 1,
    } as ShapePageItem;
  }

  appState.addItemToPage(editorState.selectedPageNumber, item);
  appState.updateEditor({ selectedItemId: item.id });
  switchToSelectedTab();
}

/**
 * Add an image file to the currently selected static page
 */
async function addImageToCurrentPage(file: File): Promise<void> {
  const editorState = appState.getEditor();
  if (editorState.selectedPageNumber === null) return;

  // Read file as base64
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  // Add file to project files
  const projectFile: ProjectFile = {
    id: crypto.randomUUID(),
    name: file.name,
    type: 'image',
    content,
    isBase64: true,
    lastModified: file.lastModified,
  };
  appState.addFiles([projectFile]);

  // Create image item on the page
  const item: ImagePageItem = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 50,
    y: 50,
    width: 150,
    height: 100,
    rotation: 0,
    opacity: 1,
    imageFileId: projectFile.id,
  };

  appState.addItemToPage(editorState.selectedPageNumber, item);
  appState.updateEditor({ selectedItemId: item.id });
  switchToSelectedTab();
}

/**
 * Add an image from an existing project file to the current page
 */
export function addImageFromFileToPage(fileId: string): void {
  const editorState = appState.getEditor();
  if (editorState.selectedPageNumber === null) return;

  const file = appState.getProject().files.find(f => f.id === fileId);
  if (!file || file.type !== 'image') return;

  const item: ImagePageItem = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 50,
    y: 50,
    width: 150,
    height: 100,
    rotation: 0,
    opacity: 1,
    imageFileId: fileId,
  };

  appState.addItemToPage(editorState.selectedPageNumber, item);
  appState.updateEditor({ selectedItemId: item.id });
  switchToSelectedTab();
}

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

  // Show add items in toolbar for static/blank pages
  const isBlankOrStatic = selectedPage?.isBlank || selectedPage?.isStatic;
  if (toolbarAddItems) {
    toolbarAddItems.style.display = isBlankOrStatic ? 'flex' : 'none';
  }

  // Panel visibility is now controlled by item selection (updateEditSelectedSection)
  // We only show the panel when an item is selected
  if (panel && !isBlankOrStatic) {
    panel.style.display = 'none';
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

  // Show panel and section
  if (panel) panel.style.display = 'block';
  section.style.display = 'block';

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

  // Update array toggle and properties
  const arrayCount = item.arrayCount || 1;
  const hasArray = arrayCount > 1;
  const itemHasArray = document.getElementById('item-has-array') as HTMLInputElement;
  const itemArraySection = document.getElementById('item-array-section');
  if (itemHasArray) itemHasArray.checked = hasArray;
  if (itemArraySection) itemArraySection.style.display = hasArray ? 'block' : 'none';
  setInputValue('item-array-count', arrayCount.toString());
  setInputValue('item-array-offset-x', (item.arrayOffsetX || 20).toString());
  setInputValue('item-array-offset-y', (item.arrayOffsetY || 20).toString());

  // Update array instances list
  updateArrayInstancesList(item);

  // Show/hide type-specific properties
  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    shapeProps!.style.display = 'block';
    textProps!.style.display = 'none';

    // Determine default fill/stroke based on shape type
    const isLinear = shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow';
    const hasFill = shapeItem.hasFill ?? !isLinear;
    const hasStroke = shapeItem.hasStroke ?? true;

    // Update fill toggle
    const shapeHasFillCheckbox = document.getElementById('shape-has-fill') as HTMLInputElement;
    const shapeFillSection = document.getElementById('shape-fill-section');
    if (shapeHasFillCheckbox) shapeHasFillCheckbox.checked = hasFill;
    if (shapeFillSection) shapeFillSection.style.display = hasFill ? 'block' : 'none';

    // Update stroke toggle
    const shapeHasStrokeCheckbox = document.getElementById('shape-has-stroke') as HTMLInputElement;
    const shapeStrokeSection = document.getElementById('shape-stroke-section');
    if (shapeHasStrokeCheckbox) shapeHasStrokeCheckbox.checked = hasStroke;
    if (shapeStrokeSection) shapeStrokeSection.style.display = hasStroke ? 'block' : 'none';

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
        itemFillPicker = createFillPicker(fillPickerContainer, currentFill, (fill) => {
          const editorState = appState.getEditor();
          if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

          // Update fill property
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
            fill,
            // Also update fillColor for backwards compatibility
            fillColor: fill.type === 'color' ? fill.color : undefined
          });
        });
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
    const hasStroke = textItem.hasStroke ?? false;
    const textHasStrokeCheckbox = document.getElementById('text-has-stroke') as HTMLInputElement;
    const textStrokeSection = document.getElementById('text-stroke-section');
    if (textHasStrokeCheckbox) textHasStrokeCheckbox.checked = hasStroke;
    if (textStrokeSection) textStrokeSection.style.display = hasStroke ? 'block' : 'none';

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
        textFillPicker = createFillPicker(textFillPickerContainer, currentFill, (fill) => {
          const editorState = appState.getEditor();
          if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

          // Update fill property
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
            fill,
            // Also update color for backwards compatibility
            color: fill.type === 'color' ? (fill.color || '#000000') : '#000000'
          });
        });
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

/**
 * Set up the page background fill picker
 */
function setupPageBackgroundPicker(pageNumber: number): void {
  const container = document.getElementById('page-background-picker');
  if (!container) return;

  // Get current page background
  const currentFill: FillConfig = appState.getPageBackground(pageNumber) || {
    type: 'color',
    color: '#ffffff'
  };

  if (pageBackgroundPicker) {
    pageBackgroundPicker.setFill(currentFill);
  } else {
    pageBackgroundPicker = createFillPicker(container, currentFill, (fill) => {
      const editorState = appState.getEditor();
      if (editorState.selectedPageNumber === null) return;
      appState.updatePageBackground(editorState.selectedPageNumber, fill);
    });
  }
}

/**
 * Update the array instances list UI
 */
function updateArrayInstancesList(item: PageItem): void {
  const container = document.getElementById('array-instances-list');
  if (!container) return;

  const arrayCount = item.arrayCount || 1;
  const arrayInstances = item.arrayInstances || [];

  // Clear existing pickers
  instanceFillPickers.forEach(picker => picker.destroy?.());
  instanceFillPickers.clear();
  container.innerHTML = '';

  // Don't show list if array count is 1 or less
  if (arrayCount <= 1) return;

  // Get the default fill from the item
  let defaultFill: FillConfig = { type: 'color', color: '#cccccc' };
  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    defaultFill = shapeItem.fill || { type: 'color', color: shapeItem.fillColor || '#cccccc' };
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    defaultFill = textItem.fill || { type: 'color', color: textItem.color || '#000000' };
  }

  // Create instance items
  for (let i = 0; i < arrayCount; i++) {
    const instanceConfig = arrayInstances.find(inst => inst.index === i);
    const instanceFill = instanceConfig?.fill || defaultFill;

    const instanceItem = document.createElement('div');
    instanceItem.className = 'array-instance-item';
    instanceItem.innerHTML = `
      <span class="array-instance-label">Instance ${i + 1}</span>
      <div class="array-instance-fill" id="instance-fill-${i}"></div>
    `;
    container.appendChild(instanceItem);

    // Create fill picker for this instance
    const fillContainer = instanceItem.querySelector(`#instance-fill-${i}`) as HTMLElement;
    if (fillContainer) {
      const picker = createFillPicker(fillContainer, instanceFill, (fill) => {
        const editorState = appState.getEditor();
        if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

        // Get current item and update its arrayInstances
        const currentItem = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
        if (!currentItem) return;

        const currentInstances = [...(currentItem.arrayInstances || [])];
        const existingIndex = currentInstances.findIndex(inst => inst.index === i);

        if (existingIndex >= 0) {
          currentInstances[existingIndex] = { ...currentInstances[existingIndex], fill };
        } else {
          currentInstances.push({ index: i, fill });
        }

        appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
          arrayInstances: currentInstances
        });
      });
      instanceFillPickers.set(i, picker);
    }
  }
}
