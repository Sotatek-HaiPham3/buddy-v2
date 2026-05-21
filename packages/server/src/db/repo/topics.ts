import fs from 'node:fs/promises';
import path from 'node:path';
import { docOutputSchema, resolveIndexDir, type DocSummary, type TopicSummary } from '@buddy/shared';

export async function listTopics(dataDir: string): Promise<TopicSummary[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dataDir);
  } catch {
    return [];
  }
  const out: TopicSummary[] = [];
  for (const topic of entries) {
    const indexDir = resolveIndexDir(dataDir, topic);
    let files: string[] = [];
    try {
      files = await fs.readdir(indexDir);
    } catch {
      continue;
    }
    const trees = files.filter((f) => f.endsWith('.tree.json'));
    out.push({ topic, doc_count: trees.length, last_built_at: null });
  }
  return out.sort((a, b) => a.topic.localeCompare(b.topic));
}

export async function listTopicDocs(dataDir: string, topic: string): Promise<DocSummary[]> {
  const indexDir = resolveIndexDir(dataDir, topic);
  let files: string[] = [];
  try {
    files = await fs.readdir(indexDir);
  } catch {
    return [];
  }
  const out: DocSummary[] = [];
  for (const file of files) {
    if (!file.endsWith('.tree.json')) continue;
    try {
      const parsed = docOutputSchema.parse(
        JSON.parse(await fs.readFile(path.join(indexDir, file), 'utf8')),
      );
      const pageCount = parsed.structure.reduce((m, n) => Math.max(m, n.end_index), 1);
      out.push({
        doc_id: parsed.doc_id,
        doc_name: parsed.doc_name,
        doc_description: parsed.doc_description,
        page_count: pageCount,
      });
    } catch {
      // ignore malformed files
    }
  }
  return out;
}
