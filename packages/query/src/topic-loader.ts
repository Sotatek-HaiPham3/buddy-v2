import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { docOutputSchema, resolveIndexDir, type DocOutput } from '@buddy/shared';
import type { TopicCache } from './types.js';

export async function loadTopic(dataDir: string, topic: string): Promise<Map<string, DocOutput>> {
  const dir = resolveIndexDir(dataDir, topic);
  const map = new Map<string, DocOutput>();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return map;
  }
  for (const f of entries) {
    if (!f.endsWith('.tree.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      const parsed = docOutputSchema.parse(JSON.parse(raw));
      map.set(parsed.doc_id, parsed);
    } catch {
      // Skip malformed files.
    }
  }
  return map;
}

export function createTopicCache(opts: {
  dataDir: string;
  watch: boolean;
  onChange?: (topic: string) => void;
}): TopicCache {
  const cache = new Map<string, Map<string, DocOutput>>();
  let watcher: FSWatcher | null = null;
  if (opts.watch) {
    const pattern = path.join(opts.dataDir, '*', '.index', '*.tree.json');
    watcher = chokidar.watch(pattern, { ignoreInitial: true });
    watcher.on('all', async (_event, filePath) => {
      const topic = path.basename(path.dirname(path.dirname(filePath)));
      if (!cache.has(topic)) return;
      cache.set(topic, await loadTopic(opts.dataDir, topic));
      opts.onChange?.(topic);
    });
  }
  return {
    async get(topic: string) {
      if (!cache.has(topic)) cache.set(topic, await loadTopic(opts.dataDir, topic));
      return cache.get(topic) ?? new Map();
    },
    async reload(topic: string) {
      cache.set(topic, await loadTopic(opts.dataDir, topic));
    },
    async close() {
      if (watcher) await watcher.close();
    },
  };
}
