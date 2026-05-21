export const detectTocPrompt = (pageText: string): string => `Your job is to detect if there is a table of contents in the given text.

Given text:
${pageText}

Return JSON:
{ "thinking": "<reasoning>", "toc_detected": "yes" | "no" }

Note: abstract, summary, figure list, table list are NOT table of contents.`;
