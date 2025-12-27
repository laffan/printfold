/**
 * Item creation functions for the Edit Page module
 */

import { appState } from '../../../services/state';
import { switchToSelectedTab } from './shared';
import type { PageItem, TextPageItem, ShapePageItem, ImagePageItem, ProjectFile } from '../../../types';

/**
 * Add an item to the currently selected static page
 */
export function addItemToCurrentPage(itemType: 'text' | 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arrow'): void {
  const editorState = appState.getEditor();
  if (editorState.selectedPageNumber === null) return;

  // Determine dimensions based on shape type
  const isLinear = itemType === 'line' || itemType === 'arrow';
  const isCircular = itemType === 'circle';

  const baseItem = {
    id: crypto.randomUUID(),
    x: 50,
    y: 50,
    width: isLinear ? 100 : (isCircular ? 60 : 100),
    height: isLinear ? 2 : (itemType === 'text' ? 30 : (isCircular ? 60 : 80)),
    rotation: 0,
    opacity: 1,
  };

  let item: PageItem;

  if (itemType === 'text') {
    item = {
      ...baseItem,
      type: 'text',
      content: 'Text',
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#000000',
      textAlign: 'left',
    } as TextPageItem;
  } else {
    item = {
      ...baseItem,
      type: 'shape',
      shapeType: itemType,
      fillColor: isLinear ? undefined : '#cccccc',
      strokeColor: '#000000',
      strokeWidth: isLinear ? 2 : 1,
    } as ShapePageItem;
  }

  appState.addItemToPage(editorState.selectedPageNumber, item);
  appState.updateEditor({ selectedItemId: item.id });
  switchToSelectedTab();
}

/**
 * Add an image file to the currently selected static page
 */
export async function addImageToCurrentPage(file: File): Promise<void> {
  const editorState = appState.getEditor();
  if (editorState.selectedPageNumber === null) return;

  // Read file as base64
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  // Add file to project files
  const projectFile: ProjectFile = {
    id: crypto.randomUUID(),
    name: file.name,
    type: 'image',
    content,
    isBase64: true,
    lastModified: file.lastModified,
  };
  appState.addFiles([projectFile]);

  // Create image item on the page
  const item: ImagePageItem = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 50,
    y: 50,
    width: 150,
    height: 100,
    rotation: 0,
    opacity: 1,
    imageFileId: projectFile.id,
  };

  appState.addItemToPage(editorState.selectedPageNumber, item);
  appState.updateEditor({ selectedItemId: item.id });
  switchToSelectedTab();
}

/**
 * Add an image from an existing project file to the current page
 */
export function addImageFromFileToPage(fileId: string): void {
  const editorState = appState.getEditor();
  if (editorState.selectedPageNumber === null) return;

  const file = appState.getProject().files.find(f => f.id === fileId);
  if (!file || file.type !== 'image') return;

  const item: ImagePageItem = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 50,
    y: 50,
    width: 150,
    height: 100,
    rotation: 0,
    opacity: 1,
    imageFileId: fileId,
  };

  appState.addItemToPage(editorState.selectedPageNumber, item);
  appState.updateEditor({ selectedItemId: item.id });
  switchToSelectedTab();
}
