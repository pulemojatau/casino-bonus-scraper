import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRobotsChecker } from '../src/lib/robots.js';
import { fakeFetch } from './helpers.js';

const UA = 'CasinoBonusScraper/1.0';
const ORIGIN = 'https://example.com';

const ROBOTS = `
User-agent: wget
Disallow: /

User-agent: *
Disallow: /go/
Crawl-delay: 5
`;

test('allows paths not disallowed for our user agent and reads crawl-delay', async () => {
  const fetchImpl = fakeFetch({ [`${ORIGIN}/robots.txt`]: { body: ROBOTS } });
  const robots = createRobotsChecker({ userAgent: UA, fetchImpl });

  const result = await robots.check(`${ORIGIN}/reviews/casino-a`);
  assert.equal(result.allowed, true);
  assert.equal(result.crawlDelayMs, 5000);
});

test('blocks disallowed paths', async () => {
  const fetchImpl = fakeFetch({ [`${ORIGIN}/robots.txt`]: { body: ROBOTS } });
  const robots = createRobotsChecker({ userAgent: UA, fetchImpl });

  const result = await robots.check(`${ORIGIN}/go/casino-a`);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /robots\.txt/);
});

test('rules for other named bots do not apply to us', async () => {
  const fetchImpl = fakeFetch({ [`${ORIGIN}/robots.txt`]: { body: ROBOTS } });
  const robots = createRobotsChecker({ userAgent: UA, fetchImpl });
  assert.equal((await robots.check(`${ORIGIN}/`)).allowed, true);
});

test('missing robots.txt (4xx) means allowed, per RFC 9309', async () => {
  const fetchImpl = fakeFetch({ [`${ORIGIN}/robots.txt`]: { status: 404 } });
  const robots = createRobotsChecker({ userAgent: UA, fetchImpl });
  assert.equal((await robots.check(`${ORIGIN}/anything`)).allowed, true);
});

test('server error or network failure on robots.txt means disallowed', async () => {
  const robots5xx = createRobotsChecker({
    userAgent: UA,
    fetchImpl: fakeFetch({ [`${ORIGIN}/robots.txt`]: { status: 503 } }),
  });
  assert.equal((await robots5xx.check(`${ORIGIN}/a`)).allowed, false);

  const robotsDown = createRobotsChecker({
    userAgent: UA,
    fetchImpl: fakeFetch({ [`${ORIGIN}/robots.txt`]: new Error('ECONNRESET') }),
  });
  const result = await robotsDown.check(`${ORIGIN}/a`);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /unreachable/);
});

test('robots.txt is fetched once per origin', async () => {
  const fetchImpl = fakeFetch({ [`${ORIGIN}/robots.txt`]: { body: ROBOTS } });
  const robots = createRobotsChecker({ userAgent: UA, fetchImpl });
  await Promise.all([robots.check(`${ORIGIN}/a`), robots.check(`${ORIGIN}/b`)]);
  assert.equal(fetchImpl.calls.length, 1);
});
