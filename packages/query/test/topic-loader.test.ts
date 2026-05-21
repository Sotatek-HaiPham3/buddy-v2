import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DocOutput } from '@buddy/shared';
import { createTopicCache, loadTopic } from '../src/topic-loader.js';

function mkDoc(docId: string, name: string): DocOutput {
  return {
    doc_id: docId,
    doc_name: name,
    doc_description: `desc-${docId}`,
    structure: [{ title: 'root', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
  };
}

async function writeTree(dataDir: string, topic: string, doc: DocOutput): Promise<void> {
  const dir = path.join(dataDir, topic, '.index');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${doc.doc_id}.tree.json`), JSON.stringify(doc));
}

describe('loadTopic', () => {
  let dataDir = '';
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tl-'));
  });

  it('loads trees and skips malformed', async () => {
    await writeTree(dataDir, 'tax', mkDoc('d1', 'one.pdf'));
    await fs.writeFile(path.join(dataDir, 'tax', '.index', 'bad.tree.json'), 'x');
    const out = await loadTopic(dataDir, 'tax');
    expect(out.size).toBe(1);
    expect(out.get('d1')?.doc_name).toBe('one.pdf');
  });
});

describe('createTopicCache', () => {
  it('caches and reloads', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-'));
    await writeTree(dataDir, 'tax', mkDoc('d1', 'a.pdf'));
    const cache = createTopicCache({ dataDir, watch: false });
    expect((await cache.get('tax')).size).toBe(1);
    await writeTree(dataDir, 'tax', mkDoc('d2', 'b.pdf'));
    expect((await cache.get('tax')).size).toBe(1);
    await cache.reload('tax');
    expect((await cache.get('tax')).size).toBe(2);
    await cache.close();
  });
});
