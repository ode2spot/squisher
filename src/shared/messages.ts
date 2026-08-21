// The message protocol between the content script, popup and service worker,
// typed as discriminated unions. Both sides import from here.
import type { SquisherParams } from './params';

/** Port name the popup uses to talk to the content script(s) in a tab. */
export const POPUP_PORT = 'squisher-popup';

/** AudioWorklet processor name; must match the registerProcessor call in
 *  content/expander-processor.ts (bundled standalone, can't import this). */
export const EXPANDER_PROCESSOR_NAME = 'squisher-expander';

export type ContextState = 'none' | 'running' | 'suspended';

/** Content script -> popup, over the popup port. */
export type ContentToPopup =
  | {
      type: 'state';
      /** Random id for this content-script instance (one per frame). */
      instanceId: string;
      /** True for the top frame; the popup uses its hostname. */
      isTop: boolean;
      hostname: string;
      mediaCount: number;
      contextState: ContextState;
      bypass: boolean;
      /** False when the expander worklet failed to load in this frame
       *  (e.g. blocked by site CSP); the rest of the chain still runs. */
      expanderAvailable: boolean;
      params: SquisherParams;
    }
  | {
      type: 'meters';
      instanceId: string;
      /** Linear amplitudes (1.0 = full scale); popup converts via db.ts. */
      inPeak: number;
      inRms: number;
      /** dB of gain reduction from DynamicsCompressorNode.reduction (<= 0). */
      reduction: number;
      /** dB of upward-expansion boost from the expander worklet (>= 0). */
      expBoost: number;
      outPeak: number;
      outRms: number;
      /** True if any output sample hit full scale during this frame. */
      clipped: boolean;
    };

/** Popup -> content script, over the popup port. */
export type PopupToContent =
  | { type: 'getState' }
  | { type: 'setParams'; params: SquisherParams }
  | { type: 'setBypass'; bypass: boolean };

/** One-shot chrome.runtime / chrome.tabs messages. */
export type RuntimeMessage =
  | { type: 'activity'; instanceId: string; active: boolean } // content -> service worker (badge)
  | { type: 'toggleBypass' }; // service worker -> content (keyboard command)
