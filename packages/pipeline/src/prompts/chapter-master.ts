export const chapterMasterPrompt = (groupTocs: [string, string, number][][], chapterPrefix: string): string => `You are merging group TOCs for chapter "${chapterPrefix}".

Group TOCs:
${groupTocs.map((g, i) => `Group ${i + 1}: ${JSON.stringify(g)}`).join('\n')}

Merge in page order, resolve boundary conflicts, and prefix all structure numbers with "${chapterPrefix}.".

Return JSON array:
[
  ["${chapterPrefix}.1",   "Introduction", 85],
  ["${chapterPrefix}.1.1", "Background",   87]
]`;
