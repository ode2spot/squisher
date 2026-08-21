import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, normalizeParams } from '../src/shared/params';

test('normalizeParams returns defaults for garbage input', () => {
  assert.deepEqual(normalizeParams(undefined), defaultParams());
  assert.deepEqual(normalizeParams(null), defaultParams());
  assert.deepEqual(normalizeParams(42), defaultParams());
  assert.deepEqual(normalizeParams({}), defaultParams());
});

test('normalizeParams passes a complete parameter set through unchanged', () => {
  const p = defaultParams();
  p.amount = 65;
  p.compressor.ratio = 8;
  p.expander.enabled = true;
  p.eq.param1.gain = 5;
  assert.deepEqual(normalizeParams(p), p);
});

test('normalizeParams fills in the expander for pre-expander stored settings', () => {
  const old = defaultParams() as unknown as Record<string, unknown>;
  delete old.expander;
  (old.compressor as { ratio: number }).ratio = 8;
  const normalized = normalizeParams(old);
  assert.deepEqual(normalized.expander, defaultParams().expander);
  assert.equal(normalized.compressor.ratio, 8);
});

test('normalizeParams fills in missing fields inside sections', () => {
  const partial = {
    amount: 30,
    compressor: { threshold: -20 },
    eq: { param1: { gain: 4 } },
  };
  const normalized = normalizeParams(partial);
  assert.equal(normalized.amount, 30);
  assert.equal(normalized.compressor.threshold, -20);
  assert.equal(normalized.compressor.ratio, defaultParams().compressor.ratio);
  assert.equal(normalized.eq.param1.gain, 4);
  assert.equal(normalized.eq.param1.freq, defaultParams().eq.param1.freq);
  assert.deepEqual(normalized.eq.lowShelf, defaultParams().eq.lowShelf);
});
