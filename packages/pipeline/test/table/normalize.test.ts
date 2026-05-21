import { describe, it, expect } from 'vitest';
import { createStubGemini } from '@buddy/shared';
import { normalizeTable } from '../../src/table/normalize.js';

describe('normalizeTable', () => {
  it('parses LLM output into NormalizedTable', async () => {
    const alwaysStub = {
      generate: async () => ({ text: JSON.stringify({
        headers: ['Product', 'Price'],
        rows: [['A', '10'], ['B', '15']],
        columnTypes: ['string', 'number'],
        schemaDescriptor: 'Product prices',
      }) }),
      generateStream: async function*() {},
    };
    const out = await normalizeTable({ gemini: alwaysStub as any, rawCells: [['Product', 'Price'], ['A', '10'], ['B', '15']] });
    expect(out.headers).toEqual(['Product', 'Price']);
    expect(out.rows).toHaveLength(2);
    expect(out.columnTypes).toEqual(['string', 'number']);
    expect(out.schemaDescriptor).toBe('Product prices');
  });

  it('falls back to coarse normalization on parse failure', async () => {
    const failStub = { generate: async () => ({ text: 'garbage' }), generateStream: async function*() {} };
    const out = await normalizeTable({ gemini: failStub as any, rawCells: [['a', 'b'], ['1', '2']] });
    expect(out.headers).toEqual(['a', 'b']);
    expect(out.rows).toEqual([['1', '2']]);
    expect(out.schemaDescriptor).toBe('Unstructured table');
  });
});
