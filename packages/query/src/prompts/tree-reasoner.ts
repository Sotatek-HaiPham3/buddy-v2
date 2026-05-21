import type { DocOutput, TreeNode } from '@buddy/shared';

function summarize(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const head = `${pad}- [${node.node_id}] ${node.title} (p.${node.start_index}-${node.end_index})`;
  const sum = node.summary ? `${pad}    ${node.summary}` : '';
  const kids = node.nodes.map((c) => summarize(c, indent + 1)).join('\n');
  return [head, sum, kids].filter(Boolean).join('\n');
}

export const treeReasonerPrompt = (
  docs: DocOutput[],
  query: string,
  historySummary: string,
): string => {
  const blocks = docs.map(
    (d) =>
      `=== doc_id: ${d.doc_id} (${d.doc_name}) ===
${d.structure.map((n) => summarize(n)).join('\n')}`,
  );
  return `Pick the tree nodes whose page ranges contain content that answers the question.

${blocks.join('\n\n')}

Prior conversation summary:
${historySummary || '(none)'}

User question: ${query}

Return JSON only:
{ "reasoning": "<one paragraph>", "selections": [ { "doc_id": "...", "node_ids": ["..."] } ] }

Pick the deepest nodes that suffice. If nothing fits, selections: [].`;
};
