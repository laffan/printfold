/**
 * Options management methods for AppState
 */

import type { OutputOptions, LayoutOptions, FontOptions, HeaderFooterOptions, MarginUnit } from '../../types';
import { AppState } from './AppStateCore';

AppState.prototype.updateOutputOptions = function(updates: Partial<OutputOptions>): void {
  const project = this.getProject();
  this.updateProject({
    outputOptions: { ...project.outputOptions, ...updates },
  });
  this.requestReflow();
};

AppState.prototype.updateLayoutOptions = function(updates: Partial<LayoutOptions>): void {
  const project = this.getProject();
  this.updateProject({
    layoutOptions: { ...project.layoutOptions, ...updates },
  });
  this.requestReflow();
};

AppState.prototype.updateFontOptions = function(updates: Partial<FontOptions>): void {
  const project = this.getProject();
  this.updateProject({
    fontOptions: { ...project.fontOptions, ...updates },
  });
  this.requestReflow();
};

AppState.prototype.updateHeaderFooter = function(updates: Partial<HeaderFooterOptions>): void {
  const project = this.getProject();
  this.updateProject({
    headerFooter: { ...project.headerFooter, ...updates },
  });
  this.requestReflow();
};

AppState.prototype.getMeasurementUnit = function(): MarginUnit {
  return this.getProject().measurementUnit || 'in';
};

AppState.prototype.setMeasurementUnit = function(unit: MarginUnit): void {
  this.updateProject({ measurementUnit: unit });
  // Also update editor marginUnit for backward compatibility
  this.updateEditor({ marginUnit: unit });
};

// Blank pages
AppState.prototype.addBlankPage = function(afterPageNumber: number): void {
  const project = this.getProject();
  const blankPages = [...project.blankPages, afterPageNumber].sort((a, b) => a - b);
  this.updateProject({ blankPages });
  this.requestReflow();
};

AppState.prototype.removeBlankPage = function(pageNumber: number): void {
  const project = this.getProject();
  const blankPages = project.blankPages.filter(p => p !== pageNumber);
  this.updateProject({ blankPages });
  this.requestReflow();
};
