export const noTocHeadingsPrompt = (taggedPages: string): string => `You are an expert in extracting hierarchical tree structure.
Generate the tree structure of the document.

The text contains tags like <physical_index_N> to mark page boundaries. N is the physical page number within this document (starting at 1).
Some pages also print their own logical page number (chapter-internal or book-numbered), often near the top or bottom and sometimes restarting per chapter.

Output one entry per heading:
["structure", "title", logical_page_or_null, physical_index]

Response format:
[
  ["1", "Introduction", 1, 5],
  ["1.1", "Background", null, 7]
]

- physical_index: integer from the surrounding <physical_index_N> tag where the heading begins.
- logical_page_or_null: page number as printed in the document for that page, or null if not visible.

Text:
${taggedPages}`;