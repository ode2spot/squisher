import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  dbToLinear,
  linearToDb,
  linToNorm,
  logToNorm,
  normToLin,
  normToLog,
  peak,
  rms,
} from '../src/shared/db';

test('linearToDb known values', () => {
  assert.equal(linearToDb(1), 0);
  assert.ok(Math.abs(linearToDb(0.5) - -6.0206) < 1e-3);
  assert.ok(Math.abs(linearToDb(0.1) - -20) < 1e-9);
  assert.equal(linearToDb(0), -Infinity);
});

test('dbToLinear known values', () => {
  assert.equal(dbToLinear(0), 1);
  assert.ok(Math.abs(dbToLinear(-20) - 0.1) < 1e-9);
  assert.ok(Math.abs(dbToLinear(6) - 1.9953) < 1e-3);
});

test('linearToDb and dbToLinear round-trip', () => {
  for (const db of [-60, -24, -6.5, -3, 0, 12]) {
    assert.ok(Math.abs(linearToDb(dbToLinear(db)) - db) < 1e-9);
  }
});

test('peak finds the largest absolute sample', () => {
  assert.equal(peak(new Float32Array([0.125, -0.75, 0.5])), 0.75);
  assert.equal(peak(new Float32Array([])), 0);
});

test('rms of a full-scale sine is ~-3.01 dBFS', () => {
  const n = 48000;
  const sine = new Float32Array(n);
  for (let i = 0; i < n; i++) sine[i] = Math.sin((2 * Math.PI * 480 * i) / n);
  const db = linearToDb(rms(sine));
  assert.ok(Math.abs(db - -3.0103) < 0.01, `got ${db}`);
});

test('rms of silence and of empty buffer is 0', () => {
  assert.equal(rms(new Float32Array(128)), 0);
  assert.equal(rms(new Float32Array([])), 0);
});

test('log slider mapping round-trips and hits endpoints', () => {
  assert.equal(logToNorm(20, 20, 20000), 0);
  assert.equal(logToNorm(20000, 20, 20000), 1);
  assert.ok(Math.abs(normToLog(0.5, 20, 20000) - Math.sqrt(20 * 20000)) < 1e-6);
  for (const v of [20, 155, 1000, 12345, 20000]) {
    assert.ok(Math.abs(normToLog(logToNorm(v, 20, 20000), 20, 20000) - v) < 1e-6);
  }
});

test('linear slider mapping round-trips and clamps', () => {
  assert.equal(linToNorm(-60, -60, 0), 0);
  assert.equal(linToNorm(0, -60, 0), 1);
  assert.equal(linToNorm(10, -60, 0), 1);
  assert.equal(normToLin(0.5, -60, 0), -30);
  assert.equal(normToLin(2, -60, 0), 0);
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});
