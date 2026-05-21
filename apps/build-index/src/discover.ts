import fs from 'node:fs/promises';
import path from 'node:path';
import { globby } from 'globby';

export async function listTopics(dataDir: string): Promise<string[]> {
  let entries: string[];
  try { entries = await fs.readdir(dataDir); } catch { return []; }
  const topics: string[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const sub = path.join(dataDir, name);
    const stat = await fs.stat(sub);
    if (!stat.isDirectory()) continue;
    const pdfs = await globby(['*.pdf'], { cwd: sub, absolute: true });
    if (pdfs.length > 0) topics.push(name);
  }
  return topics;
}

export async function discoverTopicPdfs(dataDir: string, topic: string): Promise<string[]> {
  return globby(['*.pdf'], { cwd: path.join(dataDir, topic), absolute: true });
}
