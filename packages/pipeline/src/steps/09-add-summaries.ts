import type { GeminiClient, LlmPool, TreeNode } from '@buddy/shared';
import { summarizeNodePrompt } from '../prompts/summarize-node.js';
import type { RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; pool: LlmPool; }

function nodeText(node: TreeNode, pages: RawPage[]): string {
  return pages
    .filter(p => p.pageNumber >= node.start_index && p.pageNumber <= node.end_index)
    .map(p => p.text)
    .join('\n');
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) { out.push(n); out.push(...flatten(n.nodes)); }
  return out;
}

export async function addSummaries(tree: TreeNode[], pages: RawPage[], opts: Opts): Promise<TreeNode[]> {
  const all = flatten(tree);
  const summaries = await Promise.all(all.map(n => opts.pool(async () => {
    const text = nodeText(n, pages);
    if (!text.trim()) {
      // Surface this — usually means upstream produced bad start_index/end_index for this node.
      console.warn(`[09-add-summaries] empty text for node ${n.node_id} (range ${n.start_index}-${n.end_index})`);
      return '';
    }
    const r = await opts.gemini.generate([summarizeNodePrompt(text)], { maxOutputTokens: 512 });
    return r.text.trim();
  })));
  const byId = new Map(all.map((n, i) => [n.node_id, summaries[i] ?? '']));
  const attach = (n: TreeNode): TreeNode => {
    const summary = byId.get(n.node_id) || undefined;
    const result: TreeNode = { ...n, nodes: n.nodes.map(attach) };
    if (summary) result.summary = summary;
    return result;
  };
  return tree.map(attach);
}
