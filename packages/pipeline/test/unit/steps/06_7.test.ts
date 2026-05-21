import { describe, expect, it } from 'vitest';
import { addPreface } from '../../../src/steps/06_7-add-preface.js';

describe('addPreface', () => {
  it('prepends Preface when first entry physical_index > 1', () => {
    const out = addPreface([{ structure: '1', title: 'Intro', physical_index: 5 }]);
    expect(out[0]).toEqual({ structure: '0', title: 'Preface', physical_index: 1 });
    expect(out[1]?.structure).toBe('1');
  });
  it('no-op when first physical_index is 1', () => {
    const inp = [{ structure: '1', title: 'Intro', physical_index: 1 }];
    expect(addPreface(inp)).toEqual(inp);
  });
  it('no-op when first physical_index undefined', () => {
    const inp = [{ structure: '1', title: 'Intro' }];
    expect(addPreface(inp)).toEqual(inp);
  });
});
