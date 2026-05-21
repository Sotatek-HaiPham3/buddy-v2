import { nodeId } from '@buddy/shared';
import type { GeminiClient, LlmPool, TreeNode } from '@buddy/shared';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { splitLargePrompt } from '../prompts/split-large.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { RawPage } from '../types.js';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  maxPages: number;
  maxTokens: number;
  hierarchical: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
}

function nodeTokenCount(node: TreeNode, pages: RawPage[]): number {
  let sum = 0;
  for (const p of pages) if (p.pageNumber >= node.start_index && p.pageNumber <= node.end_index) sum += p.tokenCount;
  return sum;
}

function nodePages(node: TreeNode, pages: RawPage[]): RawPage[] {
  return pages.filter(p => p.pageNumber >= node.start_index && p.pageNumber <= node.end_index);
}

async function splitOne(node: TreeNode, pages: RawPage[], opts: Opts): Promise<TreeNode> {
  const slice = nodePages(node, pages);
  let entries: { structure: string; title: string; physical_index: number }[] = [];
  if (opts.hierarchical && slice.length > 10) {
    const result = await hierarchicalExtract(slice, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    entries = result
      .map((row) => {
        const [structure, title, ...rest] = row;
        const physical = rest.length >= 2 ? rest[1] : rest[0];
        const physicalIndex = typeof physical === 'number' ? physical : Number.NaN;
        if (!Number.isFinite(physicalIndex) || physicalIndex < 1) return null;
        return { structure, title, physical_index: physicalIndex };
      })
      .filter((e): e is { structure: string; title: string; physical_index: number } => e !== null);
  } else {
    const tagged = tagPages(slice);
    const r = await opts.gemini.generate([splitLargePrompt(tagged)], { maxOutputTokens: 8192 });
    const parsed = physicalMappingResponseSchema.parse(extractJson(r.text));
    entries = parsed.map(e => ({ structure: e.structure, title: e.title, physical_index: parsePhysicalIndexTag(e.physical_index) }));
  }
  if (entries.length === 0) return node;
  entries.sort((a, b) => a.physical_index - b.physical_index);

  const children: TreeNode[] = entries.map((e, i) => {
    const next = entries[i + 1];
    return {
      title: e.title,
      start_index: e.physical_index,
      end_index: next ? Math.max(e.physical_index, next.physical_index - 1) : node.end_index,
      node_id: nodeId(),
      nodes: [],
      images: [],
      tables: [],
    };
  });
  const newEnd = Math.max(node.start_index, (entries[0]?.physical_index ?? node.start_index) - 1);
  const parent: TreeNode = { ...node, end_index: newEnd, nodes: children };
  const recursed = await Promise.all(parent.nodes.map(c => splitNodeIfBig(c, pages, opts)));
  return { ...parent, nodes: recursed };
}

async function splitNodeIfBig(node: TreeNode, pages: RawPage[], opts: Opts): Promise<TreeNode> {
  const pageCount = node.end_index - node.start_index + 1;
  const tokens = nodeTokenCount(node, pages);
  if (pageCount > opts.maxPages && tokens > opts.maxTokens) {
    return splitOne(node, pages, opts);
  }
  if (node.nodes.length === 0) return node;
  const recursed = await Promise.all(node.nodes.map(c => splitNodeIfBig(c, pages, opts)));
  return { ...node, nodes: recursed };
}

export async function splitLargeNodes(tree: TreeNode[], pages: RawPage[], opts: Opts): Promise<TreeNode[]> {
  return Promise.all(tree.map(n => splitNodeIfBig(n, pages, opts)));
}
