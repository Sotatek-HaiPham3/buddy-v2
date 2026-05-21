import { describe, expect, it } from 'vitest';
import { validateIndices } from '../../../src/steps/06_5-validate-indices.js';
import type { FlatTocEntry } from '../../../src/types.js';

describe('validateIndices', () => {
  it('clears physical_index that exceeds page count', () => {
    const out = validateIndices(
      [{ structure: '1', title: 'A', physical_index: 5 }, { structure: '2', title: 'B', physical_index: 99 }],
      10,
    );
    expect(out[0]?.physical_index).toBe(5);
    expect(out[1]?.physical_index).toBeUndefined();
  });
  it('clears physical_index < 1', () => {
    const out = validateIndices([{ structure: '1', title: 'A', physical_index: 0 }], 10);
    expect(out[0]?.physical_index).toBeUndefined();
  });

  it('keeps entries but clears logical when logical sequence regresses', () => {
    const out = validateIndices(
      [
        { structure: '1', title: 'A', page: 2, physical_index: 5 },
        { structure: '2', title: 'B', page: 1, physical_index: 14 },
      ],
      20,
    );
    expect(out).toHaveLength(2);
    expect(out[1]?.physical_index).toBe(14);
    expect(out[1]?.page).toBeUndefined();
  });

  it('leaves logical untouched when sequence is monotonic', () => {
    const out = validateIndices(
      [
        { structure: '1', title: 'A', page: 1, physical_index: 5 },
        { structure: '2', title: 'B', page: 5, physical_index: 14 },
      ],
      20,
    );
    expect(out[1]?.page).toBe(5);
  });

  it('clears logical page when it is below 1', () => {
    const out = validateIndices([{ structure: '1', title: 'A', page: 0, physical_index: 5 }], 10);
    expect(out[0]?.page).toBeUndefined();
    expect(out[0]?.physical_index).toBe(5);
  });

  it('preserves logical page when it exceeds physical pageCount (logical can be a book page number)', () => {
    const out = validateIndices([{ structure: '1', title: 'A', page: 11, physical_index: 5 }], 10);
    // logical=11 exceeds pageCount=10 but that is valid: e.g. a chapter extracted from a larger book
    expect(out[0]?.page).toBe(11);
    expect(out[0]?.physical_index).toBe(5);
  });

  it('preserves logical page above pageCount (logical can exceed physical pageCount)', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'CHIPPING POTATOES', page: 24, physical_index: 1 },
      { structure: '1.2', title: 'CABBAGE', page: 32, physical_index: 9 },
    ];
    const out = validateIndices(entries, 10);   // pageCount=10, logical=24,32 are valid
    expect(out[0]?.page).toBe(24);
    expect(out[1]?.page).toBe(32);
  });

  it('still drops logical below 1', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'X', page: 0, physical_index: 1 },
    ];
    const out = validateIndices(entries, 10);
    expect(out[0]?.page).toBeUndefined();
  });

  it('clears physical_index when sequence regresses', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 5 },
      { structure: '2', title: 'B', physical_index: 87 },   // within range but skips way ahead
      { structure: '3', title: 'C', physical_index: 2 },    // regresses below 87
    ];
    const out = validateIndices(entries, 100);
    expect(out).toHaveLength(3);
    expect(out[0]?.physical_index).toBe(5);
    expect(out[1]?.physical_index).toBe(87);
    expect(out[2]?.physical_index).toBeUndefined();   // dropped due to regression
  });

  it('clears physical_index when out of range AND drops regression separately', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 5 },
      { structure: '2', title: 'B', physical_index: 87 },   // out of pageCount=10 range → drop
      { structure: '3', title: 'C', physical_index: 7 },    // 7 > 5, monotonic
    ];
    const out = validateIndices(entries, 10);
    expect(out[1]?.physical_index).toBeUndefined();   // out of range
    expect(out[2]?.physical_index).toBe(7);           // accepted; lastPhysical=5 because 87 was dropped, not 87
  });
});
