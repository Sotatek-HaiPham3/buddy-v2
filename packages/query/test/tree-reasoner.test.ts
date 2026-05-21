import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { treeReasonerPrompt } from '../src/prompts/tree-reasoner.js';
import { reasonTree } from '../src/tree-reasoner.js';

describe('reasonTree', () => {
  it('parses llm selections', async () => {
    const doc: DocOutput = {
      doc_id: 'd1',
      doc_name: 'a.pdf',
      doc_description: 'finance',
      structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
    };
    const prompt = treeReasonerPrompt([doc], 'how?', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: '{"reasoning":"pick","selections":[{"doc_id":"d1","node_ids":["n1"]}]}' });
    const gemini = createStubGemini({ responses });
    const out = await reasonTree({ gemini, docs: [doc], query: 'how?', historySummary: '' });
    expect(out.selections[0]?.node_ids).toEqual(['n1']);
  });
});
