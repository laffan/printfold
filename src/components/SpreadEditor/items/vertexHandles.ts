/**
 * Vertex editing handles for polygon text-flow items.
 *
 * Handles render as small draggable circles at each polygon vertex inside
 * the item's Konva group. Visibility is decided at render time from the
 * current selection state — the spread editor re-renders on selection
 * changes, which rebuilds the handles with the correct visibility.
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import type { TextFlowPageItem } from '../../../types';

const HANDLE_RADIUS = 5;
const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#3b82f6';
const HANDLE_STROKE_WIDTH = 1.5;

/**
 * Add a draggable handle for each polygon vertex to the supplied group.
 * The outline Konva.Line is updated live during drag; the normalized
 * polygonPoints are committed to state on dragend.
 */
export function addPolygonVertexHandles(
  group: Konva.Group,
  outline: Konva.Line,
  item: TextFlowPageItem,
  pageNumber: number
): void {
  if (!item.polygonPoints || item.polygonPoints.length < 3) return;

  const editor = appState.getEditor();
  const isSelected = editor.selectedItemIds.includes(item.id);
  if (!isSelected) return;

  for (let vertexIndex = 0; vertexIndex < item.polygonPoints.length; vertexIndex++) {
    const point = item.polygonPoints[vertexIndex];
    const handle = new Konva.Circle({
      x: point.x * item.width,
      y: point.y * item.height,
      radius: HANDLE_RADIUS,
      fill: HANDLE_FILL,
      stroke: HANDLE_STROKE,
      strokeWidth: HANDLE_STROKE_WIDTH,
      draggable: true,
      listening: true,
    });
    handle.setAttr('isVertexHandle', true);
    handle.setAttr('vertexIndex', vertexIndex);

    handle.on('mouseenter', () => {
      const stage = group.getStage();
      if (stage) stage.container().style.cursor = 'grab';
    });
    handle.on('mouseleave', () => {
      const stage = group.getStage();
      if (stage) stage.container().style.cursor = 'default';
    });

    // Prevent the handle from being interpreted as a drag on the parent
    // group (which would move the entire item).
    handle.on('mousedown touchstart', (e) => {
      e.cancelBubble = true;
    });

    handle.on('dragmove', () => {
      // Clamp to the item's bounding box during drag for visual feedback.
      const clampedX = Math.max(0, Math.min(item.width, handle.x()));
      const clampedY = Math.max(0, Math.min(item.height, handle.y()));
      handle.x(clampedX);
      handle.y(clampedY);

      // Live-update the polygon outline so the user sees the new shape.
      const points: number[] = [];
      const handles = group.find((n: Konva.Node) => n.getAttr('isVertexHandle') === true);
      const sorted = handles.slice().sort(
        (a, b) => (a.getAttr('vertexIndex') as number) - (b.getAttr('vertexIndex') as number)
      );
      for (const h of sorted) {
        points.push(h.x(), h.y());
      }
      outline.points(points);
      group.getLayer()?.batchDraw();
    });

    handle.on('dragend', () => {
      const newPoints = item.polygonPoints!.map((p, idx) => {
        if (idx !== vertexIndex) return p;
        return {
          x: Math.max(0, Math.min(1, handle.x() / item.width)),
          y: Math.max(0, Math.min(1, handle.y() / item.height)),
        };
      });
      appState.updateItemOnPage(pageNumber, item.id, { polygonPoints: newPoints });
      appState.requestReflow();
    });

    group.add(handle);
  }
}
