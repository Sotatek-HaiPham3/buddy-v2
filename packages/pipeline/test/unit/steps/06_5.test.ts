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

  it('keeps entries and keeps logical page even when logical sequence regresses (PageIndex Case 6.5)', () => {
    const out = validateIndices(
      [
        { structure: '1', title: 'A', page: 2, physical_index: 5 },
        { structure: '2', title: 'B', page: 1, physical_index: 14 },
      ],
      20,
    );
    expect(out).toHaveLength(2);
    expect(out[1]?.physical_index).toBe(14);
    expect(out[1]?.page).toBe(1);   // KEPT, not stripped
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

  it('preserves physical_index even when sequence regresses (PageIndex Case 6.5)', () => {
    // LLM may emit headings in semantic-hierarchy order, not physical order.
    // PageIndex spec validates ONLY range, not monotonicity.
    const entries: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 5 },
      { structure: '2', title: 'B', physical_index: 87 },   // within range but skips way ahead
      { structure: '3', title: 'C', physical_index: 2 },    // regresses below 87
    ];
    const out = validateIndices(entries, 100);
    expect(out).toHaveLength(3);
    expect(out[0]?.physical_index).toBe(5);
    expect(out[1]?.physical_index).toBe(87);
    expect(out[2]?.physical_index).toBe(2);   // KEPT, not stripped
  });

  it('clears physical_index when out of range; regression elsewhere in same batch is irrelevant', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 5 },
      { structure: '2', title: 'B', physical_index: 87 },   // out of pageCount=10 range → drop
      { structure: '3', title: 'C', physical_index: 7 },    // 7 > 5, valid range
    ];
    const out = validateIndices(entries, 10);
    expect(out[1]?.physical_index).toBeUndefined();   // out of range
    expect(out[2]?.physical_index).toBe(7);           // accepted (no monotonicity check)
  });

  it('KEEPS physical_index even when it regresses vs previous entries', () => {
    // LLM may emit headings in semantic-hierarchy order, not physical order.
    // PageIndex spec validates ONLY range, not monotonicity.
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'A', physical_index: 5 },
      { structure: '1.2', title: 'B', physical_index: 8 },
      { structure: '1.3', title: 'C', physical_index: 3 },   // regresses 8 -> 3
    ];
    const out = validateIndices(entries, 10);
    expect(out).toHaveLength(3);
    expect(out[0]?.physical_index).toBe(5);
    expect(out[1]?.physical_index).toBe(8);
    expect(out[2]?.physical_index).toBe(3);   // KEPT, not stripped
  });

  it('KEEPS logical page even when it regresses', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'A', page: 24, physical_index: 1 },
      { structure: '1.2', title: 'B', page: 30, physical_index: 2 },
      { structure: '1.3', title: 'C', page: 25, physical_index: 3 },   // regresses 30 -> 25
    ];
    const out = validateIndices(entries, 10);
    expect(out[2]?.page).toBe(25);   // KEPT, not stripped
  });

  it('still strips physical_index when out of pageCount range', () => {
    // PageIndex Case 6.5 — single rule that survives.
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'A', physical_index: 99 },
    ];
    const out = validateIndices(entries, 10);
    expect(out[0]?.physical_index).toBeUndefined();
  });

  it('still strips page when < 1', () => {
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'A', page: 0, physical_index: 1 },
    ];
    const out = validateIndices(entries, 10);
    expect(out[0]?.page).toBeUndefined();
  });

  it('does NOT strip page when > pageCount (logical can exceed physical pageCount)', () => {
    // Already covered by an earlier plan; assert here as regression guard.
    const entries: FlatTocEntry[] = [
      { structure: '1.1', title: 'A', page: 99, physical_index: 1 },
    ];
    const out = validateIndices(entries, 10);
    expect(out[0]?.page).toBe(99);
  });
});
