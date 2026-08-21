// EQ magnitude-response display. The curve is computed locally with
// BiquadFilterNodes in an OfflineAudioContext (getFrequencyResponse), so it
// needs no round-trip to the content script.
import { clamp } from '../shared/db';
import { EQ_BAND_FILTER_TYPES, EQ_BAND_IDS, type SquisherParams } from '../shared/params';

const POINTS = 160;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const DB_RANGE = 18; // y axis is ±18 dB

const COLOR_CURVE = '#4aa8ff';
const COLOR_FILL = 'rgba(74, 168, 255, 0.12)';
const COLOR_GRID = '#262b33';
const COLOR_ZERO = '#3a4150';

export class EqCurve {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly offline: OfflineAudioContext;
  private readonly freqs: Float32Array<ArrayBuffer>;
  private readonly magScratch: Float32Array<ArrayBuffer>;
  private readonly phaseScratch: Float32Array<ArrayBuffer>;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.offline = new OfflineAudioContext(1, 128, 44100);
    this.freqs = new Float32Array(POINTS);
    for (let i = 0; i < POINTS; i++) {
      this.freqs[i] = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, i / (POINTS - 1));
    }
    this.magScratch = new Float32Array(POINTS);
    this.phaseScratch = new Float32Array(POINTS);
  }

  private setupSize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth || this.canvas.width;
    this.h = this.canvas.clientHeight || this.canvas.height;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(params: SquisherParams): void {
    if (this.canvas.clientWidth && this.canvas.clientWidth !== this.w) this.setupSize();
    if (this.w === 0) this.setupSize();

    // Sum the dB response of every enabled band.
    const totalDb = new Float32Array(POINTS);
    for (const id of EQ_BAND_IDS) {
      const band = params.eq[id];
      if (!band.enabled || band.gain === 0) continue;
      const filter = this.offline.createBiquadFilter();
      filter.type = EQ_BAND_FILTER_TYPES[id];
      filter.frequency.value = band.freq;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
      filter.getFrequencyResponse(this.freqs, this.magScratch, this.phaseScratch);
      for (let i = 0; i < POINTS; i++) {
        totalDb[i]! += 20 * Math.log10(Math.max(this.magScratch[i]!, 1e-6));
      }
    }

    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // Grid: frequency decades and ±6/±12 dB lines.
    ctx.fillStyle = COLOR_GRID;
    for (const f of [100, 1000, 10000]) {
      const x = (Math.log(f / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN)) * w;
      ctx.fillRect(Math.round(x), 0, 1, h);
    }
    for (const db of [-12, -6, 6, 12]) {
      ctx.fillRect(0, Math.round(this.yFor(db)), w, 1);
    }
    ctx.fillStyle = COLOR_ZERO;
    ctx.fillRect(0, Math.round(this.yFor(0)), w, 1);

    // Curve with a soft fill down to the 0 dB line.
    ctx.beginPath();
    for (let i = 0; i < POINTS; i++) {
      const x = (i / (POINTS - 1)) * w;
      const y = this.yFor(totalDb[i]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = COLOR_CURVE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(w, this.yFor(0));
    ctx.lineTo(0, this.yFor(0));
    ctx.closePath();
    ctx.fillStyle = COLOR_FILL;
    ctx.fill();
  }

  private yFor(db: number): number {
    return (0.5 - clamp(db, -DB_RANGE, DB_RANGE) / (2 * DB_RANGE)) * this.h;
  }
}
