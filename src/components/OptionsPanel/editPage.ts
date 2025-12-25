/**
 * OptionsPanel Edit Page Module
 * Handles the edit page panel for static pages (adding/editing items)
 */

import { appState } from '../../services/state';
import { createFontDropdown, FontDropdown } from '../FontDropdown';
import { createFillPicker, FillPicker } from '../FillPicker';
import type { PageItem, TextPageItem, ShapePageItem, ImagePageItem, ProjectFile, FillConfig } from '../../types';

// Module-level instances
let itemFontDropdown: FontDropdown | null = null;
let itemFillPicker: FillPicker | null = null;
let pageBackgroundPicker: FillPicker | null = null;

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

  // Fill picker for shapes (handled separately)
  setupColorInput('item-stroke', 'strokeColor');
  setupPropInput('item-stroke-width', 'strokeWidth');

  // Text properties - use custom font dropdown
  itemFontDropdown = createFontDropdown('item-font-family', (value) => {
    const editorState = appState.getEditor();
    if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;
    appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { fontFamily: value });
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
 * Add an image file to the currently selected static page
 */
async function addImageToCurrentPage(file: File): Promise<void> {
  const editorState = appState.getEditor();
  if (!editorState.selectedPageNumber) return;

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
}

/**
 * Add an image from an existing project file to the current page
 */
export function addImageFromFileToPage(fileId: string): void {
  const editorState = appState.getEditor();
  if (!editorState.selectedPageNumber) return;

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

  // If page selected but no item, show page background options
  if (editorState.selectedPageNumber && !editorState.selectedItemId) {
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

    (document.getElementById('item-stroke') as HTMLInputElement).value = shapeItem.strokeColor || '#000000';
    (document.getElementById('item-stroke-width') as HTMLInputElement).value = (shapeItem.strokeWidth || 1).toString();
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    shapeProps!.style.display = 'none';
    textProps!.style.display = 'block';

    // Use font dropdown if available, otherwise fall back to select
    if (itemFontDropdown) {
      itemFontDropdown.setValue(textItem.fontFamily);
    }
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
      if (!editorState.selectedPageNumber) return;
      appState.updatePageBackground(editorState.selectedPageNumber, fill);
    });
  }
}
