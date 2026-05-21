import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { normalizeTablePrompt } from '../prompts/normalize-table.js';
import type { NormalizedTable } from './types.js';

interface Opts { gemini: GeminiClient; rawCells: string[][]; }

export async function normalizeTable(opts: Opts): Promise<NormalizedTable> {
  const r = await opts.gemini.generate([normalizeTablePrompt(opts.rawCells)], { maxOutputTokens: 4096 });
  try {
    const parsed = extractJson(r.text) as Partial<NormalizedTable> | null;
    if (parsed?.headers && parsed?.rows && parsed?.columnTypes && parsed?.schemaDescriptor) {
      return {
        headers: parsed.headers,
        rows: parsed.rows,
        columnTypes: parsed.columnTypes,
        schemaDescriptor: parsed.schemaDescriptor,
      };
    }
  } catch { /* fall through */ }
  const headers = opts.rawCells[0] ?? [];
  return {
    headers,
    rows: opts.rawCells.slice(1),
    columnTypes: headers.map(() => 'string' as const),
    schemaDescriptor: 'Unstructured table',
  };
}
