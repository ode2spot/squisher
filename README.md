# Squisher

A Manifest V3 browser extension that compresses and EQs the audio of
`<video>`/`<audio>` elements on the current tab, with real metering. Built for
old films whose dialogue is too quiet and effects too loud, but useful on
anything with wild dynamics.

Per media element the audio is routed through Web Audio:

```
MediaElementSource
  → input analyser
  → EQ: low shelf → peak 1 → peak 2 → high shelf
  → DynamicsCompressor
  → makeup gain
  → output analyser
  → destination
```

The makeup gain control is honest: `DynamicsCompressorNode` applies a hidden
automatic makeup gain (per the Web Audio spec, ~+17 dB at heavy settings),
which the graph cancels so the knob reads as true post-compression gain and
loud onsets don't slam the clip ceiling.

The popup shows input level, gain reduction, and output level (peak + RMS,
peak hold, latching clip indicator), an Amount macro that drives
threshold/ratio/makeup together, collapsible advanced compressor and 4-band
EQ controls with a live magnitude-response curve, presets (built-in and
user-saved), a per-site "remember" toggle, and true bypass — also on
`Alt+Shift+S`. The toolbar badge reads `ON` while processing is active.

## Limitations

- **Cross-origin media without CORS headers**: the browser lets Web Audio
  process such streams but zeroes the samples, so the tab goes **silent** or
  stays unprocessed and the meters read nothing. Same-origin and properly
  CORS-served media (most players) work fine.
- **DRM/EME content** (Netflix, Spotify, etc.) cannot be tapped at all.
- Sites that already route their audio through Web Audio claim the element
  first; Squisher leaves those elements alone.

## Loading it

Build the zip / unpacked directory first (`make ext` or `make package`), then:

- **Edge**: `edge://extensions` → enable **Developer mode** → **Load
  unpacked** → pick `dist/extension/`.
- **Chrome**: `chrome://extensions` → enable **Developer mode** → **Load
  unpacked** → pick `dist/extension/`.

`dist/squisher-<version>.zip` from `make package` is the store-upload
artifact (Edge Add-ons / Chrome Web Store); its contents are identical to
`dist/extension/`.

## Development

Everything runs in the dev container. Dev-environment conventions follow
`../sigil_dsp` (the most recently modified sibling repo with the full
docker-compose + devcontainer + `run-in-docker.sh` layout; `pocketbeagle2_bsp`
is newer but its host/container Makefile split is Yocto/WSL-specific):
in-container make targets guarded by an env var, one-off host commands via
`./scripts/run-in-docker.sh <command>`. Tests run through `tsx` (no sibling
repo had a node/TS precedent, so the lighter option won).

| Target         | Where     | What                                           |
| -------------- | --------- | ---------------------------------------------- |
| `make build`   | host      | Build the dev container image                  |
| `make shell`   | host      | Drop into the container                        |
| `make dev`     | container | esbuild watch mode, rebuilds `dist/extension/` |
| `make ext`     | container | One-shot production build to `dist/extension/` |
| `make lint`    | container | `tsc --noEmit` + eslint + prettier check       |
| `make fmt`     | container | prettier write                                 |
| `make test`    | container | Unit tests via node's built-in runner          |
| `make package` | container | Build `dist/squisher-<version>.zip`            |
| `make clean`   | container | Remove build artifacts                         |

After a rebuild, reload the extension from the browser's extensions page to
pick up changes.

Layout: `src/content/` (media discovery + audio graph), `src/popup/`,
`src/background/` (badge + keyboard command relay), `src/shared/` (parameter
model, presets, storage, dB math, message protocol — the popup and content
script both import from here, and `src/shared/params.ts` is the single
source of truth the rest derives from).

## Adding a preset

Add an entry to `BUILT_IN_PRESETS` in `src/shared/presets.ts`:

```ts
preset('My preset', (p) => {
  p.amount = 40;
  p.compressor = { threshold: -22, knee: 25, ratio: 3, attack: 0.008, release: 0.3, makeupGain: 4 };
  p.eq.param1 = { enabled: true, freq: 3000, gain: 2, q: 1.5 };
}),
```

The callback mutates a copy of the defaults, so only set what differs. The
preset-shape test in `test/presets.test.ts` checks every preset against the
declared parameter ranges. Users can save their own presets from the popup
(the `＋` button next to the preset picker).
