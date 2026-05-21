export const subgroupHeadingsPrompt = (taggedPages: string): string => `You are extracting headings from a portion of a document.

The text may contain <physical_index_N> page markers - ignore them. We only need the headings, in document order.

For each heading found, output a 1-element array:
  ["heading title"]

Response format:
[
  ["Introduction"],
  ["Background"],
  ["Methodology"]
]

Return JSON only.

Text:
${taggedPages}`;