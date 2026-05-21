import { nodeId } from '@buddy/shared';
import type { TreeNode } from '@buddy/shared';
import type { FlatTocEntry } from '../types.js';

interface WorkingNode extends TreeNode { _structure: string; _appearStart: 'yes' | 'no'; _docPage?: number; }

function parentStructure(s: string): string | null {
  const parts = s.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : null;
}

export function buildTree(toc: FlatTocEntry[], totalPages: number): TreeNode[] {
  const valid = toc.filter(e => e.physical_index !== undefined);
  const ordered = [...valid].sort((a, b) => a.physical_index! - b.physical_index!);

  const flat: WorkingNode[] = ordered.map(e => ({
    title: e.title,
    start_index: e.physical_index!,
    end_index: 0,
    node_id: nodeId(),
    nodes: [],
    images: [],
    tables: [],
    _structure: e.structure,
    _appearStart: e.appear_start ?? 'yes',
    _docPage: e.page,
    doc_page_start: e.page,
  }));

  // Assign leaf end_index first, based on the next sibling in flat order.
  // We'll fix parent end_index after building the tree structure.
  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i]!;
    const next = flat[i + 1];
    if (!next) {
      cur.end_index = totalPages;
      // doc_page_end left undefined for last node (no next sibling)
    } else {
      cur.end_index = next._appearStart === 'no' ? next.start_index : next.start_index - 1;
      if (cur.end_index < cur.start_index) cur.end_index = cur.start_index;
      if (cur._docPage !== undefined && next._docPage !== undefined) {
        cur.doc_page_end = next._appearStart === 'no' ? next._docPage : next._docPage - 1;
        if (cur.doc_page_end < cur._docPage) cur.doc_page_end = cur._docPage;
      }
    }
  }

  const byStruct = new Map<string, WorkingNode>();
  for (const n of flat) byStruct.set(n._structure, n);
  const roots: WorkingNode[] = [];
  for (const n of flat) {
    const ps = parentStructure(n._structure);
    const parent = ps !== null ? byStruct.get(ps) : null;
    if (parent && parent !== n) parent.nodes.push(n as unknown as TreeNode);
    else roots.push(n);
  }

  // Propagate end_index up: parent's end_index = max(child end_index)
  function propagateEnd(node: WorkingNode): void {
    for (const child of node.nodes) propagateEnd(child as unknown as WorkingNode);
    if (node.nodes.length > 0) {
      const maxChildEnd = Math.max(...node.nodes.map(c => (c as unknown as WorkingNode).end_index));
      node.end_index = Math.max(node.end_index, maxChildEnd);
      const childDocPageEnds = node.nodes
        .map(c => (c as unknown as WorkingNode).doc_page_end)
        .filter((v): v is number => v !== undefined);
      if (childDocPageEnds.length > 0) {
        node.doc_page_end = Math.max(...childDocPageEnds);
      }
    }
  }
  for (const root of roots) propagateEnd(root);

  return roots.map(stripWorking);
}

function stripWorking(n: WorkingNode): TreeNode {
  const { _structure: _s, _appearStart: _a, _docPage: _dp, ...rest } = n;
  return rest;
}
