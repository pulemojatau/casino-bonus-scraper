import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEFAULT_CONFIG = resolve(ROOT, 'config/sources.json');
export const DEFAULT_DATA = resolve(ROOT, 'data/casinos.json');
export const DEFAULT_DIST = resolve(ROOT, 'dist');

export function loadDotEnv() {
  const file = resolve(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Write via a temp file + rename so a crash never leaves half a JSON file. */
export async function writeFileAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, contents);
  await rename(tmp, path);
}
