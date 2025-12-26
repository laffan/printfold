/**
 * Gradient tab rendering for FillPicker
 */

import { lerpColor } from './colorUtils';
import type { GradientStop, FillType } from '../../../types';

export interface GradientTabState {
  isRadial: boolean;
  gradientStops: GradientStop[];
  selectedStopIndex: number;
  gradientAngle: number;
  radialCenterX: number;
  radialCenterY: number;
  gradientCanvas: HTMLCanvasElement | null;
  panelElement: HTMLElement | null;
  activeTab: FillType;
}

export interface GradientTabCallbacks {
  render: () => void;
  renderTabContent: (panel: HTMLElement) => void;
  updateGradient: () => void;
  setIsRadial: (isRadial: boolean) => void;
  setActiveTab: (tab: FillType) => void;
  setSelectedStopIndex: (index: number) => void;
  setGradientStops: (stops: GradientStop[]) => void;
  setGradientAngle: (angle: number) => void;
  setRadialCenterX: (x: number) => void;
  setRadialCenterY: (y: number) => void;
  setGradientCanvas: (canvas: HTMLCanvasElement) => void;
}

/**
 * Render the gradient tab content
 */
export function renderGradientTab(
  container: HTMLElement,
  state: GradientTabState,
  callbacks: GradientTabCallbacks
): void {
  // Linear/Radial toggle
  const typeToggle = document.createElement('div');
  typeToggle.className = 'fill-gradient-type';

  const linearBtn = document.createElement('button');
  linearBtn.className = 'fill-type-btn' + (!state.isRadial ? ' active' : '');
  linearBtn.textContent = 'Linear';
  linearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.setIsRadial(false);
    callbacks.setActiveTab('linearGradient');
    if (state.panelElement) {
      callbacks.renderTabContent(state.panelElement);
    }
    callbacks.updateGradient();
  });

  const radialBtn = document.createElement('button');
  radialBtn.className = 'fill-type-btn' + (state.isRadial ? ' active' : '');
  radialBtn.textContent = 'Radial';
  radialBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.setIsRadial(true);
    callbacks.setActiveTab('radialGradient');
    if (state.panelElement) {
      callbacks.renderTabContent(state.panelElement);
    }
    callbacks.updateGradient();
  });

  typeToggle.appendChild(linearBtn);
  typeToggle.appendChild(radialBtn);
  container.appendChild(typeToggle);

  // Gradient preview bar with draggable stops
  const gradientBar = document.createElement('div');
  gradientBar.className = 'fill-gradient-bar';

  const gradientCanvas = document.createElement('canvas');
  gradientCanvas.width = 200;
  gradientCanvas.height = 24;
  gradientCanvas.className = 'fill-gradient-canvas';
  callbacks.setGradientCanvas(gradientCanvas);
  drawGradientCanvas(gradientCanvas, state.gradientStops);

  gradientBar.appendChild(gradientCanvas);

  // Render stop handles
  const stopsContainer = document.createElement('div');
  stopsContainer.className = 'fill-stops-container';

  state.gradientStops.forEach((stop, index) => {
    const handle = document.createElement('div');
    handle.className = 'fill-stop-handle' + (index === state.selectedStopIndex ? ' selected' : '');
    handle.style.left = `${stop.offset * 100}%`;
    handle.style.background = stop.color;

    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.setSelectedStopIndex(index);
      callbacks.render();
    });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = stopsContainer.getBoundingClientRect();
      callbacks.setSelectedStopIndex(index);

      // Track the stop being dragged
      const draggedStop = state.gradientStops[index];

      const onMove = (e: MouseEvent) => {
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        draggedStop.offset = x;

        // Update handle position directly without re-rendering
        handle.style.left = `${x * 100}%`;

        // Redraw gradient canvas (lightweight operation)
        drawGradientCanvas(gradientCanvas, state.gradientStops);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        // Sort stops by offset now that dragging is complete
        const sortedStops = [...state.gradientStops].sort((a, b) => a.offset - b.offset);
        const newIndex = sortedStops.indexOf(draggedStop);
        callbacks.setGradientStops(sortedStops);
        callbacks.setSelectedStopIndex(newIndex);

        // Update state and re-render only once at the end
        callbacks.updateGradient();
        if (state.panelElement) {
          callbacks.renderTabContent(state.panelElement);
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    stopsContainer.appendChild(handle);
  });

  // Click on bar to add stop
  gradientCanvas.addEventListener('dblclick', (e) => {
    const rect = gradientCanvas.getBoundingClientRect();
    const offset = (e.clientX - rect.left) / rect.width;
    const color = interpolateGradientColor(state.gradientStops, offset);
    const newStops = [...state.gradientStops, { offset, color }].sort((a, b) => a.offset - b.offset);
    callbacks.setGradientStops(newStops);
    callbacks.setSelectedStopIndex(newStops.findIndex(s => s.offset === offset));
    callbacks.render();
    callbacks.updateGradient();
  });

  gradientBar.appendChild(stopsContainer);
  container.appendChild(gradientBar);

  // Selected stop color picker (simple hex input)
  if (state.gradientStops.length > 0) {
    const stopColorRow = document.createElement('div');
    stopColorRow.className = 'fill-stop-color-row';

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Stop Color: ';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = state.gradientStops[state.selectedStopIndex]?.color || '#000000';
    colorInput.addEventListener('input', () => {
      if (state.gradientStops[state.selectedStopIndex]) {
        state.gradientStops[state.selectedStopIndex].color = colorInput.value;
        drawGradientCanvas(gradientCanvas, state.gradientStops);
        callbacks.updateGradient();
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'fill-stop-delete';
    deleteBtn.textContent = '×';
    deleteBtn.disabled = state.gradientStops.length <= 2;
    deleteBtn.addEventListener('click', () => {
      if (state.gradientStops.length > 2) {
        const newStops = state.gradientStops.filter((_, i) => i !== state.selectedStopIndex);
        callbacks.setGradientStops(newStops);
        callbacks.setSelectedStopIndex(Math.max(0, state.selectedStopIndex - 1));
        callbacks.render();
        callbacks.updateGradient();
      }
    });

    stopColorRow.appendChild(colorLabel);
    stopColorRow.appendChild(colorInput);
    stopColorRow.appendChild(deleteBtn);
    container.appendChild(stopColorRow);
  }

  // Angle slider (for linear) or center controls (for radial)
  if (!state.isRadial) {
    const angleRow = document.createElement('div');
    angleRow.className = 'fill-angle-row';

    const angleLabel = document.createElement('label');
    angleLabel.textContent = 'Angle: ';

    const angleInput = document.createElement('input');
    angleInput.type = 'range';
    angleInput.min = '0';
    angleInput.max = '360';
    angleInput.value = state.gradientAngle.toString();

    const angleValue = document.createElement('span');
    angleValue.className = 'fill-angle-value';
    angleValue.textContent = `${state.gradientAngle}°`;

    angleInput.addEventListener('input', () => {
      callbacks.setGradientAngle(parseInt(angleInput.value));
      angleValue.textContent = `${angleInput.value}°`;
    });
    angleInput.addEventListener('change', () => {
      callbacks.updateGradient();
    });

    angleRow.appendChild(angleLabel);
    angleRow.appendChild(angleInput);
    angleRow.appendChild(angleValue);
    container.appendChild(angleRow);
  } else {
    const centerRow = document.createElement('div');
    centerRow.className = 'fill-center-row';

    const centerXLabel = document.createElement('label');
    centerXLabel.textContent = 'Center X: ';
    const centerXInput = document.createElement('input');
    centerXInput.type = 'range';
    centerXInput.min = '0';
    centerXInput.max = '100';
    centerXInput.value = (state.radialCenterX * 100).toString();
    centerXInput.addEventListener('input', () => {
      callbacks.setRadialCenterX(parseInt(centerXInput.value) / 100);
    });
    centerXInput.addEventListener('change', () => {
      callbacks.updateGradient();
    });

    const centerYLabel = document.createElement('label');
    centerYLabel.textContent = 'Center Y: ';
    const centerYInput = document.createElement('input');
    centerYInput.type = 'range';
    centerYInput.min = '0';
    centerYInput.max = '100';
    centerYInput.value = (state.radialCenterY * 100).toString();
    centerYInput.addEventListener('input', () => {
      callbacks.setRadialCenterY(parseInt(centerYInput.value) / 100);
    });
    centerYInput.addEventListener('change', () => {
      callbacks.updateGradient();
    });

    centerRow.appendChild(centerXLabel);
    centerRow.appendChild(centerXInput);
    centerRow.appendChild(centerYLabel);
    centerRow.appendChild(centerYInput);
    container.appendChild(centerRow);
  }
}

/**
 * Draw the gradient preview canvas
 */
export function drawGradientCanvas(canvas: HTMLCanvasElement, stops: GradientStop[]): void {
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  stops.forEach(stop => {
    gradient.addColorStop(stop.offset, stop.color);
  });

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Interpolate color at a position in the gradient
 */
export function interpolateGradientColor(stops: GradientStop[], offset: number): string {
  const sortedStops = [...stops].sort((a, b) => a.offset - b.offset);

  if (offset <= sortedStops[0].offset) return sortedStops[0].color;
  if (offset >= sortedStops[sortedStops.length - 1].offset) return sortedStops[sortedStops.length - 1].color;

  for (let i = 0; i < sortedStops.length - 1; i++) {
    if (offset >= sortedStops[i].offset && offset <= sortedStops[i + 1].offset) {
      const t = (offset - sortedStops[i].offset) / (sortedStops[i + 1].offset - sortedStops[i].offset);
      return lerpColor(sortedStops[i].color, sortedStops[i + 1].color, t);
    }
  }

  return sortedStops[0].color;
}
