/**
 * Polygon path utilities for text-flow items whose vertices may be
 * sharp corners or smooth (cubic-bezier) points with tangent handles.
 */

import type { PolygonPoint } from '../../types';

// Number of segments used to flatten each curve when sampling for hit
// tests / text-flow scanline intersection. Higher = smoother fit.
const FLATTEN_STEPS = 24;

/** Resolve a vertex's in-handle absolute position; corners coincide with the vertex. */
function handleInAbs(p: PolygonPoint, w: number, h: number): { x: number; y: number } {
  if (p.cornerType !== 'smooth' || !p.handleIn) {
    return { x: p.x * w, y: p.y * h };
  }
  return { x: p.handleIn.x * w, y: p.handleIn.y * h };
}

/** Resolve a vertex's out-handle absolute position; corners coincide with the vertex. */
function handleOutAbs(p: PolygonPoint, w: number, h: number): { x: number; y: number } {
  if (p.cornerType !== 'smooth' || !p.handleOut) {
    return { x: p.x * w, y: p.y * h };
  }
  return { x: p.handleOut.x * w, y: p.handleOut.y * h };
}

/** Resolve a vertex's anchor in absolute coords. */
function pointAbs(p: PolygonPoint, w: number, h: number): { x: number; y: number } {
  return { x: p.x * w, y: p.y * h };
}

/**
 * Build an SVG path string for the polygon (in absolute coords). When all
 * vertices are corners this is straight `M ... L ... Z`; smooth vertices
 * use cubic-bezier (`C`) commands with the vertex's in/out handles.
 */
export function buildPolygonPath(
  points: PolygonPoint[],
  width: number,
  height: number
): string {
  if (points.length < 2) return '';
  const first = pointAbs(points[0], width, height);
  const cmds: string[] = [`M ${first.x} ${first.y}`];

  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const curIsSmooth = cur.cornerType === 'smooth';
    const nextIsSmooth = next.cornerType === 'smooth';

    if (!curIsSmooth && !nextIsSmooth) {
      // Pure straight edge.
      const target = pointAbs(next, width, height);
      cmds.push(`L ${target.x} ${target.y}`);
    } else {
      const c1 = handleOutAbs(cur, width, height);
      const c2 = handleInAbs(next, width, height);
      const target = pointAbs(next, width, height);
      cmds.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`);
    }
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Sample the closed polygon path into a dense line-segment polygon — used
 * by the text-flow engine for scanline intersection without having to
 * solve cubic equations analytically.
 */
export function flattenPolygon(
  points: PolygonPoint[],
  width: number,
  height: number
): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const flat: { x: number; y: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const curIsSmooth = cur.cornerType === 'smooth';
    const nextIsSmooth = next.cornerType === 'smooth';

    const curAbs = pointAbs(cur, width, height);
    flat.push(curAbs);

    if (!curIsSmooth && !nextIsSmooth) continue;

    // Sample the cubic bezier between cur and next.
    const c1 = handleOutAbs(cur, width, height);
    const c2 = handleInAbs(next, width, height);
    const nextAbs = pointAbs(next, width, height);

    for (let step = 1; step < FLATTEN_STEPS; step++) {
      const t = step / FLATTEN_STEPS;
      flat.push(cubicAt(curAbs, c1, c2, nextAbs, t));
    }
  }

  return flat;
}

function cubicAt(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
  };
}

/**
 * Default smooth-point handles to use when a corner is toggled to a
 * smooth point. Picks tangent handles parallel to the line from the
 * previous to the next neighbor — produces a natural-looking curve.
 */
export function defaultSmoothHandles(
  prev: PolygonPoint,
  cur: PolygonPoint,
  next: PolygonPoint
): { handleIn: { x: number; y: number }; handleOut: { x: number; y: number } } {
  // Tangent direction = next - prev (normalized) scaled to a fraction of
  // the distance from cur to each neighbor.
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  const ux = tx / len;
  const uy = ty / len;
  const inDist = Math.hypot(cur.x - prev.x, cur.y - prev.y) * 0.33;
  const outDist = Math.hypot(next.x - cur.x, next.y - cur.y) * 0.33;
  return {
    handleIn: { x: cur.x - ux * inDist, y: cur.y - uy * inDist },
    handleOut: { x: cur.x + ux * outDist, y: cur.y + uy * outDist },
  };
}

/**
 * True polygon offset (Minkowski-style): every edge is shifted along its
 * outward normal by `offset`, and adjacent shifted edges meet on the
 * vertex's angle bisector. This maintains constant perpendicular distance
 * from every edge, regardless of vertex angle — unlike a centroid-radial
 * scale, which distorts irregular shapes.
 *
 * Operates on a flat polyline (so callers should run `flattenPolygon`
 * first when the source has curved edges). Winding is detected
 * automatically. The miter join is clamped at `miterLimit * |offset|`
 * from the vertex so very sharp corners don't spike infinitely.
 */
export function offsetFlatPolygon(
  points: { x: number; y: number }[],
  offset: number,
  miterLimit = 8
): { x: number; y: number }[] {
  const n = points.length;
  if (n < 3 || offset === 0) return points.map(p => ({ ...p }));

  // Signed area decides winding so we know which perpendicular is outward.
  // In screen coords (y-down), positive shoelace = clockwise.
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    signedArea += a.x * b.y - b.x * a.y;
  }
  const isCW = signedArea > 0;
  // Outward perpendicular of a direction (dx, dy):
  //   CW polygon in screen coords ⇒ (dy, -dx)
  //   CCW polygon              ⇒ (-dy, dx)
  const perpOutward = (dx: number, dy: number) =>
    isCW ? { x: dy, y: -dx } : { x: -dy, y: dx };

  const maxBisectorDist = Math.abs(offset) * miterLimit;
  const result: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];

    const inDx = cur.x - prev.x;
    const inDy = cur.y - prev.y;
    const inLen = Math.hypot(inDx, inDy) || 1;
    const inUx = inDx / inLen;
    const inUy = inDy / inLen;

    const outDx = next.x - cur.x;
    const outDy = next.y - cur.y;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const outUx = outDx / outLen;
    const outUy = outDy / outLen;

    const inN = perpOutward(inUx, inUy);
    const outN = perpOutward(outUx, outUy);

    let bx = inN.x + outN.x;
    let by = inN.y + outN.y;
    const bLen = Math.hypot(bx, by);

    if (bLen < 1e-6) {
      // Anti-parallel edges (straight-through vertex) — just shift along
      // the incoming normal.
      result.push({ x: cur.x + inN.x * offset, y: cur.y + inN.y * offset });
      continue;
    }
    bx /= bLen;
    by /= bLen;

    // Distance along the bisector that places the offset point exactly
    // `offset` units perpendicular from each adjoining edge.
    const cosHalf = bx * inN.x + by * inN.y; // = bisector · inNormal
    let d = offset / (cosHalf || 1);
    if (Math.abs(d) > maxBisectorDist) {
      d = Math.sign(d) * maxBisectorDist;
    }

    result.push({ x: cur.x + bx * d, y: cur.y + by * d });
  }

  return result;
}

/** Build a closed SVG path (straight edges only) from flat polygon points. */
export function buildFlatPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const cmds: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    cmds.push(`L ${points[i].x} ${points[i].y}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}
