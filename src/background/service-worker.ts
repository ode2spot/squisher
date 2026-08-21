// Service worker: relays the toggle-bypass keyboard command to the active
// tab's content scripts and keeps the toolbar badge in sync with per-tab
// activity reported by them.
import type { RuntimeMessage } from '../shared/messages';

/** Per-tab activity by content-script instance (one per frame). Held in
 *  memory only: if the worker sleeps the map resets, but content scripts
 *  re-report on every state change and the badge itself persists. */
const tabActivity = new Map<number, Map<string, boolean>>();

void chrome.action.setBadgeBackgroundColor({ color: '#3ddc84' });
void chrome.action.setBadgeTextColor({ color: '#0c2b18' });

function updateBadge(tabId: number): void {
  const instances = tabActivity.get(tabId);
  const active = instances !== undefined && [...instances.values()].some(Boolean);
  void chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
}

chrome.runtime.onMessage.addListener((raw: RuntimeMessage, sender) => {
  if (raw.type !== 'activity') return;
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  let instances = tabActivity.get(tabId);
  if (!instances) {
    instances = new Map();
    tabActivity.set(tabId, instances);
  }
  instances.set(raw.instanceId, raw.active);
  updateBadge(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActivity.delete(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-bypass') return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id === undefined) return;
    const msg: RuntimeMessage = { type: 'toggleBypass' };
    // Sent without a frameId so every frame's content script receives it.
    void chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  });
});
