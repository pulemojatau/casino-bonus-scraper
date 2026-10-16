import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScrape } from '../src/lib/pipeline.js';
import { parseConfig } from '../src/lib/config.js';
import { fakeFetch, noSleep } from './helpers.js';

const html = readFileSync(new URL('./fixtures/review.html', import.meta.url), 'utf8');
const ORIGIN = 'https://reviews.example';

const config = parseConfig({
  source: { name: 'Example Reviews', homepage: ORIGIN },
  userAgent: 'TestBot/1.0',
  casinos: [
    { name: 'Example Palace', url: `${ORIGIN}/reviews/example-palace` },
    { name: 'Private Casino', url: `${ORIGIN}/members/private-casino` },
    { name: 'Walled Casino', url: `${ORIGIN}/reviews/walled` },
  ],
});

const routes = {
  [`${ORIGIN}/robots.txt`]: { body: 'User-agent: *\nDisallow: /members/\n' },
  [`${ORIGIN}/reviews/example-palace`]: { body: html },
  [`${ORIGIN}/reviews/walled`]: { status: 403 },
};

const extractor = {
  model: 'fake-model',
  calls: [],
  async extract(input) {
    this.calls.push(input);
    return {
      data: {
        welcome_bonus: '150% up to 600 EUR + 75 free spins',
        wagering_requirement: 40,
        wagering_applies_to: 'bonus',
        minimum_deposit: { amount: 25, currency: 'EUR' },
        evidence: {
          welcome_bonus: '150% Welcome Bonus up to €600 + 75 Free Spins',
          wagering_requirement: 'Bonuses must be wagered 40 times',
          minimum_deposit: 'Min deposit is €25',
        },
        notes: 'Payments section gives a general €10 minimum.',
      },
    };
  },
};

test('scrapes allowed pages, skips robots-disallowed ones and records blocks', async () => {
  const fetchImpl = fakeFetch(routes);
  const fixedNow = () => new Date('2026-10-16T08:00:00Z');
  const result = await runScrape({ config, extractor, fetchImpl, sleep: noSleep, now: fixedNow });

  assert.equal(result.model, 'fake-model');
  assert.equal(result.generated_at, '2026-10-16T08:00:00.000Z');
  assert.equal(result.casinos.length, 3);

  const [palace, privateCasino, walled] = result.casinos;
  assert.equal(palace.status, 'ok');
  assert.equal(palace.welcome_bonus, '150% up to 600 EUR + 75 free spins');
  assert.equal(palace.wagering_requirement, 40);
  assert.equal(palace.minimum_deposit, '25 EUR');
  assert.equal(palace.source_url, `${ORIGIN}/reviews/example-palace`);
  assert.match(palace.details.content_sha256, /^[0-9a-f]{64}$/);

  assert.equal(privateCasino.status, 'error');
  assert.match(privateCasino.error, /robots\.txt/);

  assert.equal(walled.status, 'error');
  assert.match(walled.error, /Blocked by source \(HTTP 403\)/);

  // The disallowed page was never requested; only robots.txt + 2 pages were.
  const requested = fetchImpl.calls.map((c) => c.url);
  assert.ok(!requested.includes(`${ORIGIN}/members/private-casino`));
  assert.equal(requested.filter((u) => u.endsWith('robots.txt')).length, 1);

  // The LLM only ever sees focused text, not raw HTML.
  assert.equal(extractor.calls.length, 1);
  assert.doesNotMatch(extractor.calls[0].text, /<script|tracking-should-not-appear/);
});

test('waits between page requests, honouring the configured delay', async () => {
  const waits = [];
  await runScrape({
    config: { ...config, requestDelayMs: 1234 },
    extractor,
    fetchImpl: fakeFetch(routes),
    sleep: async (ms) => waits.push(ms),
  });
  // One wait, before casino 3: casino 2 is skipped by robots.txt before any request.
  assert.ok(waits.includes(1234));
  assert.ok(waits.every((ms) => ms >= 1234));
});
