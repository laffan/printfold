/**
 * OptionsPanel Edit Page Module
 * Handles the edit page panel for static pages (adding/editing items)
 */

import { appState } from '../../services/state';
import type { PageItem, TextPageItem, ShapePageItem } from '../../types';

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
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        // TODO: Handle image upload and add to page
        console.log('Image selected:', file.name);
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

  setupColorInput('item-fill', 'fillColor');
  setupColorInput('item-stroke', 'strokeColor');
  setupPropInput('item-stroke-width', 'strokeWidth');

  // Text properties
  const fontFamily = document.getElementById('item-font-family') as HTMLSelectElement;
  fontFamily?.addEventListener('change', () => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { fontFamily: fontFamily.value });
  });

  setupPropInput('item-font-size', 'fontSize');
  setupColorInput('item-text-color', 'color');

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
}

/**
 * Add an item to the currently selected static page
 */
function addItemToCurrentPage(itemType: 'text' | 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow'): void {
  const editorState = appState.getEditor();
  if (!editorState.selectedPageNumber) return;

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
  const shapeProps = document.getElementById('shape-properties');
  const textProps = document.getElementById('text-properties');

  if (!section) return;

  // Hide if no item selected
  if (!editorState.selectedItemId || !editorState.selectedPageNumber) {
    section.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  // Get the selected item
  const item = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
  if (!item) {
    section.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  // Show panel and section
  if (panel) panel.style.display = 'block';
  section.style.display = 'block';

  // Update common properties
  (document.getElementById('item-x') as HTMLInputElement).value = Math.round(item.x).toString();
  (document.getElementById('item-y') as HTMLInputElement).value = Math.round(item.y).toString();
  (document.getElementById('item-width') as HTMLInputElement).value = Math.round(item.width).toString();
  (document.getElementById('item-height') as HTMLInputElement).value = Math.round(item.height).toString();
  (document.getElementById('item-rotation') as HTMLInputElement).value = (item.rotation || 0).toString();
  (document.getElementById('item-opacity') as HTMLInputElement).value = (item.opacity ?? 1).toString();

  // Show/hide type-specific properties
  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    shapeProps!.style.display = 'block';
    textProps!.style.display = 'none';

    (document.getElementById('item-fill') as HTMLInputElement).value = shapeItem.fillColor || '#cccccc';
    (document.getElementById('item-stroke') as HTMLInputElement).value = shapeItem.strokeColor || '#000000';
    (document.getElementById('item-stroke-width') as HTMLInputElement).value = (shapeItem.strokeWidth || 1).toString();
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    shapeProps!.style.display = 'none';
    textProps!.style.display = 'block';

    (document.getElementById('item-font-family') as HTMLSelectElement).value = textItem.fontFamily;
    (document.getElementById('item-font-size') as HTMLInputElement).value = textItem.fontSize.toString();
    (document.getElementById('item-text-color') as HTMLInputElement).value = textItem.color;

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
