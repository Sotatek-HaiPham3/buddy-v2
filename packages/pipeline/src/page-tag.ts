import type { RawPage } from './types.js';

export function tagPages(pages: RawPage[]): string {
  return pages.map(p => `<physical_index_${p.pageNumber}>\n${p.text}\n</physical_index_${p.pageNumber}>`).join('\n');
}

export function parsePhysicalIndexTag(s: string): number {
  const m = s.match(/physical_index_(\d+)/);
  if (!m?.[1]) throw new Error(`unparseable physical_index tag: ${s}`);
  return Number.parseInt(m[1], 10);
}
