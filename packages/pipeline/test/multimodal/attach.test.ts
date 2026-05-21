import { describe, it, expect } from 'vitest';
import { attachMultimodal } from '../../src/multimodal/attach.js';
import type { TreeNode } from '@buddy/shared';

const node = (
  title: string, s: number, e: number, kids: TreeNode[] = [],
): TreeNode => ({
  title, start_index: s, end_index: e, node_id: title, nodes: kids, images: [], tables: [],
});

describe('attachMultimodal', () => {
  it('attaches image to deepest containing node', () => {
    const tree: TreeNode[] = [
      node('root', 1, 10, [
        node('chapter-1', 1, 5),
        node('chapter-2', 6, 10, [
          node('section-2-1', 6, 7),
          node('section-2-2', 8, 10),
        ]),
      ]),
    ];
    const out = attachMultimodal(tree, {
      images: [{ path: '/x/8-0.png', page: 8, caption: 'c' }],
      tables: [],
    });
    expect(out[0].nodes[1].nodes[1].images).toHaveLength(1);
    expect(out[0].nodes[1].nodes[1].images[0].caption).toBe('c');
    expect(out[0].images).toHaveLength(0);
    expect(out[0].nodes[1].images).toHaveLength(0);
  });

  it('attaches table to deepest node', () => {
    const tree: TreeNode[] = [node('root', 1, 5, [node('child', 2, 4)])];
    const out = attachMultimodal(tree, {
      images: [],
      tables: [{ path: '/t/3-0.json', page: 3, schema: 'foo' }],
    });
    expect(out[0].nodes[0].tables).toHaveLength(1);
    expect(out[0].nodes[0].tables[0].schema).toBe('foo');
  });

  it('drops items with page outside any node', () => {
    const tree: TreeNode[] = [node('root', 1, 5)];
    const out = attachMultimodal(tree, {
      images: [{ path: '/x/99-0.png', page: 99 }],
      tables: [],
    });
    expect(out[0].images).toHaveLength(0);
  });

  it('preserves existing images/tables arrays (does not mutate input)', () => {
    const tree: TreeNode[] = [node('root', 1, 5)];
    const input = tree[0].images;
    attachMultimodal(tree, { images: [{ path: '/a.png', page: 3 }], tables: [] });
    expect(tree[0].images).toBe(input);
    expect(tree[0].images).toHaveLength(0);
  });
});
