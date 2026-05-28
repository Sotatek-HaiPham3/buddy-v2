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
    const titlesAndSummaries = collectTitlesWithSummaries(
      d.structure,
      DEFAULT_MAX_DEPTH,
      DEFAULT_MAX_LINES_PER_DOC,
    ).join('\n');
    return `doc_id: ${d.doc_id}
doc_name: ${d.doc_name}
description: ${d.doc_description}
structure (titles + summaries, up to ${DEFAULT_MAX_DEPTH + 1} levels):
${titlesAndSummaries}`;
  });

  return `You are routing a user question to the right document(s).

Use BOTH the description AND the structure listing to decide. The structure shows nested titles and per-section summaries when available - these reveal what each document actually contains beyond the chapter title.

Available documents:

${lines.join('\n\n---\n\n')}

Prior conversation summary:
${historySummary || '(none)'}

User question: ${query}

Pick the doc_ids most likely to answer. Return JSON only:
{ "reasoning": "<one paragraph>", "doc_ids": ["..."] }

If none clearly relevant, return doc_ids: [].`;
};
