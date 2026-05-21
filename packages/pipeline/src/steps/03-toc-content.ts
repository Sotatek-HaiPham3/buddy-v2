import type { RawPage } from '../types.js';

export function extractTocContent(pages: RawPage[], tocPageNumbers: number[]): string {
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  let text = '';
  for (const n of tocPageNumbers) text += byNum.get(n)?.text ?? '';
  text = text.replace(/\s*\.{5,}\s*/g, (m) => (m.startsWith(' ') ? ' : ' : ': '));
  text = text.replace(/\s*(?:\. ){5,}\.?\s*/g, (m) => (m.startsWith(' ') ? ' : ' : ': '));
  // collapse multiple spaces down to one
  text = text.replace(/ {2,}/g, ' ');
  return text;
}
