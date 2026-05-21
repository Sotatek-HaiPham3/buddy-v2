export const noTocHeadingsPrompt = (taggedPages: string): string => `You are extracting the hierarchical heading structure of a document.

The text contains tags like <physical_index_N> to mark page boundaries. Use the tags only as page boundaries - your output does NOT need to reference any page numbers.

For each heading in the document, output:
  ["structure", "title"]

- structure: dotted hierarchical numbering like "1", "1.1", "1.1.1" reflecting parent/child relationships
- title: the heading text exactly as written in the document

Response format:
[
  ["1", "Introduction"],
  ["1.1", "Background"]
]

Return JSON only. No commentary, no page numbers.

Text:
${taggedPages}`;