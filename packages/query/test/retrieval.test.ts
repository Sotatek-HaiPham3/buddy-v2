import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { DocOutput, TreeNode } from '@buddy/shared';
import { retrieveNodes } from '../src/retrieval.js';

async function mkPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([200, 200]);
  p.drawText(text, { x: 10, y: 100, size: 12, font: f });
  return Buffer.from(await pdf.save());
}

function makeNode(node_id: string, start_index: number, end_index: number): TreeNode {
  return { node_id, title: node_id, start_index, end_index, nodes: [], images: [], tables: [] };
}

function makeDoc(doc_id: string, doc_name: string, nodes: TreeNode[]): DocOutput {
  return { doc_id, doc_name, doc_description: '', structure: nodes };
}

let _fixturePdf: Buffer | undefined;
async function fixturePdfPath(): Promise<string> {
  if (!_fixturePdf) {
    _fixturePdf = await mkPdf('fixture page');
  }
  const tmp = path.join(os.tmpdir(), 'fixture-ret.pdf');
  await fs.writeFile(tmp, _fixturePdf);
  return tmp;
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

  it('populates doc_page_range when tree node has doc_page_start and doc_page_end', async () => {
    const node = makeNode('n1', 1, 1);
    node.doc_page_start = 5;
    node.doc_page_end = 6;
    const doc = makeDoc('d1', 'test.pdf', [node]);
    const pdfPath = await fixturePdfPath();
    const result = await retrieveNodes({
      dataDir: os.tmpdir(),
      topic: 'test',
      docs: [doc],
      selections: [{ doc_id: 'd1', node_ids: ['n1'] }],
      pdfPathFor: () => pdfPath,
    });
    expect(result[0].doc_page_range).toEqual([5, 6]);
  });

  it('leaves doc_page_range undefined when tree node has no doc_page fields', async () => {
    const node = makeNode('n1', 1, 1);
    const doc = makeDoc('d1', 'test.pdf', [node]);
    const pdfPath = await fixturePdfPath();
    const result = await retrieveNodes({
      dataDir: os.tmpdir(),
      topic: 'test',
      docs: [doc],
      selections: [{ doc_id: 'd1', node_ids: ['n1'] }],
      pdfPathFor: () => pdfPath,
    });
    expect(result[0].doc_page_range).toBeUndefined();
  });
});
