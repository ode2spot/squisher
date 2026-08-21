// Built-in presets and the Amount macro. Both are derived from the parameter
// model in params.ts so there is one source of truth for shapes and ranges.
import { clamp } from './db';
import {
  COMPRESSOR_RANGES,
  defaultParams,
  type CompressorParams,
  type SquisherParams,
} from './params';

export interface Preset {
  name: string;
  params: SquisherParams;
}

/** The compressor fields the Amount macro drives. */
export type AmountDriven = Pick<CompressorParams, 'threshold' | 'ratio' | 'makeupGain'>;

/**
 * Map the 0..100 Amount macro onto threshold, ratio and makeup gain.
 * The curve is tuned so low amounts are gentle leveling and high amounts
 * approach broadcast-style squash:
 *  - threshold falls linearly from -10 dB to -40 dB
 *  - ratio rises quadratically from 1:1 to 20:1 (slow start, aggressive end)
 *  - makeup rises to +6 dB. This is true post-compression gain (the audio
 *    graph cancels DynamicsCompressorNode's hidden automatic makeup, see
 *    db.ts); it stays modest because a fast-attack compressor without a
 *    limiter overshoots by roughly the makeup amount on loud onsets.
 */
export function amountToCompressor(amount: number): AmountDriven {
  const a = clamp(amount, 0, 100) / 100;
  return {
    threshold: -10 - 30 * a,
    ratio: 1 + 19 * a * a,
    makeupGain: 6 * a,
  };
}

/** Apply the Amount macro to a parameter set, leaving everything else alone. */
export function applyAmount(params: SquisherParams, amount: number): SquisherParams {
  const driven = amountToCompressor(amount);
  return {
    ...params,
    amount: clamp(amount, 0, 100),
    compressor: {
      ...params.compressor,
      threshold: clamp(
        driven.threshold,
        COMPRESSOR_RANGES.threshold.min,
        COMPRESSOR_RANGES.threshold.max,
      ),
      ratio: clamp(driven.ratio, COMPRESSOR_RANGES.ratio.min, COMPRESSOR_RANGES.ratio.max),
      makeupGain: clamp(
        driven.makeupGain,
        COMPRESSOR_RANGES.makeupGain.min,
        COMPRESSOR_RANGES.makeupGain.max,
      ),
    },
  };
}

function preset(name: string, overrides: (p: SquisherParams) => void): Preset {
  const params = defaultParams();
  overrides(params);
  return { name, params };
}

export const BUILT_IN_PRESETS: readonly Preset[] = [
  preset('Off', (p) => {
    p.amount = 0;
    p.compressor = { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.25, makeupGain: 0 };
  }),
  // Preset makeup gains are true post-compression gain (see
  // amountToCompressor) and stay modest to leave onset-overshoot headroom.
  preset('Gentle', (p) => {
    p.amount = 25;
    p.compressor = {
      threshold: -18,
      knee: 30,
      ratio: 2,
      attack: 0.01,
      release: 0.25,
      makeupGain: 2,
    };
  }),
  preset('Medium', (p) => {
    p.amount = 50;
    p.compressor = {
      threshold: -24,
      knee: 30,
      ratio: 4,
      attack: 0.005,
      release: 0.25,
      makeupGain: 3,
    };
  }),
  preset('Heavy', (p) => {
    p.amount = 75;
    p.compressor = {
      threshold: -32,
      knee: 20,
      ratio: 8,
      attack: 0.003,
      release: 0.3,
      makeupGain: 5,
    };
  }),
  preset('Old film dialogue', (p) => {
    p.amount = 65;
    p.compressor = {
      threshold: -30,
      knee: 24,
      ratio: 6,
      attack: 0.005,
      release: 0.35,
      makeupGain: 4,
    };
    p.eq.lowShelf = { enabled: true, freq: 120, gain: -4, q: 1 };
    p.eq.param1 = { enabled: true, freq: 2500, gain: 3, q: 1.2 };
    p.eq.highShelf = { enabled: true, freq: 8000, gain: -2, q: 1 };
  }),
];
