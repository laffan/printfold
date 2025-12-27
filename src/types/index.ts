// Fill types for static page items
export type FillType = 'color' | 'linearGradient' | 'radialGradient' | 'pattern';

export interface GradientStop {
  offset: number; // 0-1
  color: string;  // hex color
}

export interface LinearGradientConfig {
  angle: number; // degrees, 0 = left to right
  stops: GradientStop[];
}

export interface RadialGradientConfig {
  centerX: number; // 0-1, relative to shape
  centerY: number; // 0-1, relative to shape
  radius: number;  // 0-1, relative to shape size
  stops: GradientStop[];
}

export interface PatternConfig {
  imageFileId: string; // Reference to project file
  repeat: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number; // degrees
}

export interface FillConfig {
  type: FillType;
  color?: string;
  linearGradient?: LinearGradientConfig;
  radialGradient?: RadialGradientConfig;
  pattern?: PatternConfig;
}

// Helper to create default fill configs
export function createDefaultFill(type: FillType): FillConfig {
  switch (type) {
    case 'color':
      return { type: 'color', color: '#3b82f6' };
    case 'linearGradient':
      return {
        type: 'linearGradient',
        linearGradient: {
          angle: 0,
          stops: [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#8b5cf6' }
          ]
        }
      };
    case 'radialGradient':
      return {
        type: 'radialGradient',
        radialGradient: {
          centerX: 0.5,
          centerY: 0.5,
          radius: 0.5,
          stops: [
            { offset: 0, color: '#ffffff' },
            { offset: 1, color: '#3b82f6' }
          ]
        }
      };
    case 'pattern':
      return {
        type: 'pattern',
        pattern: {
          imageFileId: '',
          repeat: 'repeat',
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0
        }
      };
  }
}

// File types
export interface ProjectFile {
  id: string;
  name: string;
  type: 'markdown' | 'image' | 'archive' | 'unknown';
  content: string;
  isBase64: boolean;
  lastModified: number;
}

// Document structure
export interface DocumentSection {
  id: string;
  type: 'heading' | 'paragraph' | 'image' | 'list' | 'code' | 'blockquote' | 'hr';
  level?: number; // For headings
  content: string;
  rawMarkdown: string;
  imageRef?: string; // Reference to uploaded image
}

// Page state for the three-state model
export type PageState = 'available' | 'text' | 'static';

// Page layout
export interface PageContent {
  id: string;
  pageNumber: number;
  pageState: PageState; // The page's current state
  sections: DocumentSection[];
  overflow?: DocumentSection[]; // Content that didn't fit
  isBlank: boolean; // Deprecated: use pageState === 'available'
  isRecto: boolean; // Right-hand page
  isStatic: boolean; // Deprecated: use pageState === 'static'
  isBackCover?: boolean; // Special back cover page (verso of first spread)
  items?: PageItem[]; // Items placed on static pages
  backgroundFill?: FillConfig; // Optional background fill for the page
}

// Items that can be placed on static pages
export type PageItemType = 'text' | 'shape' | 'image';

export interface PageItemBase {
  id: string;
  type: PageItemType;
  x: number; // Position in points from left edge of page
  y: number; // Position in points from top of page
  width: number;
  height: number;
  rotation?: number; // Degrees
  opacity?: number; // 0-1, defaults to 1
  zIndex?: number; // Layer order
  // Shadow properties
  hasShadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  // Array duplication properties
  arrayCount?: number; // Number of duplicates (1 = no duplication)
  arrayOffsetX?: number; // X offset between each duplicate
  arrayOffsetY?: number; // Y offset between each duplicate
  arrayInstances?: ArrayInstance[]; // Per-instance overrides
}

// Array instance with individual fill override
export interface ArrayInstance {
  index: number;
  fill?: FillConfig;
  opacity?: number;
}

export interface TextPageItem extends PageItemBase {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string; // Deprecated: use fill instead
  textAlign: 'left' | 'center' | 'right';
  // Fill and stroke properties (like shapes)
  fill?: FillConfig;
  hasFill?: boolean; // Whether fill is enabled (default: true)
  strokeColor?: string;
  strokeWidth?: number;
  hasStroke?: boolean; // Whether stroke is enabled (default: false)
}

export interface ShapePageItem extends PageItemBase {
  type: 'shape';
  shapeType: 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow';
  fillColor?: string; // Deprecated: use fill instead
  fill?: FillConfig;
  hasFill?: boolean; // Whether fill is enabled (default: true for shapes, false for lines)
  strokeColor?: string;
  strokeWidth?: number;
  hasStroke?: boolean; // Whether stroke is enabled (default: true)
}

export interface ImagePageItem extends PageItemBase {
  type: 'image';
  imageFileId: string; // Reference to project file
}

export type PageItem = TextPageItem | ShapePageItem | ImagePageItem;

export interface Spread {
  id: string;
  spreadNumber: number;
  verso: PageContent | null; // Left page (even)
  recto: PageContent | null; // Right page (odd)
}

export interface Signature {
  id: string;
  signatureNumber: number;
  spreads: Spread[];
  pageCount: number;
}

// Layout options
export interface Margins {
  top: number;
  bottom: number;
  inner: number;
  outer: number;
}

export interface PageMarginOverride {
  pageNumber: number;
  margins: Partial<Margins>;
}

export interface OutputOptions {
  sheetSize: 'letter' | 'a4' | 'legal' | 'tabloid' | 'a3';
  bookletSize: 'half-letter' | 'quarter-letter' | 'half-a4' | 'quarter-a4' | 'custom';
  customWidth?: number;
  customHeight?: number;
  pagesPerSignature: 4 | 8 | 12 | 16 | 20 | 24;
  orientation: 'portrait' | 'landscape';
  fillAvailableSpace: boolean; // Print multiple rows of spreads per sheet when possible
  // Creep compensation - narrows inner pages to prevent outer edges from extending
  creepEnabled?: boolean;
  creepPerSheet?: number; // Amount to reduce each successive sheet (in points), default 0.0625 * 72 for bond paper
}

/**
 * Calculate how many spread rows can fit on a sheet
 * Returns 1 if fill mode is disabled or only 1 row fits
 */
export function calculateSpreadRowsPerSheet(
  sheetSize: { width: number; height: number },
  pageHeight: number,
  fillEnabled: boolean
): number {
  if (!fillEnabled) return 1;
  // Each spread row needs pageHeight vertical space
  // We need at least 2 rows for fill mode to make sense
  const maxRows = Math.floor(sheetSize.height / pageHeight);
  return maxRows >= 2 ? maxRows : 1;
}

export interface LayoutOptions {
  margins: Margins;
  marginOverrides: PageMarginOverride[];
  emptyPageBeforeH1: boolean;
  spacingAboveH1: number;
  spacingAboveH2: number;
  spacingAboveH3: number;
  paragraphSpacing: number;
  lineHeight: number;
  textAlign: 'left' | 'justify';
}

export interface FontStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: number;
  lineHeight?: number; // Line height multiplier (e.g., 1.5), optional per-element override
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  backgroundColor?: string; // Inline background color (like a highlight)
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through';
}

// Inline style for highlighted text (Obsidian ==text== syntax)
export interface HighlightStyle {
  textColor: string;
  backgroundColor: string;
}

// Inline style for strikethrough text (~~text~~ syntax)
export interface StrikethroughStyle {
  textColor: string;
  lineColor: string;
}

export interface FontOptions {
  body: FontStyle;
  h1: FontStyle;
  h2: FontStyle;
  h3: FontStyle;
  h4: FontStyle;
  h5: FontStyle;
  h6: FontStyle;
  code: FontStyle;
  blockquote: FontStyle;
  // Inline styles for Obsidian-flavored markdown
  highlight?: HighlightStyle;
  strikethrough?: StrikethroughStyle;
}

export interface HeaderFooterContent {
  left: string;
  center: string;
  right: string;
}

export interface HeaderFooterOptions {
  header: {
    enabled: boolean;
    height: number;
    verso: HeaderFooterContent;
    recto: HeaderFooterContent;
    showOnFirstPage: boolean;
    font: FontStyle;
  };
  footer: {
    enabled: boolean;
    height: number;
    verso: HeaderFooterContent;
    recto: HeaderFooterContent;
    showOnFirstPage: boolean;
    font: FontStyle;
  };
}

// Static spread - exists independently of markdown flow
export interface StaticSpread {
  id: string;
  index: number; // Position in the static spreads list
  verso: PageContent | null;
  recto: PageContent | null;
  // Items can span across both pages
  spanningItems?: SpanningItem[];
}

// Item that spans across a spread (verso + recto)
export interface SpanningItem extends PageItemBase {
  // Position relative to the full spread (verso left edge = 0)
  // x can extend from 0 to 2*pageWidth
  type: PageItemType;
  // Additional properties based on type
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  shapeType?: 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow';
  fillColor?: string;
  fill?: FillConfig;
  hasFill?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  hasStroke?: boolean;
  imageFileId?: string;
}

// Complete project state
export interface BookletProject {
  id: string;
  name: string;
  files: ProjectFile[];
  mainDocument: string | null; // ID of main markdown file
  measurementUnit: MarginUnit; // Project-wide measurement unit
  outputOptions: OutputOptions;
  layoutOptions: LayoutOptions;
  fontOptions: FontOptions;
  headerFooter: HeaderFooterOptions;
  signatures: Signature[];
  blankPages: number[]; // Page numbers where blank pages should be inserted
  staticSpreads?: StaticSpread[]; // Spreads that exist without markdown
}

// Template definitions
export interface BookletTemplate {
  id: string;
  name: string;
  description: string;
  outputOptions: Partial<OutputOptions>;
  layoutOptions: Partial<LayoutOptions>;
  fontOptions: Partial<FontOptions>;
  headerFooter: Partial<HeaderFooterOptions>;
}

// Sheet sizes in points (72 points = 1 inch)
export const SHEET_SIZES: Record<string, { width: number; height: number }> = {
  'letter': { width: 612, height: 792 },
  'a4': { width: 595.28, height: 841.89 },
  'legal': { width: 612, height: 1008 },
  'tabloid': { width: 792, height: 1224 },
  'a3': { width: 841.89, height: 1190.55 },
};

// Events
export type AppEventType =
  | 'file-added'
  | 'file-removed'
  | 'file-updated'
  | 'options-changed'
  | 'layout-changed'
  | 'reflow-needed'
  | 'reflow-complete'
  | 'page-selected'
  | 'margin-drag-start'
  | 'margin-drag-end';

export interface AppEvent {
  type: AppEventType;
  payload?: unknown;
}

// Unit types for margin display
export type MarginUnit = 'pt' | 'in' | 'cm' | 'px';

// Unit conversion utilities (internal unit is points, 72pt = 1in)
export const UNIT_CONVERSIONS: Record<MarginUnit, { factor: number; decimals: number; label: string }> = {
  'pt': { factor: 1, decimals: 0, label: 'pt' },
  'in': { factor: 1 / 72, decimals: 2, label: '"' },
  'cm': { factor: 2.54 / 72, decimals: 2, label: 'cm' },
  'px': { factor: 96 / 72, decimals: 0, label: 'px' },  // 96 DPI screen
};

export function convertFromPoints(points: number, unit: MarginUnit): number {
  const conv = UNIT_CONVERSIONS[unit];
  return Math.round(points * conv.factor * Math.pow(10, conv.decimals)) / Math.pow(10, conv.decimals);
}

export function formatMarginValue(points: number, unit: MarginUnit): string {
  const value = convertFromPoints(points, unit);
  const conv = UNIT_CONVERSIONS[unit];
  return `${value}${conv.label}`;
}

// Editor state
export interface EditorState {
  selectedPageNumber: number | null;
  selectedSpreadNumber: number | null;
  selectedPagePosition: 'verso' | 'recto' | null; // Which page in the spread is selected
  selectedItemId: string | null; // Selected item on a static page (deprecated, use selectedItemIds)
  selectedItemIds: string[]; // Multiple selected items
  isDraggingMargin: boolean;
  dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | null;
  isLocalMarginChange: boolean; // Cmd key held
  zoomLevel: number;
  activeTab: 'editor' | 'preview';
  marginUnit: MarginUnit;
  clipboard: PageItem[]; // Clipboard for copy/paste
}
