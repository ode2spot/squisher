// Slider rows for the Advanced and EQ sections, generated from the ranges
// declared in params.ts so the UI can't drift from the parameter model.
import { linToNorm, logToNorm, normToLin, normToLog } from '../shared/db';
import type { Range } from '../shared/params';

const SLIDER_STEPS = 1000;

export function formatValue(value: number, unit: string): string {
  switch (unit) {
    case 'dB':
      return value.toFixed(1);
    case ':1':
      return `${value.toFixed(1)}:1`;
    case 's': {
      const ms = value * 1000;
      return ms >= 1000 ? `${value.toFixed(2)}s` : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`;
    }
    case 'Hz':
      return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
    default:
      return value.toFixed(2);
  }
}

export interface SliderRow {
  root: HTMLDivElement;
  input: HTMLInputElement;
  /** Update slider position + readout from a value (no event fired). */
  set: (value: number) => void;
  setEnabled: (enabled: boolean) => void;
}

export function sliderRow(
  label: string,
  range: Range,
  onInput: (value: number) => void,
): SliderRow {
  const root = document.createElement('div');
  root.className = 'param-row';

  const lab = document.createElement('label');
  lab.textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(SLIDER_STEPS);
  input.step = '1';

  const readout = document.createElement('span');
  readout.className = 'readout';

  const toValue = (norm: number) =>
    range.log ? normToLog(norm, range.min, range.max) : normToLin(norm, range.min, range.max);
  const toNorm = (value: number) =>
    range.log ? logToNorm(value, range.min, range.max) : linToNorm(value, range.min, range.max);

  input.addEventListener('input', () => {
    const value = toValue(Number(input.value) / SLIDER_STEPS);
    readout.textContent = formatValue(value, range.unit);
    onInput(value);
  });

  root.append(lab, input, readout);
  return {
    root,
    input,
    set: (value: number) => {
      input.value = String(Math.round(toNorm(value) * SLIDER_STEPS));
      readout.textContent = formatValue(value, range.unit);
    },
    setEnabled: (enabled: boolean) => {
      input.disabled = !enabled;
    },
  };
}
