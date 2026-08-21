import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountToCompressor, applyAmount, BUILT_IN_PRESETS } from '../src/shared/presets';
import {
  COMPRESSOR_RANGES,
  defaultParams,
  EQ_BAND_IDS,
  EXPANDER_RANGES,
} from '../src/shared/params';

test('amount 0 means no compression', () => {
  const c = amountToCompressor(0);
  assert.equal(c.ratio, 1);
  assert.equal(c.makeupGain, 0);
});

test('amount 100 hits the aggressive end of every range', () => {
  const c = amountToCompressor(100);
  assert.equal(c.threshold, -40);
  assert.equal(c.ratio, 20);
  assert.equal(c.makeupGain, 6);
});

test('amount is clamped to 0..100', () => {
  assert.deepEqual(amountToCompressor(-50), amountToCompressor(0));
  assert.deepEqual(amountToCompressor(500), amountToCompressor(100));
});

test('macro curve is monotonic in every driven param', () => {
  let prev = amountToCompressor(0);
  for (let a = 1; a <= 100; a++) {
    const cur = amountToCompressor(a);
    assert.ok(cur.threshold < prev.threshold, `threshold not falling at ${a}`);
    assert.ok(cur.ratio > prev.ratio, `ratio not rising at ${a}`);
    assert.ok(cur.makeupGain > prev.makeupGain, `makeup not rising at ${a}`);
    prev = cur;
  }
});

test('applyAmount only touches the driven params', () => {
  const base = defaultParams();
  base.compressor.knee = 12;
  base.compressor.attack = 0.02;
  base.eq.param1.gain = 5;
  const out = applyAmount(base, 80);
  assert.equal(out.amount, 80);
  assert.equal(out.compressor.knee, 12);
  assert.equal(out.compressor.attack, 0.02);
  assert.equal(out.eq.param1.gain, 5);
  assert.notEqual(out.compressor.threshold, base.compressor.threshold);
});

test('applyAmount stays inside the declared ranges at the extremes', () => {
  for (const a of [0, 100]) {
    const c = applyAmount(defaultParams(), a).compressor;
    for (const key of ['threshold', 'ratio', 'makeupGain'] as const) {
      assert.ok(c[key] >= COMPRESSOR_RANGES[key].min, `${key} below min at amount ${a}`);
      assert.ok(c[key] <= COMPRESSOR_RANGES[key].max, `${key} above max at amount ${a}`);
    }
  }
});

test('built-in presets exist and are complete', () => {
  const names = BUILT_IN_PRESETS.map((p) => p.name);
  assert.deepEqual(names, ['Off', 'Gentle', 'Medium', 'Heavy', 'Old film dialogue']);
  for (const p of BUILT_IN_PRESETS) {
    for (const band of EQ_BAND_IDS) {
      assert.ok(p.params.eq[band], `${p.name} missing eq band ${band}`);
    }
    for (const [key, range] of Object.entries(COMPRESSOR_RANGES)) {
      const v = p.params.compressor[key as keyof typeof p.params.compressor];
      assert.ok(v >= range.min && v <= range.max, `${p.name} ${key}=${v} out of range`);
    }
    for (const [key, range] of Object.entries(EXPANDER_RANGES)) {
      const v = p.params.expander[key as keyof typeof EXPANDER_RANGES];
      assert.ok(v >= range.min && v <= range.max, `${p.name} expander ${key}=${v} out of range`);
    }
  }
});

test('"Off" preset is flat', () => {
  const off = BUILT_IN_PRESETS[0]!;
  assert.equal(off.params.compressor.ratio, 1);
  assert.equal(off.params.compressor.makeupGain, 0);
  for (const band of EQ_BAND_IDS) {
    assert.equal(off.params.eq[band].enabled, false);
    assert.equal(off.params.eq[band].gain, 0);
  }
});

test('only "Old film dialogue" enables the expander', () => {
  for (const p of BUILT_IN_PRESETS) {
    assert.equal(p.params.expander.enabled, p.name === 'Old film dialogue', p.name);
  }
});

test('"Old film dialogue" preset has the prescribed EQ', () => {
  const p = BUILT_IN_PRESETS.find((x) => x.name === 'Old film dialogue')!;
  assert.deepEqual(p.params.eq.lowShelf, { enabled: true, freq: 120, gain: -4, q: 1 });
  assert.deepEqual(p.params.eq.param1, { enabled: true, freq: 2500, gain: 3, q: 1.2 });
  assert.deepEqual(p.params.eq.highShelf, { enabled: true, freq: 8000, gain: -2, q: 1 });
});
