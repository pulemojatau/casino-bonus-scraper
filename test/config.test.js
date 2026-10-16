import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, loadConfig } from '../src/lib/config.js';

test('the shipped config is valid and uses one source', async () => {
  const config = await loadConfig(new URL('../config/sources.json', import.meta.url));
  assert.equal(config.casinos.length, 3);
});

test('rejects casinos from more than one source', () => {
  assert.throws(
    () =>
      parseConfig({
        casinos: [
          { name: 'A', url: 'https://one.example/a' },
          { name: 'B', url: 'https://two.example/b' },
        ],
      }),
    /one source/,
  );
});

test('rejects non-http URLs and missing names', () => {
  assert.throws(() => parseConfig({ casinos: [{ name: 'A', url: 'file:///etc/passwd' }] }), /http/);
  assert.throws(() => parseConfig({ casinos: [{ url: 'https://a.example' }] }), /name/);
  assert.throws(() => parseConfig({ casinos: [] }), /non-empty/);
});
