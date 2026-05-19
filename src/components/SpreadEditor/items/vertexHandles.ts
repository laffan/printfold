/**
 * Vertex editing handles for polygon text-flow items.
 *
 * Handles render as small draggable circles at each polygon vertex inside
 * the item's Konva group. Vertices may be either sharp corners or smooth
 * (cubic-bezier) points with two additional tangent handles. The editor
 * re-renders on selection changes, which rebuilds these handles in the
 * correct visibility/state.
 *
 * Interactions:
 * - Drag anchor: move the vertex (handles follow for smooth points)
 * - Drag tangent handle: reshape the curve at that vertex
 * - Cmd/Ctrl + click on anchor: toggle corner ↔ smooth
 * - Alt/Option + click on anchor: remove the vertex (min 3 vertices kept)
 * - Click near edge: insert a new (corner) vertex
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import type { TextFlowPageItem, PolygonPoint } from '../../../types';
import { buildPolygonPath, defaultSmoothHandles } from '../../../services/textFlow/polygonPath';

const HANDLE_RADIUS = 5;
const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#3b82f6';
const HANDLE_STROKE_WIDTH = 1.5;
const TANGENT_HANDLE_RADIUS = 3.5;
const TANGENT_LINE_COLOR = '#3b82f6';
const TANGENT_LINE_WIDTH = 1;
const EDGE_CLICK_THRESHOLD = 8;
const MIN_VERTEX_COUNT = 3;

/**
 * Add a draggable handle for each polygon vertex to the supplied group.
 * The outline path is updated live during drag; the normalized
 * polygonPoints are committed to state on dragend.
 */
export function addPolygonVertexHandles(
  group: Konva.Group,
  outline: Konva.Path,
  item: TextFlowPageItem,
  pageNumber: number
): void {
  if (!item.polygonPoints || item.polygonPoints.length < 3) return;
  const editor = appState.getEditor();
  if (!editor.selectedItemIds.includes(item.id)) return;

  setupEdgeInsertHandler(outline, item, pageNumber);

  // Mutable working copy used during drag — committed to state on release.
  const livePoints: PolygonPoint[] = item.polygonPoints.map(p => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : undefined,
    handleOut: p.handleOut ? { ...p.handleOut } : undefined,
  }));

  const tangentInDots = new Map<number, Konva.Circle>();
  const tangentOutDots = new Map<number, Konva.Circle>();
  const tangentInLines = new Map<number, Konva.Line>();
  const tangentOutLines = new Map<number, Konva.Line>();

  const setOutlinePath = () => {
    outline.data(buildPolygonPath(livePoints, item.width, item.height));
  };

  const setTangentVisuals = (idx: number) => {
    const p = livePoints[idx];
    if (p.cornerType !== 'smooth') return;
    const ax = p.x * item.width;
    const ay = p.y * item.height;
    if (p.handleIn) {
      const ix = p.handleIn.x * item.width;
      const iy = p.handleIn.y * item.height;
      tangentInDots.get(idx)?.x(ix);
      tangentInDots.get(idx)?.y(iy);
      tangentInLines.get(idx)?.points([ax, ay, ix, iy]);
    }
    if (p.handleOut) {
      const ox = p.handleOut.x * item.width;
      const oy = p.handleOut.y * item.height;
      tangentOutDots.get(idx)?.x(ox);
      tangentOutDots.get(idx)?.y(oy);
      tangentOutLines.get(idx)?.points([ax, ay, ox, oy]);
    }
  };

  for (let i = 0; i < item.polygonPoints.length; i++) {
    const idx = i;
    const point = livePoints[idx];
    const isSmooth = point.cornerType === 'smooth';

    // Anchor handle. Smooth points get a hollow center as a visual cue.
    const anchor = new Konva.Circle({
      x: point.x * item.width,
      y: point.y * item.height,
      radius: HANDLE_RADIUS,
      fill: isSmooth ? HANDLE_STROKE : HANDLE_FILL,
      stroke: HANDLE_STROKE,
      strokeWidth: HANDLE_STROKE_WIDTH,
      draggable: true,
      listening: true,
    });
    anchor.setAttr('isVertexHandle', true);
    anchor.setAttr('vertexIndex', idx);

    anchor.on('mouseenter', () => {
      const stage = group.getStage();
      if (stage) stage.container().style.cursor = 'grab';
    });
    anchor.on('mouseleave', () => {
      const stage = group.getStage();
      if (stage) stage.container().style.cursor = 'default';
    });

    anchor.on('mousedown touchstart', (e) => {
      e.cancelBubble = true;
      const evt = e.evt as MouseEvent | undefined;
      if (!evt) return;
      if (evt.altKey) {
        evt.preventDefault();
        if (livePoints.length <= MIN_VERTEX_COUNT) return;
        const next = livePoints.filter((_, k) => k !== idx);
        appState.updateItemOnPage(pageNumber, item.id, { polygonPoints: next });
        appState.requestReflow();
        return;
      }
      if (evt.metaKey || evt.ctrlKey) {
        evt.preventDefault();
        const next = toggleCornerType(livePoints, idx);
        appState.updateItemOnPage(pageNumber, item.id, { polygonPoints: next });
        appState.requestReflow();
        return;
      }
    });

    anchor.on('dragmove', () => {
      const newAbsX = anchor.x();
      const newAbsY = anchor.y();
      const oldP = livePoints[idx];
      const newNormX = newAbsX / item.width;
      const newNormY = newAbsY / item.height;
      const dxNorm = newNormX - oldP.x;
      const dyNorm = newNormY - oldP.y;
      livePoints[idx] = {
        ...oldP,
        x: newNormX,
        y: newNormY,
        handleIn: oldP.handleIn ? { x: oldP.handleIn.x + dxNorm, y: oldP.handleIn.y + dyNorm } : undefined,
        handleOut: oldP.handleOut ? { x: oldP.handleOut.x + dxNorm, y: oldP.handleOut.y + dyNorm } : undefined,
      };
      setTangentVisuals(idx);
      setOutlinePath();
      group.getLayer()?.batchDraw();
    });

    anchor.on('dragend', () => {
      const absPoints = livePoints.map(p => ({ x: p.x * item.width, y: p.y * item.height }));
      const updates = reframePolygon(item, absPoints, livePoints);
      appState.updateItemOnPage(pageNumber, item.id, updates);
      appState.requestReflow();
    });

    group.add(anchor);

    // Tangent handles + dashed lines for smooth points.
    if (isSmooth) {
      if (point.handleIn) addTangentHandle(group, livePoints, idx, 'in', item, pageNumber,
        tangentInDots, tangentInLines, setOutlinePath);
      if (point.handleOut) addTangentHandle(group, livePoints, idx, 'out', item, pageNumber,
        tangentOutDots, tangentOutLines, setOutlinePath);
    }
  }
}

/**
 * Toggle the corner type at index `idx` in a polygon. Inserting smoothness
 * synthesizes natural tangent handles from the previous/next neighbors;
 * going back to corner clears the handles.
 */
function toggleCornerType(points: PolygonPoint[], idx: number): PolygonPoint[] {
  const cur = points[idx];
  if (cur.cornerType === 'smooth') {
    return points.map((p, i) =>
      i === idx ? { x: p.x, y: p.y, cornerType: 'corner' as const } : p
    );
  }
  const prev = points[(idx - 1 + points.length) % points.length];
  const next = points[(idx + 1) % points.length];
  const { handleIn, handleOut } = defaultSmoothHandles(prev, cur, next);
  return points.map((p, i) =>
    i === idx ? { x: p.x, y: p.y, cornerType: 'smooth' as const, handleIn, handleOut } : p
  );
}

/**
 * Create a small draggable circle for one bezier tangent handle of a smooth
 * vertex, plus the dashed line connecting it to its anchor. Dragging the
 * dot updates that handle's normalized position and redraws the outline.
 */
function addTangentHandle(
  group: Konva.Group,
  livePoints: PolygonPoint[],
  idx: number,
  which: 'in' | 'out',
  item: TextFlowPageItem,
  pageNumber: number,
  dotMap: Map<number, Konva.Circle>,
  lineMap: Map<number, Konva.Line>,
  setOutlinePath: () => void
): void {
  const point = livePoints[idx];
  const handle = which === 'in' ? point.handleIn : point.handleOut;
  if (!handle) return;

  const ax = point.x * item.width;
  const ay = point.y * item.height;
  const hx = handle.x * item.width;
  const hy = handle.y * item.height;

  const line = new Konva.Line({
    points: [ax, ay, hx, hy],
    stroke: TANGENT_LINE_COLOR,
    strokeWidth: TANGENT_LINE_WIDTH,
    dash: [3, 3],
    listening: false,
  });
  group.add(line);
  lineMap.set(idx, line);

  const dot = new Konva.Circle({
    x: hx,
    y: hy,
    radius: TANGENT_HANDLE_RADIUS,
    fill: HANDLE_FILL,
    stroke: TANGENT_LINE_COLOR,
    strokeWidth: TANGENT_LINE_WIDTH,
    draggable: true,
    listening: true,
  });
  dot.setAttr('isTangentHandle', true);
  dot.setAttr('vertexIndex', idx);
  dot.setAttr('which', which);

  dot.on('mouseenter', () => {
    const stage = group.getStage();
    if (stage) stage.container().style.cursor = 'grab';
  });
  dot.on('mouseleave', () => {
    const stage = group.getStage();
    if (stage) stage.container().style.cursor = 'default';
  });

  dot.on('mousedown touchstart', (e) => {
    e.cancelBubble = true;
  });

  dot.on('dragmove', () => {
    const nx = dot.x() / item.width;
    const ny = dot.y() / item.height;
    if (which === 'in') {
      livePoints[idx] = { ...livePoints[idx], handleIn: { x: nx, y: ny } };
    } else {
      livePoints[idx] = { ...livePoints[idx], handleOut: { x: nx, y: ny } };
    }
    // Refresh just this tangent line.
    const px = livePoints[idx].x * item.width;
    const py = livePoints[idx].y * item.height;
    line.points([px, py, dot.x(), dot.y()]);
    setOutlinePath();
    group.getLayer()?.batchDraw();
  });

  dot.on('dragend', () => {
    const absPoints = livePoints.map(p => ({ x: p.x * item.width, y: p.y * item.height }));
    const updates = reframePolygon(item, absPoints, livePoints);
    appState.updateItemOnPage(pageNumber, item.id, updates);
    appState.requestReflow();
  });

  group.add(dot);
  dotMap.set(idx, dot);
}

/**
 * Insert a new vertex when the user clicks near an edge of the polygon
 * outline. Plain clicks on the interior fall through to the standard
 * select-item behavior. Listens for the click event rather than mousedown
 * so a drag in progress isn't interrupted (Konva suppresses the click
 * when significant movement is detected).
 */
function setupEdgeInsertHandler(
  outline: Konva.Path,
  item: TextFlowPageItem,
  pageNumber: number
): void {
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

  const flatEdgePoints = (): { x: number; y: number }[] =>
    (item.polygonPoints || []).map(p => ({ x: p.x * item.width, y: p.y * item.height }));

  const updateGhost = () => {
    const stage = outline.getStage();
    if (!stage) return hideGhost();
    const pointer = stage.getPointerPosition();
    if (!pointer) return hideGhost();
    const local = outline.getAbsoluteTransform().copy().invert().point(pointer);
    const abs = flatEdgePoints();
    const nearest = findNearestEdge(abs, local.x, local.y);
    if (!nearest || nearest.distance > EDGE_CLICK_THRESHOLD) return hideGhost();
    const atExisting = abs.some(p =>
      Math.abs(p.x - nearest.projX) < 2 && Math.abs(p.y - nearest.projY) < 2
    );
    if (atExisting) return hideGhost();
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

    const abs = flatEdgePoints();
    const nearest = findNearestEdge(abs, local.x, local.y);
    if (!nearest || nearest.distance > EDGE_CLICK_THRESHOLD) return;
    const atExisting = abs.some(p =>
      Math.abs(p.x - nearest.projX) < 1 && Math.abs(p.y - nearest.projY) < 1
    );
    if (atExisting) return;

    const newPoint: PolygonPoint = {
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
 *
 * Operates on the straight-line edges between anchors. For curved edges
 * this is an approximation, but it's still where the user expects an
 * inserted vertex to land (the new vertex defaults to a corner anyway).
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
      bestInsertAt = i + 1;
      bestProjX = projX;
      bestProjY = projY;
    }
  }

  if (bestInsertAt === -1) return null;
  return { insertAt: bestInsertAt, distance: bestDistance, projX: bestProjX, projY: bestProjY };
}

/**
 * Given absolute (item-local) anchor positions for the polygon, compute a
 * new bounding box that exactly contains them. Returns the item updates
 * (x, y, width, height shifts plus re-normalized polygonPoints) needed to
 * keep the polygon in the same place visually while making the bounds fit.
 *
 * Handles for smooth points are re-normalized against the new bounds too.
 */
function reframePolygon(
  item: TextFlowPageItem,
  absPoints: { x: number; y: number }[],
  livePoints: PolygonPoint[]
): Partial<TextFlowPageItem> {
  const xs = absPoints.map(p => p.x);
  const ys = absPoints.map(p => p.y);
  // Include handles in bounds so smooth shapes that bulge past their
  // anchors don't get cropped by the bounding box.
  for (const lp of livePoints) {
    if (lp.cornerType === 'smooth') {
      if (lp.handleIn) {
        xs.push(lp.handleIn.x * item.width);
        ys.push(lp.handleIn.y * item.height);
      }
      if (lp.handleOut) {
        xs.push(lp.handleOut.x * item.width);
        ys.push(lp.handleOut.y * item.height);
      }
    }
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const newWidth = Math.max(1, maxX - minX);
  const newHeight = Math.max(1, maxY - minY);
  const newItemX = item.x + minX;
  const newItemY = item.y + minY;

  const polygonPoints: PolygonPoint[] = livePoints.map((lp, i) => {
    const ax = absPoints[i].x;
    const ay = absPoints[i].y;
    const base: PolygonPoint = {
      x: (ax - minX) / newWidth,
      y: (ay - minY) / newHeight,
    };
    if (lp.cornerType === 'smooth') {
      base.cornerType = 'smooth';
      if (lp.handleIn) {
        base.handleIn = {
          x: (lp.handleIn.x * item.width - minX) / newWidth,
          y: (lp.handleIn.y * item.height - minY) / newHeight,
        };
      }
      if (lp.handleOut) {
        base.handleOut = {
          x: (lp.handleOut.x * item.width - minX) / newWidth,
          y: (lp.handleOut.y * item.height - minY) / newHeight,
        };
      }
    }
    return base;
  });

  return {
    x: newItemX,
    y: newItemY,
    width: newWidth,
    height: newHeight,
    polygonPoints,
  };
}
