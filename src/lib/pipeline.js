import { createHash } from 'node:crypto';
import { createRobotsChecker } from './robots.js';
import { fetchPage } from './http.js';
import { extractBonusText } from './extract-text.js';
import { validateExtraction } from './validate.js';

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scrape every casino in the config: robots.txt check -> fetch -> text
 * extraction -> LLM -> validation. One casino failing does not stop the
 * others; its entry is recorded with status "error" and the reason.
 */
export async function runScrape({
  config,
  extractor,
  fetchImpl = fetch,
  sleep = sleepDefault,
  now = () => new Date(),
  log = () => {},
}) {
  const { userAgent, timeoutMs, requestDelayMs } = config;
  const robots = createRobotsChecker({ userAgent, fetchImpl, timeoutMs });
  const casinos = [];

  for (const [index, casino] of config.casinos.entries()) {
    try {
      const rule = await robots.check(casino.url);
      if (!rule.allowed) throw new Error(`Skipped: ${rule.reason}`);
      if (index > 0) await sleep(Math.max(requestDelayMs, rule.crawlDelayMs));

      const { html, finalUrl } = await fetchPage(casino.url, { userAgent, timeoutMs, fetchImpl, sleep });
      if (finalUrl !== casino.url) {
        // A redirect (e.g. geo-targeting) can land somewhere robots.txt disallows.
        const redirected = await robots.check(finalUrl);
        if (!redirected.allowed) throw new Error(`Redirected to ${finalUrl}, ${redirected.reason}`);
      }
      const { title, text } = extractBonusText(html);
      if (!text) throw new Error('No bonus-related text found on the page');

      const { data } = await extractor.extract({ casinoName: casino.name, url: casino.url, text });
      const checked = validateExtraction(data, text);

      const entry = {
        name: casino.name,
        welcome_bonus: checked.welcome_bonus,
        wagering_requirement: checked.wagering_requirement,
        minimum_deposit: checked.minimum_deposit,
        source_url: casino.url,
        status: checked.warnings.length ? 'needs_review' : 'ok',
        warnings: checked.warnings,
        details: {
          ...checked.details,
          page_title: title,
          content_sha256: sha256(text),
          scraped_at: now().toISOString(),
        },
      };
      casinos.push(entry);
      log(formatLine(entry));
    } catch (err) {
      const entry = {
        name: casino.name,
        welcome_bonus: null,
        wagering_requirement: null,
        minimum_deposit: null,
        source_url: casino.url,
        status: 'error',
        warnings: [],
        error: err.message,
      };
      casinos.push(entry);
      log(formatLine(entry));
    }
  }

  return {
    generated_at: now().toISOString(),
    source: config.source ?? null,
    model: extractor.model ?? null,
    casinos,
  };
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function formatLine(entry) {
  if (entry.status === 'error') return `✗ ${entry.name}: ${entry.error}`;
  const fields = [
    entry.welcome_bonus ?? '—',
    entry.wagering_requirement != null ? `${entry.wagering_requirement}x` : '—',
    entry.minimum_deposit ?? '—',
  ].join(' | ');
  const flag = entry.status === 'needs_review' ? `  (review: ${entry.warnings.join(' ')})` : '';
  return `${entry.status === 'ok' ? '✓' : '!'} ${entry.name}: ${fields}${flag}`;
}
