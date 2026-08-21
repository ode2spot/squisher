// Canvas meter rendering: IN/OUT level meters (RMS bar + peak marker with
// hold) and the gain-reduction meter (grows from the 0 dB end like a
// hardware GR meter). Falloff animation is skipped when the user prefers
// reduced motion.
import { clamp, linearToDb } from '../shared/db';

const LEVEL_MIN_DB = -60;
const GR_MIN_DB = -24;
const PEAK_HOLD_MS = 1500;
const LEVEL_FALL_DB_PER_S = 30;
const PEAK_FALL_DB_PER_S = 20;

const COLOR_GREEN = '#3ddc84';
const COLOR_AMBER = '#ffb020';
const COLOR_RED = '#ff4d4f';
const COLOR_TICK = '#262b33';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

function levelColor(db: number): string {
  if (db > -6) return COLOR_RED;
  if (db > -18) return COLOR_AMBER;
  return COLOR_GREEN;
}

/** IN/OUT meter: -60..0 dBFS left to right. */
export class LevelMeter {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;
  private displayRms = -Infinity;
  private peakHold = -Infinity;
  private peakHoldUntil = 0;
  private lastFrame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = setupCanvas(canvas);
    this.w = canvas.clientWidth || canvas.width;
    this.h = canvas.clientHeight || canvas.height;
  }

  /** Feed linear amplitudes; draws one frame. Returns the dB values shown
   *  (heldDb is the peak-hold value the marker sits at). */
  draw(
    rmsLinear: number,
    peakLinear: number,
    now: number,
  ): { rmsDb: number; peakDb: number; heldDb: number } {
    const dt = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;

    const rmsDb = linearToDb(rmsLinear);
    const peakDb = linearToDb(peakLinear);

    if (reducedMotion.matches) {
      this.displayRms = rmsDb;
    } else {
      const fallen = this.displayRms - LEVEL_FALL_DB_PER_S * dt;
      this.displayRms = Math.max(rmsDb, fallen);
    }

    if (peakDb >= this.peakHold) {
      this.peakHold = peakDb;
      this.peakHoldUntil = now + PEAK_HOLD_MS;
    } else if (now > this.peakHoldUntil) {
      this.peakHold = reducedMotion.matches ? peakDb : this.peakHold - PEAK_FALL_DB_PER_S * dt;
    }

    this.render();
    return { rmsDb, peakDb, heldDb: this.peakHold };
  }

  private xFor(db: number): number {
    return clamp((db - LEVEL_MIN_DB) / -LEVEL_MIN_DB, 0, 1) * this.w;
  }

  private render(): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const tick of [-48, -36, -24, -12, -6]) {
      ctx.fillStyle = COLOR_TICK;
      ctx.fillRect(Math.round(this.xFor(tick)), 0, 1, h);
    }
    const rmsX = this.xFor(this.displayRms);
    if (rmsX > 0) {
      // Segment the bar so the green/amber/red zones stay fixed on the scale.
      const zones: Array<[number, number, string]> = [
        [LEVEL_MIN_DB, -18, COLOR_GREEN],
        [-18, -6, COLOR_AMBER],
        [-6, 0, COLOR_RED],
      ];
      for (const [from, to, color] of zones) {
        const x0 = this.xFor(from);
        const x1 = Math.min(this.xFor(to), rmsX);
        if (x1 > x0) {
          ctx.fillStyle = color;
          ctx.fillRect(x0, 2, x1 - x0, h - 4);
        }
      }
    }
    if (this.peakHold > LEVEL_MIN_DB) {
      ctx.fillStyle = levelColor(this.peakHold);
      ctx.fillRect(Math.min(Math.round(this.xFor(this.peakHold)), w - 2), 0, 2, h);
    }
  }
}

/** Gain-reduction meter: 0 dB at the right edge, growing leftward. */
export class GrMeter {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;
  private display = 0;
  private lastFrame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = setupCanvas(canvas);
    this.w = canvas.clientWidth || canvas.width;
    this.h = canvas.clientHeight || canvas.height;
  }

  /** Feed reduction in dB (<= 0); draws one frame. Returns the dB shown. */
  draw(reductionDb: number, now: number): number {
    const dt = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    if (reducedMotion.matches) {
      this.display = reductionDb;
    } else {
      // GR release falloff: recover toward 0 smoothly, respond to more
      // reduction instantly (like the needle of a hardware meter).
      const recovered = this.display + LEVEL_FALL_DB_PER_S * dt;
      this.display = Math.min(reductionDb, Math.min(recovered, 0));
    }
    this.render();
    return this.display;
  }

  private xFor(db: number): number {
    // 0 dB at the right edge, GR_MIN_DB at the left.
    return (1 - clamp(db / GR_MIN_DB, 0, 1)) * this.w;
  }

  private render(): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const tick of [-3, -6, -12, -18]) {
      ctx.fillStyle = COLOR_TICK;
      ctx.fillRect(Math.round(this.xFor(tick)), 0, 1, h);
    }
    const x = this.xFor(this.display);
    if (x < w) {
      ctx.fillStyle = COLOR_AMBER;
      ctx.fillRect(x, 2, w - x, h - 4);
    }
  }
}
