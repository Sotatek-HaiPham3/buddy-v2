import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { openPdf } from '@buddy/shared';
import { detectTables } from '../../src/table/detect.js';

async function pdfWithTable(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  const rows = [['Product', 'Price', 'Stock'], ['Widget A', '$10', '100'], ['Widget B', '$15', '50']];
  let y = 350;
  for (const row of rows) {
    let x = 50;
    for (const cell of row) {
      page.drawText(cell, { x, y, size: 12, font });
      x += 120;
    }
    y -= 20;
  }
  return Buffer.from(await pdf.save());
}

describe('detectTables', () => {
  it('detects a 3x3 table on the page', async () => {
    const doc = openPdf(await pdfWithTable());
    const tables = detectTables(doc, 1);
    expect(tables).toHaveLength(1);
    expect(tables[0].rawCells).toHaveLength(3);
    expect(tables[0].rawCells[0]).toEqual(['Product', 'Price', 'Stock']);
    expect(tables[0].page).toBe(1);
  });

  it('returns empty for page with only prose', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([400, 400]);
    page.drawText('Just a paragraph here, no tabular structure.', { x: 50, y: 200, size: 12, font });
    const doc = openPdf(Buffer.from(await pdf.save()));
    expect(detectTables(doc, 1)).toEqual([]);
  });
});
