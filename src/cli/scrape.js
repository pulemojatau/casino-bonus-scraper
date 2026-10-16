#!/usr/bin/env node
// Usage: npm run scrape [-- --config path/to/sources.json --out path/to/out.json]
import { parseArgs } from 'node:util';
import { loadConfig } from '../lib/config.js';
import { createExtractor, DEFAULT_MODEL } from '../lib/llm.js';
import { runScrape } from '../lib/pipeline.js';
import { DEFAULT_CONFIG, DEFAULT_DATA, loadDotEnv, writeFileAtomic } from './paths.js';

const { values: args } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG },
    out: { type: 'string', default: DEFAULT_DATA },
  },
});

loadDotEnv();
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(2);
}

const config = await loadConfig(args.config);
const extractor = createExtractor({ apiKey, model: process.env.LLM_MODEL || DEFAULT_MODEL });

console.log(`Scraping ${config.casinos.length} casinos from ${config.source?.name ?? 'source'} with ${extractor.model}`);
const result = await runScrape({ config, extractor, log: (line) => console.log(line) });

const count = (status) => result.casinos.filter((c) => c.status === status).length;
const [ok, review, failed] = [count('ok'), count('needs_review'), count('error')];

if (failed === result.casinos.length) {
  console.error('Every casino failed; leaving the previous output untouched.');
  process.exit(1);
}

await writeFileAtomic(args.out, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${args.out} (${ok} ok, ${review} to review, ${failed} failed)`);

// Non-zero exit on partial failure so a scheduler or CI run notices it.
process.exitCode = failed > 0 ? 1 : 0;
