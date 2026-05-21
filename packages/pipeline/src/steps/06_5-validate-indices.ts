import type { FlatTocEntry } from '../types.js';

export function validateIndices(toc: FlatTocEntry[], pageCount: number): FlatTocEntry[] {
  // Pass 1: range-validate physical_index, then check physical monotonicity.
  let lastPhysical: number | undefined;
  const physicallyValidated = toc.map(e => {
    if (e.physical_index === undefined) return { ...e };
    if (e.physical_index < 1 || e.physical_index > pageCount) {
      const { physical_index: _drop, ...rest } = e;
      return rest;
      // lastPhysical intentionally NOT updated — dropped entry doesn't shift baseline
    }
    if (lastPhysical !== undefined && e.physical_index < lastPhysical) {
      const { physical_index: _drop, ...rest } = e;
      console.warn(
        `[validateIndices] physical index regressed; clearing physical_index on "${e.structure} ${e.title}" (${e.physical_index} < ${lastPhysical})`,
      );
      return rest;
      // lastPhysical intentionally NOT updated — dropped entry doesn't shift baseline
    }
    lastPhysical = e.physical_index;
    return { ...e };
  });

  // Pass 2: range-validate and monotonicity-check logical page.
  let lastLogical: number | undefined;
  return physicallyValidated.map(e => {
    if (e.page === undefined) return e;
    if (e.page < 1) {
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
