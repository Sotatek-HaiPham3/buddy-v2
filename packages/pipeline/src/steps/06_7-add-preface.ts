import type { FlatTocEntry } from '../types.js';

export function addPreface(toc: FlatTocEntry[]): FlatTocEntry[] {
  const first = toc[0];
  if (!first || first.physical_index === undefined || first.physical_index <= 1) return toc;
  return [{ structure: '0', title: 'Preface', physical_index: 1 }, ...toc];
}
