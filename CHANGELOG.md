# Changelog

## 0.1.0 — 2026-08-20

Initial release.

- Per-media-element processing chain: upward expander (AudioWorklet, lifts
  quiet dialogue) into 4-band EQ (low shelf, two parametric peaks, high
  shelf) into a compressor with makeup gain. The compressor node's hidden automatic
  makeup is cancelled so the makeup control is true post-compression gain.
- Media discovery on load and via MutationObserver, including open shadow
  roots; handles element removal and sites that already use Web Audio.
- Popup with input / gain-reduction / output meters (peak + RMS, peak hold,
  latching clip indicator), EQ magnitude-response curve, Amount macro,
  advanced per-parameter controls.
- Presets: Off, Gentle, Medium, Heavy, Old film dialogue; user presets.
- Global settings with per-site override in `chrome.storage.sync`.
- True bypass via popup button or `Alt+Shift+S`; toolbar badge while active.
