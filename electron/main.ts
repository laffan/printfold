import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

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

// Get system fonts based on platform
async function getSystemFonts(): Promise<string[]> {
  return new Promise((resolve) => {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: Use system_profiler or fc-list
      exec('system_profiler SPFontsDataType -xml', (error: Error | null, stdout: string) => {
        if (error) {
          // Fallback to fc-list if available
          exec('fc-list : family', (err: Error | null, output: string) => {
            if (err) {
              resolve([]);
              return;
            }
            const fonts = parseFcList(output);
            resolve(fonts);
          });
          return;
        }

        // Parse plist-style output
        const fonts = parseSystemProfiler(stdout);
        resolve(fonts);
      });
    } else if (platform === 'win32') {
      // Windows: Read from registry or use PowerShell
      exec(
        'powershell -command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Drawing\') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"',
        { maxBuffer: 1024 * 1024 * 10 },
        (error: Error | null, stdout: string) => {
          if (error) {
            resolve([]);
            return;
          }
          const fonts = stdout.split('\n')
            .map((f: string) => f.trim())
            .filter((f: string) => f.length > 0)
            .sort((a: string, b: string) => a.localeCompare(b));
          resolve([...new Set(fonts)] as string[]);
        }
      );
    } else {
      // Linux: Use fc-list
      exec('fc-list : family', (error: Error | null, stdout: string) => {
        if (error) {
          resolve([]);
          return;
        }
        const fonts = parseFcList(stdout);
        resolve(fonts);
      });
    }
  });
}

function parseFcList(output: string): string[] {
  const fonts = output.split('\n')
    .map((line: string) => {
      // fc-list returns lines like "DejaVu Sans,DejaVu Sans Light"
      const families = line.split(',');
      return families[0]?.trim() || '';
    })
    .filter((f: string) => f.length > 0 && !f.startsWith('.'))
    .sort((a: string, b: string) => a.localeCompare(b));

  return [...new Set(fonts)] as string[];
}

function parseSystemProfiler(output: string): string[] {
  // Extract font names from plist XML
  const fontNames: string[] = [];
  const nameRegex = /<key>_name<\/key>\s*<string>([^<]+)<\/string>/g;
  let match;

  while ((match = nameRegex.exec(output)) !== null) {
    const fontName = match[1].trim();
    if (fontName && !fontName.startsWith('.')) {
      fontNames.push(fontName);
    }
  }

  // Also try to extract family names
  const familyRegex = /<key>family<\/key>\s*<string>([^<]+)<\/string>/g;
  while ((match = familyRegex.exec(output)) !== null) {
    const fontName = match[1].trim();
    if (fontName && !fontName.startsWith('.')) {
      fontNames.push(fontName);
    }
  }

  const uniqueFonts = [...new Set(fontNames)].sort((a, b) => a.localeCompare(b));
  return uniqueFonts;
}

// IPC handler for system fonts
ipcMain.handle('fonts:getSystemFonts', async () => {
  return getSystemFonts();
});
