import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, docOutputSchema } from '@buddy/shared';
import { outputJson } from '../../../src/steps/10-output-json.js';
import { docDescriptionPrompt } from '../../../src/prompts/doc-description.js';
import type { TreeNode } from '@buddy/shared';
import type { DescribedImage } from '../../../src/image/types.js';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p10-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('outputJson', () => {
  it('attaches images + tables to deepest containing node', async () => {
    const tree: TreeNode[] = [{
      title: 'root', start_index: 1, end_index: 10, node_id: 'r', nodes: [
        { title: 'ch', start_index: 5, end_index: 8, node_id: 'c', nodes: [], images: [], tables: [] },
      ], images: [], tables: [],
    }];
    const tmpPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'oj-')), 'out.json');
    const out = await outputJson(tree, {
      docId: 'd', docName: 'doc.pdf', outPath: tmpPath,
      gemini: createStubGemini({ responses: new Map() }), generateDescription: false,
      images: [{
        page: 6, path: '/i/6-0.png', caption: 'c', idx: 0, source: 'embedded' as const,
        bbox: { x: 0, y: 0, w: 1, h: 1 }, bytes: Buffer.from(''), mime: 'image/png',
        sidecarPath: '/i/6-0.json',
      }],
      tables: [{ page: 7, path: '/t/7-0.json', idx: 0, schema: 's', headers: ['a'], rowCount: 1 }],
    });
    expect(out.structure[0]?.nodes[0]?.images).toHaveLength(1);
    expect(out.structure[0]?.nodes[0]?.tables).toHaveLength(1);
  });

  it('writes valid DocOutput JSON', async () => {
    const tree: TreeNode[] = [{
      title: 'Root', start_index: 1, end_index: 10, node_id: 'old',
      nodes: [], images: [], tables: [],
    }];
    const responses = new Map([
      [hashPrompt([docDescriptionPrompt(tree)]), { text: 'A doc about stuff.' }],
    ]);
    const gemini = createStubGemini({ responses });
    const result = await outputJson(tree, {
      docId: 'doc_x', docName: 'a.pdf', outPath: path.join(dir, 'out.json'),
      gemini, generateDescription: true,
    });
    expect(result.doc_id).toBe('doc_x');
    expect(result.doc_description).toBe('A doc about stuff.');
    docOutputSchema.parse(result);
    const read = JSON.parse(await fs.readFile(path.join(dir, 'out.json'), 'utf8'));
    expect(read.doc_name).toBe('a.pdf');
  });
});
