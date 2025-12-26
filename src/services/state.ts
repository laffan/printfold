/**
 * Simple state management with event emitter pattern
 *
 * This file re-exports from the modular implementation in ./state/
 *
 * The AppState class is split across multiple files:
 * - state/AppStateCore.ts: Base class with core state management
 * - state/defaults.ts: Default values for project and editor state
 * - state/fileManagement.ts: File CRUD operations
 * - state/optionsManagement.ts: Options and preferences
 * - state/pageOperations.ts: Static page manipulation
 * - state/signatureOperations.ts: Signature and spread management
 * - state/itemOperations.ts: Page item CRUD and z-ordering
 * - state/multiSelect.ts: Multi-selection, clipboard, and alignment
 */

// Re-export everything from the modular implementation
export {
  defaultOutputOptions,
  defaultLayoutOptions,
  defaultFontOptions,
  defaultHeaderFooter,
  defaultEditorState,
  createEmptyProject,
  AppState,
  appState,
} from './state/index';
