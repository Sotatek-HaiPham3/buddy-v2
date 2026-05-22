import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { splitLargeNodes } from '../../../src/steps/08-split-large.js';
import { splitLargePrompt } from '../../../src/prompts/split-large.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';
import type { TreeNode } from '@buddy/shared';

const page = (n: number, tokens = 100): RawPage => ({ pageNumber: n, text: `p${n}`, annotatedText: `p${n}`, tokenCount: tokens });

describe('splitLargeNodes', () => {
  it('passes through when no node oversized', async () => {
    const tree: TreeNode[] = [{ title: 'A', start_index: 1, end_index: 5, node_id: 'n1', nodes: [], images: [], tables: [] }];
    const pages = [page(1), page(2), page(3), page(4), page(5)];
    const out = await splitLargeNodes(tree, pages, {
      gemini: createStubGemini({ responses: new Map() }),
      pool: async <T,>(fn: () => Promise<T>) => fn(),
      maxPages: 10, maxTokens: 1000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.nodes).toHaveLength(0);
  });

  it('splits oversized node using non-hierarchical LLM call', async () => {
    const tree: TreeNode[] = [{ title: 'Big', start_index: 1, end_index: 5, node_id: 'n1', nodes: [], images: [], tables: [] }];
    const pages = [page(1, 5000), page(2, 5000), page(3, 5000), page(4, 5000), page(5, 5000)];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([splitLargePrompt(tagged)]), {
        text: '[{"structure":"1","title":"Sub1","physical_index":"<physical_index_1>"},{"structure":"2","title":"Sub2","physical_index":"<physical_index_3>"}]',
      }],
    ]);
    const out = await splitLargeNodes(tree, pages, {
      gemini: createStubGemini({ responses }),
      pool: async <T,>(fn: () => Promise<T>) => fn(),
      maxPages: 3, maxTokens: 10000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out[0]?.nodes.length).toBe(2);
    expect(out[0]?.nodes[0]?.title).toBe('Sub1');
  });
});
