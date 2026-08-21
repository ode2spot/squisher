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
