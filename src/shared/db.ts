// dB conversion and level math used by the meters. Kept dependency-free and
// pure so it can be unit tested under node.

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Linear amplitude (1.0 = full scale) to dBFS. 0 maps to -Infinity. */
export function linearToDb(linear: number): number {
  return 20 * Math.log10(linear);
}

/** dBFS to linear amplitude. */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Largest absolute sample value in the buffer. */
export function peak(samples: Float32Array): number {
  let max = 0;
  for (const s of samples) {
    const a = Math.abs(s);
    if (a > max) max = a;
  }
  return max;
}

/**
 * The automatic makeup gain a DynamicsCompressorNode applies internally,
 * in dB. The Web Audio spec defines it as (1/curve(1.0))^0.6 in the linear
 * domain; with the curve's straight-line segment that is
 * 0.6 * -threshold * (1 - 1/ratio). (When the soft knee spans 0 dBFS the
 * real value is slightly smaller, so subtracting this overcompensates a
 * little — erring quiet, never toward clipping.) The audio graph subtracts
 * this from the user's makeup gain so the makeup control is honest instead
 * of stacking on a hidden boost.
 */
export function compressorAutoMakeupDb(thresholdDb: number, ratio: number): number {
  return 0.6 * -thresholdDb * (1 - 1 / ratio);
}

/**
 * Length of the longest run of consecutive samples at or above the given
 * absolute level. Clip detection uses runs (>= 3 samples over full scale)
 * so a single-sample transient overshoot doesn't count as a clip.
 */
export function maxConsecutiveOver(samples: Float32Array, level: number): number {
  let run = 0;
  let max = 0;
  for (const s of samples) {
    if (Math.abs(s) >= level) {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

/** Root-mean-square of the buffer. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/** Map a value in [min, max] to a normalized 0..1 slider position through
 *  log space. min must be > 0. */
export function logToNorm(value: number, min: number, max: number): number {
  const v = clamp(value, min, max);
  return Math.log(v / min) / Math.log(max / min);
}

/** Inverse of logToNorm. */
export function normToLog(norm: number, min: number, max: number): number {
  return min * Math.pow(max / min, clamp(norm, 0, 1));
}

/** Map a value in [min, max] to a normalized 0..1 slider position linearly. */
export function linToNorm(value: number, min: number, max: number): number {
  return (clamp(value, min, max) - min) / (max - min);
}

/** Inverse of linToNorm. */
export function normToLin(norm: number, min: number, max: number): number {
  return min + (max - min) * clamp(norm, 0, 1);
}
