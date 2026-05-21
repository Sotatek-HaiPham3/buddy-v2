export const subgroupHeadingsPrompt = (content: string): string => `Extract all section headings from the text below.

== INPUT FORMAT ==
Each page is wrapped in a tag of the form <physical_index_N>...</physical_index_N>.
N is the page's identifier within this document, starting at 1. It is NOT a page number printed in the page text.

== TWO DISTINCT FIELDS YOU MUST EMIT ==
physical_index — The integer N from the surrounding <physical_index_N> tag. Always a small integer starting at 1.
logical_page   — The page number as printed in the document text (e.g., "61" visible at top/bottom). Use null if not visible.

== CRITICAL RULES ==
1. physical_index MUST be the integer N from the surrounding <physical_index_N> tag. Nothing else.
2. NEVER use a number printed inside the page text as physical_index. Printed numbers belong in logical_page.
3. Example: a page wrapped in <physical_index_1> that prints "61" at the top → physical_index=1, logical_page=61.
   The value 61 NEVER goes into physical_index.

== OUTPUT FORMAT ==
JSON array of tuples, one per heading:
[title, logical_page_or_null, physical_index]

Only extract clear section/chapter headings, not every bold text.
Output ONLY the JSON array, nothing else.

Example:
[
  ["Introduction", 1, 85],
  ["Background", null, 87]
]

Text:
${content}`;
