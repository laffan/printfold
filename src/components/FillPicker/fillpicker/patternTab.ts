/**
 * Pattern tab rendering for FillPicker
 */

import { appState } from '../../../services/state';
import type { FillConfig, PatternConfig } from '../../../types';

export interface PatternTabState {
  fill: FillConfig;
}

export interface PatternTabCallbacks {
  setFill: (fill: FillConfig) => void;
  render: () => void;
  onChange: (fill: FillConfig) => void;
}

/**
 * Render the pattern tab content
 */
export function renderPatternTab(
  container: HTMLElement,
  state: PatternTabState,
  callbacks: PatternTabCallbacks
): void {
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

  const currentPatternId = state.fill.type === 'pattern' ? state.fill.pattern?.imageFileId : null;

  imageFiles.forEach(file => {
    const thumb = document.createElement('div');
    thumb.className = 'fill-pattern-thumb' + (file.id === currentPatternId ? ' selected' : '');

    const img = document.createElement('img');
    img.src = `data:image/png;base64,${file.content}`;
    img.alt = file.name;
    thumb.appendChild(img);

    thumb.addEventListener('click', () => {
      const newFill: FillConfig = {
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
      callbacks.setFill(newFill);
      callbacks.render();
      callbacks.onChange(newFill);
    });

    imageList.appendChild(thumb);
  });

  container.appendChild(imageList);

  // Pattern options if a pattern is selected
  if (state.fill.type === 'pattern' && state.fill.pattern?.imageFileId) {
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
      option.selected = state.fill.pattern?.repeat === mode;
      repeatSelect.appendChild(option);
    });
    repeatSelect.addEventListener('change', () => {
      if (state.fill.pattern) {
        state.fill.pattern.repeat = repeatSelect.value as PatternConfig['repeat'];
        callbacks.onChange(state.fill);
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
    scaleInput.value = ((state.fill.pattern?.scale || 1) * 100).toString();

    const scaleValue = document.createElement('span');
    scaleValue.textContent = `${(state.fill.pattern?.scale || 1) * 100}%`;

    scaleInput.addEventListener('input', () => {
      if (state.fill.pattern) {
        state.fill.pattern.scale = parseInt(scaleInput.value) / 100;
        scaleValue.textContent = `${scaleInput.value}%`;
        callbacks.onChange(state.fill);
      }
    });

    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleInput);
    scaleRow.appendChild(scaleValue);
    optionsSection.appendChild(scaleRow);

    container.appendChild(optionsSection);
  }
}
