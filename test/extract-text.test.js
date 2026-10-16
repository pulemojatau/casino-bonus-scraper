import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlToLines, focusBonusText, extractBonusText } from '../src/lib/extract-text.js';

const html = readFileSync(new URL('./fixtures/review.html', import.meta.url), 'utf8');

test('htmlToLines drops scripts, styles, nav, footer and hidden elements', () => {
  const text = htmlToLines(html).lines.join('\n');
  assert.doesNotMatch(text, /tracking-should-not-appear/);
  assert.doesNotMatch(text, /color: gold/);
  assert.doesNotMatch(text, /Deposit methods/); // nav
  assert.doesNotMatch(text, /Gamble responsibly/); // footer
  assert.doesNotMatch(text, /cookies/); // aria-hidden
});

test('htmlToLines keeps the promo terms and table rows on one line', () => {
  const { title, lines } = htmlToLines(html);
  assert.equal(title, 'Example Palace Casino Review');
  assert.ok(lines.includes('150% Welcome Bonus up to €600 + 75 Free Spins'));
  assert.ok(lines.includes('Min deposit | €10'));
  assert.ok(lines.some((l) => l.includes('Bonuses must be wagered 40 times within 30 days.')));
});

test('focusBonusText keeps bonus lines and drops unrelated paragraphs', () => {
  const { text } = extractBonusText(html);
  assert.match(text, /Min deposit is €25/);
  assert.match(text, /wagering requirement of forty times/);
  assert.doesNotMatch(text, /colour scheme is purple/);
});

test('focusBonusText marks gaps and respects maxChars', () => {
  const lines = ['bonus one', 'x', 'y', 'z', 'q', 'r', 'deposit two'];
  assert.equal(focusBonusText(lines, { window: 0 }), 'bonus one\n…\ndeposit two');
  assert.equal(focusBonusText(lines, { window: 0, maxChars: 12 }), 'bonus one');
});
