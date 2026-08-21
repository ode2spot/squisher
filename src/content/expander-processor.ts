// Downward expander as an AudioWorkletProcessor (Web Audio has no native
// expander node). Below the threshold the signal is pushed down by the
// expansion ratio, capped at `depth` dB of attenuation — used to sink hiss
// and room noise between dialogue lines before the compressor lifts
// everything. Parameters and meter reporting run over the node's message
// port; the file is bundled standalone and loaded via audioWorklet.addModule.

// Minimal ambient declarations: lib.dom has no AudioWorklet processor scope.
declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

interface ParamsMessage {
  type: 'params';
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  depth: number;
}
interface MetersMessage {
  type: 'meters';
  on: boolean;
}

const METER_INTERVAL_FRAMES = 1600; // ~33 ms at 48 kHz

class ExpanderProcessor extends AudioWorkletProcessor {
  private enabled = false;
  private thresholdDb = -50;
  private ratio = 2;
  private attackCoeff = 0;
  private releaseCoeff = 0;
  private depthDb = 15;
  private metersOn = false;

  /** Detector envelope (linear amplitude). */
  private env = 0;
  /** Current applied gain in dB (smoothed gain reduction, <= 0). */
  private gainDb = 0;
  private nextMeterFrame = 0;

  constructor() {
    super();
    this.setTimes(0.002, 0.2);
    this.port.onmessage = (e: MessageEvent<ParamsMessage | MetersMessage>) => {
      const m = e.data;
      if (m.type === 'params') {
        this.enabled = m.enabled;
        this.thresholdDb = m.threshold;
        this.ratio = m.ratio;
        this.depthDb = m.depth;
        this.setTimes(m.attack, m.release);
      } else {
        this.metersOn = m.on;
      }
    };
  }

  private setTimes(attack: number, release: number): void {
    // One-pole smoothing coefficients; attack governs gain recovery when the
    // signal returns, release governs how fast attenuation sets in.
    this.attackCoeff = Math.exp(-1 / (sampleRate * Math.max(attack, 0.0001)));
    this.releaseCoeff = Math.exp(-1 / (sampleRate * Math.max(release, 0.001)));
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0) return true;
    const frames = input[0]!.length;

    if (!this.enabled) {
      for (let ch = 0; ch < output.length; ch++) output[ch]!.set(input[ch] ?? input[0]!);
      this.gainDb = 0;
      this.reportMeters(frames);
      return true;
    }

    // Detector: fast-attack envelope of the loudest channel.
    const envCoeff = Math.exp(-1 / (sampleRate * 0.0005));
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      for (let ch = 0; ch < input.length; ch++) {
        const a = Math.abs(input[ch]![i]!);
        if (a > peak) peak = a;
      }
      this.env = peak > this.env ? peak : peak + envCoeff * (this.env - peak);

      const envDb = 20 * Math.log10(Math.max(this.env, 1e-6));
      let targetDb = 0;
      if (envDb < this.thresholdDb) {
        targetDb = Math.max((envDb - this.thresholdDb) * (this.ratio - 1), -this.depthDb);
      }
      // Gain rising back toward 0 uses attack; falling uses release.
      const coeff = targetDb > this.gainDb ? this.attackCoeff : this.releaseCoeff;
      this.gainDb = targetDb + coeff * (this.gainDb - targetDb);

      const gain = Math.pow(10, this.gainDb / 20);
      for (let ch = 0; ch < output.length; ch++) {
        output[ch]![i] = (input[ch] ?? input[0]!)[i]! * gain;
      }
    }

    this.reportMeters(frames);
    return true;
  }

  private reportMeters(frames: number): void {
    if (!this.metersOn) return;
    this.nextMeterFrame -= frames;
    if (this.nextMeterFrame <= 0) {
      this.nextMeterFrame = METER_INTERVAL_FRAMES;
      this.port.postMessage({ gr: this.gainDb });
    }
  }
}

// Name must match EXPANDER_PROCESSOR_NAME in shared/messages.ts (this file
// is bundled standalone for addModule, so it can't import from the app).
registerProcessor('squisher-expander', ExpanderProcessor);
