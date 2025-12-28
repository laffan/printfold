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

    // Use explicit shell and PATH for packaged apps
    // Packaged Electron apps don't inherit the terminal's environment
    const execOptions = {
      shell: platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      env: {
        ...process.env,
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      },
      maxBuffer: 1024 * 1024 * 10,
    };

    if (platform === 'darwin') {
      // macOS: Use system_profiler with full path
      exec('/usr/sbin/system_profiler SPFontsDataType -xml', execOptions, (error: Error | null, stdout: string) => {
        if (error) {
          // Fallback to fc-list if available (e.g., via Homebrew)
          exec('/usr/local/bin/fc-list : family 2>/dev/null || /opt/homebrew/bin/fc-list : family 2>/dev/null', execOptions, (err: Error | null, output: string) => {
            if (err || !output.trim()) {
              console.log('Font discovery failed, using web-safe fonts');
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
      // Windows: Use PowerShell to get installed fonts
      exec(
        '[System.Reflection.Assembly]::LoadWithPartialName(\'System.Drawing\') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }',
        execOptions,
        (error: Error | null, stdout: string) => {
          if (error) {
            console.log('Font discovery failed on Windows:', error.message);
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
      // Linux: Use fc-list with common paths
      exec('fc-list : family', execOptions, (error: Error | null, stdout: string) => {
        if (error) {
          console.log('Font discovery failed on Linux:', error.message);
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

// Cache for font paths extracted from system_profiler (maps font name -> file path)
const systemFontPaths: Map<string, string> = new Map();

/**
 * Determine if a font name represents a "regular" variant (not bold/italic)
 * This checks the FULL font name for variant indicators, not just a suffix,
 * because font names may have different spacing than family names.
 */
function isRegularVariant(fontName: string, fontFamily: string): boolean {
  // If name equals family, it's the regular variant
  if (fontName === fontFamily) return true;

  const lower = fontName.toLowerCase();
  const familyLower = fontFamily.toLowerCase();

  // Normalize by removing spaces for comparison
  const lowerNormalized = lower.replace(/\s+/g, '');
  const familyNormalized = familyLower.replace(/\s+/g, '');

  // If normalized versions are equal, it's the regular variant
  if (lowerNormalized === familyNormalized) return true;

  // Check if the name is just family + "Regular"
  if (lower === familyLower + ' regular' || lower === familyLower + '-regular') return true;
  if (lowerNormalized === familyNormalized + 'regular') return true;

  // Non-regular variant indicators to check in the FULL font name
  // We need to check these appear AFTER the family name portion
  const nonRegularIndicators = [
    'bold', 'italic', 'oblique', 'light', 'thin', 'medium', 'semibold', 'semi-bold',
    'extrabold', 'extra-bold', 'black', 'heavy', 'condensed', 'narrow', 'wide',
    'expanded', 'compressed'
  ];

  // Get the part after the family name (normalized)
  // This handles cases like "IBMPlexMono-Italic" where family is "IBM Plex Mono"
  let suffix = '';
  if (lowerNormalized.startsWith(familyNormalized)) {
    suffix = lowerNormalized.slice(familyNormalized.length);
  } else {
    // If font name doesn't start with family, check full name
    // But exclude the family portion if it appears somewhere
    suffix = lowerNormalized;
  }

  // Remove file extension if present
  suffix = suffix.replace(/\.(ttf|otf|ttc)$/i, '');

  // Remove leading separator
  suffix = suffix.replace(/^[-_]/, '');

  // If there's no meaningful suffix, it's regular
  if (!suffix || suffix === 'regular') return true;

  // Check if suffix contains any non-regular indicators
  for (const indicator of nonRegularIndicators) {
    if (suffix.includes(indicator)) return false;
  }

  return true;
}

function parseSystemProfiler(output: string): string[] {
  // Extract font entries from plist XML
  // Each font entry has _name, family, and path keys
  // Only include fonts that can be embedded in PDFs (exclude .ttc files)

  // Track which families have usable font files
  const usableFamilies: Set<string> = new Set();

  // Split into individual dict entries
  const dictRegex = /<dict>([\s\S]*?)<\/dict>/g;
  let dictMatch;

  while ((dictMatch = dictRegex.exec(output)) !== null) {
    const dictContent = dictMatch[1];

    // Extract _name (font face name like "Helvetica Neue Bold")
    const nameMatch = /<key>_name<\/key>\s*<string>([^<]+)<\/string>/.exec(dictContent);
    // Extract family (font family name like "Helvetica Neue")
    const familyMatch = /<key>family<\/key>\s*<string>([^<]+)<\/string>/.exec(dictContent);
    // Extract path (font file path)
    const pathMatch = /<key>path<\/key>\s*<string>([^<]+)<\/string>/.exec(dictContent);

    const fontName = nameMatch?.[1]?.trim();
    const fontFamily = familyMatch?.[1]?.trim();
    const fontPath = pathMatch?.[1]?.trim();

    // Skip hidden fonts
    if (fontName?.startsWith('.') || fontFamily?.startsWith('.')) continue;

    // Check if this is a usable font file (not .ttc)
    const isUsable = fontPath && !fontPath.toLowerCase().endsWith('.ttc');

    // Store path mappings only for usable fonts
    if (fontPath && fontName) {
      // Always store the specific font name -> path mapping
      systemFontPaths.set(fontName, fontPath);
      systemFontPaths.set(fontName.toLowerCase().replace(/\s+/g, ''), fontPath);

      // Log all font name -> path mappings for debugging
      if (fontFamily === 'Georgia' || fontFamily === 'Arial' || fontFamily === 'Courier New') {
        console.log(`[parseSystemProfiler] Storing: "${fontName}" -> ${fontPath}`);
      }

      // Only store family name -> path if this is the regular variant
      // This prevents italic/bold variants from overwriting the regular variant's path
      if (fontFamily && isRegularVariant(fontName, fontFamily)) {
        systemFontPaths.set(fontFamily, fontPath);
        systemFontPaths.set(fontFamily.toLowerCase().replace(/\s+/g, ''), fontPath);
        console.log(`Mapping family "${fontFamily}" -> ${fontPath} (regular variant: "${fontName}")`);
      }

      // Track usable families (those with at least one non-.ttc file)
      if (isUsable && fontFamily) {
        usableFamilies.add(fontFamily);
      }
    }
  }

  console.log(`Parsed ${usableFamilies.size} usable font families from system_profiler`);

  // Only return font families that have usable files
  const uniqueFonts = [...usableFamilies].sort((a, b) => a.localeCompare(b));
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
  } catch (error) {
    // Log directory read failures for debugging
    console.log(`Font directory not accessible: ${dir}`, (error as Error).message);
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
  console.log('Building font file cache from directories:', dirs);

  const allFontFiles: string[] = [];

  for (const dir of dirs) {
    const files = await findFontFiles(dir);
    if (files.length > 0) {
      console.log(`Found ${files.length} font files in ${dir}`);
    }
    allFontFiles.push(...files);
  }

  console.log(`Total font files found: ${allFontFiles.length}`);

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

  console.log(`Font cache built with ${fontFileCache.size} families`);
}

// Ensure system font paths are loaded (call getSystemFonts if not already done)
let systemFontsLoadPromise: Promise<void> | null = null;
async function ensureSystemFontPathsLoaded(): Promise<void> {
  if (systemFontPaths.size > 0) return;
  if (systemFontsLoadPromise) return systemFontsLoadPromise;

  systemFontsLoadPromise = (async () => {
    console.log('Loading system font paths...');
    await getSystemFonts(); // This populates systemFontPaths as a side effect
    console.log(`System font paths loaded: ${systemFontPaths.size} entries`);
  })();

  return systemFontsLoadPromise;
}

/**
 * Find font file for a given family and variant
 */
async function findFontFile(
  fontFamily: string,
  weight: 'normal' | 'bold' = 'normal',
  style: 'normal' | 'italic' = 'normal'
): Promise<string | null> {
  const normalizedFamily = fontFamily.toLowerCase().replace(/\s+/g, '');

  // Ensure system font paths are loaded (on macOS, this populates the systemFontPaths map)
  if (process.platform === 'darwin') {
    await ensureSystemFontPathsLoaded();
  }

  // Determine the variant we're looking for
  let variantDesc = 'regular';
  if (weight === 'bold' && style === 'italic') variantDesc = 'boldItalic';
  else if (weight === 'bold') variantDesc = 'bold';
  else if (style === 'italic') variantDesc = 'italic';

  console.log(`[findFontFile] Looking for: "${fontFamily}" (${variantDesc})`);

  // Build variant-specific font names to try
  // Include variations with/without spaces, dashes, and file extensions
  const variantNames: string[] = [];

  if (weight === 'bold' && style === 'italic') {
    variantNames.push(
      `${fontFamily} Bold Italic`,
      `${fontFamily} BoldItalic`,
      `${fontFamily}-BoldItalic`,
      `${fontFamily} Bold Oblique`,
      `${fontFamily}-Bold-Italic`,
    );
  } else if (weight === 'bold') {
    variantNames.push(
      `${fontFamily} Bold`,
      `${fontFamily}-Bold`,
      `${fontFamily}Bold`,
    );
  } else if (style === 'italic') {
    variantNames.push(
      `${fontFamily} Italic`,
      `${fontFamily}-Italic`,
      `${fontFamily}Italic`,
      `${fontFamily} Oblique`,
      `${fontFamily}-Oblique`,
    );
  }

  // For regular variant, add the base family name
  // For other variants, only add as fallback after trying variant-specific names
  if (weight === 'normal' && style === 'normal') {
    variantNames.push(fontFamily);
  }

  // Debug: Log what we're searching for
  console.log(`[findFontFile] Trying variant names for "${fontFamily}" (${variantDesc}):`, variantNames);

  // Try each variant name in systemFontPaths
  for (const name of variantNames) {
    const normalizedName = name.toLowerCase().replace(/\s+/g, '');
    const systemPath = systemFontPaths.get(name) || systemFontPaths.get(normalizedName);

    if (systemPath) {
      // Skip .ttc files - they're not supported by pdf-lib
      if (systemPath.toLowerCase().endsWith('.ttc')) {
        console.log(`[findFontFile] Skipping .ttc file: "${name}" -> ${systemPath}`);
        continue;
      }
      try {
        await fs.promises.access(systemPath, fs.constants.R_OK);
        console.log(`[findFontFile] Found: "${name}" -> ${systemPath}`);
        return systemPath;
      } catch {
        console.log(`[findFontFile] Path not accessible: ${systemPath}`);
      }
    }
  }

  // Debug: Show what's in systemFontPaths for this family
  const matchingEntries: string[] = [];
  for (const [key] of systemFontPaths) {
    if (key.toLowerCase().includes(normalizedFamily) || normalizedFamily.includes(key.toLowerCase().replace(/\s+/g, ''))) {
      matchingEntries.push(key);
    }
  }
  console.log(`[findFontFile] Matching entries in systemFontPaths for "${fontFamily}":`, matchingEntries);

  console.log(`[findFontFile] Not found in systemFontPaths, trying fontFileCache...`);

  // Fall back to directory-based cache
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

  console.log(`Looking for font: "${fontFamily}" (${variant}), cache size: ${fontFileCache.size}, systemFontPaths: ${systemFontPaths.size}`);

  // Try exact match first
  const familyMap = fontFileCache.get(fontFamily);
  if (familyMap?.has(variant)) {
    console.log(`Found exact match for "${fontFamily}"`);
    return familyMap.get(variant)!;
  }

  // Try normalized match
  const normalizedMap = fontFileCache.get(normalizedFamily);
  if (normalizedMap?.has(variant)) {
    console.log(`Found normalized match for "${fontFamily}"`);
    return normalizedMap.get(variant)!;
  }

  // Try partial match (font family might be a substring)
  for (const [cachedFamily, variantMap] of fontFileCache) {
    const cachedNormalized = cachedFamily.toLowerCase().replace(/\s+/g, '');
    if (cachedNormalized.includes(normalizedFamily) || normalizedFamily.includes(cachedNormalized)) {
      if (variantMap.has(variant)) {
        console.log(`Found partial match: "${cachedFamily}" for "${fontFamily}"`);
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

  console.log(`No font file found for "${fontFamily}" (${variant})`);
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
// Returns an object with boolean flags for each variant
ipcMain.handle('fonts:getFontVariants', async (
  _event,
  fontFamily: string
): Promise<{ regular: boolean; bold: boolean; italic: boolean; boldItalic: boolean }> => {
  console.log(`[getFontVariants] Checking variants for: "${fontFamily}"`);

  // Check which variants are actually available by trying to find each one
  const variants = {
    regular: false,
    bold: false,
    italic: false,
    boldItalic: false,
  };

  // Check regular
  const regularPath = await findFontFile(fontFamily, 'normal', 'normal');
  variants.regular = !!regularPath && !regularPath.toLowerCase().endsWith('.ttc');
  console.log(`[getFontVariants] Regular: ${regularPath || 'not found'}`);

  // Check bold
  const boldPath = await findFontFile(fontFamily, 'bold', 'normal');
  // Bold is available if we found a different file than regular (not just falling back)
  variants.bold = !!boldPath && !boldPath.toLowerCase().endsWith('.ttc') &&
    boldPath !== regularPath;
  console.log(`[getFontVariants] Bold: ${boldPath || 'not found'} (available: ${variants.bold})`);

  // Check italic
  const italicPath = await findFontFile(fontFamily, 'normal', 'italic');
  variants.italic = !!italicPath && !italicPath.toLowerCase().endsWith('.ttc') &&
    italicPath !== regularPath;
  console.log(`[getFontVariants] Italic: ${italicPath || 'not found'} (available: ${variants.italic})`);

  // Check boldItalic
  const boldItalicPath = await findFontFile(fontFamily, 'bold', 'italic');
  variants.boldItalic = !!boldItalicPath && !boldItalicPath.toLowerCase().endsWith('.ttc') &&
    boldItalicPath !== regularPath && boldItalicPath !== boldPath && boldItalicPath !== italicPath;
  console.log(`[getFontVariants] BoldItalic: ${boldItalicPath || 'not found'} (available: ${variants.boldItalic})`);

  console.log(`[getFontVariants] Result for "${fontFamily}":`, variants);
  return variants;
});
