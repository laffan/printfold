/**
 * FillPicker Component
 * Provides color, gradient, and pattern fill options for shapes
 */

import { appState } from '../../../services/state';
import { hsvToHex, hexToHsv } from './colorUtils';
import { renderColorTab, drawSatValCanvas } from './colorTab';
import { renderGradientTab, drawGradientCanvas, interpolateGradientColor } from './gradientTab';
import { renderPatternTab } from './patternTab';
import type { FillConfig, FillType, GradientStop } from '../../../types';

export interface FillPickerOptions {
  /**
   * Restrict the picker to a subset of fill types. When omitted, all three
   * tabs (color / gradient / pattern) are shown. With a single entry the
   * tab strip is hidden entirely.
   */
  allowedTabs?: FillType[];
}

export class FillPicker {
  private container: HTMLElement;
  private fill: FillConfig;
  private onChange: (fill: FillConfig) => void;
  private options: FillPickerOptions;
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

  // Panel reference and close handler
  private panelElement: HTMLElement | null = null;
  private closeHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    initialFill: FillConfig,
    onChange: (fill: FillConfig) => void,
    options: FillPickerOptions = {}
  ) {
    this.container = container;
    this.fill = initialFill;
    this.onChange = onChange;
    this.options = options;
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
    // Remove any existing panel first
    this.removePanel();

    this.container.innerHTML = '';
    this.container.className = 'fill-picker';

    // Preview swatch that opens/closes the picker
    const preview = document.createElement('div');
    preview.className = 'fill-preview';
    preview.style.background = this.getFillPreviewStyle();
    preview.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePicker();
    });
    this.container.appendChild(preview);

    // Dropdown panel
    if (this.isOpen) {
      const panel = document.createElement('div');
      panel.className = 'fill-picker-panel';
      this.panelElement = panel;

      // Stop clicks inside panel from closing it
      panel.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      // Tabs — filtered by the allowedTabs option. With a single allowed
      // tab the strip is hidden so the picker just shows that tab's UI.
      const allTabTypes: { type: FillType; label: string }[] = [
        { type: 'color', label: 'Color' },
        { type: 'linearGradient', label: 'Gradient' },
        { type: 'pattern', label: 'Pattern' }
      ];
      const allowedTabs = this.options.allowedTabs;
      const tabTypes = allowedTabs
        ? allTabTypes.filter(t => allowedTabs.includes(t.type) ||
            (t.type === 'linearGradient' && allowedTabs.includes('radialGradient')))
        : allTabTypes;

      if (tabTypes.length > 1) {
        const tabs = document.createElement('div');
        tabs.className = 'fill-tabs';
        tabTypes.forEach(({ type, label }) => {
          const tab = document.createElement('button');
          tab.className = 'fill-tab' + (this.activeTab === type || (this.activeTab === 'radialGradient' && type === 'linearGradient') ? ' active' : '');
          tab.textContent = label;
          tab.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.activeTab = type;
            this.renderTabContent(panel);
          });
          tabs.appendChild(tab);
        });
        panel.appendChild(tabs);
      }

      // Tab content container
      const content = document.createElement('div');
      content.className = 'fill-tab-content';

      if (this.activeTab === 'color') {
        this.renderColorTabContent(content);
      } else if (this.activeTab === 'linearGradient' || this.activeTab === 'radialGradient') {
        this.renderGradientTabContent(content);
      } else if (this.activeTab === 'pattern') {
        this.renderPatternTabContent(content);
      }

      panel.appendChild(content);

      // Append to body for proper positioning above everything
      document.body.appendChild(panel);

      // Position the panel relative to the preview button
      this.positionPanel(panel, preview);

      // Set up close handler
      this.setupCloseHandler();
    }
  }

  private renderTabContent(panel: HTMLElement): void {
    // Find and replace the tab content
    const oldContent = panel.querySelector('.fill-tab-content');
    if (oldContent) {
      oldContent.remove();
    }

    const content = document.createElement('div');
    content.className = 'fill-tab-content';

    if (this.activeTab === 'color') {
      this.renderColorTabContent(content);
    } else if (this.activeTab === 'linearGradient' || this.activeTab === 'radialGradient') {
      this.renderGradientTabContent(content);
    } else if (this.activeTab === 'pattern') {
      this.renderPatternTabContent(content);
    }

    panel.appendChild(content);

    // Update tab active states
    const tabs = panel.querySelectorAll('.fill-tab');
    tabs.forEach((tab, index) => {
      const tabTypes: FillType[] = ['color', 'linearGradient', 'pattern'];
      const isActive = this.activeTab === tabTypes[index] ||
        (this.activeTab === 'radialGradient' && tabTypes[index] === 'linearGradient');
      tab.classList.toggle('active', isActive);
    });
  }

  private positionPanel(panel: HTMLElement, preview: HTMLElement): void {
    const previewRect = preview.getBoundingClientRect();
    const panelWidth = 240;
    const panelHeight = 320;

    let left = previewRect.left;
    let top = previewRect.bottom + 4;

    if (left + panelWidth > window.innerWidth - 10) {
      left = window.innerWidth - panelWidth - 10;
    }

    if (left < 10) {
      left = 10;
    }

    if (top + panelHeight > window.innerHeight - 10) {
      top = previewRect.top - panelHeight - 4;
      if (top < 10) {
        top = 10;
      }
    }

    panel.style.position = 'fixed';
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.zIndex = '10000';
  }

  private renderColorTabContent(container: HTMLElement): void {
    renderColorTab(container, {
      hue: this.hue,
      saturation: this.saturation,
      value: this.value,
      fill: this.fill,
      satValCanvas: this.satValCanvas,
      hueSlider: this.hueSlider
    }, {
      onColorChange: (h, s, v) => {
        this.hue = h;
        this.saturation = s;
        this.value = v;
        this.updateColorFromHsv();
      },
      render: () => this.render(),
      setSatValCanvas: (canvas) => { this.satValCanvas = canvas; },
      setHueSlider: (slider) => { this.hueSlider = slider; }
    });
  }

  private renderGradientTabContent(container: HTMLElement): void {
    renderGradientTab(container, {
      isRadial: this.isRadial,
      gradientStops: this.gradientStops,
      selectedStopIndex: this.selectedStopIndex,
      gradientAngle: this.gradientAngle,
      radialCenterX: this.radialCenterX,
      radialCenterY: this.radialCenterY,
      gradientCanvas: this.gradientCanvas,
      panelElement: this.panelElement,
      activeTab: this.activeTab
    }, {
      render: () => this.render(),
      renderTabContent: (panel) => this.renderTabContent(panel),
      updateGradient: () => this.updateGradient(),
      setIsRadial: (isRadial) => { this.isRadial = isRadial; },
      setActiveTab: (tab) => { this.activeTab = tab; },
      setSelectedStopIndex: (index) => { this.selectedStopIndex = index; },
      setGradientStops: (stops) => { this.gradientStops = stops; },
      setGradientAngle: (angle) => { this.gradientAngle = angle; },
      setRadialCenterX: (x) => { this.radialCenterX = x; },
      setRadialCenterY: (y) => { this.radialCenterY = y; },
      setGradientCanvas: (canvas) => { this.gradientCanvas = canvas; }
    });
  }

  private renderPatternTabContent(container: HTMLElement): void {
    renderPatternTab(container, {
      fill: this.fill
    }, {
      setFill: (fill) => { this.fill = fill; },
      render: () => this.render(),
      onChange: this.onChange
    });
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
  }

  private setupCloseHandler(): void {
    if (this.closeHandler) {
      document.removeEventListener('mousedown', this.closeHandler);
    }

    this.closeHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!this.container.contains(target) &&
          (!this.panelElement || !this.panelElement.contains(target))) {
        this.isOpen = false;
        this.removePanel();
        this.render();
      }
    };

    setTimeout(() => {
      if (this.closeHandler) {
        document.addEventListener('mousedown', this.closeHandler);
      }
    }, 10);
  }

  private removePanel(): void {
    if (this.closeHandler) {
      document.removeEventListener('mousedown', this.closeHandler);
      this.closeHandler = null;
    }

    if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }
  }

  destroy(): void {
    this.removePanel();
    this.container.innerHTML = '';
  }
}
