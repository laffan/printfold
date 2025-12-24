import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for file operations
ipcMain.handle('dialog:openFiles', async (_event, options: {
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
}) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: options.filters || [
      { name: 'Supported Files', extensions: ['md', 'png', 'jpg', 'jpeg', 'webp', 'zip'] },
    ],
  });

  if (result.canceled) return null;

  const files = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const content = await fs.promises.readFile(filePath);
      const name = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      return {
        name,
        path: filePath,
        type: getFileType(ext),
        content: ext === '.md' ? content.toString('utf-8') : content.toString('base64'),
        isBase64: ext !== '.md',
      };
    })
  );

  return files;
});

ipcMain.handle('dialog:saveFile', async (_event, options: {
  defaultName?: string;
  filters?: { name: string; extensions: string[] }[];
  content: string | Uint8Array;
}) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options.defaultName,
    filters: options.filters || [
      { name: 'PDF', extensions: ['pdf'] },
    ],
  });

  if (result.canceled || !result.filePath) return false;

  const content = options.content instanceof Uint8Array
    ? options.content
    : Buffer.from(options.content, 'base64');

  await fs.promises.writeFile(result.filePath, content);
  return true;
});

ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      success: true,
      content: ext === '.md' ? content.toString('utf-8') : content.toString('base64'),
      isBase64: ext !== '.md',
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('app:print', async (_event, options?: Electron.PrintToPDFOptions) => {
  if (!mainWindow) return null;

  const pdfData = await mainWindow.webContents.printToPDF(options || {});
  return pdfData.toString('base64');
});

function getFileType(ext: string): string {
  switch (ext) {
    case '.md':
      return 'markdown';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.webp':
      return 'image';
    case '.zip':
      return 'archive';
    default:
      return 'unknown';
  }
}
