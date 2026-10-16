#!/usr/bin/env node
// Pre-flight: checks robots.txt and fetches each page, without calling the
// LLM. Run this first to confirm the source is reachable from your network.
// Usage: npm run check [-- --show]
import { parseArgs } from 'node:util';
import { loadConfig } from '../lib/config.js';
import { createRobotsChecker } from '../lib/robots.js';
import { fetchPage } from '../lib/http.js';
import { extractBonusText } from '../lib/extract-text.js';
import { DEFAULT_CONFIG } from './paths.js';

const { values: args } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG },
    show: { type: 'boolean', default: false },
  },
});

const config = await loadConfig(args.config);
const robots = createRobotsChecker({ userAgent: config.userAgent, timeoutMs: config.timeoutMs });
let problems = 0;

for (const [index, casino] of config.casinos.entries()) {
  try {
    const rule = await robots.check(casino.url);
    if (!rule.allowed) throw new Error(`robots.txt: ${rule.reason}`);
    if (index > 0) await new Promise((r) => setTimeout(r, Math.max(config.requestDelayMs, rule.crawlDelayMs)));
    const { html } = await fetchPage(casino.url, { userAgent: config.userAgent, timeoutMs: config.timeoutMs });
    const { title, text } = extractBonusText(html);
    console.log(`✓ ${casino.name}: robots ok, ${Math.round(html.length / 1024)} KB, ${text.length} chars of bonus text ("${title}")`);
    if (args.show) console.log(`${text}\n`);
    else console.log(`  ${text.split('\n').slice(0, 3).join('\n  ')}`);
  } catch (err) {
    problems += 1;
    console.log(`✗ ${casino.name}: ${err.message}`);
  }
}

process.exitCode = problems ? 1 : 0;
