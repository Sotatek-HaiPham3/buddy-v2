export const detectTocPrompt = (pageText: string): string => `Your job is to detect if there is a table of contents in the given text.

A table of contents lists chapter or section TITLES paired with PAGE NUMBERS that tell the reader where to find those sections in the document. It is a navigation aid, not content itself.

The following are NOT a table of contents:
- Abstract, summary, figure list, table list
- Product codes, commodity codes, or classification codes (e.g. HS codes like 1001.99.11)
- Definitions, descriptions, or explanatory text
- Any list where the numbers are identifiers/codes rather than page numbers

Given text:
${pageText}

Return JSON:
{ "thinking": "<reasoning>", "toc_detected": "yes" | "no" }`;

