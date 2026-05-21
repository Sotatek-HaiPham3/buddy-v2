import { describe, expect, it } from 'vitest';
import { buildTree } from '../../../src/steps/07-build-tree.js';
import type { FlatTocEntry } from '../../../src/types.js';

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
