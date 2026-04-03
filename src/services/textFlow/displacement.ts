/**
 * Displacement zone calculation for text flow around items
 *
 * When items with displaceText=true are placed on pages, text wraps around them.
 * This module calculates the available text region at each Y position on a page.
 */

import type { PageItem, PageContent, Signature } from '../../types';

/** A rectangular zone where text cannot be placed */
export interface DisplacementZone {
  yStart: number;  // Top of zone (relative to content area top)
  yEnd: number;    // Bottom of zone
  xStart: number;  // Left edge of zone (relative to content area left)
  xEnd: number;    // Right edge of zone
}

/** Available text region at a given Y position */
export interface TextRegion {
  xOffset: number;  // Left edge of available text area (relative to content area)
  width: number;    // Available width for text
}

/** Minimum fraction of content width that must remain for text (below this, skip vertically) */
const MIN_TEXT_WIDTH_FRACTION = 0.3;

/** Default padding around displacement zones */
const DEFAULT_DISPLACEMENT_PADDING = 8;

/**
 * Build displacement zones from items on a page
 * Only includes items with displaceText !== false (defaults to true)
 */
export function buildDisplacementZones(
  items: PageItem[],
  margins: { top: number; inner: number; outer: number },
  isRecto: boolean
): DisplacementZone[] {
  const zones: DisplacementZone[] = [];
  const leftMargin = isRecto ? margins.inner : margins.outer;

  for (const item of items) {
    // displaceText defaults to true
    if (item.displaceText === false) continue;

    const padding = item.displaceTextPadding ?? DEFAULT_DISPLACEMENT_PADDING;

    // Item positions are relative to page left edge; convert to content-area-relative
    const itemLeft = item.x - leftMargin;
    const itemTop = item.y - margins.top;

    zones.push({
      yStart: itemTop - padding,
      yEnd: itemTop + item.height + padding,
      xStart: itemLeft - padding,
      xEnd: itemLeft + item.width + padding,
    });
  }

  return zones;
}

/**
 * Get the available text region at a given Y position, accounting for displacement zones
 *
 * Strategy for rectangular wrapping:
 * - Items on the left: text starts after the item's right edge
 * - Items on the right: text ends at the item's left edge
 * - Items in the center or leaving too little width: return zero width (caller should skip Y)
 * - Multiple items: find largest contiguous gap
 */
export function getTextRegionAtY(
  y: number,
  lineHeight: number,
  zones: DisplacementZone[],
  contentWidth: number
): TextRegion {
  // Default: full content width, no offset
  if (zones.length === 0) {
    return { xOffset: 0, width: contentWidth };
  }

  // Find zones that overlap this Y range [y, y + lineHeight]
  const overlapping = zones.filter(z => z.yStart < y + lineHeight && z.yEnd > y);

  if (overlapping.length === 0) {
    return { xOffset: 0, width: contentWidth };
  }

  // Build a list of blocked horizontal intervals, clamped to [0, contentWidth]
  const blocked: Array<{ start: number; end: number }> = overlapping.map(z => ({
    start: Math.max(0, z.xStart),
    end: Math.min(contentWidth, z.xEnd),
  })).filter(b => b.end > b.start);

  if (blocked.length === 0) {
    return { xOffset: 0, width: contentWidth };
  }

  // Merge overlapping blocked intervals
  blocked.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [blocked[0]];
  for (let i = 1; i < blocked.length; i++) {
    const last = merged[merged.length - 1];
    if (blocked[i].start <= last.end) {
      last.end = Math.max(last.end, blocked[i].end);
    } else {
      merged.push(blocked[i]);
    }
  }

  // Find the largest gap between blocked intervals (including edges)
  const gaps: Array<{ start: number; width: number }> = [];

  // Gap before first blocked interval
  if (merged[0].start > 0) {
    gaps.push({ start: 0, width: merged[0].start });
  }

  // Gaps between blocked intervals
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i].end;
    const gapWidth = merged[i + 1].start - gapStart;
    if (gapWidth > 0) {
      gaps.push({ start: gapStart, width: gapWidth });
    }
  }

  // Gap after last blocked interval
  const lastBlocked = merged[merged.length - 1];
  if (lastBlocked.end < contentWidth) {
    gaps.push({ start: lastBlocked.end, width: contentWidth - lastBlocked.end });
  }

  if (gaps.length === 0) {
    // Entirely blocked
    return { xOffset: 0, width: 0 };
  }

  // Return the largest gap
  const bestGap = gaps.reduce((best, gap) => gap.width > best.width ? gap : best, gaps[0]);

  // If the best gap is too narrow, signal that text should skip this Y
  if (bestGap.width < contentWidth * MIN_TEXT_WIDTH_FRACTION) {
    return { xOffset: 0, width: 0 };
  }

  return { xOffset: bestGap.start, width: bestGap.width };
}

/**
 * Collect displacement zones for all pages that have displacing items
 * Returns a map of pageNumber -> DisplacementZone[]
 */
export function collectDisplacementZones(
  signatures: Signature[],
  layoutMargins: { top: number; inner: number; outer: number }
): Map<number, DisplacementZone[]> {
  const zonesByPage = new Map<number, DisplacementZone[]>();

  for (const sig of signatures) {
    for (const spread of sig.spreads) {
      for (const page of [spread.verso, spread.recto]) {
        if (!page || !page.items?.length) continue;
        // Skip pages with blocked text flow — they don't need displacement zones
        if (page.blockTextFlow || page.pageState === 'static') continue;

        const zones = buildDisplacementZones(
          page.items,
          layoutMargins,
          page.isRecto
        );

        if (zones.length > 0) {
          zonesByPage.set(page.pageNumber, zones);
        }
      }
    }
  }

  return zonesByPage;
}

/**
 * Find the Y position below all displacement zones at a given Y
 * Used when text needs to skip past items (width too narrow)
 */
export function findNextClearY(
  y: number,
  zones: DisplacementZone[]
): number {
  // Find the lowest yEnd of zones that overlap y
  let maxEnd = y;
  for (const zone of zones) {
    if (zone.yStart <= y && zone.yEnd > y) {
      maxEnd = Math.max(maxEnd, zone.yEnd);
    }
  }
  // There may be more zones starting right after — check iteratively
  let changed = true;
  while (changed) {
    changed = false;
    for (const zone of zones) {
      if (zone.yStart < maxEnd && zone.yEnd > maxEnd) {
        maxEnd = zone.yEnd;
        changed = true;
      }
    }
  }
  return maxEnd;
}
