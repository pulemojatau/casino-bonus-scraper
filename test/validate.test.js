import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateExtraction, isGrounded, mentionsNumber } from '../src/lib/validate.js';

const PAGE = [
  '150% Welcome Bonus up to €600 + 75 Free Spins',
  '18+. New players only. Min deposit is €25. Bonuses must be wagered 40 times within 30 days.',
  'Winnings from the free spins carry a wagering requirement of forty times.',
  'High rollers: 200% up to €2,500.',
].join('\n');

const good = {
  welcome_bonus: '150% up to 600 EUR + 75 free spins',
  wagering_requirement: 40,
  wagering_applies_to: 'bonus',
  minimum_deposit: { amount: 25, currency: 'eur' },
  evidence: {
    welcome_bonus: '150% Welcome Bonus up to €600 + 75 Free Spins',
    wagering_requirement: 'Bonuses must be wagered 40 times',
    minimum_deposit: 'Min deposit is €25.',
  },
  notes: null,
};

test('a grounded extraction passes with no warnings', () => {
  const result = validateExtraction(good, PAGE);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.welcome_bonus, '150% up to 600 EUR + 75 free spins');
  assert.equal(result.wagering_requirement, 40);
  assert.equal(result.minimum_deposit, '25 EUR');
});

test('evidence that is not on the page is flagged', () => {
  const result = validateExtraction(
    { ...good, evidence: { ...good.evidence, wagering_requirement: 'Wagering: 40x the bonus' } },
    PAGE,
  );
  assert.equal(result.wagering_requirement, 40); // kept, but flagged for review
  assert.match(result.warnings.join(' '), /Wagering evidence was not found/);
});

test('numbers in the welcome bonus that are not on the page are flagged', () => {
  const result = validateExtraction({ ...good, welcome_bonus: '150% up to 1000 EUR' }, PAGE);
  assert.match(result.warnings.join(' '), /mentions 1000/);
});

test('a multiplier that does not match its evidence is flagged', () => {
  const result = validateExtraction({ ...good, wagering_requirement: 35 }, PAGE);
  assert.match(result.warnings.join(' '), /does not contain 35/);
});

test('implausible values are dropped', () => {
  const result = validateExtraction(
    { ...good, wagering_requirement: 4000, minimum_deposit: { amount: -5, currency: 'EUR' } },
    PAGE,
  );
  assert.equal(result.wagering_requirement, null);
  assert.equal(result.minimum_deposit, null);
  assert.equal(result.warnings.length, 2);
});

test('missing welcome bonus is reported, not invented', () => {
  const result = validateExtraction({ ...good, welcome_bonus: null }, PAGE);
  assert.equal(result.welcome_bonus, null);
  assert.match(result.warnings[0], /No welcome bonus/);
});

test('grounding ignores case, whitespace, typography and thousands separators', () => {
  assert.ok(isGrounded('min  DEPOSIT is €25', PAGE));
  assert.ok(isGrounded('200% up to €2500', PAGE));
  assert.ok(!isGrounded('', PAGE));
  assert.ok(mentionsNumber('wagering requirement of forty times', 40));
  assert.ok(mentionsNumber('wagered 40x', 40));
  assert.ok(!mentionsNumber('wagered 400x', 40));
  assert.ok(!mentionsNumber('€140', 40));
});
