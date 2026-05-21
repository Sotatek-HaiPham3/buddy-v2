export const subgroupHeadingsPrompt = (content: string): string => `Extract all section headings from the text below.

For each heading, output: [title, page_number]

Output format (JSON array of arrays):
[
  ["Introduction", 85],
  ["Background", 87]
]

Only extract clear section/chapter headings, not every bold text.
Output ONLY the JSON array, nothing else.

Text:
${content}`;
