// The per-media-element audio graph:
//
//   MediaElementSource
//     -> inputAnalyser
//     -> expander (AudioWorkletNode, attached once the module loads)
//     -> EQ: lowShelf -> param1 -> param2 -> highShelf   (BiquadFilterNodes)
//     -> DynamicsCompressorNode
//     -> makeupGain
//     -> outputAnalyser
//     -> destination
//
// Bypass is true bypass: the source is reconnected directly to the
// destination (the input analyser stays attached as a pure tap so the input
// meter keeps reading).
import { compressorAutoMakeupDb, dbToLinear } from '../shared/db';
import {
  EQ_BAND_FILTER_TYPES,
  EQ_BAND_IDS,
  GRAPH_ORDER,
  type SquisherParams,
} from '../shared/params';

const ANALYSER_FFT_SIZE = 2048;

export class MediaChain {
  private readonly ctx: AudioContext;
  private readonly source: MediaElementAudioSourceNode;
  readonly inputAnalyser: AnalyserNode;
  readonly outputAnalyser: AnalyserNode;
  readonly compressor: DynamicsCompressorNode;
  private readonly makeupGain: GainNode;
  private readonly eqBands: Record<string, BiquadFilterNode>;
  private readonly processingHead: AudioNode;
  private expander: AudioWorkletNode | null = null;
  /** Latest gain reduction reported by the expander worklet, in dB (<= 0). */
  expanderGrDb = 0;
  private bypassed = false;
  private lastParams: SquisherParams | null = null;

  constructor(ctx: AudioContext, element: HTMLMediaElement) {
    this.ctx = ctx;
    // Throws InvalidStateError if the element is already claimed by another
    // AudioContext (e.g. the site's own Web Audio); caller handles it.
    this.source = ctx.createMediaElementSource(element);

    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = ANALYSER_FFT_SIZE;
    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = ANALYSER_FFT_SIZE;

    this.eqBands = {};
    for (const id of EQ_BAND_IDS) {
      const filter = ctx.createBiquadFilter();
      filter.type = EQ_BAND_FILTER_TYPES[id];
      this.eqBands[id] = filter;
    }

    this.compressor = ctx.createDynamicsCompressor();
    this.makeupGain = ctx.createGain();

    // EQ chain in declared order.
    const eqChain = EQ_BAND_IDS.map((id) => this.eqBands[id]!);
    for (let i = 0; i < eqChain.length - 1; i++) eqChain[i]!.connect(eqChain[i + 1]!);
    const eqHead = eqChain[0]!;
    const eqTail = eqChain[eqChain.length - 1]!;

    if (GRAPH_ORDER === 'eq-first') {
      this.processingHead = eqHead;
      eqTail.connect(this.compressor);
      this.compressor.connect(this.makeupGain);
    } else {
      this.processingHead = this.compressor;
      this.compressor.connect(eqHead);
      eqTail.connect(this.makeupGain);
    }
    this.makeupGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(ctx.destination);

    this.source.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.processingHead);
  }

  /** The node the input analyser feeds when processing is engaged. */
  private chainHead(): AudioNode {
    return this.expander ?? this.processingHead;
  }

  /**
   * Insert the expander worklet node between the input tap and the rest of
   * the chain. Called once per chain, after audioWorklet.addModule resolves
   * (the rest of the graph runs fine before/without it).
   */
  attachExpander(node: AudioWorkletNode): void {
    if (this.expander) return;
    this.expander = node;
    node.port.onmessage = (e: MessageEvent<{ gr: number }>) => {
      this.expanderGrDb = e.data.gr;
    };
    node.connect(this.processingHead);
    if (!this.bypassed) {
      this.inputAnalyser.disconnect();
      this.inputAnalyser.connect(node);
    }
    if (this.lastParams) this.sendExpanderParams(this.lastParams);
  }

  setExpanderMeters(on: boolean): void {
    this.expander?.port.postMessage({ type: 'meters', on });
    if (!on) this.expanderGrDb = 0;
  }

  private sendExpanderParams(params: SquisherParams): void {
    this.expander?.port.postMessage({ type: 'params', ...params.expander });
  }

  setParams(params: SquisherParams): void {
    this.lastParams = params;
    this.sendExpanderParams(params);
    const c = params.compressor;
    this.compressor.threshold.value = c.threshold;
    this.compressor.knee.value = c.knee;
    this.compressor.ratio.value = c.ratio;
    this.compressor.attack.value = c.attack;
    this.compressor.release.value = c.release;
    // Cancel the node's hidden automatic makeup so c.makeupGain is the
    // actual gain applied after compression.
    this.makeupGain.gain.value = dbToLinear(
      c.makeupGain - compressorAutoMakeupDb(c.threshold, c.ratio),
    );

    for (const id of EQ_BAND_IDS) {
      const band = params.eq[id];
      const filter = this.eqBands[id]!;
      filter.frequency.value = band.freq;
      // A shelving/peaking filter with 0 dB gain is flat, so "disabled" just
      // forces the gain to 0 without rewiring the chain.
      filter.gain.value = band.enabled ? band.gain : 0;
      filter.Q.value = band.q;
    }
  }

  setBypass(bypass: boolean): void {
    if (bypass === this.bypassed) return;
    this.bypassed = bypass;
    if (bypass) {
      this.source.disconnect();
      this.inputAnalyser.disconnect();
      this.source.connect(this.ctx.destination);
      this.source.connect(this.inputAnalyser); // meter tap only
    } else {
      this.source.disconnect();
      this.source.connect(this.inputAnalyser);
      this.inputAnalyser.connect(this.chainHead());
    }
  }

  dispose(): void {
    this.source.disconnect();
    this.inputAnalyser.disconnect();
    this.outputAnalyser.disconnect();
  }
}
