# PrintFold

Create printable, signature-based booklets from markdown documents. PrintFold is available both as an Electron desktop application and as a static web app deployable via GitHub Pages.

![screenshot](screenshot.png)

## Features

- **Markdown to Booklet**: Convert markdown documents into professionally formatted booklets
- **Interactive Editor**: Canvas-based spread editor with Konva.js
- **Drag & Drop**: Import markdown files and images via drag and drop
- **Text Flow**: Automatic text reflow as you adjust margins and settings
- **Signature Support**: Configure pages per signature for proper booklet imposition
- **PDF Export**: Generate print-ready PDFs with pdf-lib
- **3D Preview**: Visualize your booklet in 3D with Three.js
- **Cross-Platform**: Works in browsers and as an Electron app

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 8 or higher

### Installation

```bash
npm install
```

### Development

Run the web version in development mode:
```bash
npm run dev
```

Run the Electron version in development mode:
```bash
npm run electron:dev
```

### Building

Build for web (static files for GitHub Pages):
```bash
npm run build:web
```

Build Electron app:
```bash
npm run electron:build
```

## Usage

1. **Add Files**: Drag and drop markdown files (.md) and images (.png, .jpg, .jpeg, .webp) into the file panel, or click to browse
2. **Set Main Document**: Star a markdown file to set it as the main document for your booklet
3. **Configure Options**: Adjust sheet size, booklet size, margins, fonts, and headers/footers
4. **Preview**: Use the spread editor to see your booklet layout, drag margin lines to adjust
5. **Export**: Click "Export PDF" to generate a print-ready PDF with proper booklet imposition

### Keyboard Shortcuts

- **Arrow Keys**: Navigate between spreads
- **Cmd/Ctrl + Drag Margin**: Apply margin change only to the current page
- **Shift + Drag**: Pan the spread view
- **Mouse Wheel**: Zoom in/out

### Margin Editing

Click and drag the dotted margin lines in the spread editor to adjust margins:
- **Global Change**: Drag normally to change margins for all pages
- **Local Change**: Hold Cmd/Ctrl while dragging to change only the current page

## Project Structure

```
printfold/
-  electron/           # Electron main process
-  src/
-    -  components/     # UI components
-    -  services/       # Core services
-    -  styles/         # CSS styles
-    - types/          # TypeScript types
-  public/
-    - templates/      # Booklet templates
- .github/
    - workflows/      # GitHub Actions
```

## Templates

PrintFold includes three built-in templates:

- **Standard Booklet**: General purpose layout for most projects
- **Mini Zine**: Compact quarter-fold format for small publications
- **Chapbook**: Traditional layout with generous margins for poetry/prose

## Deployment

### GitHub Pages

The project includes a GitHub Actions workflow that automatically builds and deploys to GitHub Pages when you push to the main branch.

1. Enable GitHub Pages in your repository settings
2. Set the source to "GitHub Actions"
3. Push to main/master branch

### Manual Deployment

Build the static files and deploy to any static hosting:

```bash
npm run build:web
# Deploy contents of dist/web/
```

## Technical Stack

- **Canvas Editor**: Konva.js
- **3D Preview**: Three.js
- **PDF Generation**: pdf-lib
- **Markdown Parsing**: marked
- **Code Editor**: CodeMirror 6
- **Build Tool**: Webpack
- **Bundler**: Electron Builder

## License

MIT
