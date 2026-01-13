/**
 * State Management Module
 *
 * This module provides application state management with an event emitter pattern.
 * The AppState class is split across multiple files for maintainability:
 *
 * - AppStateCore.ts: Base class with core state management
 * - defaults.ts: Default values for project and editor state
 * - fileManagement.ts: File CRUD operations
 * - optionsManagement.ts: Options and preferences
 * - pageOperations.ts: Static page manipulation
 * - signatureOperations.ts: Signature and spread management
 * - itemOperations.ts: Page item CRUD and z-ordering
 * - multiSelect.ts: Multi-selection, clipboard, and alignment
 * - textFlowOperations.ts: Text flow region management
 */

// Export defaults
export {
  defaultOutputOptions,
  defaultLayoutOptions,
  defaultFontOptions,
  defaultHeaderFooter,
  defaultEditorState,
  createEmptyProject,
} from './defaults';

// Export the AppState class (with all method extensions)
export { AppState } from './AppStateCore';

// Import method extensions to attach them to the prototype
import './fileManagement';
import './optionsManagement';
import './pageOperations';
import './signatureOperations';
import './itemOperations';
import './multiSelect';
import './textFlowOperations';

// Create and export the singleton instance
import { AppState } from './AppStateCore';
export const appState = new AppState();
