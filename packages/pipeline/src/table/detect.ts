import type { PdfDoc } from '@buddy/shared';
import type { DetectedTable } from './types.js';

interface LineSpan {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TableRow {
  cells: string[];
  y: number;
  x: number;
  w: number;
  h: number;
}

const MIN_COLUMN_GAP = 12;
const MIN_COLUMNS = 2;
const MIN_ROWS = 2;

/**
 * Parse a page's StructuredText JSON into row-like structures.
 * Each "block" in mupdf's output groups text on the same horizontal band.
 * "lines" within a block are individual text spans (columns).
 */
function parseRows(json: unknown): TableRow[] {
  const data = json as {
    blocks?: {
      type?: string;
      bbox?: { x: number; y: number; w: number; h: number };
      lines?: {
        text?: string;
        bbox?: { x: number; y: number; w: number; h: number };
        x?: number;
        y?: number;
      }[];
    }[];
  };

  const rows: TableRow[] = [];

  for (const block of data.blocks ?? []) {
    if (block.type !== 'text') continue;
    const lines = block.lines ?? [];
    if (lines.length === 0) continue;

    // Collect spans with position info
    const spans: LineSpan[] = [];
    for (const line of lines) {
      if (!line.text?.trim()) continue;
      const bbox = line.bbox;
      if (!bbox) continue;
      spans.push({
        text: line.text.trim(),
        x: bbox.x,
        y: bbox.y,
        w: bbox.w,
        h: bbox.h,
      });
    }

    if (spans.length === 0) continue;

    // Sort spans by x position (left to right)
    spans.sort((a, b) => a.x - b.x);

    // Check if spans have meaningful horizontal gaps (multi-column)
    // A block with multiple spans that have gaps > MIN_COLUMN_GAP = a table row candidate
    const cells = spans.map(s => s.text);

    const blockBbox = block.bbox;
    if (!blockBbox) continue;

    rows.push({
      cells,
      y: blockBbox.y,
      x: blockBbox.x,
      w: blockBbox.w,
      h: blockBbox.h,
    });
  }

  return rows;
}

/**
 * Determine if a row qualifies as a table row.
 * Requires >= MIN_COLUMNS cells with meaningful horizontal gaps between spans.
 */
function isTableRow(row: TableRow): boolean {
  return row.cells.length >= MIN_COLUMNS;
}

/**
 * Groups of adjacent table rows coalesce into tables.
 * "Adjacent" means consecutive in the parsed order (already top-to-bottom).
 * Column count must be consistent ±1.
 */
function coalesceIntoTables(rows: TableRow[], pageNum: number): DetectedTable[] {
  const tables: DetectedTable[] = [];
  let group: TableRow[] = [];

  function flush() {
    if (group.length >= MIN_ROWS) {
      const xs = group.map(r => r.x);
      const ys = group.map(r => r.y);
      const rights = group.map(r => r.x + r.w);
      const bottoms = group.map(r => r.y + r.h);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...rights) - x;
      const h = Math.max(...bottoms) - y;
      tables.push({
        page: pageNum,
        bbox: { x, y, w, h },
        rawCells: group.map(r => r.cells),
      });
    }
    group = [];
  }

  for (const row of rows) {
    if (!isTableRow(row)) {
      flush();
      continue;
    }

    if (group.length === 0) {
      group.push(row);
      continue;
    }

    // Check column count consistency ±1
    const prevColCount = group[group.length - 1]!.cells.length;
    const currColCount = row.cells.length;
    if (Math.abs(currColCount - prevColCount) <= 1) {
      group.push(row);
    } else {
      flush();
      group.push(row);
    }
  }

  flush();
  return tables;
}

/**
 * Detect tables on a given page (1-indexed).
 * Uses MuPDF StructuredText to identify rows with multiple columns.
 */
export function detectTables(doc: PdfDoc, page: number): DetectedTable[] {
  const pageIndex = page - 1;
  const pageCount = doc._doc.countPages();
  if (pageIndex < 0 || pageIndex >= pageCount) {
    return [];
  }

  const mupdfPage = doc._doc.loadPage(pageIndex);
  const st = mupdfPage.toStructuredText('preserve-whitespace');
  const json = JSON.parse(st.asJSON()) as unknown;

  const rows = parseRows(json);
  return coalesceIntoTables(rows, page);
}
