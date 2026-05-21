import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { renderPage, resolveIndexDir, type DocOutput } from '@buddy/shared';
import type { createPdfCache } from '../pdf-cache.js';

interface ResolvedDoc {
  key: string;
  doc: DocOutput;
}

async function readDoc(dataDir: string, topic: string, docId: string): Promise<ResolvedDoc | null> {
  const indexDir = resolveIndexDir(dataDir, topic);
  try {
    return {
      key: docId,
      doc: JSON.parse(await fs.readFile(path.join(indexDir, `${docId}.tree.json`), 'utf8')) as DocOutput,
    };
  } catch {
    // Fallback: some clients pass internal doc_id rather than filename stem.
    // Resolve by scanning topic index files and matching parsed doc_id.
    try {
      const entries = await fs.readdir(indexDir);
      for (const entry of entries) {
        if (!entry.endsWith('.tree.json')) continue;
        try {
          const full = path.join(indexDir, entry);
          const parsed = JSON.parse(await fs.readFile(full, 'utf8')) as DocOutput;
          if (parsed.doc_id === docId) {
            return { key: entry.slice(0, -'.tree.json'.length), doc: parsed };
          }
        } catch {
          // Ignore malformed files and continue scanning.
        }
      }
    } catch {
      // Keep null behavior for missing index dir/files.
    }
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
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4) return c.json({ error: 'invalid scale' }, 400);
    const { topic, docId } = c.req.param();
    const resolved = await readDoc(deps.dataDir, topic, docId);
    if (!resolved) return c.json({ error: 'doc not found' }, 404);
    const cacheDir = path.join(resolveIndexDir(deps.dataDir, topic), resolved.key, 'pages');
    const cacheFile = path.join(cacheDir, `${page}@${scale}.png`);
    try {
      const png = await fs.readFile(cacheFile);
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    } catch {
      // cache miss
    }
    const pdf = await deps.cache.load(deps.pdfPathFor(topic, resolved.doc.doc_name));
    const png = renderPage(pdf, page - 1, scale).png;
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, png);
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  });
  return app;
}
