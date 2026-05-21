import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getPageText,
  openPdf,
  resolveDocImagesDir,
  resolveDocTablesDir,
  type DocOutput,
  type TreeNode,
} from '@buddy/shared';
import type { RetrievedNode } from './types.js';

function* walk(nodes: TreeNode[]): Iterable<TreeNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.nodes);
  }
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function retrieveNodes(opts: {
  dataDir: string;
  topic: string;
  docs: DocOutput[];
  selections: { doc_id: string; node_ids: string[] }[];
  pdfPathFor: (docName: string) => string;
}): Promise<RetrievedNode[]> {
  const out: RetrievedNode[] = [];
  const selMap = new Map(opts.selections.map((s) => [s.doc_id, new Set(s.node_ids)]));
  for (const doc of opts.docs) {
    const wanted = selMap.get(doc.doc_id);
    if (!wanted || wanted.size === 0) continue;
    const pdf = openPdf(await fs.readFile(opts.pdfPathFor(doc.doc_name)));
    for (const node of walk(doc.structure)) {
      if (!wanted.has(node.node_id)) continue;
      const pages = [];
      for (let p = node.start_index; p <= node.end_index; p++) {
        pages.push(`--- page ${p} ---\n${getPageText(pdf, p - 1)}`);
      }
      const imageCaptions = [];
      for (const img of node.images) {
        if (img.caption) imageCaptions.push({ page: img.page, caption: img.caption });
        else {
          const meta = await readJsonIfExists<{ caption?: string }>(
            path.join(resolveDocImagesDir(opts.dataDir, opts.topic, doc.doc_id), path.basename(img.path)),
          );
          if (meta?.caption) imageCaptions.push({ page: img.page, caption: meta.caption });
        }
      }
      const tables = [];
      for (const t of node.tables) {
        const meta = await readJsonIfExists<{ schema?: string; rows?: unknown[] }>(
          path.join(resolveDocTablesDir(opts.dataDir, opts.topic, doc.doc_id), path.basename(t.path)),
        );
        tables.push({
          page: t.page,
          schema: meta?.schema ?? t.schema ?? '',
          preview: JSON.stringify((meta?.rows ?? []).slice(0, 3)),
        });
      }
      out.push({
        doc_id: doc.doc_id,
        doc_name: doc.doc_name,
        node_id: node.node_id,
        title: node.title,
        page_range: [node.start_index, node.end_index],
        text: pages.join('\n'),
        image_captions: imageCaptions,
        tables,
      });
    }
  }
  return out;
}
