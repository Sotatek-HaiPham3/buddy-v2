import type { FlatTocEntry } from '../types.js';

export function validateIndices(toc: FlatTocEntry[], pageCount: number): FlatTocEntry[] {
  return toc.map(e => {
    if (e.physical_index === undefined) return { ...e };
    if (e.physical_index < 1 || e.physical_index > pageCount) {
      const { physical_index: _drop, ...rest } = e;
      return rest;
    }
    return { ...e };
  });
}
