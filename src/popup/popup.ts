// Popup controller: connects to the content script(s) in the active tab,
// renders meters from their ~30 fps samples, and edits/persists parameters.
import {
  POPUP_PORT,
  type ContentToPopup,
  type ContextState,
  type PopupToContent,
} from '../shared/messages';
import {
  COMPRESSOR_RANGES,
  EQ_BAND_IDS,
  EQ_FREQ_RANGES,
  EQ_GAIN_RANGE,
  EQ_Q_RANGE,
  defaultParams,
  type CompressorParams,
  type EqBandId,
  type SquisherParams,
} from '../shared/params';
import { BUILT_IN_PRESETS, applyAmount } from '../shared/presets';
import {
  clearSite,
  loadUserPresets,
  saveForSite,
  saveGlobal,
  saveUserPresets,
  siteKey,
  type UserPreset,
} from '../shared/storage';
import { sliderRow, type SliderRow } from './controls';
import { EqCurve } from './eq-curve';
import { GrMeter, LevelMeter } from './meters';

const METER_STALE_MS = 500;
const PERSIST_DEBOUNCE_MS = 400;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// --- state ---

let params: SquisherParams = defaultParams();
let bypass = false;
let hostname = '';
let paramsAdopted = false;
let userPresets: UserPreset[] = [];
let clipLatched = false;
let port: chrome.runtime.Port | null = null;
let portAlive = false;
let gotAnyState = false;

interface InstanceInfo {
  isTop: boolean;
  hostname: string;
  mediaCount: number;
  contextState: ContextState;
}
const instances = new Map<string, InstanceInfo>();
const meterFrames = new Map<string, { msg: ContentToPopup & { type: 'meters' }; at: number }>();

// --- static elements ---

const statusDot = el<HTMLSpanElement>('status-dot');
const statusText = el<HTMLSpanElement>('status-text');
const banner = el<HTMLDivElement>('banner');
const amountSlider = el<HTMLInputElement>('amount');
const amountReadout = el<HTMLSpanElement>('readout-amount');
const bypassBtn = el<HTMLButtonElement>('bypass');
const presetSelect = el<HTMLSelectElement>('preset');
const savePresetBtn = el<HTMLButtonElement>('save-preset');
const rememberBox = el<HTMLInputElement>('remember');
const siteName = el<HTMLSpanElement>('site-name');
const clipLed = el<HTMLButtonElement>('clip');
const readoutIn = el<HTMLSpanElement>('readout-in');
const readoutGr = el<HTMLSpanElement>('readout-gr');
const readoutOut = el<HTMLSpanElement>('readout-out');

const meterIn = new LevelMeter(el<HTMLCanvasElement>('meter-in'));
const meterGr = new GrMeter(el<HTMLCanvasElement>('meter-gr'));
const meterOut = new LevelMeter(el<HTMLCanvasElement>('meter-out'));
const eqCurve = new EqCurve(el<HTMLCanvasElement>('eq-curve'));

// --- generated controls ---

const COMP_LABELS: Record<keyof CompressorParams, string> = {
  threshold: 'THRESH',
  knee: 'KNEE',
  ratio: 'RATIO',
  attack: 'ATTACK',
  release: 'RELEASE',
  makeupGain: 'MAKEUP',
};

const compRows = {} as Record<keyof CompressorParams, SliderRow>;
{
  const grid = el<HTMLDivElement>('comp-controls');
  for (const key of Object.keys(COMPRESSOR_RANGES) as Array<keyof CompressorParams>) {
    const row = sliderRow(COMP_LABELS[key], COMPRESSOR_RANGES[key], (value) => {
      params.compressor[key] = value;
      onParamsEdited();
    });
    compRows[key] = row;
    grid.append(row.root);
  }
}

const EQ_LABELS: Record<EqBandId, string> = {
  lowShelf: 'LOW SHELF',
  param1: 'PEAK 1',
  param2: 'PEAK 2',
  highShelf: 'HIGH SHELF',
};

interface BandRows {
  enable: HTMLInputElement;
  freq: SliderRow;
  gain: SliderRow;
  q: SliderRow | null;
}
const eqRows = {} as Record<EqBandId, BandRows>;
{
  const wrap = el<HTMLDivElement>('eq-controls');
  for (const id of EQ_BAND_IDS) {
    const band = document.createElement('div');
    band.className = 'eq-band';

    const head = document.createElement('div');
    head.className = 'eq-band-head';
    const enable = document.createElement('input');
    enable.type = 'checkbox';
    const title = document.createElement('span');
    title.textContent = EQ_LABELS[id];
    head.append(enable, title);
    band.append(head);

    const isPeaking = id === 'param1' || id === 'param2';
    const freq = sliderRow('FREQ', EQ_FREQ_RANGES[id], (v) => {
      params.eq[id].freq = v;
      onParamsEdited();
    });
    const gain = sliderRow('GAIN', EQ_GAIN_RANGE, (v) => {
      params.eq[id].gain = v;
      onParamsEdited();
    });
    const q = isPeaking
      ? sliderRow('Q', EQ_Q_RANGE, (v) => {
          params.eq[id].q = v;
          onParamsEdited();
        })
      : null;
    band.append(freq.root, gain.root);
    if (q) band.append(q.root);

    enable.addEventListener('change', () => {
      params.eq[id].enabled = enable.checked;
      onParamsEdited();
      syncBandEnabled(id);
    });

    eqRows[id] = { enable, freq, gain, q };
    wrap.append(band);
  }
}

function syncBandEnabled(id: EqBandId): void {
  const rows = eqRows[id];
  const on = params.eq[id].enabled;
  rows.freq.setEnabled(on);
  rows.gain.setEnabled(on);
  rows.q?.setEnabled(on);
}

// --- rendering params into controls ---

function renderControls(): void {
  amountSlider.value = String(Math.round(params.amount));
  amountReadout.textContent = String(Math.round(params.amount));
  for (const key of Object.keys(COMPRESSOR_RANGES) as Array<keyof CompressorParams>) {
    compRows[key].set(params.compressor[key]);
  }
  for (const id of EQ_BAND_IDS) {
    const rows = eqRows[id];
    rows.enable.checked = params.eq[id].enabled;
    rows.freq.set(params.eq[id].freq);
    rows.gain.set(params.eq[id].gain);
    rows.q?.set(params.eq[id].q);
    syncBandEnabled(id);
  }
  bypassBtn.classList.toggle('active', bypass);
  eqCurve.draw(params);
}

// --- preset picker ---

function rebuildPresetOptions(): void {
  presetSelect.textContent = '';
  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = 'Custom';
  custom.hidden = true;
  presetSelect.append(custom);
  for (const p of BUILT_IN_PRESETS) {
    const opt = document.createElement('option');
    opt.value = `builtin:${p.name}`;
    opt.textContent = p.name;
    presetSelect.append(opt);
  }
  if (userPresets.length > 0) {
    const group = document.createElement('optgroup');
    group.label = 'Your presets';
    for (const p of userPresets) {
      const opt = document.createElement('option');
      opt.value = `user:${p.name}`;
      opt.textContent = p.name;
      group.append(opt);
    }
    presetSelect.append(group);
  }
  presetSelect.value = '';
}

presetSelect.addEventListener('change', () => {
  const v = presetSelect.value;
  const [kind, ...rest] = v.split(':');
  const name = rest.join(':');
  const preset =
    kind === 'builtin'
      ? BUILT_IN_PRESETS.find((p) => p.name === name)
      : userPresets.find((p) => p.name === name);
  if (!preset) return;
  params = structuredClone(preset.params) as SquisherParams;
  renderControls();
  sendParams();
  persistSoon();
});

savePresetBtn.addEventListener('click', () => {
  const name = window.prompt('Preset name:')?.trim();
  if (!name) return;
  userPresets = [
    ...userPresets.filter((p) => p.name !== name),
    { name, params: structuredClone(params) as SquisherParams },
  ];
  void saveUserPresets(userPresets);
  rebuildPresetOptions();
  presetSelect.value = `user:${name}`;
});

// --- edits, sending, persistence ---

function sendParams(): void {
  post({ type: 'setParams', params });
}

function onParamsEdited(): void {
  presetSelect.value = '';
  eqCurve.draw(params);
  sendParams();
  persistSoon();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (rememberBox.checked && hostname) void saveForSite(hostname, params);
    else void saveGlobal(params);
  }, PERSIST_DEBOUNCE_MS);
}

amountSlider.addEventListener('input', () => {
  params = applyAmount(params, Number(amountSlider.value));
  renderControls();
  presetSelect.value = '';
  sendParams();
  persistSoon();
});

bypassBtn.addEventListener('click', () => {
  bypass = !bypass;
  bypassBtn.classList.toggle('active', bypass);
  post({ type: 'setBypass', bypass });
  updateStatus();
});

rememberBox.addEventListener('change', () => {
  if (!hostname) return;
  if (rememberBox.checked) void saveForSite(hostname, params);
  else void clearSite(hostname);
});

clipLed.addEventListener('click', () => {
  clipLatched = false;
  clipLed.classList.remove('lit');
});

// --- port to the content script(s) ---

function post(msg: PopupToContent): void {
  if (port && portAlive) port.postMessage(msg);
}

function handleMessage(msg: ContentToPopup): void {
  if (msg.type === 'state') {
    gotAnyState = true;
    instances.set(msg.instanceId, {
      isTop: msg.isTop,
      hostname: msg.hostname,
      mediaCount: msg.mediaCount,
      contextState: msg.contextState,
    });
    if (msg.isTop && !hostname) {
      hostname = msg.hostname;
      siteName.textContent = hostname;
      void chrome.storage.sync.get(siteKey(hostname)).then((entries) => {
        rememberBox.checked = siteKey(hostname) in entries;
      });
    }
    // Adopt params once, from the first state we see from a frame that has
    // media (falling back to the top frame); after that the popup's own
    // edits are authoritative while it is open. Bypass is always adopted so
    // the keyboard shortcut stays in sync.
    if (!paramsAdopted && (msg.mediaCount > 0 || msg.isTop)) {
      paramsAdopted = true;
      params = msg.params;
      bypass = msg.bypass;
      renderControls();
    }
    bypass = msg.bypass;
    bypassBtn.classList.toggle('active', bypass);
    updateStatus();
  } else {
    meterFrames.set(msg.instanceId, { msg, at: performance.now() });
    if (msg.clipped && !clipLatched) {
      clipLatched = true;
      clipLed.classList.add('lit');
    }
  }
}

function connect(): void {
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id === undefined) {
      showUnavailable();
      return;
    }
    try {
      port = chrome.tabs.connect(tab.id, { name: POPUP_PORT });
    } catch {
      showUnavailable();
      return;
    }
    portAlive = true;
    port.onMessage.addListener((msg: ContentToPopup) => handleMessage(msg));
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError; // expected on pages without a content script
      portAlive = false;
      if (!gotAnyState) showUnavailable();
    });
  });
}

function showUnavailable(): void {
  banner.hidden = false;
  banner.textContent = "Squisher can't run on this page.";
  statusText.textContent = 'unavailable';
  statusDot.className = 'dot';
}

// --- status line + banner ---

function totalMedia(): number {
  let n = 0;
  for (const i of instances.values()) n += i.mediaCount;
  return n;
}

function overallContextState(): ContextState {
  let sawSuspended = false;
  for (const i of instances.values()) {
    if (i.mediaCount === 0) continue;
    if (i.contextState === 'running') return 'running';
    if (i.contextState === 'suspended') sawSuspended = true;
  }
  return sawSuspended ? 'suspended' : 'none';
}

function updateStatus(): void {
  if (!gotAnyState) return;
  const media = totalMedia();
  const state = overallContextState();
  if (media === 0) {
    banner.hidden = false;
    banner.textContent = 'No media elements found on this page.';
    statusText.textContent = 'no media';
    statusDot.className = 'dot';
  } else if (state === 'suspended') {
    banner.hidden = false;
    banner.textContent = 'Click play or anywhere on the page to activate.';
    statusText.textContent = 'suspended';
    statusDot.className = 'dot suspended';
  } else {
    banner.hidden = true;
    if (bypass) {
      statusText.textContent = 'bypassed';
      statusDot.className = 'dot bypassed';
    } else {
      statusText.textContent = `active · ${media} source${media === 1 ? '' : 's'}`;
      statusDot.className = 'dot running';
    }
  }
}

// --- meter loop ---

function aggregateMeters(now: number) {
  let inPeak = 0;
  let inRms = 0;
  let outPeak = 0;
  let outRms = 0;
  let reduction = 0;
  let any = false;
  for (const [id, frame] of meterFrames) {
    if (now - frame.at > METER_STALE_MS) {
      meterFrames.delete(id);
      continue;
    }
    any = true;
    inPeak = Math.max(inPeak, frame.msg.inPeak);
    inRms = Math.max(inRms, frame.msg.inRms);
    outPeak = Math.max(outPeak, frame.msg.outPeak);
    outRms = Math.max(outRms, frame.msg.outRms);
    reduction = Math.min(reduction, frame.msg.reduction);
  }
  return { any, inPeak, inRms, outPeak, outRms, reduction };
}

function fmtDb(db: number): string {
  return db <= -80 || !isFinite(db) ? '-inf' : db.toFixed(1);
}

function meterLoop(now: number): void {
  const m = aggregateMeters(now);
  const grDb = meterGr.draw(m.any ? m.reduction : 0, now);
  const inLevels = meterIn.draw(m.inRms, m.inPeak, now);
  const outLevels = meterOut.draw(m.outRms, m.outPeak, now);
  readoutIn.textContent = fmtDb(m.any ? inLevels.heldDb : -Infinity);
  readoutOut.textContent = fmtDb(m.any ? outLevels.heldDb : -Infinity);
  readoutGr.textContent = grDb <= -0.05 ? grDb.toFixed(1) : '0.0';
  requestAnimationFrame(meterLoop);
}

// --- boot ---

rebuildPresetOptions();
renderControls();
void loadUserPresets().then((presets) => {
  userPresets = presets;
  rebuildPresetOptions();
});
connect();
requestAnimationFrame(meterLoop);
