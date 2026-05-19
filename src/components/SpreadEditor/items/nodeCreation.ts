/**
 * Konva node creation for page items
 */

import Konva from 'konva';
import { appState } from '../../../services/state';
import { switchToSelectedTab } from '../../OptionsPanel/editPage';
import { applyFillToShape } from './fill';
import { startTextEditing } from './textEditing';
import { applyTextTransform } from '../../../services/textFlow';
import type { PageItem, TextPageItem, ShapePageItem, ImagePageItem, TextFlowPageItem } from '../../../types';
import { drawTextFlowItemContent } from './textFlowRendering';
import { addPolygonVertexHandles } from './vertexHandles';
import { buildPolygonPath, flattenPolygon, offsetFlatPolygon, buildFlatPath } from '../../../services/textFlow/polygonPath';


/**
 * Create a Konva node for a page item
 */
export function createItemNode(
  item: PageItem,
  xOffset: number,
  pageNumber: number,
  zoomLevel: number,
  stage: Konva.Stage,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer,
  updateTransformerFn: () => void
): Konva.Shape | Konva.Text | Konva.Arrow | null {
  let node: Konva.Shape | Konva.Text | Konva.Arrow | null = null;
  const opacity = item.opacity ?? 1;

  if (item.type === 'shape') {
    const shapeItem = item as ShapePageItem;
    const isLinear = shapeItem.shapeType === 'line' || shapeItem.shapeType === 'arrow';
    const hasFill = shapeItem.hasFill ?? !isLinear;
    const hasStroke = shapeItem.hasStroke ?? true;
    const strokeProps = hasStroke ? {
      stroke: shapeItem.strokeColor || '#000000',
      strokeWidth: shapeItem.strokeWidth || 1,
    } : {};

    if (shapeItem.shapeType === 'rectangle') {
      const rect = new Konva.Rect({
        x: xOffset + item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        ...strokeProps,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
      if (hasFill) {
        applyFillToShape(rect, shapeItem.fill, shapeItem.fillColor, item.width, item.height);
      }
      node = rect;
    } else if (shapeItem.shapeType === 'ellipse') {
      const ellipse = new Konva.Ellipse({
        x: xOffset + item.x + item.width / 2,
        y: item.y + item.height / 2,
        radiusX: item.width / 2,
        radiusY: item.height / 2,
        ...strokeProps,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
        offset: { x: 0, y: 0 },
      });
      if (hasFill) {
        applyFillToShape(ellipse, shapeItem.fill, shapeItem.fillColor, item.width, item.height);
      }
      node = ellipse;
    } else if (shapeItem.shapeType === 'circle') {
      // Circle uses the minimum of width/height for radius
      const radius = Math.min(item.width, item.height) / 2;
      const circle = new Konva.Circle({
        x: xOffset + item.x + radius,
        y: item.y + radius,
        radius: radius,
        ...strokeProps,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
      if (hasFill) {
        applyFillToShape(circle, shapeItem.fill, shapeItem.fillColor, radius * 2, radius * 2);
      }
      node = circle;
    } else if (shapeItem.shapeType === 'line') {
      node = new Konva.Line({
        x: xOffset + item.x,
        y: item.y,
        points: [0, 0, item.width, 0],
        stroke: hasStroke ? (shapeItem.strokeColor || '#000000') : undefined,
        strokeWidth: hasStroke ? (shapeItem.strokeWidth || 2) : 0,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
    } else if (shapeItem.shapeType === 'arrow') {
      node = new Konva.Arrow({
        x: xOffset + item.x,
        y: item.y,
        points: [0, 0, item.width, 0],
        stroke: hasStroke ? (shapeItem.strokeColor || '#000000') : undefined,
        strokeWidth: hasStroke ? (shapeItem.strokeWidth || 2) : 0,
        fill: shapeItem.strokeColor || '#000000',
        pointerLength: 10,
        pointerWidth: 8,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
    }
  } else if (item.type === 'text') {
    const textItem = item as TextPageItem;
    const hasFill = textItem.hasFill ?? true;
    const hasStroke = textItem.hasStroke ?? false;

    const textNode = new Konva.Text({
      x: xOffset + item.x,
      y: item.y,
      width: item.width,
      text: applyTextTransform(textItem.content, textItem.textTransform),
      fontSize: textItem.fontSize,
      fontFamily: textItem.fontFamily,
      fontStyle: `${textItem.fontWeight === 'bold' ? 'bold' : ''} ${textItem.fontStyle === 'italic' ? 'italic' : ''}`.trim() || 'normal',
      align: textItem.textAlign,
      rotation: item.rotation || 0,
      opacity,
      draggable: true,
    });

    // Apply fill if enabled (use measured height for gradients if item.height not set)
    if (hasFill) {
      // Get the actual text height for proper gradient calculation
      const textHeight = item.height || textNode.height() || textItem.fontSize * 1.2;
      applyFillToShape(textNode, textItem.fill, textItem.color, item.width, textHeight);
    } else {
      // When fill is disabled, make text transparent
      textNode.fill('transparent');
    }

    // Apply stroke if enabled
    if (hasStroke) {
      textNode.stroke(textItem.strokeColor || '#000000');
      textNode.strokeWidth(textItem.strokeWidth || 1);
    }

    node = textNode;
  } else if (item.type === 'textFlow') {
    const flowItem = item as TextFlowPageItem;
    const isPolygon =
      flowItem.flowShape === 'polygon' &&
      flowItem.polygonPoints &&
      flowItem.polygonPoints.length >= 3;

    // Absolute (item-local) polygon coords, used for both clipping and outline.
    const polygonAbs = isPolygon
      ? flowItem.polygonPoints!.map(p => ({
          x: p.x * item.width,
          y: p.y * item.height,
        }))
      : null;

    // Outer group: positioning + drag. Not clipped, so the polygon outline
    // and vertex handles can extend beyond the bounding box.
    const outerGroup = new Konva.Group({
      x: xOffset + item.x,
      y: item.y,
      rotation: item.rotation || 0,
      opacity,
      draggable: true,
      width: item.width,
      height: item.height,
    });

    // Fill + hit-area shape added FIRST so the flowed text sits on top of
    // any solid background. When stroke is enabled the outline gets the
    // user's color/width; otherwise we render a dashed gray editor-aid
    // that does NOT appear in the exported PDF.
    const userHasFill = flowItem.hasFill === true;
    const userHasStroke = flowItem.hasStroke === true;
    const fillColor = userHasFill
      ? (flowItem.fill?.type === 'color' ? (flowItem.fill?.color || '#ffffff') : '#ffffff')
      : 'rgba(0,0,0,0.001)';
    const userStrokeColor = flowItem.strokeColor || '#000000';
    const userStrokeWidth = flowItem.strokeWidth ?? 1;
    const strokeOffset = userHasStroke ? (flowItem.strokeOffset ?? 0) : 0;
    const fillOffset = userHasFill ? (flowItem.fillOffset ?? 0) : 0;
    // Real fill color value (used either on the outline path itself or on
    // a separate offset fill shape below it).
    const realFillColor = userHasFill
      ? (flowItem.fill?.type === 'color' ? (flowItem.fill?.color || '#ffffff') : '#ffffff')
      : null;
    // Offset fill renders separately. The main outline keeps a near-zero
    // alpha fill so it still catches clicks (and isn't visually filled twice).
    const outlineFill = fillOffset !== 0 && realFillColor !== null
      ? 'rgba(0,0,0,0.001)'
      : fillColor;
    // Fill node = original shape. Stroke is on it only when stroke is
    // enabled AND no offset (offset != 0 needs a separate stroke shape).
    const fillNodeStroke = userHasStroke && strokeOffset === 0 ? userStrokeColor : '#888888';
    const fillNodeStrokeWidth = userHasStroke && strokeOffset === 0 ? userStrokeWidth : 1;
    const fillNodeDash = userHasStroke ? undefined : [4, 4];

    // Offset fill: draws colored padding (or inset) around the polygon path.
    // Placed BEFORE the outline so the text and outline render on top.
    if (userHasFill && fillOffset !== 0 && realFillColor) {
      if (polygonAbs && flowItem.polygonPoints) {
        // Flatten any bezier edges, then run a true polygon offset so the
        // padding stays at uniform perpendicular distance from every edge.
        const flat = flattenPolygon(flowItem.polygonPoints, item.width, item.height);
        const offsetPts = offsetFlatPolygon(flat, fillOffset);
        outerGroup.add(new Konva.Path({
          data: buildFlatPath(offsetPts),
          fill: realFillColor,
          listening: true,
        }));
      } else {
        outerGroup.add(new Konva.Rect({
          x: -fillOffset,
          y: -fillOffset,
          width: item.width + fillOffset * 2,
          height: item.height + fillOffset * 2,
          fill: realFillColor,
          listening: true,
        }));
      }
    }

    // The polygon outline supports curved (bezier) edges when any vertex
    // is smooth, so it's rendered via Konva.Path. Straight all-corner
    // polygons still go through the same path renderer for simplicity.
    let polygonOutline: Konva.Path | Konva.Line | null = null;
    if (polygonAbs && flowItem.polygonPoints) {
      const pathData = buildPolygonPath(flowItem.polygonPoints, item.width, item.height);
      polygonOutline = new Konva.Path({
        data: pathData,
        stroke: fillNodeStroke,
        strokeWidth: fillNodeStrokeWidth,
        dash: fillNodeDash,
        fill: outlineFill,
        listening: true,
      });
      outerGroup.add(polygonOutline);
    } else {
      const bgRect = new Konva.Rect({
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
        stroke: fillNodeStroke,
        strokeWidth: fillNodeStrokeWidth,
        dash: fillNodeDash,
        fill: outlineFill,
        listening: true,
      });
      outerGroup.add(bgRect);
    }

    // Offset stroke: drawn as a separate outline shape sized at the offset
    // position so the stroke literally floats outside (or inside) the path.
    if (userHasStroke && strokeOffset !== 0) {
      if (polygonAbs && flowItem.polygonPoints) {
        const flat = flattenPolygon(flowItem.polygonPoints, item.width, item.height);
        const offsetPts = offsetFlatPolygon(flat, strokeOffset);
        outerGroup.add(new Konva.Path({
          data: buildFlatPath(offsetPts),
          stroke: userStrokeColor,
          strokeWidth: userStrokeWidth,
          listening: false,
        }));
      } else {
        outerGroup.add(new Konva.Rect({
          x: -strokeOffset,
          y: -strokeOffset,
          width: item.width + strokeOffset * 2,
          height: item.height + strokeOffset * 2,
          stroke: userStrokeColor,
          strokeWidth: userStrokeWidth,
          listening: false,
        }));
      }
    }

    // Inner group: clips the flowed text to the item's shape. Polygons
    // skip the clip — wrapping already respects the polygon's silhouette,
    // and descenders / ascenders should be free to extend past the edge.
    const contentGroup = new Konva.Group({
      x: 0,
      y: 0,
      width: item.width,
      height: item.height,
      listening: false,
      clipFunc: polygonAbs ? undefined : (ctx) => {
        ctx.rect(0, 0, item.width, item.height);
      },
    });
    drawTextFlowItemContent(contentGroup, flowItem);
    outerGroup.add(contentGroup);

    // Vertex-editing handles for polygons — appear only when the item is
    // selected (the editor re-renders on selection change). Added to the
    // outer (unclipped) group so they can be dragged past the bounding box.
    if (polygonOutline && polygonAbs) {
      addPolygonVertexHandles(outerGroup, polygonOutline, flowItem, pageNumber);
    }

    // Konva.Group satisfies the structural methods used by the shared setup
    // path (x, y, on, setAttr, etc.); cast through unknown to appease TS.
    node = outerGroup as unknown as Konva.Shape;
  } else if (item.type === 'image') {
    const imageItem = item as ImagePageItem;
    const imageFile = appState.getProject().files.find(f => f.id === imageItem.imageFileId);

    if (imageFile) {
      // Load image first, then create Konva.Image
      const img = new window.Image();
      img.src = `data:image/png;base64,${imageFile.content}`;

      const konvaImage = new Konva.Image({
        x: xOffset + item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        image: img,
        rotation: item.rotation || 0,
        opacity,
        draggable: true,
      });
      konvaImage.setAttr('itemId', item.id);
      konvaImage.setAttr('pageNumber', pageNumber);
      konvaImage.setAttr('xOffset', xOffset);
      konvaImage.setAttr('imageLoading', true);

      // Redraw when image loads and update transformer
      img.onload = () => {
        konvaImage.setAttr('imageLoading', false);
        itemsLayer.batchDraw();
        // If this item is selected, update the transformer
        if (appState.getEditor().selectedItemId === item.id) {
          updateTransformerFn();
        }
      };

      node = konvaImage;
    }
  }

  if (node) {
    node.setAttr('itemId', item.id);
    node.setAttr('pageNumber', pageNumber);
    node.setAttr('xOffset', xOffset);

    // Apply shadow if enabled (only Shape subclasses support shadows; the
    // textFlow group is skipped — its children can carry their own shadow).
    if (item.hasShadow && typeof (node as unknown as Konva.Shape).shadowEnabled === 'function') {
      const shape = node as unknown as Konva.Shape;
      shape.shadowEnabled(true);
      shape.shadowColor(item.shadowColor || '#000000');
      shape.shadowBlur(item.shadowBlur ?? 5);
      shape.shadowOffsetX(item.shadowOffsetX ?? 3);
      shape.shadowOffsetY(item.shadowOffsetY ?? 3);
      shape.shadowOpacity(item.shadowOpacity ?? 0.5);
    }

    // Handle click to select item and its page
    node.on('click tap', (e) => {
      // Determine page position (verso or recto) based on xOffset
      // xOffset is 0 for verso, pageWidth for recto
      const position = xOffset === 0 ? 'verso' : 'recto';
      const additive = e.evt?.shiftKey || false;

      // Update page position first
      appState.updateEditor({
        selectedPageNumber: pageNumber,
        selectedPagePosition: position,
      });

      // Then select the item (additive for shift+click)
      appState.selectItem(item.id, additive);
      switchToSelectedTab();
    });

    // Handle double-click for text editing
    if (item.type === 'text') {
      node.on('dblclick dbltap', () => {
        startTextEditing(node as Konva.Text, item as TextPageItem, pageNumber, xOffset, zoomLevel, stage, itemsLayer, transformer, updateTransformerFn);
      });
    }

    // Setup drag handling
    setupDragHandling(node, item, xOffset, pageNumber, itemsLayer, transformer);

    // Handle transform end to update size/rotation
    setupTransformHandling(node, item, xOffset, pageNumber);
  }

  return node;
}

/**
 * Setup drag handling for an item node
 */
function setupDragHandling(
  node: Konva.Shape | Konva.Text | Konva.Arrow,
  item: PageItem,
  xOffset: number,
  pageNumber: number,
  itemsLayer: Konva.Layer,
  transformer: Konva.Transformer
): void {
  // Multi-item drag state
  let isDuplicateDrag = false;
  let dragStartNodePositions: Map<string, { x: number; y: number }> = new Map();
  let initialDragPos = { x: 0, y: 0 };
  let dragStartItemData: Map<string, PageItem> = new Map();
  let originalOpacities: Map<string, number> = new Map();
  let ghostNodes: Konva.Node[] = [];

  node.on('dragstart', (e) => {
    const isAltKey = e.evt?.altKey || false;
    let editorState = appState.getEditor();
    let selectedIds = editorState.selectedItemIds;

    // Store initial node position
    initialDragPos = { x: node.x(), y: node.y() };

    // Option+drag: prepare for duplication with visual feedback
    if (isAltKey) {
      isDuplicateDrag = true;

      // If this item isn't selected, select it first
      if (!selectedIds.includes(item.id)) {
        const position = xOffset === 0 ? 'verso' : 'recto';
        appState.updateEditor({
          selectedPageNumber: pageNumber,
          selectedPagePosition: position,
        });
        appState.selectItem(item.id, false);
      }

      // Refresh state after potential selection change
      editorState = appState.getEditor();
      selectedIds = editorState.selectedItemIds;

      // Store complete item data and create visual ghosts for all selected items
      dragStartItemData.clear();
      originalOpacities.clear();
      ghostNodes.forEach(g => g.destroy());
      ghostNodes = [];

      for (const id of selectedIds) {
        const itemData = appState.getItemFromPage(pageNumber, id);
        const itemNode = id === item.id ? node : itemsLayer.findOne((n: Konva.Node) => n.getAttr('itemId') === id);
        if (itemData && itemNode) {
          // Deep clone the item data
          dragStartItemData.set(id, JSON.parse(JSON.stringify(itemData)));

          // Store original opacity and make dragged node semi-transparent
          originalOpacities.set(id, itemNode.opacity());
          itemNode.opacity(0.5);

          // Create a ghost (dashed outline) at the original position to show where original stays
          const ghost = new Konva.Rect({
            x: itemNode.x(),
            y: itemNode.y(),
            width: itemNode.width() || 50,
            height: itemNode.height() || 50,
            stroke: '#3b82f6',
            strokeWidth: 1,
            dash: [4, 4],
            fill: 'transparent',
            listening: false,
          });
          itemsLayer.add(ghost);
          ghostNodes.push(ghost);
        }
      }
      itemsLayer.batchDraw();
    }

    // Refresh state
    editorState = appState.getEditor();
    selectedIds = editorState.selectedItemIds;

    // If this item is part of a multi-selection, store node positions for synchronized movement
    if (selectedIds.includes(item.id) && selectedIds.length > 1) {
      dragStartNodePositions.clear();
      for (const id of selectedIds) {
        if (id !== item.id) {
          const otherNode = itemsLayer.findOne((n: Konva.Node) => n.getAttr('itemId') === id);
          if (otherNode) {
            dragStartNodePositions.set(id, { x: otherNode.x(), y: otherNode.y() });
          }
        }
      }
      // Detach transformer during multi-item drag to prevent jittering
      transformer.nodes([]);
      itemsLayer.batchDraw();
    }
  });

  // Handle drag move - synchronize all selected items
  node.on('dragmove', () => {
    const editorState = appState.getEditor();
    const selectedIds = editorState.selectedItemIds;

    // If multi-selection, move all other selected items by the same delta
    if (selectedIds.includes(item.id) && selectedIds.length > 1 && dragStartNodePositions.size > 0) {
      const dx = node.x() - initialDragPos.x;
      const dy = node.y() - initialDragPos.y;

      dragStartNodePositions.forEach((startPos, id) => {
        const otherNode = itemsLayer.findOne((n: Konva.Node) => n.getAttr('itemId') === id);
        if (otherNode) {
          otherNode.x(startPos.x + dx);
          otherNode.y(startPos.y + dy);
        }
      });

      itemsLayer.batchDraw();
    }
  });

  // Handle drag end to update positions
  node.on('dragend', () => {
    const editorState = appState.getEditor();
    const selectedIds = editorState.selectedItemIds;

    // Calculate the final delta
    const dx = node.x() - initialDragPos.x;
    const dy = node.y() - initialDragPos.y;

    // Clean up ghost nodes and restore opacities
    ghostNodes.forEach(g => g.destroy());
    ghostNodes = [];
    originalOpacities.forEach((opacity, id) => {
      const itemNode = id === item.id ? node : itemsLayer.findOne((n: Konva.Node) => n.getAttr('itemId') === id);
      if (itemNode) {
        itemNode.opacity(opacity);
      }
    });
    originalOpacities.clear();

    // If Option+drag, create copies at NEW positions and reset originals to their start positions
    if (isDuplicateDrag && dragStartItemData.size > 0) {
      const newItemIds: string[] = [];

      // Create copies at the new (dragged) positions
      for (const [originalId, originalItemData] of dragStartItemData) {
        // Create a copy with new ID at the NEW position (where user dropped)
        const copy: PageItem = {
          ...originalItemData,
          id: crypto.randomUUID(),
          x: originalItemData.x + dx,
          y: originalItemData.y + dy,
        };
        appState.addItemToPage(pageNumber, copy);
        newItemIds.push(copy.id);
      }

      // Select the new copies (this triggers render which re-attaches transformer)
      if (newItemIds.length > 0) {
        appState.selectItems(newItemIds);
      }

      dragStartItemData.clear();
      isDuplicateDrag = false;
      dragStartNodePositions.clear();
      // Transformer will be re-attached by the render triggered by addItemToPage/selectItems
      return; // Don't update original positions - they stay where they were
    }

    // Reset duplicate drag state
    isDuplicateDrag = false;

    // Update all selected items' positions
    if (selectedIds.includes(item.id) && selectedIds.length > 1) {
      // Multi-item drag: update all selected items
      for (const id of selectedIds) {
        const currentItem = appState.getItemFromPage(pageNumber, id);
        if (currentItem) {
          appState.updateItemOnPage(pageNumber, id, {
            x: currentItem.x + dx,
            y: currentItem.y + dy,
          });
        }
      }
    } else {
      // Single item drag
      let newX = node.x() - xOffset;
      let newY = node.y();

      // For centered shapes, convert back from center position to top-left
      if (item.type === 'shape') {
        const shapeItem = item as ShapePageItem;
        if (shapeItem.shapeType === 'ellipse') {
          newX -= item.width / 2;
          newY -= item.height / 2;
        } else if (shapeItem.shapeType === 'circle') {
          const radius = Math.min(item.width, item.height) / 2;
          newX -= radius;
          newY -= radius;
        }
      }

      appState.updateItemOnPage(pageNumber, item.id, { x: newX, y: newY });
    }

    // Clear drag state
    dragStartNodePositions.clear();
  });
}

/**
 * Setup transform handling for an item node
 */
function setupTransformHandling(
  node: Konva.Shape | Konva.Text | Konva.Arrow,
  item: PageItem,
  xOffset: number,
  pageNumber: number
): void {
  node.on('transformend', () => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();

    // Reset scale and apply to width/height
    node.scaleX(1);
    node.scaleY(1);

    let newWidth = item.width * scaleX;
    let newHeight = item.height * scaleY;
    let newX = node.x() - xOffset;
    let newY = node.y();

    // For text, get actual dimensions from the node and update width
    if (item.type === 'text') {
      const textNode = node as Konva.Text;
      newWidth = textNode.width() * scaleX;
      newHeight = textNode.height() * scaleY;
      // Apply new width to the text node for proper wrapping
      textNode.width(newWidth);
    }

    // For ellipse, we need to handle differently since it's centered
    if (item.type === 'shape' && (item as ShapePageItem).shapeType === 'ellipse') {
      const ellipse = node as Konva.Ellipse;
      newWidth = ellipse.radiusX() * 2 * scaleX;
      newHeight = ellipse.radiusY() * 2 * scaleY;
      ellipse.radiusX(newWidth / 2);
      ellipse.radiusY(newHeight / 2);
      // Convert from center to top-left
      newX -= newWidth / 2;
      newY -= newHeight / 2;
    }

    // For circle, update both width and height to maintain aspect
    if (item.type === 'shape' && (item as ShapePageItem).shapeType === 'circle') {
      const circle = node as Konva.Circle;
      const newRadius = circle.radius() * Math.max(scaleX, scaleY);
      circle.radius(newRadius);
      newWidth = newRadius * 2;
      newHeight = newRadius * 2;
      // Convert from center to top-left
      newX -= newRadius;
      newY -= newRadius;
    }

    appState.updateItemOnPage(pageNumber, item.id, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      rotation: rotation,
    });
  });
}
