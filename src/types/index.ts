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

// Page layout
export interface PageContent {
  id: string;
  pageNumber: number;
  sections: DocumentSection[];
  overflow?: DocumentSection[]; // Content that didn't fit
  isBlank: boolean;
  isRecto: boolean; // Right-hand page
}

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
}

export interface FontStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: number;
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

// Complete project state
export interface BookletProject {
  id: string;
  name: string;
  files: ProjectFile[];
  mainDocument: string | null; // ID of main markdown file
  outputOptions: OutputOptions;
  layoutOptions: LayoutOptions;
  fontOptions: FontOptions;
  headerFooter: HeaderFooterOptions;
  signatures: Signature[];
  blankPages: number[]; // Page numbers where blank pages should be inserted
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

// Editor state
export interface EditorState {
  selectedPageNumber: number | null;
  selectedSpreadNumber: number | null;
  isDraggingMargin: boolean;
  dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | null;
  isLocalMarginChange: boolean; // Cmd key held
  zoomLevel: number;
  activeTab: 'editor' | 'preview';
}
