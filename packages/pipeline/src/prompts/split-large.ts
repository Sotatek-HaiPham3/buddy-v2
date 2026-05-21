export const splitLargePrompt = (taggedPages: string): string => `You are an expert at extracting hierarchical structure.
Identify section headings in the text below. The text contains <physical_index_N> tags marking page boundaries.

Return JSON array:
[
  { "structure": "1",   "title": "Introduction", "physical_index": "<physical_index_1>" },
  { "structure": "1.1", "title": "Background",   "physical_index": "<physical_index_3>" }
]

Only extract real section/chapter headings, not every bold line.

Text:
${taggedPages}`;
