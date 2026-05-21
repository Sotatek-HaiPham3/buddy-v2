export const chapterMasterPrompt = (
  groupTocs: unknown[][],
  chapterPrefix: string,
): string => `You are merging group TOCs for chapter "${chapterPrefix}".

Group TOCs:
${groupTocs.map((g, i) => `Group ${i + 1}: ${JSON.stringify(g)}`).join('\n')}

Merge in document order, resolve boundary conflicts, and prefix all structure numbers with "${chapterPrefix}.".

Return JSON array of tuples:
[
  ["${chapterPrefix}.1", "Introduction"],
  ["${chapterPrefix}.1.1", "Background"]
]

Return JSON only. No page numbers in output.`;
