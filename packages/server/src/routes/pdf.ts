import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { renderPage, resolveIndexDir, type DocOutput } from '@buddy/shared';
import type { createPdfCache } from '../pdf-cache.js';

async function readDoc(dataDir: string, topic: string, docId: string): Promise<DocOutput | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(resolveIndexDir(dataDir, topic), `${docId}.tree.json`), 'utf8'),
    ) as DocOutput;
  } catch {
    return null;
  }
}

export function pdfRoutes(deps: {
  dataDir: string;
  cache: ReturnType<typeof createPdfCache>;
  pdfPathFor: (topic: string, docName: string) => string;
}): Hono {
  const app = new Hono();
  app.get('/pdf/:topic/:docId', async (c) => {
    const page = Number.parseInt(c.req.query('page') ?? '', 10);
    const scale = Number.parseFloat(c.req.query('scale') ?? '2');
    if (!Number.isFinite(page) || page < 1) return c.json({ error: 'invalid page' }, 400);
    const { topic, docId } = c.req.param();
    const doc = await readDoc(deps.dataDir, topic, docId);
    if (!doc) return c.json({ error: 'doc not found' }, 404);
    const cacheDir = path.join(resolveIndexDir(deps.dataDir, topic), docId, 'pages');
    const cacheFile = path.join(cacheDir, `${page}@${scale}.png`);
    try {
      const png = await fs.readFile(cacheFile);
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    } catch {
      // cache miss
    }
    const pdf = await deps.cache.load(deps.pdfPathFor(topic, doc.doc_name));
    const png = renderPage(pdf, page - 1, scale).png;
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, png);
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  });
  return app;
}
