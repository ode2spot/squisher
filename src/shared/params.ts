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

/** Upward expander: lifts signal below the threshold (quiet dialogue)
 *  toward it, leaving loud passages alone. */
export interface ExpanderParams {
  enabled: boolean;
  /** dB; below this the signal is lifted. */
  threshold: number;
  /** 1..10; the region below threshold is compressed upward by (1 - 1/r). */
  ratio: number;
  /** seconds — how fast the boost ducks when loud signal arrives. Log scale. */
  attack: number;
  /** seconds — how fast the boost builds as the signal falls away. Log scale. */
  release: number;
  /** dB, maximum boost (caps how far the noise floor comes up too). */
  depth: number;
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
  expander: ExpanderParams;
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

export const EXPANDER_RANGES: Record<Exclude<keyof ExpanderParams, 'enabled'>, Range> = {
  threshold: { min: -80, max: 0, log: false, unit: 'dB' },
  ratio: { min: 1, max: 10, log: false, unit: ':1' },
  attack: { min: 0.0005, max: 0.1, log: true, unit: 's' },
  release: { min: 0.01, max: 1, log: true, unit: 's' },
  depth: { min: 0, max: 24, log: false, unit: 'dB' },
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

/**
 * Merge a possibly-partial/older stored parameter object onto the defaults,
 * so settings saved by earlier versions (e.g. before the expander existed)
 * load with sane values for the fields they lack.
 */
export function normalizeParams(raw: unknown): SquisherParams {
  const d = defaultParams();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as {
    amount?: unknown;
    compressor?: unknown;
    expander?: unknown;
    eq?: Partial<Record<EqBandId, unknown>>;
  };
  const section = <T extends object>(base: T, over: unknown): T =>
    typeof over === 'object' && over !== null ? { ...base, ...over } : base;
  const eq = {} as Record<EqBandId, EqBandParams>;
  for (const id of EQ_BAND_IDS) eq[id] = section(d.eq[id], r.eq?.[id]);
  return {
    amount: typeof r.amount === 'number' ? r.amount : d.amount,
    compressor: section(d.compressor, r.compressor),
    expander: section(d.expander, r.expander),
    eq,
  };
}

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
    expander: {
      enabled: false,
      threshold: -45,
      ratio: 2,
      attack: 0.002,
      release: 0.2,
      depth: 10,
    },
    eq: {
      lowShelf: { enabled: false, freq: 120, gain: 0, q: 1 },
      param1: { enabled: false, freq: 1000, gain: 0, q: 1 },
      param2: { enabled: false, freq: 4000, gain: 0, q: 1 },
      highShelf: { enabled: false, freq: 8000, gain: 0, q: 1 },
    },
  };
}
