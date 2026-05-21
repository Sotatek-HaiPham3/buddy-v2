import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { selectDocs } from '../src/doc-selector.js';
import { docSelectorPrompt } from '../src/prompts/doc-selector.js';

const doc: DocOutput = {
  doc_id: 'd1',
  doc_name: 'a.pdf',
  doc_description: 'finance',
  structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
};

describe('selectDocs', () => {
  it('uses llm for multi-doc topics', async () => {
    const prompt = docSelectorPrompt([doc, { ...doc, doc_id: 'd2' }], 'revenue?', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: '{"reasoning":"fit","doc_ids":["d1"]}' });
    const gemini = createStubGemini({ responses });
    const out = await selectDocs({ gemini, docs: [doc, { ...doc, doc_id: 'd2' }], query: 'revenue?', historySummary: '' });
    expect(out.doc_ids).toEqual(['d1']);
  });
});
