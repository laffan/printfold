import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // File dialogs
  openFiles: (options?: {
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }) => ipcRenderer.invoke('dialog:openFiles', options),

  saveFile: (options: {
    defaultName?: string;
    filters?: { name: string; extensions: string[] }[];
    content: string | Uint8Array;
  }) => ipcRenderer.invoke('dialog:saveFile', options),

  // File operations
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),

  // Shell operations
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Printing
  print: (options?: Electron.PrintToPDFOptions) => ipcRenderer.invoke('app:print', options),

  // System fonts
  getSystemFonts: () => ipcRenderer.invoke('fonts:getSystemFonts'),

  // Font file access (for PDF embedding)
  getFontFile: (fontFamily: string, weight?: 'normal' | 'bold', style?: 'normal' | 'italic') =>
    ipcRenderer.invoke('fonts:getFontFile', fontFamily, weight || 'normal', style || 'normal'),
  getFontVariants: (fontFamily: string) =>
    ipcRenderer.invoke('fonts:getFontVariants', fontFamily),

  // Project file lifecycle (file-first flow)
  pickProjectDestination: (defaultName: string) =>
    ipcRenderer.invoke('printfold:pickDestination', defaultName),
  openProjectFile: () =>
    ipcRenderer.invoke('printfold:openFile'),
  writeProjectFile: (path: string, content: Uint8Array) =>
    ipcRenderer.invoke('printfold:writeFile', path, content),

  // Recent projects
  getRecents: () => ipcRenderer.invoke('printfold:getRecents'),
  addRecent: (entry: { path: string; name: string; lastOpened: number }) =>
    ipcRenderer.invoke('printfold:addRecent', entry),
  removeRecent: (path: string) =>
    ipcRenderer.invoke('printfold:removeRecent', path),
});

// Type declarations for the exposed API
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      openFiles: (options?: {
        filters?: { name: string; extensions: string[] }[];
        multiple?: boolean;
      }) => Promise<Array<{
        name: string;
        path: string;
        type: string;
        content: string;
        isBase64: boolean;
      }> | null>;
      saveFile: (options: {
        defaultName?: string;
        filters?: { name: string; extensions: string[] }[];
        content: string | Uint8Array;
      }) => Promise<boolean>;
      readFile: (filePath: string) => Promise<{
        success: boolean;
        content?: string;
        isBase64?: boolean;
        error?: string;
      }>;
      openExternal: (url: string) => Promise<void>;
      print: (options?: Electron.PrintToPDFOptions) => Promise<string | null>;
      getSystemFonts: () => Promise<string[]>;
      getFontFile: (
        fontFamily: string,
        weight?: 'normal' | 'bold',
        style?: 'normal' | 'italic'
      ) => Promise<{ success: boolean; data?: string; path?: string; error?: string }>;
      getFontVariants: (fontFamily: string) => Promise<{
        regular: boolean;
        bold: boolean;
        italic: boolean;
        boldItalic: boolean;
      }>;

      pickProjectDestination: (defaultName: string) => Promise<{
        name: string;
        path: string;
      } | null>;
      openProjectFile: () => Promise<{
        name: string;
        path: string;
        content: string; // base64
      } | null>;
      writeProjectFile: (path: string, content: Uint8Array) => Promise<{
        success: boolean;
        error?: string;
      }>;

      getRecents: () => Promise<Array<{
        id: string;
        name: string;
        path: string;
        lastOpened: number;
      }>>;
      addRecent: (entry: {
        path: string;
        name: string;
        lastOpened: number;
      }) => Promise<void>;
      removeRecent: (path: string) => Promise<void>;
    };
  }
}
