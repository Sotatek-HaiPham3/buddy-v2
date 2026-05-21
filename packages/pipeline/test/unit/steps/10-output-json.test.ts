import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, docOutputSchema } from '@buddy/shared';
import { outputJson } from '../../../src/steps/10-output-json.js';
import { docDescriptionPrompt } from '../../../src/prompts/doc-description.js';
import type { TreeNode } from '@buddy/shared';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p10-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('outputJson', () => {
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
