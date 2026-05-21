import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { DocOutput } from '@buddy/shared';
import { retrieveNodes } from '../src/retrieval.js';

async function mkPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([200, 200]);
  p.drawText(text, { x: 10, y: 100, size: 12, font: f });
  return Buffer.from(await pdf.save());
}

describe('retrieveNodes', () => {
  it('loads page text for selected node', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ret-'));
    const topic = 'tax';
    const doc: DocOutput = {
      doc_id: 'd1',
      doc_name: 'a.pdf',
      doc_description: 'finance',
      structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
    };
    const pdfPath = path.join(dataDir, 'a.pdf');
    await fs.writeFile(pdfPath, await mkPdf('Revenue grew 10%.'));
    const out = await retrieveNodes({
      dataDir,
      topic,
      docs: [doc],
      selections: [{ doc_id: 'd1', node_ids: ['n1'] }],
      pdfPathFor: () => pdfPath,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toContain('Revenue grew');
  });
});
