import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createPdfCache } from '../../src/pdf-cache.js';
import { pdfRoutes } from '../../src/routes/pdf.js';

async function tinyPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  return Buffer.from(await pdf.save());
}

describe('pdf route', () => {
  it('returns PNG for valid page', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
    const topic = 'tax';
    const docId = 'd1';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await tinyPdf());
    await fs.writeFile(
      path.join(dataDir, topic, '.index', `${docId}.tree.json`),
      JSON.stringify({
        doc_id: docId,
        doc_name: 'a.pdf',
        doc_description: '',
        structure: [{ title: 't', start_index: 1, end_index: 1, node_id: 'n', nodes: [], images: [], tables: [] }],
      }),
    );
    const app = new Hono().route(
      '/api',
      pdfRoutes({ dataDir, cache: createPdfCache(), pdfPathFor: (t, name) => path.join(dataDir, t, name) }),
    );
    const res = await app.request('/api/pdf/tax/d1?page=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('resolves by internal doc_id when filename stem differs', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
    const topic = 'tax';
    const fileStem = 'chapter01';
    const internalId = 'doc_bAaOLzh2UyH-6e6nOT0wv';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await tinyPdf());
    await fs.writeFile(
      path.join(dataDir, topic, '.index', `${fileStem}.tree.json`),
      JSON.stringify({
        doc_id: internalId,
        doc_name: 'a.pdf',
        doc_description: '',
        structure: [{ title: 't', start_index: 1, end_index: 1, node_id: 'n', nodes: [], images: [], tables: [] }],
      }),
    );
    const app = new Hono().route(
      '/api',
      pdfRoutes({ dataDir, cache: createPdfCache(), pdfPathFor: (t, name) => path.join(dataDir, t, name) }),
    );
    const res = await app.request(`/api/pdf/${topic}/${internalId}?page=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('still resolves when another tree file is malformed', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
    const topic = 'tax';
    const fileStem = 'chapter01';
    const internalId = 'doc_bAaOLzh2UyH-6e6nOT0wv';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await tinyPdf());
    await fs.writeFile(path.join(dataDir, topic, '.index', 'broken.tree.json'), '{bad json');
    await fs.writeFile(
      path.join(dataDir, topic, '.index', `${fileStem}.tree.json`),
      JSON.stringify({
        doc_id: internalId,
        doc_name: 'a.pdf',
        doc_description: '',
        structure: [{ title: 't', start_index: 1, end_index: 1, node_id: 'n', nodes: [], images: [], tables: [] }],
      }),
    );
    const app = new Hono().route(
      '/api',
      pdfRoutes({ dataDir, cache: createPdfCache(), pdfPathFor: (t, name) => path.join(dataDir, t, name) }),
    );
    const res = await app.request(`/api/pdf/${topic}/${internalId}?page=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('returns 400 for invalid scale', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
    const topic = 'tax';
    const docId = 'd1';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await tinyPdf());
    await fs.writeFile(
      path.join(dataDir, topic, '.index', `${docId}.tree.json`),
      JSON.stringify({
        doc_id: docId,
        doc_name: 'a.pdf',
        doc_description: '',
        structure: [{ title: 't', start_index: 1, end_index: 1, node_id: 'n', nodes: [], images: [], tables: [] }],
      }),
    );
    const app = new Hono().route(
      '/api',
      pdfRoutes({ dataDir, cache: createPdfCache(), pdfPathFor: (t, name) => path.join(dataDir, t, name) }),
    );
    const res = await app.request('/api/pdf/tax/d1?page=1&scale=0');
    expect(res.status).toBe(400);
  });
});
