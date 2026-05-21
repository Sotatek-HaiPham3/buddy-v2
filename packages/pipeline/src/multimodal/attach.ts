import type { TreeNode, ImageRef, TableRef } from '@buddy/shared';
import type { DescribedImage } from '../image/types.js';
import type { SavedTable } from '../table/types.js';

interface AttachInput {
  images: { path: string; page: number; caption?: string }[];
  tables: { path: string; page: number; schema?: string }[];
}

function cloneTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => ({
    ...n,
    images: [...n.images],
    tables: [...n.tables],
    nodes: cloneTree(n.nodes),
  }));
}

function findDeepestForPage(nodes: TreeNode[], page: number): TreeNode | null {
  let best: TreeNode | null = null;
  let bestDepth = -1;
  function walk(n: TreeNode, depth: number): void {
    if (page >= n.start_index && page <= n.end_index) {
      if (depth > bestDepth) { best = n; bestDepth = depth; }
      for (const c of n.nodes) walk(c, depth + 1);
    }
  }
  for (const n of nodes) walk(n, 0);
  return best;
}

export function attachMultimodal(tree: TreeNode[], input: AttachInput): TreeNode[] {
  const out = cloneTree(tree);

  for (const img of input.images) {
    const target = findDeepestForPage(out, img.page);
    if (!target) continue;
    const ref: ImageRef = { path: img.path, page: img.page, ...(img.caption ? { caption: img.caption } : {}) };
    target.images.push(ref);
  }
  for (const tbl of input.tables) {
    const target = findDeepestForPage(out, tbl.page);
    if (!target) continue;
    const ref: TableRef = { path: tbl.path, page: tbl.page, ...(tbl.schema ? { schema: tbl.schema } : {}) };
    target.tables.push(ref);
  }
  return out;
}

export function fromDescribedImages(images: DescribedImage[]): AttachInput['images'] {
  return images.map((i) => ({ path: i.path, page: i.page, ...(i.caption ? { caption: i.caption } : {}) }));
}

export function fromSavedTables(tables: SavedTable[]): AttachInput['tables'] {
  return tables.map((t) => ({ path: t.path, page: t.page, schema: t.schema }));
}
