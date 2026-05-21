export const subgroupHeadingsPrompt = (content: string): string => `Extract all section headings from the text below.

The text contains tags like <physical_index_N>. For each heading, output:
[title, logical_page_or_null, physical_index]
- logical_page_or_null: page number printed on the page (if visible), otherwise null
- physical_index: numeric page number from the nearest <physical_index_N> tag

Output format (JSON array of arrays):
[
  ["Introduction", 1, 85],
  ["Background", null, 87]
]

Only extract clear section/chapter headings, not every bold text.
Output ONLY the JSON array, nothing else.

Text:
${content}`;
