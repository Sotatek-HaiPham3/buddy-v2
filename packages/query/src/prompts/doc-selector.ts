import type { DocOutput } from '@buddy/shared';

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
