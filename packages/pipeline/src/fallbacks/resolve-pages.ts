import type { FlatTocEntry, RawPage } from '../types.js';

export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractPrintedPageNumber(text: string): number | undefined {
  const head = text.slice(0, 150);
  const m = head.match(/\b(\d{1,4})\b/);
  if (!m || !m[1]) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface HeadingInput {
  structure: string;
  title: string;
}

export function resolvePagesForHeadings(
  headings: HeadingInput[],
  pages: RawPage[],
): FlatTocEntry[] {
  const normalizedPages = pages.map((p) => ({
    pageNumber: p.pageNumber,
    normalized: normalizeForMatch(p.text),
    rawText: p.text,
  }));

  let lastMatchedIndex = -1;

  return headings.map((h) => {
    const needle = normalizeForMatch(h.title);
    let matchIdx = -1;

    for (let i = lastMatchedIndex + 1; i < normalizedPages.length; i++) {
      if (normalizedPages[i]?.normalized.includes(needle)) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx === -1) {
      for (let i = 0; i < normalizedPages.length; i++) {
        if (normalizedPages[i]?.normalized.includes(needle)) {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx === -1) {
      return { structure: h.structure, title: h.title };
    }

    lastMatchedIndex = matchIdx;
    const matched = normalizedPages[matchIdx]!;
    const entry: FlatTocEntry = {
      structure: h.structure,
      title: h.title,
      physical_index: matched.pageNumber,
    };
    const printed = extractPrintedPageNumber(matched.rawText);
    if (printed !== undefined) entry.page = printed;
    return entry;
  });
}
