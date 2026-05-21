export const titleAtStartPrompt = (title: string, pageText: string): string => `Does the section titled "${title}" begin at the very START of this page, or does it begin in the middle (after other content)?

Page text:
${pageText}

Return JSON: { "appear_start": "yes" | "no" }`;
