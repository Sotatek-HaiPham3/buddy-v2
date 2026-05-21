import fs from 'node:fs/promises';
import path from 'node:path';
import type { DetectedTable, NormalizedTable, SavedTable } from './types.js';

interface Opts {
  dir: string;
  page: number;
  idx: number;
  detected: DetectedTable;
  normalized: NormalizedTable;
}

export async function saveTable(opts: Opts): Promise<SavedTable> {
  await fs.mkdir(opts.dir, { recursive: true });
  const filePath = path.join(opts.dir, `${opts.page}-${opts.idx}.json`);
  const body = {
    page: opts.page,
    bbox: opts.detected.bbox,
    headers: opts.normalized.headers,
    rows: opts.normalized.rows,
    columnTypes: opts.normalized.columnTypes,
    schemaDescriptor: opts.normalized.schemaDescriptor,
  };
  await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf8');
  return {
    page: opts.page,
    path: filePath,
    idx: opts.idx,
    schema: opts.normalized.schemaDescriptor,
    headers: opts.normalized.headers,
    rowCount: opts.normalized.rows.length,
  };
}
