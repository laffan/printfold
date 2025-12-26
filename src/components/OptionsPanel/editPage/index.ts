/**
 * OptionsPanel Edit Page Module
 * Handles the edit page panel for static pages (adding/editing items)
 */

// Re-export all public functions
export { switchToSelectedTab } from './shared';
export { setupMultiSelectControls, updateMultiSelectControls } from './multiSelect';
export { addItemToCurrentPage, addImageToCurrentPage, addImageFromFileToPage } from './itemCreation';
export { setupEditPagePanel } from './setupPanel';
export { updateEditPagePanel, updateEditSelectedSection } from './panelUpdate';
export { updateArrayInstancesList } from './arrayInstances';
export { setupPageBackgroundPicker } from './pageBackground';
