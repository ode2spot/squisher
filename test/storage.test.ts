import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_KEY,
  normalizeHostname,
  resolveSettings,
  siteKey,
} from '../src/shared/storage';
import { defaultParams } from '../src/shared/params';

test('normalizeHostname lowercases and strips a trailing dot', () => {
  assert.equal(normalizeHostname('Example.COM'), 'example.com');
  assert.equal(normalizeHostname('example.com.'), 'example.com');
  assert.equal(normalizeHostname('archive.org'), 'archive.org');
});

test('siteKey is stable and namespaced', () => {
  assert.equal(siteKey('archive.org'), 'settings:site:archive.org');
  assert.equal(siteKey('Archive.ORG.'), 'settings:site:archive.org');
  assert.notEqual(siteKey('archive.org'), GLOBAL_KEY);
});

test('resolveSettings prefers site over global over defaults', () => {
  const siteParams = defaultParams();
  siteParams.amount = 65;
  const globalParams = defaultParams();
  globalParams.amount = 30;

  const both = {
    [siteKey('archive.org')]: { params: siteParams },
    [GLOBAL_KEY]: { params: globalParams },
  };
  assert.equal(resolveSettings(both, 'archive.org').source, 'site');
  assert.equal(resolveSettings(both, 'archive.org').params.amount, 65);

  assert.equal(resolveSettings(both, 'other.example').source, 'global');
  assert.equal(resolveSettings(both, 'other.example').params.amount, 30);

  const neither = {};
  const res = resolveSettings(neither, 'archive.org');
  assert.equal(res.source, 'default');
  assert.deepEqual(res.params, defaultParams());
});

test('resolveSettings matches case-insensitively on hostname', () => {
  const params = defaultParams();
  params.amount = 65;
  const entries = { [siteKey('archive.org')]: { params } };
  assert.equal(resolveSettings(entries, 'ARCHIVE.ORG').source, 'site');
});
