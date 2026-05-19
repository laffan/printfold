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
// Click within this many points of an edge inserts a new vertex there.
const EDGE_CLICK_THRESHOLD = 8;
// Polygon must keep at least this many vertices.
const MIN_VERTEX_COUNT = 3;

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

  // Insert a new vertex when the user clicks near an edge.
  setupEdgeInsertHandler(outline, item, pageNumber);

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
    // group (which would move the entire item). Alt/option + mousedown
    // removes this vertex instead of starting a drag.
    handle.on('mousedown touchstart', (e) => {
      e.cancelBubble = true;
      const isAlt = !!e.evt && 'altKey' in e.evt && (e.evt as MouseEvent).altKey;
      if (!isAlt) return;
      e.evt?.preventDefault();
      if (item.polygonPoints!.length <= MIN_VERTEX_COUNT) return;
      const newPoints = item.polygonPoints!.filter((_, idx) => idx !== vertexIndex);
      appState.updateItemOnPage(pageNumber, item.id, { polygonPoints: newPoints });
      appState.requestReflow();
    });

    handle.on('dragmove', () => {
      // Live-update the polygon outline so the user sees the new shape.
      // No clamping: vertices may extend past the item's bounding box and
      // the box auto-expands to fit on dragend.
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
      // Compute absolute item-local vertex positions with the dragged handle
      // at its new spot, then reframe the polygon so the bounding box
      // exactly contains every vertex.
      const absPoints = item.polygonPoints!.map((p, idx) => {
        if (idx === vertexIndex) return { x: handle.x(), y: handle.y() };
        return { x: p.x * item.width, y: p.y * item.height };
      });
      const updates = reframePolygon(item, absPoints);
      appState.updateItemOnPage(pageNumber, item.id, updates);
      appState.requestReflow();
    });

    group.add(handle);
  }
}

/**
 * Insert a new vertex when the user clicks near an edge of the polygon
 * outline. Plain clicks on the interior fall through to the standard
 * select-item behavior. Listens for the click event rather than mousedown
 * so a drag in progress isn't interrupted (Konva suppresses the click
 * when significant movement is detected).
 */
function setupEdgeInsertHandler(
  outline: Konva.Line,
  item: TextFlowPageItem,
  pageNumber: number
): void {
  // Ghost vertex preview: shown when the pointer is near an edge so the
  // user can see where a click would create a new vertex.
  const layer = outline.getLayer();
  const parent = outline.getParent();
  const ghost = new Konva.Circle({
    radius: HANDLE_RADIUS,
    fill: HANDLE_FILL,
    stroke: HANDLE_STROKE,
    strokeWidth: HANDLE_STROKE_WIDTH,
    opacity: 0.5,
    listening: false,
    visible: false,
  });
  if (parent) parent.add(ghost);

  const updateGhost = () => {
    const stage = outline.getStage();
    if (!stage) return hideGhost();
    const pointer = stage.getPointerPosition();
    if (!pointer) return hideGhost();
    const local = outline.getAbsoluteTransform().copy().invert().point(pointer);
    const absPoints = item.polygonPoints!.map(p => ({
      x: p.x * item.width,
      y: p.y * item.height,
    }));
    const nearest = findNearestEdge(absPoints, local.x, local.y);
    if (!nearest || nearest.distance > EDGE_CLICK_THRESHOLD) return hideGhost();
    const isAtExistingVertex = absPoints.some(p =>
      Math.abs(p.x - nearest.projX) < 2 && Math.abs(p.y - nearest.projY) < 2
    );
    if (isAtExistingVertex) return hideGhost();
    ghost.x(nearest.projX);
    ghost.y(nearest.projY);
    ghost.visible(true);
    layer?.batchDraw();
  };
  const hideGhost = () => {
    if (ghost.visible()) {
      ghost.visible(false);
      layer?.batchDraw();
    }
  };

  outline.on('mousemove', updateGhost);
  outline.on('mouseleave', hideGhost);

  outline.on('click tap', (e) => {
    if (!e.evt || ('altKey' in e.evt && (e.evt as MouseEvent).altKey)) return;
    const stage = outline.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const local = outline.getAbsoluteTransform().copy().invert().point(pointer);

    const absPoints = item.polygonPoints!.map(p => ({
      x: p.x * item.width,
      y: p.y * item.height,
    }));
    const nearest = findNearestEdge(absPoints, local.x, local.y);
    if (!nearest || nearest.distance > EDGE_CLICK_THRESHOLD) return;

    // Reject if the projection coincides with an existing vertex (avoid
    // duplicate points that would zero out an edge).
    const isAtExistingVertex = absPoints.some(p =>
      Math.abs(p.x - nearest.projX) < 1 && Math.abs(p.y - nearest.projY) < 1
    );
    if (isAtExistingVertex) return;

    const newPoint = {
      x: nearest.projX / item.width,
      y: nearest.projY / item.height,
    };
    const newPoints = [...item.polygonPoints!];
    newPoints.splice(nearest.insertAt, 0, newPoint);
    appState.updateItemOnPage(pageNumber, item.id, { polygonPoints: newPoints });
    appState.requestReflow();
    e.cancelBubble = true;
    e.evt.preventDefault();
  });
}

/**
 * Find the polygon edge nearest to (x, y) along with the projection of
 * (x, y) onto that edge segment. Used to position a newly inserted vertex.
 */
function findNearestEdge(
  points: { x: number; y: number }[],
  x: number,
  y: number
): { insertAt: number; distance: number; projX: number; projY: number } | null {
  if (points.length < 2) return null;
  let bestDistance = Infinity;
  let bestInsertAt = -1;
  let bestProjX = 0;
  let bestProjY = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;

    let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const distance = Math.hypot(x - projX, y - projY);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestInsertAt = i + 1; // Insert between p_i and p_{i+1}
      bestProjX = projX;
      bestProjY = projY;
    }
  }

  if (bestInsertAt === -1) return null;
  return { insertAt: bestInsertAt, distance: bestDistance, projX: bestProjX, projY: bestProjY };
}

/**
 * Given absolute (item-local) vertex positions for the polygon, compute a
 * new bounding box that exactly contains them. Returns the item updates
 * (x, y, width, height shifts plus re-normalized polygonPoints) needed to
 * keep the polygon in the same place visually while making the bounds fit.
 */
function reframePolygon(
  item: TextFlowPageItem,
  absPoints: { x: number; y: number }[]
): Partial<TextFlowPageItem> {
  const xs = absPoints.map(p => p.x);
  const ys = absPoints.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const newWidth = Math.max(1, maxX - minX);
  const newHeight = Math.max(1, maxY - minY);
  const newItemX = item.x + minX;
  const newItemY = item.y + minY;

  const polygonPoints = absPoints.map(p => ({
    x: (p.x - minX) / newWidth,
    y: (p.y - minY) / newHeight,
  }));

  return {
    x: newItemX,
    y: newItemY,
    width: newWidth,
    height: newHeight,
    polygonPoints,
  };
}
