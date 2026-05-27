import type { FlatTocEntry } from '../types.js';

export function validateIndices(toc: FlatTocEntry[], pageCount: number): FlatTocEntry[] {
  return toc.map((e) => {
    const out: FlatTocEntry = { ...e };

    // PageIndex Case 6.5: strip physical_index when out of [1, pageCount]
    if (out.physical_index !== undefined) {
      if (out.physical_index < 1 || out.physical_index > pageCount) {
        const { physical_index: _drop, ...rest } = out;
        return rest as FlatTocEntry;
      }
    }

    // Logical (book page) can legitimately exceed pageCount (e.g. chapter pages 24-32 of a larger book).
    // Only sanity-check < 1.
    if (out.page !== undefined && out.page < 1) {
      const { page: _drop, ...rest } = out;
      return rest as FlatTocEntry;
    }

    return out;
  });
}
