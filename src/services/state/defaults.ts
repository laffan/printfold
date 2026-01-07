/**
 * Default values for state management
 */

import type {
  BookletProject,
  OutputOptions,
  LayoutOptions,
  FontOptions,
  HeaderFooterOptions,
  EditorState,
  FontStyle,
  PageContent,
  Spread,
  Signature,
} from '../../types';

// Default font styles - using web-safe fonts for reliable PDF rendering
const defaultFontStyle: FontStyle = {
  fontFamily: 'Georgia',
  fontSize: 12,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
};

const defaultHeadingStyle = (size: number, weight: 'bold' | 'normal' = 'bold'): FontStyle => ({
  fontFamily: 'Arial',
  fontSize: size,
  fontWeight: weight,
  fontStyle: 'normal',
  color: '#000000',
});

// Default options
export const defaultOutputOptions: OutputOptions = {
  sheetSize: 'letter',
  bookletSize: 'quarter',
  pagesPerSignature: 4,
  orientation: 'portrait',
  fillAvailableSpace: true,
  showFoldMarks: false,
  creepEnabled: false,
  creepPerSheet: 0.0625 * 72,
  duplexOffsetX: 0,
  duplexOffsetY: 0,
  showCropMarks: true,
  cropMarkColor: '#000000',
  cropMarkThickness: 0.5,
};

export const defaultLayoutOptions: LayoutOptions = {
  margins: {
    top: 54,
    bottom: 54,
    inner: 54,
    outer: 36,
  },
  marginOverrides: [],
  emptyPageBeforeH1: true,
  spacingAboveH1: 72,
  spacingAboveH2: 36,
  spacingAboveH3: 24,
  paragraphSpacing: 12,
  lineHeight: 1.5,
  textAlign: 'left',
};

export const defaultFontOptions: FontOptions = {
  body: defaultFontStyle,
  h1: defaultHeadingStyle(24),
  h2: defaultHeadingStyle(20),
  h3: defaultHeadingStyle(16),
  h4: defaultHeadingStyle(14),
  h5: defaultHeadingStyle(12),
  h6: defaultHeadingStyle(12, 'normal'),
  code: {
    ...defaultFontStyle,
    fontFamily: 'Courier New',
    fontSize: 10,
  },
  blockquote: {
    ...defaultFontStyle,
    fontStyle: 'italic',
    color: '#555555',
  },
  // Inline styles for Obsidian-flavored markdown
  highlight: {
    textColor: '#000000',
    backgroundColor: '#ffff00',
  },
  strikethrough: {
    textColor: '#888888',
    lineColor: '#888888',
  },
};

export const defaultHeaderFooter: HeaderFooterOptions = {
  header: {
    enabled: false,
    height: 24,
    verso: { left: '', center: '', right: '' },
    recto: { left: '', center: '', right: '' },
    showOnFirstPage: false,
    font: { ...defaultFontStyle, fontSize: 10 },
  },
  footer: {
    enabled: true,
    height: 24,
    verso: { left: '{{pageNumber}}', center: '', right: '' },
    recto: { left: '', center: '', right: '{{pageNumber}}' },
    showOnFirstPage: false,
    font: { ...defaultFontStyle, fontSize: 10 },
  },
};

export const defaultEditorState: EditorState = {
  selectedPageNumber: null,
  selectedSpreadNumber: null,
  selectedPagePosition: null,
  selectedItemId: null,
  selectedItemIds: [],
  isDraggingMargin: false,
  dragMarginType: null,
  isLocalMarginChange: false,
  zoomLevel: 1,
  activeTab: 'editor',
  marginUnit: 'in',
  clipboard: [],
};

export function createEmptyProject(): BookletProject {
  const pagesPerSig = defaultOutputOptions.pagesPerSignature;

  const initialPages: PageContent[] = [];
  for (let i = 0; i < pagesPerSig; i++) {
    const pageNum = i + 1;
    initialPages.push({
      id: crypto.randomUUID(),
      pageNumber: pageNum,
      pageState: 'available',
      sections: [],
      isBlank: true,
      isRecto: pageNum % 2 === 1,
      isStatic: false,
      items: [],
    });
  }

  const initialSpreads: Spread[] = [];

  initialSpreads.push({
    id: crypto.randomUUID(),
    spreadNumber: 1,
    verso: null,
    recto: initialPages[0],
  });

  for (let i = 1; i < initialPages.length - 1; i += 2) {
    initialSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: initialSpreads.length + 1,
      verso: initialPages[i],
      recto: initialPages[i + 1] || null,
    });
  }

  if (initialPages.length > 1) {
    initialSpreads.push({
      id: crypto.randomUUID(),
      spreadNumber: initialSpreads.length + 1,
      verso: initialPages[initialPages.length - 1],
      recto: null,
    });
  }

  const initialSignature: Signature = {
    id: crypto.randomUUID(),
    signatureNumber: 1,
    spreads: initialSpreads,
    pageCount: pagesPerSig,
  };

  return {
    id: crypto.randomUUID(),
    name: 'Untitled Booklet',
    files: [],
    mainDocument: null,
    measurementUnit: 'in',
    outputOptions: { ...defaultOutputOptions },
    layoutOptions: JSON.parse(JSON.stringify(defaultLayoutOptions)),
    fontOptions: JSON.parse(JSON.stringify(defaultFontOptions)),
    headerFooter: JSON.parse(JSON.stringify(defaultHeaderFooter)),
    signatures: [initialSignature],
    blankPages: [],
  };
}
