/**
 * Panel update functions for the Edit Page module
 */

import { appState } from '../../../services/state';
import { createFillPicker } from '../../FillPicker';
import {
  switchToSelectedTab,
  itemFontDropdown,
  itemFillPicker,
  setItemFillPicker
} from './shared';
import { updateMultiSelectControls } from './multiSelect';
import { updateArrayDimensionsList, setupAddDimensionButton } from './arrayInstances';
import { setupPageBackgroundPicker } from './pageBackground';
import { updateCustomBackgroundSection } from './customBackground';
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
 * Find the selected page content
 */
function findSelectedPage(): import('../../../types').PageContent | null {
  const editorState = appState.getEditor();
  const project = appState.getProject();

  if (editorState.selectedPageNumber === null) return null;

  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (editorState.selectedPagePosition === 'verso' &&
          spread.verso?.pageNumber === editorState.selectedPageNumber) {
        return spread.verso;
      }
      if (editorState.selectedPagePosition === 'recto' &&
          spread.recto?.pageNumber === editorState.selectedPageNumber) {
        return spread.recto;
      }
    }
  }
  return null;
}

/**
 * Check if both pages in the visual spread are static
 */
function isEntireSpreadStatic(pageNumber: number): boolean {
  const project = appState.getProject();

  // Build visual spreads like thumbnails do
  const allPages: import('../../../types').PageContent[] = [];
  for (const sig of project.signatures) {
    for (const spread of sig.spreads) {
      if (spread.verso) allPages.push(spread.verso);
      if (spread.recto) allPages.push(spread.recto);
    }
  }

  allPages.sort((a, b) => a.pageNumber - b.pageNumber);
  if (allPages.length === 0) return false;

  const pageMap = new Map<number, import('../../../types').PageContent>();
  for (const page of allPages) {
    pageMap.set(page.pageNumber, page);
  }

  const isPageStatic = (p: import('../../../types').PageContent | undefined): boolean =>
    p?.pageState === 'static' || p?.isStatic === true;

  // Page 1 is recto of first spread [null|1] - only need page 1 to be static
  if (pageNumber === 1) {
    const page1 = pageMap.get(1);
    return isPageStatic(page1);
  }

  // For page N > 1: visual spread is [even|odd]
  const versoNum = pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
  const rectoNum = versoNum + 1;

  const verso = pageMap.get(versoNum);
  const recto = pageMap.get(rectoNum);

  // Both pages must exist and be static
  return isPageStatic(verso) && isPageStatic(recto);
}

/**
 * Update the Edit Selected section based on current item selection
 */
export function updateEditSelectedSection(): void {
  const editorState = appState.getEditor();
  const panel = document.getElementById('edit-page-panel');
  const section = document.getElementById('edit-selected-section');
  const pageBackgroundSection = document.getElementById('page-background-section');
  const customBackgroundSection = document.getElementById('custom-background-section');
  const shapeProps = document.getElementById('shape-properties');
  const textProps = document.getElementById('text-properties');

  if (!section) return;

  // Always update multi-select controls
  updateMultiSelectControls();

  const selectedCount = editorState.selectedItemIds.length;

  // Get delete section, check if page is static
  const deleteStaticPageSection = document.getElementById('delete-static-page-section');
  const noSelectionMessage = document.getElementById('no-selection-message');
  const selectedPage = findSelectedPage();
  const isStaticPage = selectedPage?.pageState === 'static' || selectedPage?.isStatic;

  // If multiple items selected, only show multi-select controls
  if (selectedCount > 1) {
    section.style.display = 'none';
    if (pageBackgroundSection) pageBackgroundSection.style.display = 'none';
    if (customBackgroundSection) customBackgroundSection.style.display = 'none';
    if (deleteStaticPageSection) deleteStaticPageSection.style.display = 'none';
    if (noSelectionMessage) noSelectionMessage.style.display = 'none';
    const effectsSection = document.getElementById('effects-section');
    if (effectsSection) effectsSection.style.display = 'none';
    if (panel) panel.style.display = 'block';
    return;
  }

  // If page selected but no item, show custom background, page fill, and delete (if static)
  if (editorState.selectedPageNumber && selectedCount === 0) {
    section.style.display = 'none';

    // Show custom background section for ALL pages (not just static)
    updateCustomBackgroundSection();

    // Show page fill picker
    if (pageBackgroundSection) {
      pageBackgroundSection.style.display = 'block';
      setupPageBackgroundPicker(editorState.selectedPageNumber);
    }

    // Show delete section only for static pages
    if (deleteStaticPageSection) {
      deleteStaticPageSection.style.display = isStaticPage ? 'block' : 'none';
    }
    if (noSelectionMessage) noSelectionMessage.style.display = 'none';
    if (panel) panel.style.display = 'block';
    return;
  }

  // Hide page background sections if item is selected
  if (pageBackgroundSection) {
    pageBackgroundSection.style.display = 'none';
  }
  if (customBackgroundSection) {
    customBackgroundSection.style.display = 'none';
  }

  // Hide if no item selected
  if (selectedCount === 0 || !editorState.selectedPageNumber) {
    section.style.display = 'none';
    if (deleteStaticPageSection) deleteStaticPageSection.style.display = 'none';
    if (noSelectionMessage) noSelectionMessage.style.display = 'block';
    const effectsSection = document.getElementById('effects-section');
    if (effectsSection) effectsSection.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  // When an item is selected, hide custom background section, show delete only for static pages
  if (customBackgroundSection) customBackgroundSection.style.display = 'none';
  if (deleteStaticPageSection) {
    deleteStaticPageSection.style.display = isStaticPage ? 'block' : 'none';
  }
  if (noSelectionMessage) noSelectionMessage.style.display = 'none';

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
  } else if (item.type === 'textFlow') {
    hasStroke = item.hasStroke ?? false;
    strokeColor = item.strokeColor || '#000000';
    strokeWidth = item.strokeWidth ?? 1;
  }

  // Update unified stroke toggle
  const itemHasStroke = document.getElementById('item-has-stroke') as HTMLInputElement;
  const itemStrokeSection = document.getElementById('item-stroke-section');
  if (itemHasStroke) itemHasStroke.checked = hasStroke;
  if (itemStrokeSection) itemStrokeSection.style.display = hasStroke ? 'block' : 'none';
  setInputValue('item-stroke', strokeColor);
  setInputValue('item-stroke-width', strokeWidth.toString());

  // Update shadow toggle and properties. Hidden entirely for text-flow
  // items — shadow doesn't make sense on a region of flowed text.
  const hasShadow = item.hasShadow ?? false;
  const itemHasShadow = document.getElementById('item-has-shadow') as HTMLInputElement;
  const itemShadowSection = document.getElementById('item-shadow-section');
  const shadowToggleRow = itemHasShadow?.closest('.form-group') as HTMLElement | null;
  const isTextFlow = item.type === 'textFlow';
  if (shadowToggleRow) shadowToggleRow.style.display = isTextFlow ? 'none' : '';
  if (itemHasShadow) itemHasShadow.checked = hasShadow;
  if (itemShadowSection) itemShadowSection.style.display = hasShadow && !isTextFlow ? 'block' : 'none';
  setInputValue('item-shadow-color', item.shadowColor || '#000000');
  setInputValue('item-shadow-blur', (item.shadowBlur ?? 5).toString());
  setInputValue('item-shadow-offset-x', (item.shadowOffsetX ?? 3).toString());
  setInputValue('item-shadow-offset-y', (item.shadowOffsetY ?? 3).toString());
  setInputValue('item-shadow-opacity', (item.shadowOpacity ?? 0.5).toString());

  // Text-color picker for text-flow items: shown alongside the fill picker
  // and applied to every flowed line.
  const itemTextColorSection = document.getElementById('item-text-color-section');
  if (itemTextColorSection) {
    itemTextColorSection.style.display = isTextFlow ? 'block' : 'none';
  }
  if (isTextFlow) {
    setInputValue('item-text-color', item.textColor || '#000000');
  }

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

  // Update unified fill toggle and picker (works for shapes, text, text-flow)
  let hasFill = true;
  let currentFill: FillConfig;
  let defaultFillColor = '#cccccc';

  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    const isLinear = shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow';
    hasFill = shapeItem.hasFill ?? !isLinear;
    defaultFillColor = shapeItem.fillColor || '#cccccc';
    currentFill = shapeItem.fill || { type: 'color', color: defaultFillColor };
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    hasFill = textItem.hasFill ?? true;
    defaultFillColor = textItem.color || '#000000';
    currentFill = textItem.fill || { type: 'color', color: defaultFillColor };
  } else if (item.type === 'textFlow') {
    // Text-flow fill = background of the region. Default off; a sensible
    // initial color so toggling on produces a visible result.
    hasFill = item.hasFill === true;
    defaultFillColor = '#ffffff';
    currentFill = item.fill || { type: 'color', color: defaultFillColor };
  } else {
    currentFill = { type: 'color', color: defaultFillColor };
  }

  const itemHasFillCheckbox = document.getElementById('item-has-fill') as HTMLInputElement;
  const itemFillSection = document.getElementById('item-fill-section');
  if (itemHasFillCheckbox) itemHasFillCheckbox.checked = hasFill;
  if (itemFillSection) itemFillSection.style.display = hasFill ? 'block' : 'none';

  // Set up unified fill picker
  const fillPickerContainer = document.getElementById('item-fill-picker');
  if (fillPickerContainer) {
    if (itemFillPicker) {
      itemFillPicker.setFill(currentFill);
    } else {
      const picker = createFillPicker(fillPickerContainer, currentFill, (fill) => {
        const editorState = appState.getEditor();
        if (!editorState.selectedPageNumber || !editorState.selectedItemId) return;

        const currentItem = appState.getItemFromPage(editorState.selectedPageNumber, editorState.selectedItemId);
        if (!currentItem) return;

        // Update fill with backwards compatibility
        if (currentItem.type === 'shape') {
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
            fill,
            fillColor: fill.type === 'color' ? fill.color : undefined
          });
        } else if (currentItem.type === 'text') {
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, {
            fill,
            color: fill.type === 'color' ? (fill.color || '#000000') : '#000000'
          });
        } else if (currentItem.type === 'textFlow') {
          appState.updateItemOnPage(editorState.selectedPageNumber, editorState.selectedItemId, { fill });
        }
      });
      setItemFillPicker(picker);
    }
  }

  // Show/hide type-specific properties
  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    shapeProps!.style.display = 'block';
    textProps!.style.display = 'none';

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

    // Update case button states
    document.getElementById('item-uppercase')?.classList.toggle('active', textItem.textTransform === 'uppercase');
    document.getElementById('item-lowercase')?.classList.toggle('active', textItem.textTransform === 'lowercase');
  } else {
    shapeProps!.style.display = 'none';
    textProps!.style.display = 'none';
  }
}
