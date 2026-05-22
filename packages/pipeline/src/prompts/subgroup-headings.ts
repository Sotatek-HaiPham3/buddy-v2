export const subgroupHeadingsPrompt = (taggedPages: string): string => `You are extracting headings from a portion of a document.

The text may contain <physical_index_N> page markers - ignore them. We only need the headings, in document order.

Lines rendered in bold in the source PDF are wrapped in <b>...</b>. Italic lines in <i>...</i>. These are strong hints:

- A heading is almost always <b>-wrapped.
- An unstyled (no <b>/<i>) line is almost never a heading.
- A run of several consecutive <b> lines may be a multi-line table column header; treat as content, not a heading.

For each real heading found, output a 1-element array:
  ["heading title"]   (strip <b>/<i> tags from the title)

Response format:
[
  ["Introduction"],
  ["Background"],
  ["Methodology"]
]

Return JSON only.

Text:
${taggedPages}`;
