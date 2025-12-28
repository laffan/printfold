import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as os from 'os';

let mainWindow: BrowserWindow | null = null;

// Cache for font file paths: Map<fontFamily, Map<variant, filePath>>
// variant is 'regular', 'bold', 'italic', 'boldItalic'
const fontFileCache: Map<string, Map<string, string>> = new Map();

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

// Font file discovery and reading

interface FontFileInfo {
  family: string;
  path: string;
  weight: string; // 'normal', 'bold'
  style: string;  // 'normal', 'italic'
}

/**
 * Get font directories for the current platform
 */
function getFontDirectories(): string[] {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'darwin') {
    return [
      '/Library/Fonts',
      '/System/Library/Fonts',
      '/System/Library/Fonts/Supplemental',
      path.join(home, 'Library/Fonts'),
    ];
  } else if (platform === 'win32') {
    return [
      'C:\\Windows\\Fonts',
      path.join(home, 'AppData\\Local\\Microsoft\\Windows\\Fonts'),
    ];
  } else {
    // Linux
    return [
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      path.join(home, '.fonts'),
      path.join(home, '.local/share/fonts'),
    ];
  }
}

/**
 * Recursively find all font files in a directory
 */
async function findFontFiles(dir: string): Promise<string[]> {
  const fontFiles: string[] = [];

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await findFontFiles(fullPath);
        fontFiles.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ttf', '.otf', '.ttc'].includes(ext)) {
          fontFiles.push(fullPath);
        }
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return fontFiles;
}

/**
 * Parse font weight/style from filename
 */
function parseVariantFromFilename(filename: string): { weight: string; style: string } {
  const lower = filename.toLowerCase();

  let weight = 'normal';
  let style = 'normal';

  // Check for bold
  if (lower.includes('bold') || lower.includes('-bd') || lower.includes('_bd') ||
      lower.endsWith('bd.ttf') || lower.endsWith('bd.otf') ||
      lower.includes('-b.') || lower.includes('_b.')) {
    weight = 'bold';
  }

  // Check for italic/oblique
  if (lower.includes('italic') || lower.includes('oblique') ||
      lower.includes('-it') || lower.includes('_it') ||
      lower.endsWith('it.ttf') || lower.endsWith('it.otf') ||
      lower.includes('-i.') || lower.includes('_i.')) {
    style = 'italic';
  }

  return { weight, style };
}

/**
 * Extract font family name from filename (heuristic)
 */
function extractFamilyFromFilename(filename: string): string {
  // Remove extension
  let name = path.basename(filename, path.extname(filename));

  // Remove common variant suffixes
  name = name
    .replace(/[-_]?(Bold|Bd|B)?(Italic|It|I|Oblique|Obl)?(Regular|Reg|R)?$/i, '')
    .replace(/[-_]?(BoldItalic|BoldIt|BI|BdIt)$/i, '')
    .trim();

  // Convert CamelCase to spaces for readability
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

  return name;
}

/**
 * Build font file cache by scanning font directories
 */
async function buildFontFileCache(): Promise<void> {
  if (fontFileCache.size > 0) return; // Already built

  const dirs = getFontDirectories();
  const allFontFiles: string[] = [];

  for (const dir of dirs) {
    const files = await findFontFiles(dir);
    allFontFiles.push(...files);
  }

  // Group by family
  for (const filePath of allFontFiles) {
    const filename = path.basename(filePath);
    const family = extractFamilyFromFilename(filename);
    const { weight, style } = parseVariantFromFilename(filename);

    // Determine variant key
    let variant = 'regular';
    if (weight === 'bold' && style === 'italic') {
      variant = 'boldItalic';
    } else if (weight === 'bold') {
      variant = 'bold';
    } else if (style === 'italic') {
      variant = 'italic';
    }

    // Add to cache
    if (!fontFileCache.has(family)) {
      fontFileCache.set(family, new Map());
    }
    fontFileCache.get(family)!.set(variant, filePath);

    // Also add normalized versions for matching
    const normalizedFamily = family.toLowerCase().replace(/\s+/g, '');
    if (!fontFileCache.has(normalizedFamily)) {
      fontFileCache.set(normalizedFamily, new Map());
    }
    fontFileCache.get(normalizedFamily)!.set(variant, filePath);
  }
}

/**
 * Find font file for a given family and variant
 */
async function findFontFile(
  fontFamily: string,
  weight: 'normal' | 'bold' = 'normal',
  style: 'normal' | 'italic' = 'normal'
): Promise<string | null> {
  await buildFontFileCache();

  // Determine variant key
  let variant = 'regular';
  if (weight === 'bold' && style === 'italic') {
    variant = 'boldItalic';
  } else if (weight === 'bold') {
    variant = 'bold';
  } else if (style === 'italic') {
    variant = 'italic';
  }

  // Try exact match first
  const familyMap = fontFileCache.get(fontFamily);
  if (familyMap?.has(variant)) {
    return familyMap.get(variant)!;
  }

  // Try normalized match
  const normalizedFamily = fontFamily.toLowerCase().replace(/\s+/g, '');
  const normalizedMap = fontFileCache.get(normalizedFamily);
  if (normalizedMap?.has(variant)) {
    return normalizedMap.get(variant)!;
  }

  // Try partial match (font family might be a substring)
  for (const [cachedFamily, variantMap] of fontFileCache) {
    const cachedNormalized = cachedFamily.toLowerCase().replace(/\s+/g, '');
    if (cachedNormalized.includes(normalizedFamily) || normalizedFamily.includes(cachedNormalized)) {
      if (variantMap.has(variant)) {
        return variantMap.get(variant)!;
      }
    }
  }

  // Fallback: try to find regular variant if specific variant not found
  if (variant !== 'regular') {
    const regularPath = await findFontFile(fontFamily, 'normal', 'normal');
    if (regularPath) {
      return regularPath;
    }
  }

  return null;
}

/**
 * Read font file and return as base64
 */
async function readFontFile(filePath: string): Promise<string | null> {
  try {
    const data = await fs.promises.readFile(filePath);
    return data.toString('base64');
  } catch {
    return null;
  }
}

// IPC handler for getting font file data
ipcMain.handle('fonts:getFontFile', async (
  _event,
  fontFamily: string,
  weight: 'normal' | 'bold' = 'normal',
  style: 'normal' | 'italic' = 'normal'
): Promise<{ success: boolean; data?: string; path?: string; error?: string }> => {
  try {
    const filePath = await findFontFile(fontFamily, weight, style);

    if (!filePath) {
      return { success: false, error: `Font file not found for: ${fontFamily} (${weight} ${style})` };
    }

    // Check if it's a TTC file (not directly supported by pdf-lib)
    if (filePath.toLowerCase().endsWith('.ttc')) {
      return { success: false, error: `TTC font collections not supported: ${filePath}` };
    }

    const data = await readFontFile(filePath);

    if (!data) {
      return { success: false, error: `Failed to read font file: ${filePath}` };
    }

    return { success: true, data, path: filePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// IPC handler to get available font variants for a family
ipcMain.handle('fonts:getFontVariants', async (
  _event,
  fontFamily: string
): Promise<string[]> => {
  await buildFontFileCache();

  const normalizedFamily = fontFamily.toLowerCase().replace(/\s+/g, '');

  // Check exact match
  let familyMap = fontFileCache.get(fontFamily);
  if (!familyMap) {
    familyMap = fontFileCache.get(normalizedFamily);
  }

  // Try partial match
  if (!familyMap) {
    for (const [cachedFamily, variantMap] of fontFileCache) {
      const cachedNormalized = cachedFamily.toLowerCase().replace(/\s+/g, '');
      if (cachedNormalized.includes(normalizedFamily) || normalizedFamily.includes(cachedNormalized)) {
        familyMap = variantMap;
        break;
      }
    }
  }

  if (!familyMap) {
    return [];
  }

  return Array.from(familyMap.keys());
});
