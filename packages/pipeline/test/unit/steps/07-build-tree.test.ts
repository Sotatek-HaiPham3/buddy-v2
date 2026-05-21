import { describe, expect, it } from 'vitest';
import { buildTree } from '../../../src/steps/07-build-tree.js';
import type { FlatTocEntry } from '../../../src/types.js';

const entry = (overrides: Partial<FlatTocEntry> & { structure: string; title: string; physical_index: number }): FlatTocEntry => ({
  appear_start: 'yes',
  ...overrides,
});

describe('buildTree', () => {
  it('builds parent-child + end_index from siblings', () => {
    const toc: FlatTocEntry[] = [
      { structure: '1',   title: 'Exec', physical_index: 5, appear_start: 'yes' },
      { structure: '1.1', title: 'Fin',  physical_index: 7, appear_start: 'yes' },
      { structure: '1.2', title: 'Risk', physical_index: 10, appear_start: 'yes' },
      { structure: '2',   title: 'Anal', physical_index: 15, appear_start: 'yes' },
      { structure: '3',   title: 'Conc', physical_index: 40, appear_start: 'yes' },
    ];
    const tree = buildTree(toc, 50);
    expect(tree).toHaveLength(3);
    expect(tree[0]?.title).toBe('Exec');
    expect(tree[0]?.start_index).toBe(5);
    expect(tree[0]?.end_index).toBe(14);
    expect(tree[0]?.nodes).toHaveLength(2);
    expect(tree[0]?.nodes[0]?.title).toBe('Fin');
    expect(tree[0]?.nodes[0]?.end_index).toBe(9);
    expect(tree[0]?.nodes[1]?.end_index).toBe(14);
    expect(tree[2]?.end_index).toBe(50);
  });

  it('respects appear_start=no (next section starts mid-page → prev ends on same page)', () => {
    const toc: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 1, appear_start: 'yes' },
      { structure: '2', title: 'B', physical_index: 5, appear_start: 'no' },
    ];
    const tree = buildTree(toc, 10);
    expect(tree[0]?.end_index).toBe(5);  // shares page 5
  });

  it('skips entries missing physical_index', () => {
    const tree = buildTree(
      [{ structure: '1', title: 'A', physical_index: 1 }, { structure: '2', title: 'B' }],
      5,
    );
    expect(tree).toHaveLength(1);
  });
});

describe('buildTree — doc_page propagation', () => {
  it('sets doc_page_start from FlatTocEntry.page when present', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'Chapter 1', physical_index: 1, page: 5 }),
      entry({ structure: '2', title: 'Chapter 2', physical_index: 2, page: 6 }),
    ];
    const tree = buildTree(toc, 2);
    expect(tree[0].doc_page_start).toBe(5);
    expect(tree[1].doc_page_start).toBe(6);
  });

  it('sets doc_page_end to next sibling page minus 1', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'Chapter 1', physical_index: 1, page: 5 }),
      entry({ structure: '2', title: 'Chapter 2', physical_index: 2, page: 8 }),
    ];
    const tree = buildTree(toc, 2);
    expect(tree[0].doc_page_end).toBe(7);   // 8 - 1
    expect(tree[1].doc_page_end).toBeUndefined(); // last node, no next sibling
  });

  it('leaves doc_page_start/end undefined when FlatTocEntry has no page', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'Section 1', physical_index: 1 }),
      entry({ structure: '2', title: 'Section 2', physical_index: 2 }),
    ];
    const tree = buildTree(toc, 2);
    expect(tree[0].doc_page_start).toBeUndefined();
    expect(tree[0].doc_page_end).toBeUndefined();
  });

  it('propagates doc_page_end up to parent from deepest child', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1',   title: 'Chapter 1', physical_index: 1, page: 5 }),
      entry({ structure: '1.1', title: 'Section A', physical_index: 1, page: 5 }),
      entry({ structure: '1.2', title: 'Section B', physical_index: 2, page: 6 }),
      entry({ structure: '2',   title: 'Chapter 2', physical_index: 3, page: 9 }),
    ];
    const tree = buildTree(toc, 3);
    // Chapter 1's doc_page_end should be max of its children's doc_page_end
    expect(tree[0].doc_page_end).toBe(8);   // Section B doc_page_end = 9-1 = 8
    expect(tree[0].doc_page_start).toBe(5);
  });

  it('carries logical_start from FlatTocEntry.page and computes logical_end from next sibling', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'A', physical_index: 5, page: 1 }),
      entry({ structure: '2', title: 'B', physical_index: 14, page: 10 }),
    ];
    const tree = buildTree(toc, 20);
    expect(tree[0].logical_start).toBe(1);
    expect(tree[0].logical_end).toBe(9);
    expect(tree[1].logical_start).toBe(10);
    expect(tree[1].logical_end).toBeUndefined();
  });

  it('omits logical fields when FlatTocEntry has only physical_index', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'A', physical_index: 5 }),
      entry({ structure: '2', title: 'B', physical_index: 14 }),
    ];
    const tree = buildTree(toc, 20);
    expect(tree[0].logical_start).toBeUndefined();
    expect(tree[0].logical_end).toBeUndefined();
    expect(tree[1].logical_start).toBeUndefined();
    expect(tree[1].logical_end).toBeUndefined();
  });

  it('omits logical_end when next sibling lacks logical basis', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'A', physical_index: 5, page: 1 }),
      entry({ structure: '2', title: 'B', physical_index: 14 }),
    ];
    const tree = buildTree(toc, 20);
    expect(tree[0].logical_start).toBe(1);
    expect(tree[0].logical_end).toBeUndefined();
  });
});
