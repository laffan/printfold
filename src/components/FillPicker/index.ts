/**
 * FillPicker Component
 * Provides color, gradient, and pattern fill options for shapes
 */

import { appState } from '../../services/state';
import type {
  FillConfig,
  FillType,
  GradientStop,
  LinearGradientConfig,
  RadialGradientConfig,
  PatternConfig,
  createDefaultFill,
  ProjectFile
} from '../../types';

export class FillPicker {
  private container: HTMLElement;
  private fill: FillConfig;
  private onChange: (fill: FillConfig) => void;
  private isOpen = false;
  private activeTab: FillType = 'color';

  // Color picker state
  private hue = 210;
  private saturation = 0.6;
  private value = 0.8;

  // Gradient state
  private gradientStops: GradientStop[] = [];
  private selectedStopIndex = 0;
  private gradientAngle = 0;
  private isRadial = false;
  private radialCenterX = 0.5;
  private radialCenterY = 0.5;

  // Canvas refs for color picker
  private satValCanvas: HTMLCanvasElement | null = null;
  private hueSlider: HTMLElement | null = null;
  private gradientCanvas: HTMLCanvasElement | null = null;

  constructor(
    container: HTMLElement,
    initialFill: FillConfig,
    onChange: (fill: FillConfig) => void
  ) {
    this.container = container;
    this.fill = initialFill;
    this.onChange = onChange;
    this.initFromFill(initialFill);
    this.render();
  }

  private initFromFill(fill: FillConfig): void {
    this.activeTab = fill.type;

    if (fill.type === 'color' && fill.color) {
      const hsv = hexToHsv(fill.color);
      this.hue = hsv.h;
      this.saturation = hsv.s;
      this.value = hsv.v;
    } else if (fill.type === 'linearGradient' && fill.linearGradient) {
      this.gradientStops = [...fill.linearGradient.stops];
      this.gradientAngle = fill.linearGradient.angle;
      this.isRadial = false;
    } else if (fill.type === 'radialGradient' && fill.radialGradient) {
      this.gradientStops = [...fill.radialGradient.stops];
      this.radialCenterX = fill.radialGradient.centerX;
      this.radialCenterY = fill.radialGradient.centerY;
      this.isRadial = true;
    }

    if (this.gradientStops.length === 0) {
      this.gradientStops = [
        { offset: 0, color: '#3b82f6' },
        { offset: 1, color: '#8b5cf6' }
      ];
    }
  }

  setFill(fill: FillConfig): void {
    this.fill = fill;
    this.initFromFill(fill);
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'fill-picker';

    // Preview swatch that opens/closes the picker
    const preview = document.createElement('div');
    preview.className = 'fill-preview';
    preview.style.background = this.getFillPreviewStyle();
    preview.addEventListener('click', () => this.togglePicker());
    this.container.appendChild(preview);

    // Dropdown panel
    if (this.isOpen) {
      const panel = document.createElement('div');
      panel.className = 'fill-picker-panel';

      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'fill-tabs';

      const tabTypes: { type: FillType; label: string }[] = [
        { type: 'color', label: 'Color' },
        { type: 'linearGradient', label: 'Gradient' },
        { type: 'pattern', label: 'Pattern' }
      ];

      tabTypes.forEach(({ type, label }) => {
        const tab = document.createElement('button');
        tab.className = 'fill-tab' + (this.activeTab === type || (this.activeTab === 'radialGradient' && type === 'linearGradient') ? ' active' : '');
        tab.textContent = label;
        tab.addEventListener('click', () => {
          this.activeTab = type;
          this.render();
        });
        tabs.appendChild(tab);
      });
      panel.appendChild(tabs);

      // Tab content
      const content = document.createElement('div');
      content.className = 'fill-tab-content';

      if (this.activeTab === 'color') {
        this.renderColorTab(content);
      } else if (this.activeTab === 'linearGradient' || this.activeTab === 'radialGradient') {
        this.renderGradientTab(content);
      } else if (this.activeTab === 'pattern') {
        this.renderPatternTab(content);
      }

      panel.appendChild(content);
      this.container.appendChild(panel);
    }
  }

  private renderColorTab(container: HTMLElement): void {
    // Saturation/Value area
    const satValArea = document.createElement('div');
    satValArea.className = 'fill-satval-area';

    const satValCanvas = document.createElement('canvas');
    satValCanvas.width = 200;
    satValCanvas.height = 150;
    satValCanvas.className = 'fill-satval-canvas';
    this.satValCanvas = satValCanvas;

    this.drawSatValCanvas();

    // Handle clicks/drags on sat-val area
    const handleSatVal = (e: MouseEvent) => {
      const rect = satValCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.saturation = x;
      this.value = 1 - y;
      this.drawSatValCanvas();
      this.updateColorFromHsv();
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
    this.hueSlider = hueSlider;

    const hueTrack = document.createElement('div');
    hueTrack.className = 'fill-hue-track';

    const hueThumb = document.createElement('div');
    hueThumb.className = 'fill-hue-thumb';
    hueThumb.style.left = `${(this.hue / 360) * 100}%`;

    hueSlider.appendChild(hueTrack);
    hueSlider.appendChild(hueThumb);

    const handleHue = (e: MouseEvent) => {
      const rect = hueSlider.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.hue = x * 360;
      hueThumb.style.left = `${x * 100}%`;
      this.drawSatValCanvas();
      this.updateColorFromHsv();
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
    hexInput.value = this.fill.color || hsvToHex(this.hue, this.saturation, this.value);
    hexInput.addEventListener('change', () => {
      const hex = hexInput.value.startsWith('#') ? hexInput.value : '#' + hexInput.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        const hsv = hexToHsv(hex);
        this.hue = hsv.h;
        this.saturation = hsv.s;
        this.value = hsv.v;
        this.drawSatValCanvas();
        this.updateColorFromHsv();
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
        this.hue = hsv.h;
        this.saturation = hsv.s;
        this.value = hsv.v;
        this.render();
        this.updateColorFromHsv();
      });
      presets.appendChild(swatch);
    });

    container.appendChild(presets);
  }

  private renderGradientTab(container: HTMLElement): void {
    // Linear/Radial toggle
    const typeToggle = document.createElement('div');
    typeToggle.className = 'fill-gradient-type';

    const linearBtn = document.createElement('button');
    linearBtn.className = 'fill-type-btn' + (!this.isRadial ? ' active' : '');
    linearBtn.textContent = 'Linear';
    linearBtn.addEventListener('click', () => {
      this.isRadial = false;
      this.activeTab = 'linearGradient';
      this.render();
      this.updateGradient();
    });

    const radialBtn = document.createElement('button');
    radialBtn.className = 'fill-type-btn' + (this.isRadial ? ' active' : '');
    radialBtn.textContent = 'Radial';
    radialBtn.addEventListener('click', () => {
      this.isRadial = true;
      this.activeTab = 'radialGradient';
      this.render();
      this.updateGradient();
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
    this.gradientCanvas = gradientCanvas;
    this.drawGradientCanvas();

    gradientBar.appendChild(gradientCanvas);

    // Render stop handles
    const stopsContainer = document.createElement('div');
    stopsContainer.className = 'fill-stops-container';

    this.gradientStops.forEach((stop, index) => {
      const handle = document.createElement('div');
      handle.className = 'fill-stop-handle' + (index === this.selectedStopIndex ? ' selected' : '');
      handle.style.left = `${stop.offset * 100}%`;
      handle.style.background = stop.color;

      handle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedStopIndex = index;
        this.render();
      });

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = stopsContainer.getBoundingClientRect();

        const onMove = (e: MouseEvent) => {
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          this.gradientStops[index].offset = x;
          // Sort stops by offset
          this.gradientStops.sort((a, b) => a.offset - b.offset);
          this.selectedStopIndex = this.gradientStops.findIndex(s => s === this.gradientStops.find(st => st.offset === x));
          this.drawGradientCanvas();
          this.render();
          this.updateGradient();
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
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
      const color = this.interpolateGradientColor(offset);
      this.gradientStops.push({ offset, color });
      this.gradientStops.sort((a, b) => a.offset - b.offset);
      this.selectedStopIndex = this.gradientStops.findIndex(s => s.offset === offset);
      this.render();
      this.updateGradient();
    });

    gradientBar.appendChild(stopsContainer);
    container.appendChild(gradientBar);

    // Selected stop color picker (simple hex input)
    if (this.gradientStops.length > 0) {
      const stopColorRow = document.createElement('div');
      stopColorRow.className = 'fill-stop-color-row';

      const colorLabel = document.createElement('label');
      colorLabel.textContent = 'Stop Color: ';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = this.gradientStops[this.selectedStopIndex]?.color || '#000000';
      colorInput.addEventListener('input', () => {
        if (this.gradientStops[this.selectedStopIndex]) {
          this.gradientStops[this.selectedStopIndex].color = colorInput.value;
          this.drawGradientCanvas();
          this.updateGradient();
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'fill-stop-delete';
      deleteBtn.textContent = '×';
      deleteBtn.disabled = this.gradientStops.length <= 2;
      deleteBtn.addEventListener('click', () => {
        if (this.gradientStops.length > 2) {
          this.gradientStops.splice(this.selectedStopIndex, 1);
          this.selectedStopIndex = Math.max(0, this.selectedStopIndex - 1);
          this.render();
          this.updateGradient();
        }
      });

      stopColorRow.appendChild(colorLabel);
      stopColorRow.appendChild(colorInput);
      stopColorRow.appendChild(deleteBtn);
      container.appendChild(stopColorRow);
    }

    // Angle slider (for linear) or center controls (for radial)
    if (!this.isRadial) {
      const angleRow = document.createElement('div');
      angleRow.className = 'fill-angle-row';

      const angleLabel = document.createElement('label');
      angleLabel.textContent = 'Angle: ';

      const angleInput = document.createElement('input');
      angleInput.type = 'range';
      angleInput.min = '0';
      angleInput.max = '360';
      angleInput.value = this.gradientAngle.toString();
      angleInput.addEventListener('input', () => {
        this.gradientAngle = parseInt(angleInput.value);
        angleValue.textContent = `${this.gradientAngle}°`;
        this.updateGradient();
      });

      const angleValue = document.createElement('span');
      angleValue.className = 'fill-angle-value';
      angleValue.textContent = `${this.gradientAngle}°`;

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
      centerXInput.value = (this.radialCenterX * 100).toString();
      centerXInput.addEventListener('input', () => {
        this.radialCenterX = parseInt(centerXInput.value) / 100;
        this.updateGradient();
      });

      const centerYLabel = document.createElement('label');
      centerYLabel.textContent = 'Center Y: ';
      const centerYInput = document.createElement('input');
      centerYInput.type = 'range';
      centerYInput.min = '0';
      centerYInput.max = '100';
      centerYInput.value = (this.radialCenterY * 100).toString();
      centerYInput.addEventListener('input', () => {
        this.radialCenterY = parseInt(centerYInput.value) / 100;
        this.updateGradient();
      });

      centerRow.appendChild(centerXLabel);
      centerRow.appendChild(centerXInput);
      centerRow.appendChild(centerYLabel);
      centerRow.appendChild(centerYInput);
      container.appendChild(centerRow);
    }
  }

  private renderPatternTab(container: HTMLElement): void {
    const imageList = document.createElement('div');
    imageList.className = 'fill-pattern-images';

    // Get all image files from project
    const project = appState.getProject();
    const imageFiles = project.files.filter(f => f.type === 'image');

    if (imageFiles.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'fill-pattern-empty';
      emptyMsg.textContent = 'No images in project. Add images to use as patterns.';
      container.appendChild(emptyMsg);
      return;
    }

    const currentPatternId = this.fill.type === 'pattern' ? this.fill.pattern?.imageFileId : null;

    imageFiles.forEach(file => {
      const thumb = document.createElement('div');
      thumb.className = 'fill-pattern-thumb' + (file.id === currentPatternId ? ' selected' : '');

      const img = document.createElement('img');
      img.src = `data:image/png;base64,${file.content}`;
      img.alt = file.name;
      thumb.appendChild(img);

      thumb.addEventListener('click', () => {
        this.fill = {
          type: 'pattern',
          pattern: {
            imageFileId: file.id,
            repeat: 'repeat',
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0
          }
        };
        this.render();
        this.onChange(this.fill);
      });

      imageList.appendChild(thumb);
    });

    container.appendChild(imageList);

    // Pattern options if a pattern is selected
    if (this.fill.type === 'pattern' && this.fill.pattern?.imageFileId) {
      const optionsSection = document.createElement('div');
      optionsSection.className = 'fill-pattern-options';

      // Repeat mode
      const repeatRow = document.createElement('div');
      repeatRow.className = 'fill-pattern-row';

      const repeatLabel = document.createElement('label');
      repeatLabel.textContent = 'Repeat: ';

      const repeatSelect = document.createElement('select');
      const repeatModes = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat'];
      repeatModes.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = mode;
        option.selected = this.fill.pattern?.repeat === mode;
        repeatSelect.appendChild(option);
      });
      repeatSelect.addEventListener('change', () => {
        if (this.fill.pattern) {
          this.fill.pattern.repeat = repeatSelect.value as PatternConfig['repeat'];
          this.onChange(this.fill);
        }
      });

      repeatRow.appendChild(repeatLabel);
      repeatRow.appendChild(repeatSelect);
      optionsSection.appendChild(repeatRow);

      // Scale
      const scaleRow = document.createElement('div');
      scaleRow.className = 'fill-pattern-row';

      const scaleLabel = document.createElement('label');
      scaleLabel.textContent = 'Scale: ';

      const scaleInput = document.createElement('input');
      scaleInput.type = 'range';
      scaleInput.min = '10';
      scaleInput.max = '200';
      scaleInput.value = ((this.fill.pattern?.scale || 1) * 100).toString();
      scaleInput.addEventListener('input', () => {
        if (this.fill.pattern) {
          this.fill.pattern.scale = parseInt(scaleInput.value) / 100;
          scaleValue.textContent = `${scaleInput.value}%`;
          this.onChange(this.fill);
        }
      });

      const scaleValue = document.createElement('span');
      scaleValue.textContent = `${(this.fill.pattern?.scale || 1) * 100}%`;

      scaleRow.appendChild(scaleLabel);
      scaleRow.appendChild(scaleInput);
      scaleRow.appendChild(scaleValue);
      optionsSection.appendChild(scaleRow);

      container.appendChild(optionsSection);
    }
  }

  private drawSatValCanvas(): void {
    if (!this.satValCanvas) return;

    const ctx = this.satValCanvas.getContext('2d')!;
    const width = this.satValCanvas.width;
    const height = this.satValCanvas.height;

    // Base hue color
    const hueColor = hsvToHex(this.hue, 1, 1);

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
    const x = this.saturation * width;
    const y = (1 - this.value) * height;
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

  private drawGradientCanvas(): void {
    if (!this.gradientCanvas) return;

    const ctx = this.gradientCanvas.getContext('2d')!;
    const width = this.gradientCanvas.width;
    const height = this.gradientCanvas.height;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    this.gradientStops.forEach(stop => {
      gradient.addColorStop(stop.offset, stop.color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private interpolateGradientColor(offset: number): string {
    const stops = [...this.gradientStops].sort((a, b) => a.offset - b.offset);

    if (offset <= stops[0].offset) return stops[0].color;
    if (offset >= stops[stops.length - 1].offset) return stops[stops.length - 1].color;

    for (let i = 0; i < stops.length - 1; i++) {
      if (offset >= stops[i].offset && offset <= stops[i + 1].offset) {
        const t = (offset - stops[i].offset) / (stops[i + 1].offset - stops[i].offset);
        return lerpColor(stops[i].color, stops[i + 1].color, t);
      }
    }

    return stops[0].color;
  }

  private updateColorFromHsv(): void {
    const color = hsvToHex(this.hue, this.saturation, this.value);
    this.fill = { type: 'color', color };
    this.render();
    this.onChange(this.fill);
  }

  private updateGradient(): void {
    if (this.isRadial) {
      this.fill = {
        type: 'radialGradient',
        radialGradient: {
          centerX: this.radialCenterX,
          centerY: this.radialCenterY,
          radius: 0.5,
          stops: [...this.gradientStops]
        }
      };
    } else {
      this.fill = {
        type: 'linearGradient',
        linearGradient: {
          angle: this.gradientAngle,
          stops: [...this.gradientStops]
        }
      };
    }
    this.onChange(this.fill);
  }

  private getFillPreviewStyle(): string {
    if (this.fill.type === 'color') {
      return this.fill.color || '#cccccc';
    } else if (this.fill.type === 'linearGradient' && this.fill.linearGradient) {
      const stops = this.fill.linearGradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ');
      return `linear-gradient(${this.fill.linearGradient.angle}deg, ${stops})`;
    } else if (this.fill.type === 'radialGradient' && this.fill.radialGradient) {
      const stops = this.fill.radialGradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ');
      const cx = this.fill.radialGradient.centerX * 100;
      const cy = this.fill.radialGradient.centerY * 100;
      return `radial-gradient(circle at ${cx}% ${cy}%, ${stops})`;
    } else if (this.fill.type === 'pattern' && this.fill.pattern?.imageFileId) {
      const file = appState.getProject().files.find(f => f.id === this.fill.pattern?.imageFileId);
      if (file) {
        return `url(data:image/png;base64,${file.content})`;
      }
    }
    return '#cccccc';
  }

  private togglePicker(): void {
    this.isOpen = !this.isOpen;
    this.render();

    // Close on outside click
    if (this.isOpen) {
      const closeHandler = (e: MouseEvent) => {
        if (!this.container.contains(e.target as Node)) {
          this.isOpen = false;
          this.render();
          document.removeEventListener('click', closeHandler);
        }
      };
      // Delay to avoid closing immediately
      setTimeout(() => {
        document.addEventListener('click', closeHandler);
      }, 0);
    }
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}

// Color utility functions
function hsvToHex(h: number, s: number, v: number): string {
  const hi = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r: number, g: number, b: number;
  switch (hi) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }

  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, v: 0 };

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return { h, s, v };
}

function lerpColor(color1: string, color2: string, t: number): string {
  const hex1 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color1);
  const hex2 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color2);

  if (!hex1 || !hex2) return color1;

  const r = Math.round(parseInt(hex1[1], 16) + (parseInt(hex2[1], 16) - parseInt(hex1[1], 16)) * t);
  const g = Math.round(parseInt(hex1[2], 16) + (parseInt(hex2[2], 16) - parseInt(hex1[2], 16)) * t);
  const b = Math.round(parseInt(hex1[3], 16) + (parseInt(hex2[3], 16) - parseInt(hex1[3], 16)) * t);

  const toHex = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Export a factory function
export function createFillPicker(
  container: HTMLElement,
  initialFill: FillConfig,
  onChange: (fill: FillConfig) => void
): FillPicker {
  return new FillPicker(container, initialFill, onChange);
}
