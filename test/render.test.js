import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, safeHref } from '../src/lib/render.js';

const base = {
  generated_at: '2026-10-16T06:00:00.000Z',
  source: { name: 'Example Reviews' },
  model: 'claude-haiku-5-5',
};

const ok = {
  name: 'Example Palace',
  welcome_bonus: '150% up to 600 EUR + 75 free spins',
  wagering_requirement: 40,
  minimum_deposit: '25 EUR',
  source_url: 'https://www.reviews.example/example-palace',
  status: 'ok',
  warnings: [],
  details: { wagering_applies_to: 'deposit_and_bonus', notes: null },
};

test('renders one row per casino with mobile labels', () => {
  const html = renderPage({ ...base, casinos: [ok] });
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /data-label="Welcome bonus"><div>150% up to 600 EUR \+ 75 free spins/);
  assert.match(html, /40× <span class="muted">deposit \+ bonus<\/span>/);
  assert.match(html, /data-label="Min. deposit"><div>25 EUR/);
  assert.match(html, /href="https:\/\/www\.reviews\.example\/example-palace"[^>]*>reviews\.example</);
  assert.match(html, /16 Oct 2026, 06:00 UTC/);
});

test('escapes scraped values', () => {
  const html = renderPage({
    ...base,
    casinos: [{ ...ok, name: '<img src=x onerror=alert(1)>', welcome_bonus: '"quoted" & <b>bold</b>' }],
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;\/b&gt;/);
});

test('never links non-http URLs', () => {
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('not a url'), null);
  const html = renderPage({ ...base, casinos: [{ ...ok, source_url: 'javascript:alert(1)' }] });
  assert.doesNotMatch(html, /href="javascript:/);
});

test('shows review warnings, missing values and errors', () => {
  const html = renderPage({
    ...base,
    casinos: [
      { ...ok, wagering_requirement: null, status: 'needs_review', warnings: ['Wagering evidence was not found.'] },
      { ...ok, name: 'Walled', status: 'error', error: 'Blocked by source (HTTP 403)' },
    ],
  });
  assert.match(html, /<summary>Check \(1\)<\/summary>/);
  assert.match(html, /data-label="Wagering"><div><span class="muted">Not stated/);
  assert.match(html, /colspan="3"><div><span class="muted">Could not scrape: Blocked by source \(HTTP 403\)/);
});
