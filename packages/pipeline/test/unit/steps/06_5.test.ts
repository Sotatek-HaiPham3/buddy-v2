import { describe, expect, it } from 'vitest';
import { validateIndices } from '../../../src/steps/06_5-validate-indices.js';

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
});
