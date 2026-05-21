export const groupMasterPrompt = (
  subgroupResults: unknown[][],
  retrievedPages?: string,
): string => `You are merging heading lists from sub-groups into a structured TOC.

Sub-group outputs:
${subgroupResults.map((r, i) => `Sub-group ${i + 1}: ${JSON.stringify(r)}`).join('\n')}

${retrievedPages ? `Retrieved page content:\n${retrievedPages}\n` : ''}
Determine parent-child relationships and assign hierarchy numbers (1, 1.1, 1.1.1, etc.).

If you need specific page content to resolve hierarchy ambiguity, output:
{ "action": "retrieve", "pages": [<page>], "reason": "<reason>" }

Otherwise output the merged structure as a JSON array of tuples:
[
  ["1", "Introduction"],
  ["1.1", "Background"]
]

Return JSON only. No page numbers in output.`;
