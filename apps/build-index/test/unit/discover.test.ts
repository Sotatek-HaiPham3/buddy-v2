import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverTopicPdfs, listTopics } from '../../src/discover.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'disc-'));
  await fs.mkdir(path.join(dir, 'topicA'), { recursive: true });
  await fs.writeFile(path.join(dir, 'topicA', 'a.pdf'), 'x');
  await fs.writeFile(path.join(dir, 'topicA', 'b.pdf'), 'x');
  await fs.mkdir(path.join(dir, 'topicB'), { recursive: true });
  await fs.writeFile(path.join(dir, 'topicB', 'c.pdf'), 'x');
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('discover', () => {
  it('listTopics returns subdir names with at least one pdf', async () => {
    expect((await listTopics(dir)).sort()).toEqual(['topicA', 'topicB']);
  });
  it('discoverTopicPdfs returns absolute pdf paths', async () => {
    const pdfs = await discoverTopicPdfs(dir, 'topicA');
    expect(pdfs).toHaveLength(2);
    expect(pdfs.every(p => p.endsWith('.pdf'))).toBe(true);
  });
});
