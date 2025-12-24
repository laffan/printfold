/**
 * SpreadEditor Types
 * Shared interfaces for the SpreadEditor component
 */

import Konva from 'konva';

export interface MarginLine {
  line: Konva.Line;
  type: 'top' | 'bottom' | 'inner' | 'outer' | 'header' | 'footer';
  pageNumber: number;
}

export interface MarginLabel {
  text: Konva.Text;
  type: 'top' | 'bottom' | 'inner' | 'outer';
  pageNumber: number;
}

export interface SpreadEditorContext {
  stage: Konva.Stage;
  layer: Konva.Layer;
  marginLayer: Konva.Layer;
  itemsLayer: Konva.Layer;
  transformer: Konva.Transformer;
  itemNodes: Map<string, Konva.Node>;
  marginLines: MarginLine[];
  marginLabels: MarginLabel[];
  zoomLevel: number;
  isDraggingMargin: boolean;
  dragMarginType: 'top' | 'bottom' | 'inner' | 'outer' | 'header' | 'footer' | null;
  dragPageNumber: number | null;
  currentSpreadIndex: number;
}
