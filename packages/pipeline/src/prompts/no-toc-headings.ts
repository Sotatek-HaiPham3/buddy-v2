export const noTocHeadingsPrompt = (taggedPages: string): string => `You are an expert in extracting hierarchical tree structure.
Generate the tree structure of the document.

The text contains tags like <physical_index_N> to mark page boundaries.

Response format:
[
  { "structure": "1",   "title": "Introduction", "physical_index": "<physical_index_1>" },
  { "structure": "1.1", "title": "Background",   "physical_index": "<physical_index_3>" }
]

Text:
${taggedPages}`;
