// Parameter model — the single source of truth for the processing chain.
// Presets, storage shape, the popup controls and the audio graph all derive
// from the types and ranges here.

/** Where the EQ sits relative to the compressor. Constant for now so the
 *  graph order can be flipped in one place later. */
export const GRAPH_ORDER: 'eq-first' | 'compressor-first' = 'eq-first';

export interface CompressorParams {
  /** dB, -60..0 */
  threshold: number;
  /** dB, 0..40 */
  knee: number;
  /** 1..20 */
  ratio: number;
  /** seconds, log scale */
  attack: number;
  /** seconds, log scale */
  release: number;
  /** dB, 0..24 */
  makeupGain: number;
}

export type EqBandId = 'lowShelf' | 'param1' | 'param2' | 'highShelf';

export const EQ_BAND_IDS: readonly EqBandId[] = ['lowShelf', 'param1', 'param2', 'highShelf'];

export interface EqBandParams {
  enabled: boolean;
  /** Hz, log scale */
  freq: number;
  /** dB, -15..15 */
  gain: number;
  /** Only meaningful for the parametric bands; shelves ignore it. Log scale. */
  q: number;
}

export interface SquisherParams {
  /** 0..100 macro; moves threshold/ratio/makeup together (see presets.ts). */
  amount: number;
  compressor: CompressorParams;
  eq: Record<EqBandId, EqBandParams>;
}

export interface Range {
  min: number;
  max: number;
  /** Sliders for this value should map through log space. */
  log: boolean;
  unit: string;
}

export const COMPRESSOR_RANGES: Record<keyof CompressorParams, Range> = {
  threshold: { min: -60, max: 0, log: false, unit: 'dB' },
  knee: { min: 0, max: 40, log: false, unit: 'dB' },
  ratio: { min: 1, max: 20, log: false, unit: ':1' },
  attack: { min: 0.0005, max: 1, log: true, unit: 's' },
  release: { min: 0.01, max: 1, log: true, unit: 's' },
  makeupGain: { min: 0, max: 24, log: false, unit: 'dB' },
};

export const EQ_GAIN_RANGE: Range = { min: -15, max: 15, log: false, unit: 'dB' };
export const EQ_Q_RANGE: Range = { min: 0.1, max: 10, log: true, unit: '' };

export const EQ_FREQ_RANGES: Record<EqBandId, Range> = {
  lowShelf: { min: 20, max: 500, log: true, unit: 'Hz' },
  param1: { min: 20, max: 20000, log: true, unit: 'Hz' },
  param2: { min: 20, max: 20000, log: true, unit: 'Hz' },
  highShelf: { min: 2000, max: 20000, log: true, unit: 'Hz' },
};

/** Which BiquadFilterNode type each band uses. */
export const EQ_BAND_FILTER_TYPES: Record<EqBandId, BiquadFilterType> = {
  lowShelf: 'lowshelf',
  param1: 'peaking',
  param2: 'peaking',
  highShelf: 'highshelf',
};

export function defaultParams(): SquisherParams {
  return {
    amount: 0,
    compressor: {
      threshold: -24,
      knee: 30,
      ratio: 4,
      attack: 0.003,
      release: 0.25,
      makeupGain: 0,
    },
    eq: {
      lowShelf: { enabled: false, freq: 120, gain: 0, q: 1 },
      param1: { enabled: false, freq: 1000, gain: 0, q: 1 },
      param2: { enabled: false, freq: 4000, gain: 0, q: 1 },
      highShelf: { enabled: false, freq: 8000, gain: 0, q: 1 },
    },
  };
}
