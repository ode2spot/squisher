// Content script controller: wires discovered media elements into audio
// graphs, applies stored settings, streams meter data to the popup while its
// port is open, and reports activity to the service worker for the badge.
import { maxConsecutiveOver, peak, rms } from '../shared/db';
import {
  POPUP_PORT,
  type ContentToPopup,
  type ContextState,
  type PopupToContent,
  type RuntimeMessage,
} from '../shared/messages';
import { defaultParams, type SquisherParams } from '../shared/params';
import { GLOBAL_KEY, resolveSettings, siteKey } from '../shared/storage';
import { MediaDiscovery } from './discover';
import { MediaChain } from './graph';

const METER_INTERVAL_MS = 33; // ~30 fps

const instanceId = Math.random().toString(36).slice(2);
const hostname = location.hostname;

let ctx: AudioContext | null = null;
let params: SquisherParams = defaultParams();
let bypass = false;
let lastReportedActive: boolean | null = null;

/** Chains persist for the life of the element: a MediaElementSourceNode can
 *  never be created twice, so the chain is kept even if the element leaves
 *  the DOM and is reused if it comes back. */
const chains = new WeakMap<HTMLMediaElement, MediaChain>();
/** Elements currently in the document (drives mediaCount and metering). */
const liveElements = new Set<HTMLMediaElement>();
/** Elements we failed to wire (already claimed by the site's own WebAudio). */
const unusable = new WeakSet<HTMLMediaElement>();

const meterBuffer = new Float32Array(2048);

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    // The context starts suspended unless created during a user gesture;
    // resume on the next gesture and surface the state in the popup.
    const tryResume = () => {
      void ctx?.resume();
    };
    window.addEventListener('pointerdown', tryResume, { capture: true, passive: true });
    window.addEventListener('keydown', tryResume, { capture: true, passive: true });
    ctx.addEventListener('statechange', () => {
      sendState();
      reportActivity();
    });
  }
  return ctx;
}

function wireElement(el: HTMLMediaElement): void {
  if (unusable.has(el)) return;
  let chain = chains.get(el);
  if (!chain) {
    const context = ensureContext();
    try {
      chain = new MediaChain(context, el);
    } catch {
      unusable.add(el);
      return;
    }
    chains.set(el, chain);
    // A play gesture is also a resume opportunity.
    el.addEventListener('play', () => void ctx?.resume());
  }
  chain.setParams(params);
  chain.setBypass(bypass);
  if (!liveElements.has(el)) {
    liveElements.add(el);
    sendState();
    reportActivity();
  }
}

function pruneRemoved(): void {
  let changed = false;
  for (const el of liveElements) {
    if (!el.isConnected) {
      liveElements.delete(el);
      changed = true;
    }
  }
  if (changed) {
    sendState();
    reportActivity();
  }
}

function applyToAll(): void {
  for (const el of liveElements) {
    const chain = chains.get(el);
    if (chain) {
      chain.setParams(params);
      chain.setBypass(bypass);
    }
  }
}

function contextState(): ContextState {
  if (!ctx || liveElements.size === 0) return 'none';
  return ctx.state === 'running' ? 'running' : 'suspended';
}

function reportActivity(): void {
  const active = liveElements.size > 0 && !bypass;
  if (active === lastReportedActive) return;
  lastReportedActive = active;
  const msg: RuntimeMessage = { type: 'activity', instanceId, active };
  void chrome.runtime.sendMessage(msg).catch(() => {});
}

// --- popup port ---

let popupPort: chrome.runtime.Port | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;

function sendState(): void {
  if (!popupPort) return;
  const msg: ContentToPopup = {
    type: 'state',
    instanceId,
    isTop: window === window.top,
    hostname,
    mediaCount: liveElements.size,
    contextState: contextState(),
    bypass,
    params,
  };
  popupPort.postMessage(msg);
}

function sendMeters(): void {
  if (!popupPort || liveElements.size === 0) return;
  let inPeak = 0;
  let inRms = 0;
  let outPeak = 0;
  let outRms = 0;
  let reduction = 0;
  let clipped = false;
  for (const el of liveElements) {
    const chain = chains.get(el);
    if (!chain) continue;
    chain.inputAnalyser.getFloatTimeDomainData(meterBuffer);
    inPeak = Math.max(inPeak, peak(meterBuffer));
    inRms = Math.max(inRms, rms(meterBuffer));
    chain.outputAnalyser.getFloatTimeDomainData(meterBuffer);
    outPeak = Math.max(outPeak, peak(meterBuffer));
    outRms = Math.max(outRms, rms(meterBuffer));
    reduction = Math.min(reduction, chain.compressor.reduction);
    // Samples here are floats, so exactly-full-scale sources don't trip
    // this — only processing that would clip the DAC, and only when it's
    // more than a single-sample transient overshoot.
    clipped ||= maxConsecutiveOver(meterBuffer, 1.0001) >= 3;
  }
  const msg: ContentToPopup = {
    type: 'meters',
    instanceId,
    inPeak,
    inRms,
    reduction,
    outPeak,
    outRms,
    clipped,
  };
  popupPort.postMessage(msg);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT) return;
  popupPort = port;
  port.onMessage.addListener((raw: PopupToContent) => {
    switch (raw.type) {
      case 'getState':
        sendState();
        break;
      case 'setParams':
        params = raw.params;
        applyToAll();
        break;
      case 'setBypass':
        bypass = raw.bypass;
        applyToAll();
        sendState();
        reportActivity();
        break;
    }
  });
  port.onDisconnect.addListener(() => {
    if (popupPort === port) popupPort = null;
    if (meterTimer !== null) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
  });
  sendState();
  meterTimer = setInterval(sendMeters, METER_INTERVAL_MS);
});

// --- keyboard command relayed by the service worker ---

chrome.runtime.onMessage.addListener((raw: RuntimeMessage) => {
  if (raw.type === 'toggleBypass') {
    bypass = !bypass;
    applyToAll();
    sendState();
    reportActivity();
  }
});

// --- settings ---

async function loadSettings(): Promise<void> {
  const entries = await chrome.storage.sync.get([GLOBAL_KEY, siteKey(hostname)]);
  params = resolveSettings(entries, hostname).params;
  applyToAll();
  sendState();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  // Re-resolve on any settings write (from the popup on this or another tab).
  if (area === 'sync') void loadSettings();
});

// --- start ---

const discovery = new MediaDiscovery(wireElement, pruneRemoved);
void loadSettings().then(() => discovery.start());
