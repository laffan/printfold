/**
 * File management methods for AppState
 */

import type { ProjectFile } from '../../types';
import { AppState } from './AppStateCore';

// File management
AppState.prototype.addFiles = function(files: ProjectFile[]): void {
  const prevState = this.getProject();
  const newFiles = [...prevState.files];

  for (const file of files) {
    // Replace if same name exists
    const existingIndex = newFiles.findIndex(f => f.name === file.name);
    if (existingIndex >= 0) {
      newFiles[existingIndex] = file;
    } else {
      newFiles.push(file);
    }
  }

  // Auto-select main document if not set
  let mainDocument = prevState.mainDocument;
  if (!mainDocument) {
    const mdFile = newFiles.find(f => f.type === 'markdown');
    if (mdFile) {
      mainDocument = mdFile.id;
    }
  }

  this.setProject({ ...prevState, files: newFiles, mainDocument });
  this.notifyProjectListeners(prevState);
  this.requestReflow();
};

AppState.prototype.removeFile = function(fileId: string): void {
  const prevState = this.getProject();
  const files = prevState.files.filter(f => f.id !== fileId);
  let mainDocument = prevState.mainDocument;

  if (mainDocument === fileId) {
    const mdFile = files.find(f => f.type === 'markdown');
    mainDocument = mdFile?.id ?? null;
  }

  this.setProject({ ...prevState, files, mainDocument });
  this.notifyProjectListeners(prevState);
  this.requestReflow();
};

AppState.prototype.updateFile = function(fileId: string, updates: Partial<ProjectFile>): void {
  const prevState = this.getProject();
  const file = prevState.files.find(f => f.id === fileId);
  const files = prevState.files.map(f =>
    f.id === fileId ? { ...f, ...updates } : f
  );
  this.setProject({ ...prevState, files });
  this.notifyProjectListeners(prevState);

  // Trigger reflow for any markdown file update (all text files are concatenated)
  if (file?.type === 'markdown') {
    this.requestReflow();
  }
};

AppState.prototype.reorderFiles = function(fileIds: string[]): void {
  const prevState = this.getProject();
  const fileMap = new Map(prevState.files.map(f => [f.id, f]));

  // Reorder only the files that are in the provided list
  const reorderedFiles: ProjectFile[] = [];
  const otherFiles: ProjectFile[] = [];

  // First, collect files not in the reorder list
  for (const file of prevState.files) {
    if (!fileIds.includes(file.id)) {
      otherFiles.push(file);
    }
  }

  // Then add reordered files in the new order
  for (const id of fileIds) {
    const file = fileMap.get(id);
    if (file) {
      reorderedFiles.push(file);
    }
  }

  // Merge: text files (reordered) + other files
  this.setProject({ ...prevState, files: [...reorderedFiles, ...otherFiles] });
  this.notifyProjectListeners(prevState);
  this.requestReflow();
};

AppState.prototype.setMainDocument = function(fileId: string | null): void {
  const project = this.getProject();
  if (project.mainDocument !== fileId) {
    this.updateProject({ mainDocument: fileId });
    this.requestReflow();
  }
};

AppState.prototype.getMainDocument = function(): ProjectFile | null {
  const project = this.getProject();
  if (!project.mainDocument) return null;
  return project.files.find(f => f.id === project.mainDocument) ?? null;
};

AppState.prototype.getFile = function(fileId: string): ProjectFile | null {
  return this.getProject().files.find(f => f.id === fileId) ?? null;
};

AppState.prototype.getImageByName = function(name: string): ProjectFile | null {
  return this.getProject().files.find(
    f => f.type === 'image' && f.name.toLowerCase() === name.toLowerCase()
  ) ?? null;
};
