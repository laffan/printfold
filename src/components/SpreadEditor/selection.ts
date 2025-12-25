/**
 * SpreadEditor Selection Module
 * Handles drag-to-select marquee and right-click context menu
 */

import Konva from 'konva';
import { appState } from '../../services/state';
import type { PageItem } from '../../types';

interface SelectionMarquee {
  rect: Konva.Rect;
  startX: number;
  startY: number;
  isActive: boolean;
}

/**
 * Create and manage selection marquee for drag-to-select
 */
export function createSelectionMarquee(
  layer: Konva.Layer,
  stage: Konva.Stage,
  itemNodes: Map<string, Konva.Node>,
  onSelectionComplete: (itemIds: string[]) => void
): {
  startMarquee: (x: number, y: number) => void;
  updateMarquee: (x: number, y: number) => void;
  endMarquee: () => void;
  cancelMarquee: () => void;
  isActive: () => boolean;
} {
  const marquee: SelectionMarquee = {
    rect: new Konva.Rect({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fill: 'rgba(59, 130, 246, 0.1)',
      stroke: '#3b82f6',
      strokeWidth: 1,
      dash: [4, 4],
      visible: false,
      listening: false,
    }),
    startX: 0,
    startY: 0,
    isActive: false,
  };

  layer.add(marquee.rect);

  function startMarquee(x: number, y: number): void {
    marquee.startX = x;
    marquee.startY = y;
    marquee.rect.setAttrs({
      x,
      y,
      width: 0,
      height: 0,
      visible: true,
    });
    marquee.isActive = true;
    layer.batchDraw();
  }

  function updateMarquee(x: number, y: number): void {
    if (!marquee.isActive) return;

    const minX = Math.min(marquee.startX, x);
    const minY = Math.min(marquee.startY, y);
    const width = Math.abs(x - marquee.startX);
    const height = Math.abs(y - marquee.startY);

    marquee.rect.setAttrs({
      x: minX,
      y: minY,
      width,
      height,
    });
    layer.batchDraw();
  }

  function endMarquee(): void {
    if (!marquee.isActive) return;

    // Get marquee bounds in stage coordinates
    const marqueeBox = {
      x: marquee.rect.x(),
      y: marquee.rect.y(),
      width: marquee.rect.width(),
      height: marquee.rect.height(),
    };
    const selectedIds: string[] = [];

    // Check which items intersect with the marquee using stage coordinates
    itemNodes.forEach((node, id) => {
      // Skip array instance nodes
      if (node.getAttr('isArrayMember')) return;

      // Get the node's bounding box in stage coordinates
      const nodeBox = getNodeBoundsInStage(node);
      if (intersects(marqueeBox, nodeBox)) {
        selectedIds.push(id);
      }
    });

    marquee.rect.visible(false);
    marquee.isActive = false;
    layer.batchDraw();

    onSelectionComplete(selectedIds);
  }

  function cancelMarquee(): void {
    marquee.rect.visible(false);
    marquee.isActive = false;
    layer.batchDraw();
  }

  function isActive(): boolean {
    return marquee.isActive;
  }

  return {
    startMarquee,
    updateMarquee,
    endMarquee,
    cancelMarquee,
    isActive,
  };
}

/**
 * Get a node's bounding box in stage coordinates
 */
function getNodeBoundsInStage(node: Konva.Node): { x: number; y: number; width: number; height: number } {
  const className = node.getClassName();

  // For ellipse and circle, calculate bounds from center
  if (className === 'Ellipse') {
    const ellipse = node as Konva.Ellipse;
    const radiusX = ellipse.radiusX();
    const radiusY = ellipse.radiusY();
    return {
      x: ellipse.x() - radiusX,
      y: ellipse.y() - radiusY,
      width: radiusX * 2,
      height: radiusY * 2,
    };
  }

  if (className === 'Circle') {
    const circle = node as Konva.Circle;
    const radius = circle.radius();
    return {
      x: circle.x() - radius,
      y: circle.y() - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }

  // For Line and Arrow, use the points to get bounds
  if (className === 'Line' || className === 'Arrow') {
    const line = node as Konva.Line;
    const points = line.points();
    const x = line.x();
    const y = line.y();
    // Assuming horizontal line [0, 0, width, 0]
    const width = points.length >= 2 ? Math.abs(points[2] - points[0]) : 0;
    const height = 10; // Give some height for easier selection
    return { x, y: y - 5, width, height };
  }

  // For groups (array items), get the group's bounds
  if (className === 'Group') {
    const group = node as Konva.Group;
    const rect = group.getClientRect({ relativeTo: group.getStage() });
    // Convert back to stage coordinates
    const stage = group.getStage();
    if (stage) {
      const scale = stage.scaleX();
      const stagePos = stage.position();
      return {
        x: (rect.x - stagePos.x) / scale,
        y: (rect.y - stagePos.y) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    }
    return rect;
  }

  // For regular shapes (Rect, Text, Image), position and size are direct
  return {
    x: node.x(),
    y: node.y(),
    width: node.width(),
    height: node.height(),
  };
}

/**
 * Check if two rectangles intersect
 */
function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Context menu for items
 */
export interface ContextMenuItem {
  label: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
}

let activeContextMenu: HTMLElement | null = null;

/**
 * Show context menu at the given position
 */
export function showContextMenu(
  x: number,
  y: number,
  items: ContextMenuItem[]
): void {
  // Remove any existing context menu
  hideContextMenu();

  // Create context menu element
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 160px;
    padding: 4px 0;
    z-index: 10000;
    font-size: 13px;
  `;

  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.style.cssText = `
        height: 1px;
        background: #e5e7eb;
        margin: 4px 0;
      `;
      menu.appendChild(separator);
    }

    const menuItem = document.createElement('div');
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
      padding: 8px 12px;
      cursor: ${item.disabled ? 'default' : 'pointer'};
      color: ${item.disabled ? '#9ca3af' : '#374151'};
      user-select: none;
    `;

    if (!item.disabled) {
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#f3f4f6';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        item.action();
      });
    }

    menu.appendChild(menuItem);
  }

  document.body.appendChild(menu);
  activeContextMenu = menu;

  // Adjust position if menu goes off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${y - rect.height}px`;
  }

  // Close on click outside or escape
  const closeHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      hideContextMenu();
    }
  };
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('keydown', keyHandler);
  }, 0);

  // Store handlers for cleanup
  (menu as any)._closeHandler = closeHandler;
  (menu as any)._keyHandler = keyHandler;
}

/**
 * Hide the active context menu
 */
export function hideContextMenu(): void {
  if (activeContextMenu) {
    const menu = activeContextMenu;
    document.removeEventListener('click', (menu as any)._closeHandler);
    document.removeEventListener('keydown', (menu as any)._keyHandler);
    menu.remove();
    activeContextMenu = null;
  }
}

/**
 * Create context menu items for selected item(s)
 */
export function createItemContextMenu(
  pageNumber: number,
  itemIds: string[]
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const single = itemIds.length === 1;
  const itemId = itemIds[0];

  // Layer ordering (only for single selection)
  if (single) {
    items.push({
      label: 'Bring to Front',
      action: () => appState.bringItemToFront(pageNumber, itemId),
    });
    items.push({
      label: 'Move Forward',
      action: () => appState.moveItemForward(pageNumber, itemId),
    });
    items.push({
      label: 'Move Backward',
      action: () => appState.moveItemBackward(pageNumber, itemId),
    });
    items.push({
      label: 'Send to Back',
      action: () => appState.sendItemToBack(pageNumber, itemId),
      separator: true,
    });
  }

  // Copy, Duplicate, Delete
  items.push({
    label: 'Copy',
    action: () => appState.copyToClipboard(),
  });
  items.push({
    label: 'Duplicate',
    action: () => appState.duplicateSelectedItems(),
  });
  items.push({
    label: `Delete${itemIds.length > 1 ? ` (${itemIds.length} items)` : ''}`,
    action: () => appState.deleteSelectedItems(),
    separator: true,
  });

  return items;
}
