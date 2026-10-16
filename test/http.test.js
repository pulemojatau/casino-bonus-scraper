import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage, BlockedError, HttpError } from '../src/lib/http.js';
import { fakeFetch, noSleep } from './helpers.js';

const URL_A = 'https://example.com/a';
const opts = (fetchImpl) => ({ userAgent: 'test', fetchImpl, sleep: noSleep });

test('returns html on 200 and sends our user agent', async () => {
  const fetchImpl = fakeFetch({ [URL_A]: { body: '<h1>ok</h1>' } });
  const { html } = await fetchPage(URL_A, opts(fetchImpl));
  assert.equal(html, '<h1>ok</h1>');
  assert.equal(fetchImpl.calls[0].init.headers['user-agent'], 'test');
});

test('403 is treated as a block and not retried', async () => {
  const fetchImpl = fakeFetch({ [URL_A]: { status: 403 } });
  await assert.rejects(fetchPage(URL_A, opts(fetchImpl)), BlockedError);
  assert.equal(fetchImpl.calls.length, 1);
});

test('a CAPTCHA / challenge page is treated as a block', async () => {
  const body = '<html><head><title>Just a moment...</title></head></html>';
  const fetchImpl = fakeFetch({ [URL_A]: { body } });
  await assert.rejects(fetchPage(URL_A, opts(fetchImpl)), /Not bypassing/);
});

test('retries transient 5xx then succeeds', async () => {
  const fetchImpl = fakeFetch({
    [URL_A]: (n) => (n < 2 ? { status: 502 } : { body: 'fine' }),
  });
  const { html } = await fetchPage(URL_A, opts(fetchImpl));
  assert.equal(html, 'fine');
  assert.equal(fetchImpl.calls.length, 2);
});

test('gives up after retries on persistent 5xx', async () => {
  const fetchImpl = fakeFetch({ [URL_A]: { status: 500 } });
  await assert.rejects(fetchPage(URL_A, { ...opts(fetchImpl), retries: 2 }), HttpError);
  assert.equal(fetchImpl.calls.length, 3);
});

test('404 fails fast with HttpError', async () => {
  const fetchImpl = fakeFetch({});
  await assert.rejects(fetchPage(URL_A, opts(fetchImpl)), (err) => err.status === 404);
  assert.equal(fetchImpl.calls.length, 1);
});
