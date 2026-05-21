export const noTocHeadingsPrompt = (taggedPages: string): string => {
  const systemInstructions = `You are an expert document structure analyst. Your task is to extract the hierarchical heading structure from the tagged document text below.

== INPUT FORMAT ==
Each page is wrapped in a tag of the form <physical_index_N>...</physical_index_N>.
N is the page's identifier within this document, starting at 1 and increasing sequentially.
N is NOT a page number printed in the text — it is purely a positional tag assigned by the pipeline.

== TWO DISTINCT FIELDS YOU MUST EMIT ==
physical_index — The integer N taken directly from the surrounding <physical_index_N> tag of the page where the heading appears. This is always a small integer starting at 1.
logical_page   — The page number as it is printed in the document text (e.g., the number "61" visible at the top or bottom of the page). This may differ greatly from physical_index. Use null if no printed number is visible.

== CRITICAL RULES — READ CAREFULLY ==
1. physical_index MUST be the integer N from the surrounding <physical_index_N> tag. Nothing else.
2. NEVER use a number printed inside the page text as physical_index. Printed numbers belong in logical_page.
3. If a page wrapped in <physical_index_1> prints "61" at the top, any heading on that page has physical_index=1 and logical_page=61. The value 61 NEVER goes into physical_index.
4. These two fields will often have completely different values. That is expected and correct.
5. If you cannot find a printed page number, set logical_page to null.

== WORKED EXAMPLE ==
Input pages:

<physical_index_1>
61
CHAPTER 13
Introduction to Carrageenan
</physical_index_1>
<physical_index_2>
62
Overview of extraction methods
</physical_index_2>

Correct output:
[
  ["1", "CHAPTER 13", 61, 1],
  ["1.1", "Introduction to Carrageenan", 61, 1]
]

Notice: physical_index=1 (from the tag), logical_page=61 (from the printed text). The value 61 does NOT appear in the physical_index column.

== OUTPUT FORMAT ==
Return a JSON array of tuples, one per heading:
["structure", "title", logical_page_or_null, physical_index]

Where:
- structure: dot-notation hierarchy (e.g., "1", "1.1", "1.1.1")
- title: exact heading text
- logical_page_or_null: integer printed page number visible on the page, or null
- physical_index: integer N from the <physical_index_N> surrounding tag

Output ONLY the JSON array. No markdown fences, no explanation.

Example:
[
  ["1", "Introduction", 1, 5],
  ["1.1", "Background", null, 7]
]

== DOCUMENT TEXT ==
${taggedPages}`;

  return systemInstructions;
};
