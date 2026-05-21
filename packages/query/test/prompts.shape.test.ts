import { describe, expect, it } from 'vitest';
import type { DocOutput } from '@buddy/shared';
import { docSelectorPrompt } from '../src/prompts/doc-selector.js';
import { treeReasonerPrompt } from '../src/prompts/tree-reasoner.js';
import { answerPrompt } from '../src/prompts/answer.js';
import type { RetrievedNode } from '../src/types.js';

const docs: DocOutput[] = [
  {
    doc_id: 'd1',
    doc_name: 'a.pdf',
    doc_description: 'about a',
    structure: [{ title: 'ch1', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
  },
];

describe('prompt shape (cache-friendly)', () => {
  it('doc-selector places query after doc list', () => {
    const prompt = docSelectorPrompt(docs, 'MY_UNIQUE_QUERY_TOKEN', '');
    expect(prompt.indexOf('doc_id: d1')).toBeLessThan(prompt.indexOf('MY_UNIQUE_QUERY_TOKEN'));
  });

  it('tree-reasoner places query after tree content', () => {
    const prompt = treeReasonerPrompt(docs, 'MY_QUERY_TOKEN', '');
    expect(prompt.indexOf('doc_id: d1')).toBeLessThan(prompt.indexOf('MY_QUERY_TOKEN'));
  });

  it('answer places retrieved sections before query', () => {
    const retrieved: RetrievedNode[] = [
      {
        doc_id: 'd1',
        doc_name: 'a.pdf',
        node_id: 'n1',
        title: 't',
        page_range: [1, 1],
        text: 'SECTION_BODY_TOKEN',
        image_captions: [],
        tables: [],
      },
    ];
    const prompt = answerPrompt('MY_QUERY_TOKEN', retrieved, []);
    expect(prompt.indexOf('SECTION_BODY_TOKEN')).toBeLessThan(prompt.indexOf('MY_QUERY_TOKEN'));
  });
});
