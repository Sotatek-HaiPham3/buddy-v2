export const noTocHeadingsPrompt = (taggedPages: string): string => `You are extracting the hierarchical heading structure of a document.

The text contains tags like <physical_index_N> to mark page boundaries. Use the tags only as page boundaries - your output does NOT need to reference any page numbers.

Within each page, lines that were rendered in bold in the source PDF are wrapped in <b>...</b>. Italic lines are wrapped in <i>...</i>. Use these as strong hints:

- A heading is almost always <b>-wrapped.
- A plain unstyled line is almost never a heading, even if it is all-caps.
- Multiple consecutive <b> lines may be either (a) a single heading split across lines (merge them) or (b) a table column header block (skip them; they appear inside content sections, not at section starts).

For each real section heading, output:
  ["structure", "title"]

- structure: dotted hierarchical numbering like "1", "1.1", "1.1.1" reflecting parent/child relationships
- title: the heading text (strip the <b>/<i> tags)

Response format:
[
  ["1", "Introduction"],
  ["1.1", "Background"]
]

Return JSON only. No commentary, no page numbers, no tag markers in titles.

Text:
${taggedPages}`;
