#!/usr/bin/env node
// Usage: npm run build [-- --data data/casinos.json --out dist]
import { parseArgs } from 'node:util';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderPage } from '../lib/render.js';
import { DEFAULT_DATA, DEFAULT_DIST, writeFileAtomic } from './paths.js';

const { values: args } = parseArgs({
  options: {
    data: { type: 'string', default: DEFAULT_DATA },
    out: { type: 'string', default: DEFAULT_DIST },
  },
});

if (!existsSync(args.data)) {
  console.error(`No data at ${args.data}. Run "npm run scrape" first.`);
  process.exit(1);
}

const data = JSON.parse(await readFile(args.data, 'utf8'));
await mkdir(args.out, { recursive: true });
await writeFileAtomic(resolve(args.out, 'index.html'), renderPage(data));
await copyFile(args.data, resolve(args.out, 'casinos.json'));
console.log(`Built ${resolve(args.out, 'index.html')} from ${data.casinos?.length ?? 0} casinos`);
