import { describe, expect, it } from 'vitest';
import { validateIndices } from '../../../src/steps/06_5-validate-indices.js';
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

  it('produces degenerate single-page end_index when siblings share the same physical_index', () => {
    // buildTree sorts by physical_index, so regressing physical values get reordered.
    // The only way end_index < start_index can occur after sort is duplicate physical_index:
    // next.start_index - 1 == current.start_index - 1 < current.start_index.
    const flat: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 5 },
      { structure: '2', title: 'B', physical_index: 5 },   // same page → after sort still adjacent; end = 5-1 = 4 < 5
    ];
    const tree = buildTree(flat, 20);
    // After sort both have start=5; first node's computed end = next.start-1 = 4 which < start=5 → clamped to 5
    expect(tree[0]?.start_index).toBe(5);
    expect(tree[0]?.end_index).toBe(5);   // degenerate, not 4 (which would be 5-1)
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

describe('buildTree — integration with validateIndices (PageIndex Case 6.5 + Case 33)', () => {
  function collectTitles(nodes: { title: string; nodes?: unknown[] }[]): string[] {
    const out: string[] = [];
    for (const n of nodes) {
      out.push(n.title);
      if (n.nodes && n.nodes.length > 0) {
        out.push(...collectTitles(n.nodes as { title: string; nodes?: unknown[] }[]));
      }
    }
    return out;
  }

  it('after validate + buildTree: out-of-order LLM entries land in physical order in the tree', () => {
    // LLM emitted in semantic order; physical sort in buildTree puts them right.
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'First',  physical_index: 5 },
      { structure: '1.2', title: 'Second', physical_index: 8 },
      { structure: '1.3', title: 'Third',  physical_index: 3 },   // out of order
    ];
    const validated = validateIndices(entries, 10);   // no strip — all in range
    expect(validated[2]?.physical_index).toBe(3);     // confirm validate kept it
    const tree = buildTree(validated, 10);
    const allTitles = collectTitles(tree);
    expect(allTitles).toEqual(expect.arrayContaining(['First', 'Second', 'Third']));
    // Physical sort: Third(3) < First(5) < Second(8)
    expect(tree[0]?.start_index).toBe(3);
  });

  it('orphaned deep entries become root nodes when parent has no physical_index (Case 33)', () => {
    // Parent has no physical_index (resolver couldn't anchor it) → validateIndices leaves it without
    // physical_index → buildTree filters it → child becomes orphan root.
    const entries: FlatTocEntry[] = [
      { structure: '1',   title: 'Chapter',  /* no physical_index — resolver miss */ },
      { structure: '1.1', title: 'SubA',     physical_index: 2 },
      { structure: '1.2', title: 'SubB',     physical_index: 5 },
    ];
    const validated = validateIndices(entries, 10);
    const tree = buildTree(validated, 10);
    // Parent filtered out; children become orphan roots
    const allTitles = collectTitles(tree);
    expect(allTitles).toEqual(expect.arrayContaining(['SubA', 'SubB']));
    expect(allTitles).not.toContain('Chapter');
  });
});
