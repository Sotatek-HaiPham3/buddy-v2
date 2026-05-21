export interface DetectedTable {
  page: number;
  bbox: { x: number; y: number; w: number; h: number };
  rawCells: string[][];
}

export interface NormalizedTable {
  headers: string[];
  rows: string[][];
  columnTypes: ('string' | 'number' | 'date' | 'mixed')[];
  schemaDescriptor: string;
}

export interface SavedTable {
  page: number;
  path: string;
  idx: number;
  schema: string;
  headers: string[];
  rowCount: number;
}
