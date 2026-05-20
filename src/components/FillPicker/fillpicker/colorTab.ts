/**
 * Color tab rendering for FillPicker
 */

import { hsvToHex, hexToHsv } from './colorUtils';
import type { FillConfig } from '../../../types';

export interface ColorTabState {
  hue: number;
  saturation: number;
  value: number;
  fill: FillConfig;
  satValCanvas: HTMLCanvasElement | null;
  hueSlider: HTMLElement | null;
}

export interface ColorTabCallbacks {
  onColorChange: (hue: number, saturation: number, value: number) => void;
  render: () => void;
  setSatValCanvas: (canvas: HTMLCanvasElement) => void;
  setHueSlider: (slider: HTMLElement) => void;
}

/**
 * Render the color tab content
 */
export function renderColorTab(
  container: HTMLElement,
  state: ColorTabState,
  callbacks: ColorTabCallbacks
): void {
  // Saturation/Value area
  const satValArea = document.createElement('div');
  satValArea.className = 'fill-satval-area';

  const satValCanvas = document.createElement('canvas');
  satValCanvas.width = 200;
  satValCanvas.height = 150;
  satValCanvas.className = 'fill-satval-canvas';
  callbacks.setSatValCanvas(satValCanvas);

  drawSatValCanvas(satValCanvas, state.hue, state.saturation, state.value);

  // Handle clicks/drags on sat-val area
  const handleSatVal = (e: MouseEvent) => {
    const rect = satValCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newSaturation = x;
    const newValue = 1 - y;
    drawSatValCanvas(satValCanvas, state.hue, newSaturation, newValue);
    callbacks.onColorChange(state.hue, newSaturation, newValue);
  };

  satValCanvas.addEventListener('mousedown', (e) => {
    handleSatVal(e);
    const onMove = (e: MouseEvent) => handleSatVal(e);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  satValArea.appendChild(satValCanvas);
  container.appendChild(satValArea);

  // Hue slider
  const hueRow = document.createElement('div');
  hueRow.className = 'fill-hue-row';

  const hueSlider = document.createElement('div');
  hueSlider.className = 'fill-hue-slider';
  callbacks.setHueSlider(hueSlider);

  const hueTrack = document.createElement('div');
  hueTrack.className = 'fill-hue-track';

  const hueThumb = document.createElement('div');
  hueThumb.className = 'fill-hue-thumb';
  hueThumb.style.left = `${(state.hue / 360) * 100}%`;

  hueSlider.appendChild(hueTrack);
  hueSlider.appendChild(hueThumb);

  const handleHue = (e: MouseEvent) => {
    const rect = hueSlider.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newHue = x * 360;
    hueThumb.style.left = `${x * 100}%`;
    drawSatValCanvas(satValCanvas, newHue, state.saturation, state.value);
    callbacks.onColorChange(newHue, state.saturation, state.value);
  };

  hueSlider.addEventListener('mousedown', (e) => {
    handleHue(e);
    const onMove = (e: MouseEvent) => handleHue(e);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  hueRow.appendChild(hueSlider);
  container.appendChild(hueRow);

  // Hex input
  const hexRow = document.createElement('div');
  hexRow.className = 'fill-hex-row';

  const hexLabel = document.createElement('label');
  hexLabel.textContent = 'Hex: ';

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'fill-hex-input';
  hexInput.value = state.fill.color || hsvToHex(state.hue, state.saturation, state.value);
  hexInput.addEventListener('change', () => {
    const hex = hexInput.value.startsWith('#') ? hexInput.value : '#' + hexInput.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const hsv = hexToHsv(hex);
      drawSatValCanvas(satValCanvas, hsv.h, hsv.s, hsv.v);
      hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
      callbacks.onColorChange(hsv.h, hsv.s, hsv.v);
    }
  });

  hexRow.appendChild(hexLabel);
  hexRow.appendChild(hexInput);
  container.appendChild(hexRow);

  // Preset colors
  const presets = document.createElement('div');
  presets.className = 'fill-presets';

  const presetColors = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ff00ff', '#00ffff', '#ff6600', '#6600ff',
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'
  ];

  presetColors.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'fill-preset-swatch';
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      const hsv = hexToHsv(color);
      // Update the picker's internal HSV state first so the subsequent
      // re-render reads the new hue/saturation/value.
      callbacks.onColorChange(hsv.h, hsv.s, hsv.v);
      callbacks.render();
    });
    presets.appendChild(swatch);
  });

  container.appendChild(presets);
}

/**
 * Draw the saturation/value canvas
 */
export function drawSatValCanvas(
  canvas: HTMLCanvasElement,
  hue: number,
  saturation: number,
  value: number
): void {
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;

  // Base hue color
  const hueColor = hsvToHex(hue, 1, 1);

  // White to hue gradient (horizontal)
  const gradH = ctx.createLinearGradient(0, 0, width, 0);
  gradH.addColorStop(0, '#ffffff');
  gradH.addColorStop(1, hueColor);
  ctx.fillStyle = gradH;
  ctx.fillRect(0, 0, width, height);

  // Transparent to black gradient (vertical)
  const gradV = ctx.createLinearGradient(0, 0, 0, height);
  gradV.addColorStop(0, 'rgba(0,0,0,0)');
  gradV.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = gradV;
  ctx.fillRect(0, 0, width, height);

  // Draw selector circle
  const x = saturation * width;
  const y = (1 - value) * height;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();
}
