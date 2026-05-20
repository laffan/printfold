/**
 * Shared state and utilities for the Edit Page module
 */

import { FontDropdown } from '../../FontDropdown';
import { FillPicker, ColorPicker } from '../../FillPicker';

// Module-level instances
export let itemFontDropdown: FontDropdown | null = null;
export let itemFillPicker: FillPicker | null = null;
export let textFillPicker: FillPicker | null = null;
export let pageBackgroundPicker: FillPicker | null = null;
export let itemStrokeColorPicker: ColorPicker | null = null;
export let itemShadowColorPicker: ColorPicker | null = null;

// Setters for module-level state (needed because TypeScript doesn't allow direct assignment to exported variables)
export function setItemFontDropdown(dropdown: FontDropdown | null): void {
  itemFontDropdown = dropdown;
}

export function setItemFillPicker(picker: FillPicker | null): void {
  itemFillPicker = picker;
}

export function setTextFillPicker(picker: FillPicker | null): void {
  textFillPicker = picker;
}

export function setPageBackgroundPicker(picker: FillPicker | null): void {
  pageBackgroundPicker = picker;
}

export function setItemStrokeColorPicker(picker: ColorPicker | null): void {
  itemStrokeColorPicker = picker;
}

export function setItemShadowColorPicker(picker: ColorPicker | null): void {
  itemShadowColorPicker = picker;
}

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
