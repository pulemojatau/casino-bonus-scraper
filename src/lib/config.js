import { readFile } from 'node:fs/promises';

const DEFAULTS = {
  requestDelayMs: 3000,
  timeoutMs: 20000,
  userAgent: 'CasinoBonusScraper/1.0',
};

/**
 * Load and validate the sources config. All casinos must come from one
 * source (the brief asks for a single public source), so we enforce a
 * single origin here rather than trusting the file.
 */
export async function loadConfig(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  return parseConfig(raw);
}

export function parseConfig(raw) {
  const config = { ...DEFAULTS, ...raw };

  if (!Array.isArray(config.casinos) || config.casinos.length === 0) {
    throw new Error('config: "casinos" must be a non-empty array');
  }

  const origins = new Set();
  for (const [i, casino] of config.casinos.entries()) {
    if (!casino || typeof casino.name !== 'string' || !casino.name.trim()) {
      throw new Error(`config: casinos[${i}].name is required`);
    }
    let url;
    try {
      url = new URL(casino.url);
    } catch {
      throw new Error(`config: casinos[${i}].url is not a valid URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`config: casinos[${i}].url must be http(s)`);
    }
    origins.add(url.origin);
  }

  if (origins.size > 1) {
    throw new Error(
      `config: all casinos must come from one source, got ${[...origins].join(', ')}`,
    );
  }

  return config;
}
