export const chapterMasterPrompt = (
  groupTocs: ([string, string, number] | [string, string, number | null, number])[][],
  chapterPrefix: string,
): string => `You are merging group TOCs for chapter "${chapterPrefix}".

Group TOCs:
${groupTocs.map((g, i) => `Group ${i + 1}: ${JSON.stringify(g)}`).join('\n')}

Merge in page order, resolve boundary conflicts, and prefix all structure numbers with "${chapterPrefix}.".

Return JSON array:
[
  ["${chapterPrefix}.1",   "Introduction", 1,    85],
  ["${chapterPrefix}.1.1", "Background",   null, 87]
]`;
