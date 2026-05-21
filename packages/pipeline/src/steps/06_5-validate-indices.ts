import type { FlatTocEntry } from '../types.js';

export function validateIndices(toc: FlatTocEntry[], pageCount: number): FlatTocEntry[] {
  const physicallyValidated = toc.map(e => {
    if (e.physical_index === undefined) return { ...e };
    if (e.physical_index < 1 || e.physical_index > pageCount) {
      const { physical_index: _drop, ...rest } = e;
      return rest;
    }
    return { ...e };
  });

  let lastLogical: number | undefined;
  return physicallyValidated.map(e => {
    if (e.page === undefined) return e;
    if (e.page < 1 || e.page > pageCount) {
      const { page: _drop, ...rest } = e;
      return rest;
    }
    if (lastLogical !== undefined && e.page < lastLogical) {
      const { page: _drop, ...rest } = e;
      console.warn(
        `[validateIndices] logical page regressed; clearing page on "${e.structure} ${e.title}" (${e.page} < ${lastLogical})`,
      );
      return rest;
    }
    lastLogical = e.page;
    return e;
  });
}
