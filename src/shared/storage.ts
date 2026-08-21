// Settings persistence in chrome.storage.sync. The pure key/resolution logic
// is separated from the chrome.* calls so it can be unit tested under node.
import { defaultParams, normalizeParams, type SquisherParams } from './params';

export const GLOBAL_KEY = 'settings:global';
export const SITE_KEY_PREFIX = 'settings:site:';
export const USER_PRESETS_KEY = 'userPresets';

export interface StoredSettings {
  params: SquisherParams;
}

export interface UserPreset {
  name: string;
  params: SquisherParams;
}

/** Canonical form of a hostname for use in storage keys. */
export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

export function siteKey(hostname: string): string {
  return SITE_KEY_PREFIX + normalizeHostname(hostname);
}

/**
 * Pick the effective settings for a site from a bag of stored entries:
 * site-specific wins over global wins over defaults.
 */
export function resolveSettings(
  entries: Record<string, unknown>,
  hostname: string,
): { params: SquisherParams; source: 'site' | 'global' | 'default' } {
  // normalizeParams fills in fields older stored versions didn't have.
  const site = entries[siteKey(hostname)] as StoredSettings | undefined;
  if (site?.params) return { params: normalizeParams(site.params), source: 'site' };
  const global = entries[GLOBAL_KEY] as StoredSettings | undefined;
  if (global?.params) return { params: normalizeParams(global.params), source: 'global' };
  return { params: defaultParams(), source: 'default' };
}

// --- chrome.storage wrappers (not unit tested; exercised in the browser) ---

export async function loadSettingsFor(hostname: string) {
  const entries = await chrome.storage.sync.get([GLOBAL_KEY, siteKey(hostname)]);
  return resolveSettings(entries, hostname);
}

export async function saveGlobal(params: SquisherParams): Promise<void> {
  await chrome.storage.sync.set({ [GLOBAL_KEY]: { params } satisfies StoredSettings });
}

export async function saveForSite(hostname: string, params: SquisherParams): Promise<void> {
  await chrome.storage.sync.set({ [siteKey(hostname)]: { params } satisfies StoredSettings });
}

export async function clearSite(hostname: string): Promise<void> {
  await chrome.storage.sync.remove(siteKey(hostname));
}

export async function loadUserPresets(): Promise<UserPreset[]> {
  const entries = await chrome.storage.sync.get(USER_PRESETS_KEY);
  return (entries[USER_PRESETS_KEY] as UserPreset[] | undefined) ?? [];
}

export async function saveUserPresets(presets: UserPreset[]): Promise<void> {
  await chrome.storage.sync.set({ [USER_PRESETS_KEY]: presets });
}
