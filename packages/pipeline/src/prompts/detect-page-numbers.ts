export const detectPageNumbersPrompt = (tocText: string): string => `Your job is to detect if there are page numbers/indices in the table of contents.

Given text:
${tocText}

Return JSON:
{ "thinking": "<reasoning>", "page_index_given_in_toc": "yes" | "no" }`;
