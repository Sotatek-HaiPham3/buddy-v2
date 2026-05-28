import type { DocOutput, TreeNode } from '@buddy/shared';

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_LINES_PER_DOC = 30;

export function collectTitlesWithSummaries(nodes: TreeNode[], maxDepth: number, maxLines: number): string[] {
  const out: string[] = [];
  let hitLimit = false;

  function pushLine(line: string): boolean {
    if (out.length >= maxLines) {
      hitLimit = true;
      return false;
    }
    out.push(line);
    return true;
  }

  function walk(node: TreeNode, depth: number): boolean {
    const indent = '  '.repeat(depth);
    if (!pushLine(`${indent}- ${node.title}`)) return false;
    if (node.summary && !pushLine(`${indent}    ${node.summary}`)) return false;
    if (depth >= maxDepth) return true;
    for (const child of node.nodes) {
      if (!walk(child, depth + 1)) return false;
    }
    return true;
  }

  for (const root of nodes) {
    if (!walk(root, 0)) break;
  }

  if (hitLimit) out.push('... (more nodes not shown)');
  return out;
}

export const docSelectorPrompt = (
  docs: DocOutput[],
  query: string,
  historySummary: string,
): string => {
  const lines = docs.map((d) => {
    const topTitles = d.structure.slice(0, 8).map((n) => `- ${n.title}`).join('\n');
    return `doc_id: ${d.doc_id}
doc_name: ${d.doc_name}
description: ${d.doc_description}
top-level titles:
${topTitles}`;
  });

  return `You are routing a user question to the right document(s).

Available documents:

${lines.join('\n\n---\n\n')}

Prior conversation summary:
${historySummary || '(none)'}

User question: ${query}

Pick the doc_ids most likely to answer. Return JSON only:
{ "reasoning": "<one paragraph>", "doc_ids": ["..."] }

If none clearly relevant, return doc_ids: [].`;
};
