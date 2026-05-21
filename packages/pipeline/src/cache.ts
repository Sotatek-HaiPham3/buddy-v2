import fs from 'node:fs/promises';
import path from 'node:path';

export interface CacheKey {
  cacheDir: string;
  step: string;
  force: boolean;
}

export async function withCache<T>(key: CacheKey, fn: () => Promise<T>): Promise<T> {
  const file = path.join(key.cacheDir, `${key.step}.json`);
  if (!key.force) {
    try {
      const buf = await fs.readFile(file, 'utf8');
      return JSON.parse(buf) as T;
    } catch { /* miss */ }
  }
  const result = await fn();
  await fs.mkdir(key.cacheDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(result), 'utf8');
  return result;
}
