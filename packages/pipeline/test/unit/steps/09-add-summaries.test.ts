import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { addSummaries } from '../../../src/steps/09-add-summaries.js';
import { summarizeNodePrompt } from '../../../src/prompts/summarize-node.js';
import type { RawPage } from '../../../src/types.js';
import type { TreeNode } from '@buddy/shared';

describe('addSummaries', () => {
  it('attaches summary to each node', async () => {
    const tree: TreeNode[] = [{
      title: 'A', start_index: 1, end_index: 2, node_id: 'n1',
      nodes: [{ title: 'A.1', start_index: 1, end_index: 1, node_id: 'n2', nodes: [], images: [], tables: [] }],
      images: [], tables: [],
    }];
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'page1', annotatedText: 'page1', tokenCount: 1 },
      { pageNumber: 2, text: 'page2', annotatedText: 'page2', tokenCount: 1 },
    ];
    const responses = new Map([
      [hashPrompt([summarizeNodePrompt('page1\npage2')]), { text: 'sum-A' }],
      [hashPrompt([summarizeNodePrompt('page1')]), { text: 'sum-A1' }],
    ]);
    const pool = async <T,>(fn: () => Promise<T>) => fn();
    const out = await addSummaries(tree, pages, { gemini: createStubGemini({ responses }), pool });
    expect(out[0]?.summary).toBe('sum-A');
    expect(out[0]?.nodes[0]?.summary).toBe('sum-A1');
  });
});
